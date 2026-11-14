import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Phase 6 (DIALOG): the diagram dialog's messages are seen above it, its unsaved edits survive a reload, and focus
 * goes back to the document when it closes.
 */

type DiagramAttrs = { source: { nodes: Array<{ data: { label: string } }> }; previewId: string; title: string };
type StoredDoc = { id: string; content: { schemaVersion: number; doc: unknown } };
type DraftDiagram = { type: string; attrs?: { source?: { nodes: Array<{ data: { label: string } }> } } };
// A dialog draft is stored as a schema-2 document (ADR 0013 decision 7): a note, the diagram before, the edited diagram last.
type StoredDraft = { itemId: string; session: string; content: { doc?: { content?: DraftDiagram[] } } };
const editedSource = (c: StoredDraft['content']) => (c.doc?.content ?? []).filter((n) => n.type === 'diagram').at(-1)?.attrs ?? {};

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
const dialogDrafts = async (page: Page, id: string) =>
  (await readStore<StoredDraft>(page, 'drafts')).filter((d) => d.itemId === id && d.session.startsWith('diagram-dialog:'));
const labels = (d: { source?: { nodes: Array<{ data: { label: string } }> } }) => (d.source?.nodes ?? []).map((n) => n.data.label);

async function openNewDiagram(page: Page, template: string) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: template, exact: true }).click();
  return page.getByRole('dialog', { name: 'New diagram' });
}

async function renameShape(dialog: Locator, from: string, to: string) {
  await dialog.locator('.react-flow__node', { hasText: from }).dblclick();
  const box = dialog.getByRole('textbox', { name: 'Shape text' });
  await box.fill(to);
  await box.press('Enter');
  await expect(dialog.locator('.react-flow__node', { hasText: to })).toBeVisible();
}

async function insertFlowchart(page: Page) {
  const dialog = await openNewDiagram(page, 'Flowchart');
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
}

/** Whether the element in focus is in the document (or is the ribbon's Edit button), not lost to <body>. */
const focusPlace = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    if (el.closest('.ProseMirror')) return 'document';
    if (el.tagName === 'BUTTON' && /edit/i.test(el.textContent ?? el.getAttribute('aria-label') ?? '')) return 'edit-button';
    return `other:${el.tagName}`;
  });

test('toasts and errors are seen above the open diagram dialog (RG-8)', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  const dialog = await openNewDiagram(page, 'Blank canvas');
  await expect(dialog.locator('.react-flow')).toBeVisible();

  // A toast from the diagram editor while the modal dialog is open: visible, on top, and announced.
  await dialog.getByRole('button', { name: /arrange/i }).click();
  await page.getByRole('menuitem', { name: 'Tree: top to bottom' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Connect shapes first' });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => !!el.closest('dialog'))).toBe(true);
  const onTop = await toast.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  expect(onTop).toBe(true);

  // A refused save says why inside the dialog, which stays open.
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Add at least one shape');
  await expect(dialog).toBeVisible();
});

test('unsaved edits in the diagram dialog survive a reload and go back into the document', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await insertFlowchart(page);
  const before = await storedDiagrams(page, id);
  expect(before.diagrams).toHaveLength(1);

  await page.locator('.ProseMirror .dcos-diagram-box').dblclick();
  const edit = page.getByRole('dialog', { name: 'Edit diagram' });
  await renameShape(edit, 'Start', 'UNSAVED-EDIT');
  // Kept as a draft of this document a moment after the change.
  await expect.poll(async () => (await dialogDrafts(page, id)).map((d) => labels(editedSource(d.content))).flat(), { timeout: 5000 }).toContain('UNSAVED-EDIT');

  // Leaving now asks first; accepting reloads.
  const asked: string[] = [];
  page.on('dialog', (d) => {
    asked.push(d.type());
    void d.accept();
  });
  await page.reload();
  expect(asked).toContain('beforeunload');

  // The document opens unchanged, does not offer the dialog draft as document content, and offers the diagram edits.
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await expect(page.getByText('Some changes from your last session were not saved.')).toHaveCount(0);
  expect((await storedDiagrams(page, id)).diagrams.flatMap(labels)).not.toContain('UNSAVED-EDIT');
  const offer = page.getByRole('status', { name: 'Unsaved diagram edits' });
  await expect(offer).toContainText('were kept');
  await offer.getByRole('button', { name: 'Recover diagram edits' }).click();

  const recovered = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(recovered.locator('.react-flow__node', { hasText: 'UNSAVED-EDIT' })).toBeVisible();
  await expect(recovered.getByText(/Recovered unsaved changes/)).toBeVisible();
  await recovered.getByRole('button', { name: 'Save changes' }).click();
  await expect(recovered).toBeHidden();
  await expect(page.getByText('Recovered diagram edits saved in the document.')).toBeVisible();

  // The same diagram was updated (not a second one added), with a new preview, and the draft is gone.
  await expect.poll(async () => (await storedDiagrams(page, id)).diagrams.flatMap(labels)).toContain('UNSAVED-EDIT');
  const after = await storedDiagrams(page, id);
  expect(after.diagrams).toHaveLength(1);
  expect(after.diagrams[0].previewId).not.toBe(before.diagrams[0].previewId);
  expect(after.schemaVersion).toBe(before.schemaVersion);
  await expect.poll(async () => (await dialogDrafts(page, id)).length).toBe(0);
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await expect(offer).toHaveCount(0);

  // Still there after another reload, with nothing left to offer.
  await page.reload();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  expect((await storedDiagrams(page, id)).diagrams.flatMap(labels)).toContain('UNSAVED-EDIT');
  await expect(page.getByRole('status', { name: 'Unsaved diagram edits' })).toHaveCount(0);
});

test('a new diagram left unsaved in the dialog is recovered at the end of the document', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const dialog = await openNewDiagram(page, 'Flowchart');
  await renameShape(dialog, 'Start', 'NEW-UNSAVED');
  await expect.poll(async () => (await dialogDrafts(page, id)).length, { timeout: 5000 }).toBe(1);
  page.on('dialog', (d) => void d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Recover diagram edits' }).click();
  const recovered = page.getByRole('dialog', { name: 'New diagram' });
  await expect(recovered.locator('.react-flow__node', { hasText: 'NEW-UNSAVED' })).toBeVisible();
  await recovered.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.getByText('The recovered diagram was added at the end of the document.')).toBeVisible();
  await expect.poll(async () => (await storedDiagrams(page, id)).diagrams.flatMap(labels)).toContain('NEW-UNSAVED');
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await expect.poll(async () => (await dialogDrafts(page, id)).length).toBe(0);
});

test('focus goes back to the document after Escape, Cancel and Save', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  await insertFlowchart(page);
  const box = page.locator('.ProseMirror .dcos-diagram-box');
  const edit = page.getByRole('dialog', { name: 'Edit diagram' });

  // Double-click, then Escape on an unchanged diagram.
  await box.dblclick();
  await expect(edit.locator('.react-flow__node').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  expect(await focusPlace(page)).toBe('document');

  // Double-click, then Cancel.
  await box.dblclick();
  await expect(edit.locator('.react-flow__node').first()).toBeVisible();
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();
  expect(await focusPlace(page)).toBe('document');

  // Double-click, then Save changes.
  await box.dblclick();
  await expect(edit.locator('.react-flow__node').first()).toBeVisible();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  expect(await focusPlace(page)).toBe('document');
  // Typing goes on in the document, not into nowhere.
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
});
