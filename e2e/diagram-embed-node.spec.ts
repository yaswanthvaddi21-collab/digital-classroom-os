import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

// Phase 6 (NODE): the embedded diagram in the document: keyboard access, alignment/caption/alt text/title, a missing
// preview drawn again from the diagram's data, proportions at any width, and where a new diagram goes.

type DiagramAttrs = {
  previewId: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  title: string;
  align: string | null;
  caption: string | null;
  alt: string | null;
  source: unknown;
};
type StoredDoc = { id: string; content: { schemaVersion: number; doc: { content: Array<{ type: string; content?: Array<{ text?: string }> }> } } };

function findDiagrams(node: unknown, out: DiagramAttrs[] = []): DiagramAttrs[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push(n.attrs);
  n.content?.forEach((c) => findDiagrams(c, out));
  return out;
}
const storedDoc = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;
const storedDiagrams = async (page: Page, id: string) => findDiagrams((await storedDoc(page, id)).doc);

async function insertFlowchart(page: Page) {
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram img').last()).toBeVisible();
}

async function caretInsideWord(page: Page, word: string, offset: number) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(0);
  await page.evaluate(
    ({ word, offset }) => {
      const walker = document.createTreeWalker(document.querySelector('.ProseMirror')!, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const i = t.textContent!.indexOf(word);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(t, i + offset);
          r.collapse(true);
          getSelection()!.removeAllRanges();
          getSelection()!.addRange(r);
          return;
        }
      }
      throw new Error(`no "${word}" in the document`);
    },
    { word, offset },
  );
  // ProseMirror reads a changed DOM selection on the next selectionchange event, which is asynchronous.
  await page.waitForTimeout(150);
}

test('a diagram inserted with the caret inside a word goes after the paragraph, and Enter or F2 opens it', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await caretInsideWord(page, 'answer', 3); // "ans|wer"
  await insertFlowchart(page);
  await waitSaved(page);
  const blocks = (await storedDoc(page, id)).doc.content;
  const i = blocks.findIndex((b) => b.type === 'diagram');
  expect(blocks[i - 1].content?.map((c) => c.text).join('')).toContain('Begin your answer here.');

  // Enter on the selected diagram opens its editor (no empty paragraph is added); Escape closes it unchanged and
  // leaves the diagram selected, so F2 opens it again.
  const count = await page.locator('.ProseMirror > *').count();
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram.is-selected')).toHaveCount(1);
  await page.keyboard.press('F2');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.locator('.ProseMirror > *').count()).toBe(count);
  // Screen readers are told how to edit it.
  const img = page.locator('.ProseMirror .dcos-diagram img');
  await expect(img).toHaveAccessibleDescription(/press enter or double-click/i);
});

test('the Selected diagram bar sets alignment, caption, alternative text and title; they show, save and reload', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await insertFlowchart(page);
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  const bar = page.getByRole('toolbar', { name: 'Selected diagram' });
  await bar.getByRole('button', { name: 'Align right' }).click();
  await bar.getByRole('textbox', { name: 'Caption' }).fill('Figure 1. Login flow');
  await bar.getByRole('textbox', { name: 'Caption' }).press('Enter');
  await bar.getByRole('textbox', { name: 'Alternative text' }).fill('Flowchart of the login steps');
  await bar.getByRole('textbox', { name: 'Alternative text' }).press('Enter');
  await bar.getByRole('textbox', { name: 'Diagram title' }).fill('Login');
  await bar.getByRole('textbox', { name: 'Diagram title' }).press('Enter');
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id))[0]).toMatchObject({ align: 'right', caption: 'Figure 1. Login flow', alt: 'Flowchart of the login steps', title: 'Login' });
  expect((await storedDoc(page, id)).schemaVersion).toBe(3);

  await page.reload();
  const figure = page.locator('.ProseMirror figure.dcos-diagram');
  await expect(figure).toHaveAttribute('data-align', 'right');
  await expect(figure.locator('figcaption')).toHaveText('Figure 1. Login flow');
  await expect(figure.locator('img')).toHaveAttribute('alt', 'Flowchart of the login steps');
  // Right-aligned: the picture's right edge meets the text's right edge.
  const box = (await figure.locator('.dcos-diagram-box').boundingBox())!;
  const page_ = (await figure.boundingBox())!;
  expect(Math.abs(box.x + box.width - (page_.x + page_.width))).toBeLessThanOrEqual(2);
});

test('a preview that is gone is drawn again from the diagram\'s data, stored, and shown', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await insertFlowchart(page);
  await waitSaved(page);
  const [before] = await storedDiagrams(page, id);

  // Lose the preview attachment (as a damaged or partial restore would).
  await page.evaluate(
    (previewId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('digital-classroom-os');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('attachments', 'readwrite');
          tx.objectStore('attachments').delete(previewId);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    before.previewId,
  );
  await page.reload();
  const img = page.locator('.ProseMirror .dcos-diagram img');
  await expect(img).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await waitSaved(page);
  const [after] = await storedDiagrams(page, id);
  const attachments = await readStore<{ id: string; mimeType: string }>(page, 'attachments');
  expect(attachments.find((a) => a.id === after.previewId)).toMatchObject({ mimeType: 'image/png' });
  expect(after).toMatchObject({ width: before.width, source: before.source, title: before.title });
  expect(Math.abs(after.naturalWidth - before.naturalWidth)).toBeLessThanOrEqual(1);
  // The redraw is not an undo step: undo does not take the picture away again.
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(img).toBeVisible();
});

test('a diagram wider than the space keeps its proportions in a narrow window and when printed', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await insertFlowchart(page);
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  await page.getByRole('button', { name: /^size/i }).click();
  await page.getByRole('menuitem', { name: 'Full width' }).click();
  await waitSaved(page);
  const [d] = await storedDiagrams(page, id);
  const ratio = d.naturalHeight / d.naturalWidth;
  const box = page.locator('.ProseMirror .dcos-diagram-box');
  for (const width of [1280, 700, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const b = (await box.boundingBox())!;
      return Math.abs(b.height / b.width - ratio) < 0.01;
    }).toBe(true);
    const b = (await box.boundingBox())!;
    const img = (await box.locator('img').boundingBox())!;
    expect(Math.abs(img.height - b.height)).toBeLessThanOrEqual(1);
  }
  // Print styles: the same box rules apply (the print copy is made from this page's DOM).
  await page.emulateMedia({ media: 'print' });
  const b = (await box.boundingBox())!;
  expect(Math.abs(b.height / b.width - ratio)).toBeLessThan(0.01);
});
