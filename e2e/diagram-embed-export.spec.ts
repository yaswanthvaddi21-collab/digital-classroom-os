import { expect, test, type Page } from './fixtures';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/**
 * Phase 6 (ADR 0013), group EXPORT: an embedded diagram leaves the app and comes back editable.
 * - Classroom OS document (.dcosdoc): export, import as a new document, edit the diagram there.
 * - Word (.docx) and OpenDocument (.odt): the picture carries the diagram's data; importing the file restores an
 *   editable diagram at the same size, and the export says so.
 * - Print: the diagram is printed as its SVG drawing, without editing hints.
 */

type DiagramAttrs = { source: { nodes: Array<{ data: { label: string } }> }; previewId: string; width: number; height: number; title: string };
type StoredDoc = { id: string; title: string; content: { schemaVersion: number; doc: unknown } };

function findDiagrams(node: unknown, out: DiagramAttrs[] = []): DiagramAttrs[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push(n.attrs);
  n.content?.forEach((c) => findDiagrams(c, out));
  return out;
}
const diagramsOf = async (page: Page, id: string) => findDiagrams((await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content.doc);

/** A document holding a Flowchart diagram whose first shape is renamed "Begin". */
async function documentWithDiagram(page: Page) {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await dialog.locator('.react-flow__node', { hasText: 'Start' }).dblclick();
  const box = dialog.getByRole('textbox', { name: 'Shape text' });
  await box.fill('Begin');
  await box.press('Enter');
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  return id;
}

async function exportAs(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  return { name: download.suggestedFilename(), bytes: await downloadBytes(download) };
}

/** Imports a file from the Documents list and waits for the new document to open. */
async function importFile(page: Page, file: { name: string; bytes: Buffer }, mimeType: string) {
  await page.goto('./#/documents');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import document' }).click();
  await (await chooser).setFiles({ name: file.name, mimeType, buffer: file.bytes });
  await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** The imported diagram shows its preview and opens in the editor with its shapes. */
async function expectEditable(page: Page) {
  const img = page.locator('.ProseMirror .dcos-diagram img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.locator('.ProseMirror .dcos-diagram-box').dblclick();
  const edit = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(edit.locator('.react-flow__node', { hasText: 'Begin' })).toBeVisible();
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();
}

test('a Classroom OS document file (.dcosdoc) carries an editable diagram to a new document', async ({ page }) => {
  const id = await documentWithDiagram(page);
  const [original] = await diagramsOf(page, id);
  const file = await exportAs(page, /Classroom OS document/);
  expect(file.name).toBe('Assignment.dcosdoc');
  const json = JSON.parse(file.bytes.toString('utf8'));
  expect(json).toMatchObject({ format: 'dcos-document', version: 1, title: 'Assignment' });
  expect(json.attachments[original.previewId].type).toBe('image/png');
  await expect(page.getByText(/^Exported Classroom OS document/)).toBeVisible();

  const imported = await importFile(page, file, 'application/vnd.dcos.document+json');
  expect(imported).not.toBe(id);
  await expect(page.getByText('Imported “Assignment”.')).toBeVisible();
  const [copy] = await diagramsOf(page, imported);
  expect(copy.source).toEqual(original.source);
  expect([copy.width, copy.height]).toEqual([original.width, original.height]);
  await expectEditable(page);
});

for (const [label, ext, mime] of [
  [/Word document/, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  [/OpenDocument text/, 'odt', 'application/vnd.oasis.opendocument.text'],
] as const) {
  test(`a diagram exported to .${ext} is editable again when the file is imported back`, async ({ page }) => {
    const id = await documentWithDiagram(page);
    const [original] = await diagramsOf(page, id);
    const file = await exportAs(page, label);
    // The export says plainly what other apps get, and what Classroom OS gets back.
    await expect(page.getByText(/1 diagram was written as a picture; it can be edited again when this file is imported back into Classroom OS/)).toBeVisible();
    const zip = await JSZip.loadAsync(file.bytes);
    // The vector drawing is written next to the PNG.
    expect(Object.keys(zip.files).some((f) => f.endsWith('.svg'))).toBe(true);

    const imported = await importFile(page, file, mime);
    const [copy] = await diagramsOf(page, imported);
    expect(copy.source.nodes.map((n) => n.data.label)).toEqual(original.source.nodes.map((n) => n.data.label));
    expect(copy.title).toBe(original.title);
    expect([copy.width, copy.height]).toEqual([original.width, original.height]);
    const attachments = await readStore<{ id: string; mimeType: string }>(page, 'attachments');
    expect(attachments.find((a) => a.id === copy.previewId)?.mimeType).toBe('image/png');
    await expectEditable(page);
  });
}

test('print shows the diagram as its SVG drawing, with no editing hints', async ({ page }) => {
  await documentWithDiagram(page);
  // Capture what the print frame holds instead of opening the system print dialog.
  await page.evaluate(() => {
    const w = window as unknown as { __printed?: { html: string; type: string } };
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes)) {
          if (!(n instanceof HTMLIFrameElement) || !n.contentWindow) continue;
          const frame = n;
          frame.contentWindow!.print = () => {
            const doc = frame.contentDocument!;
            const img = doc.querySelector<HTMLImageElement>('.dcos-diagram img');
            void fetch(img!.src)
              .then((res) => res.blob())
              .then((blob) => (w.__printed = { html: doc.body.innerHTML, type: blob.type }));
          };
        }
    }).observe(document.body, { childList: true });
  });
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  const printed = await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed?: { html: string; type: string } }).__printed ?? null), { timeout: 10_000 })
    .not.toBeNull()
    .then(() => page.evaluate(() => (window as unknown as { __printed: { html: string; type: string } }).__printed));
  expect(printed.type).toBe('image/svg+xml');
  expect(printed.html).not.toMatch(/double-click|double-tap|press enter|Loading diagram|Editing…/i);
});
