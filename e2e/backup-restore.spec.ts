import { expect, test, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/**
 * Backup and restore through the real UI, in a real browser (audit §4.1, STOR-R6, STOR-R7, STOR-R9):
 * realistic data in one profile, export from Settings, restore into an empty profile, then the
 * re-import, divergent-copy and broken-file rules.
 */

type Item = { id: string; kind: string; title: string; content: unknown; favorite: boolean; deletedAt: string | null; restoredFrom?: unknown };
type Version = { id: string; itemId: string; reason: string };
type Dump = Record<'documents' | 'diagrams' | 'document_versions' | 'diagram_versions' | 'item_index' | 'attachments', Array<Record<string, unknown>>>;

/** A small valid PNG (solid colour), built here so the test needs no binary fixture. */
function makePng(width: number, height: number, rgb: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

/** Every store a backup touches, sorted by key, with attachment bytes as base64 so they can be compared. */
async function dump(page: Page): Promise<Dump> {
  return page.evaluate(
    () =>
      new Promise<Dump>((resolve, reject) => {
        const names = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'item_index', 'attachments'] as const;
        const open = indexedDB.open('digital-classroom-os');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction([...names]);
          const out = {} as Dump;
          for (const name of names) {
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              out[name] = (req.result as Array<Record<string, unknown>>)
                .map((r) => {
                  // lastUsedAt is this device's clean-up bookkeeping (set when the file is restored), not part of the data.
                  if (name === 'attachments') r = (({ lastUsedAt: _used, ...rest }) => rest)(r);
                  if (!(r.data instanceof ArrayBuffer)) return r;
                  let bin = '';
                  for (const b of new Uint8Array(r.data)) bin += String.fromCharCode(b);
                  return { ...r, data: btoa(bin) };
                })
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function restoreFile(page: Page, name: string, buffer: Buffer) {
  // Earlier messages must be gone first, so the next assertion can only match this restore's message.
  await expect(page.locator('div[aria-live="polite"].fixed > div')).toHaveCount(0, { timeout: 10_000 });
  await page.goto('./#/settings/backup');
  await expect(page.getByRole('button', { name: 'Restore from file' })).toBeVisible();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name, mimeType: 'application/json', buffer });
}

const row = (page: Page, title: string) => page.locator('div.group', { hasText: title }).first();

test('a backup exported in one browser profile restores completely into an empty one', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);

  // ── Profile 1: realistic work ──────────────────────────────────────────────────────────────
  const docId = await createFromQuickStart(page, 'Assignment');
  const editor = page.locator('.ProseMirror');
  await editor.getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' A queue is first-in, first-out.');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Insert image' }).click()]);
  await chooser.setFiles({ name: 'swatch.png', mimeType: 'image/png', buffer: makePng(24, 16, [30, 120, 200]) });
  await expect(editor.locator('img[alt="swatch"]')).toBeVisible();

  await editor.getByText('first-in, first-out', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(dialog).toBeHidden();
  await expect(editor.locator('.dcos-diagram img')).toBeVisible();
  await waitSaved(page);

  // Ctrl/⌘+S records a manual version; later edits go on top of it.
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(async () => (await readStore<Version>(page, 'document_versions')).filter((v) => v.itemId === docId && v.reason === 'manual').length, { timeout: 10_000 })
    .toBe(1);
  await editor.getByText('first-in, first-out', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Written after the version.');
  await waitSaved(page);
  await expect
    .poll(async () => JSON.stringify((await readStore<Item>(page, 'documents')).find((d) => d.id === docId)?.content), { timeout: 10_000 })
    .toContain('Written after the version.');

  // A standalone diagram, edited.
  const diagramId = await createFromQuickStart(page, 'Flowchart');
  await page.locator('.react-flow__node', { hasText: 'Print "Odd"' }).dblclick();
  const shapeText = page.getByRole('textbox', { name: 'Shape text' });
  await shapeText.fill('Print the odd number');
  await shapeText.press('Enter');
  await expect(page.locator('.react-flow__node', { hasText: 'Print the odd number' })).toBeVisible();
  await waitSaved(page);
  await expect
    .poll(async () => JSON.stringify((await readStore<Item>(page, 'diagrams')).find((d) => d.id === diagramId)?.content), { timeout: 10_000 })
    .toContain('Print the odd number');

  // One item to the trash, one favourite.
  const trashedId = await createFromQuickStart(page, 'Lab report');
  await waitSaved(page);
  await page.goto('./#/documents');
  await row(page, 'Lab report').hover();
  await row(page, 'Lab report').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await expect(row(page, 'Lab report')).toBeHidden();
  await row(page, 'Assignment').hover();
  await row(page, 'Assignment').getByRole('button', { name: 'Favorite' }).click();
  await expect(row(page, 'Assignment').getByRole('button', { name: 'Unfavorite' })).toBeVisible();

  const original = await dump(page);
  expect(original.documents.find((d) => d.id === docId)).toMatchObject({ favorite: true, deletedAt: null });
  expect(original.documents.find((d) => d.id === trashedId)?.deletedAt).toEqual(expect.any(String));
  expect(original.attachments.length).toBeGreaterThan(0);

  // ── Export from Settings ───────────────────────────────────────────────────────────────────
  await page.goto('./#/settings/backup');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  await expect(page.getByText(/Backup exported: 3 items, \d+ versions\. Check that your browser saved the file\./)).toBeVisible();
  // The app records the export, not a confirmed saved file (STOR-R9).
  await expect(page.getByText('Last backup exported just now.')).toBeVisible();
  const bytes = await downloadBytes(download);
  const backup = JSON.parse(bytes.toString('utf8'));
  expect(backup).toMatchObject({ format: 'dcos-backup', formatVersion: 2, schemaVersion: 2 });
  expect(backup.items).toHaveLength(original.documents.length + original.diagrams.length);
  expect(backup.versions).toHaveLength(original.document_versions.length + original.diagram_versions.length);
  expect(backup.attachments).toHaveLength(original.attachments.length);
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect([...backup.items].sort(byId)).toEqual([...original.documents, ...original.diagrams].sort(byId as never));

  // ── Profile 2: an empty browser profile ────────────────────────────────────────────────────
  const fresh = await browser.newContext({ baseURL, viewport: page.viewportSize() });
  try {
    const page2 = await fresh.newPage();
    await page2.goto('./#/');
    expect(await readStore(page2, 'documents')).toHaveLength(0);

    await restoreFile(page2, download.suggestedFilename(), bytes);
    // The Restore section describes what the rest of this test proves (STOR-R6).
    await expect(page2.getByText('If you have changed an item since the backup was made, the backed-up version is added once')).toBeVisible();
    await expect(page2.getByText('Backup restored: 3 added, 0 already present')).toBeVisible();
    const restored = await dump(page2);
    // Every item, title, content, favourite and trash state, version and attachment, exactly as in profile 1.
    expect(restored).toEqual(original);

    await page2.goto('./#/documents');
    await expect(row(page2, 'Assignment').getByRole('button', { name: 'Unfavorite' })).toBeAttached();
    await expect(page2.locator('div.group', { hasText: 'Lab report' })).toHaveCount(0);
    await page2.goto('./#/trash');
    await expect(row(page2, 'Lab report')).toBeVisible();

    // The document opens with its text, its image and a rendered preview of the embedded diagram.
    await page2.goto(`./#/documents/${docId}`);
    const editor2 = page2.locator('.ProseMirror');
    await expect(editor2).toContainText('A queue is first-in, first-out. Written after the version.');
    await expect.poll(() => editor2.locator('img[alt="swatch"]').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(24);
    await expect(editor2.locator('.dcos-diagram img')).toBeVisible();
    await expect.poll(() => editor2.locator('.dcos-diagram img').evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);

    // The standalone diagram opens with its edit.
    await page2.goto(`./#/diagrams/${diagramId}`);
    await expect(page2.locator('.react-flow__node', { hasText: 'Print the odd number' })).toBeVisible();
    await expect(page2.locator('.react-flow__node')).toHaveCount(6);

    // ── Restoring the same file again adds nothing ───────────────────────────────────────────
    await restoreFile(page2, 'again.json', bytes);
    await expect(page2.getByText('Backup restored: 0 added, 3 already present')).toBeVisible();
    expect(await dump(page2)).toEqual(original);

    // ── After a local edit, the backed-up version comes back once, as a separate copy ─────────
    await page2.goto(`./#/documents/${docId}`);
    await page2.locator('.ProseMirror').getByText('Written after the version.', { exact: false }).click();
    await page2.keyboard.press('End');
    await page2.keyboard.type(' Changed on the second device.');
    await waitSaved(page2);
    await expect
      .poll(async () => JSON.stringify((await readStore<Item>(page2, 'documents')).find((d) => d.id === docId)?.content), { timeout: 10_000 })
      .toContain('Changed on the second device.');
    const edited = await dump(page2);
    const editedDoc = edited.documents.find((d) => d.id === docId)!;

    await restoreFile(page2, 'after-edit.json', bytes);
    await expect(page2.getByText('Backup restored: 0 added, 2 already present, 1 restored as copies (your current versions were kept)')).toBeVisible();
    const withCopy = await dump(page2);
    expect(withCopy.documents).toHaveLength(edited.documents.length + 1);
    expect(withCopy.documents.find((d) => d.id === docId)).toEqual(editedDoc);
    const copies = withCopy.documents.filter((d) => d.title === 'Assignment (restored)');
    expect(copies).toHaveLength(1);
    const originalDoc = original.documents.find((d) => d.id === docId)!;
    expect(copies[0].content).toEqual(originalDoc.content);
    expect(copies[0].restoredFrom).toEqual({ itemId: docId, version: originalDoc.version, updatedAt: originalDoc.updatedAt });
    // The copy carries the backed-up history in full (only its ids are new); the edited document's history and list row are untouched.
    const history = (vs: Dump['document_versions'], itemId: string) =>
      vs
        .filter((v) => v.itemId === itemId)
        .map(({ id: _id, itemId: _item, ...rest }) => rest)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(history(withCopy.document_versions, copies[0].id as string)).toEqual(history(original.document_versions, docId));
    expect(withCopy.document_versions.filter((v) => v.itemId === docId)).toEqual(edited.document_versions.filter((v) => v.itemId === docId));
    expect(withCopy.item_index.find((r) => r.id === docId)).toEqual(edited.item_index.find((r) => r.id === docId));
    expect(withCopy.diagrams).toEqual(edited.diagrams);

    // And only once: restoring yet again adds nothing more.
    await restoreFile(page2, 'once-more.json', bytes);
    await expect(page2.getByText('Backup restored: 0 added, 3 already present')).toBeVisible();
    expect(await dump(page2)).toEqual(withCopy);

    // ── Broken or newer files are refused with a reason, and change nothing ──────────────────
    const text = bytes.toString('utf8');
    await restoreFile(page2, 'truncated.json', Buffer.from(text.slice(0, Math.floor(text.length / 2))));
    await expect(page2.getByText('Nothing was imported. This file could not be read as a backup: it may be damaged or incomplete.')).toBeVisible();
    expect(await dump(page2)).toEqual(withCopy);

    await restoreFile(page2, 'newer.json', Buffer.from(JSON.stringify({ ...backup, formatVersion: 99 })));
    await expect(page2.getByText(/Nothing was imported\. Invalid backup file: this backup was made by a newer version of the app/)).toBeVisible();
    expect(await dump(page2)).toEqual(withCopy);

    // A file whose item content is not a document is refused as a whole (STOR-R7), naming the item.
    const damaged = structuredClone(backup);
    const n = damaged.items.findIndex((i: Item) => i.id === docId);
    damaged.items[n].content = 'not a document';
    damaged.items.push({ ...damaged.items[n], id: 'f2f2f2f2-0000-4000-8000-000000000000', title: 'Would be new', content: { schemaVersion: 1, doc: { type: 'doc', content: [] } } });
    await restoreFile(page2, 'damaged.json', Buffer.from(JSON.stringify(damaged)));
    await expect(page2.getByText(`Nothing was imported. Invalid backup file: item ${n + 1} (“Assignment”, ${docId}) is damaged: its content should be a document but is text`)).toBeVisible();
    expect(await dump(page2)).toEqual(withCopy);
  } finally {
    await fresh.close();
  }
});
