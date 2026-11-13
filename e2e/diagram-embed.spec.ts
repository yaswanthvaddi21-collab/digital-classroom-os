import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

const DRAWIO_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'drawio', 'library-system.drawio');

type DiagramAttrs = { source: { nodes: Array<{ data: { label: string } }> }; previewId: string; width: number; height: number; naturalWidth: number; naturalHeight: number; title: string };
type StoredDoc = { id: string; content: { schemaVersion: number; doc: unknown } };

function findDiagrams(node: unknown, out: DiagramAttrs[] = []): DiagramAttrs[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push(n.attrs);
  n.content?.forEach((c) => findDiagrams(c, out));
  return out;
}

async function storedDiagrams(page: Page, id: string) {
  const [doc] = (await readStore<StoredDoc>(page, 'documents')).filter((d) => d.id === id);
  return { schemaVersion: doc.content.schemaVersion, diagrams: findDiagrams(doc.content.doc) };
}

async function openDiagramTab(page: Page) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Diagram' }).click();
}

async function insertTemplate(page: Page, template: string) {
  await openDiagramTab(page);
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: template, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  return dialog;
}

async function renameShape(dialog: ReturnType<Page['getByRole']>, from: string, to: string) {
  await dialog.locator('.react-flow__node', { hasText: from }).dblclick();
  const box = dialog.getByRole('textbox', { name: 'Shape text' });
  await box.fill(to);
  await box.press('Enter');
  await expect(dialog.locator('.react-flow__node', { hasText: to })).toBeVisible();
}

test('insert, store, reopen, edit by double-click and export an embedded diagram', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const dialog = await insertTemplate(page, 'Flowchart');
  await renameShape(dialog, 'Start', 'Begin');
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(dialog).toBeHidden();

  const embedded = page.locator('.ProseMirror .dcos-diagram img');
  await expect(embedded).toBeVisible();
  await waitSaved(page);

  // The diagram's data lives in the document; its rendered preview is a separate PNG attachment.
  const first = await storedDiagrams(page, id);
  expect(first.schemaVersion).toBe(2);
  expect(first.diagrams).toHaveLength(1);
  const d1 = first.diagrams[0];
  expect(d1.source.nodes.map((n) => n.data.label)).toContain('Begin');
  const attachments = await readStore<{ id: string; mimeType: string; sizeBytes: number }>(page, 'attachments');
  expect(attachments.find((a) => a.id === d1.previewId)).toMatchObject({ mimeType: 'image/png' });
  // Aspect ratio and quality: shown at its natural proportions, rendered at 2× resolution.
  expect(Math.abs(d1.height / d1.width - d1.naturalHeight / d1.naturalWidth)).toBeLessThan(0.01);
  const natural = await embedded.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(natural).toEqual([d1.naturalWidth * 2, d1.naturalHeight * 2]);

  // Survives a reload.
  await page.reload();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await expect.poll(() => page.locator('.ProseMirror .dcos-diagram img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Double-click opens the editor with the saved content; saving re-renders the preview.
  await page.locator('.ProseMirror .dcos-diagram-box').dblclick();
  const editDialog = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(editDialog.locator('.react-flow__node', { hasText: 'Begin' })).toBeVisible();
  await renameShape(editDialog, 'End', 'Finish');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(editDialog).toBeHidden();
  await waitSaved(page);
  const second = await storedDiagrams(page, id);
  expect(second.diagrams[0].source.nodes.map((n) => n.data.label)).toEqual(expect.arrayContaining(['Begin', 'Finish']));
  expect(second.diagrams[0].previewId).not.toBe(d1.previewId);
  expect(second.diagrams[0].width).toBe(d1.width);

  // DOCX contains the diagram as a picture; TXT names it.
  await page.getByRole('button', { name: 'Export' }).click();
  const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(docx));
  expect(Object.keys(zip.files).some((f) => /^word\/media\/.+\.png$/.test(f))).toBe(true);
  expect(await zip.file('word/document.xml')!.async('string')).toContain('descr="Flowchart"');
  await page.getByRole('button', { name: 'Export' }).click();
  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /plain text/i }).click()]);
  expect((await downloadBytes(txt)).toString()).toContain('[Diagram: Flowchart]');
});

test('resizing keeps the aspect ratio, and cancelling inserts nothing', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  let dialog = await insertTemplate(page, 'Tree diagram');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram')).toHaveCount(0);

  dialog = await insertTemplate(page, 'UML class diagram');
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  await page.getByRole('button', { name: /^size/i }).click();
  await page.getByRole('menuitem', { name: 'Small' }).click();
  await waitSaved(page);
  const [d] = (await storedDiagrams(page, id)).diagrams;
  expect(d.width).toBeLessThan(d.naturalWidth);
  expect(Math.abs(d.height / d.width - d.naturalHeight / d.naturalWidth)).toBeLessThan(0.01);
});

test('diagrams.net files import into documents and into Diagram Studio, and export back', async ({ page }) => {
  // Into a document, via the Diagram tab.
  const id = await createFromQuickStart(page, 'Assignment');
  await openDiagramTab(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagrams.net' }).click()]);
  await chooser.setFiles(DRAWIO_FIXTURE);
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.getByText(/imported from diagrams.net with these differences/i)).toBeVisible();
  await expect(dialog.getByText(/cloud/)).toBeVisible();
  await expect(dialog.locator('.react-flow__node', { hasText: 'Available?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect.poll(async () => (await storedDiagrams(page, id)).diagrams.length, { timeout: 10_000 }).toBe(1);
  const [d] = (await storedDiagrams(page, id)).diagrams;
  expect(d.title).toBe('Library system');
  expect(d.source.nodes.map((n) => n.data.label)).toEqual(expect.arrayContaining(['Member', 'Available?']));

  // As a standalone diagram.
  await page.goto('./#/diagrams');
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagrams.net' }).click()]);
  await chooser2.setFiles(DRAWIO_FIXTURE);
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node', { hasText: 'Book' })).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);

  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /diagrams\.net/i }).click()]);
  expect(file.suggestedFilename()).toBe('Library system.drawio');
  const xml = (await downloadBytes(file)).toString();
  expect(xml).toContain('<mxfile');
  expect(xml).toContain('Available?');
});
