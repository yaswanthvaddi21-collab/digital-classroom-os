import { expect, test, type Locator, type Page } from './fixtures';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Phase 6 (CLIPBOARD): copy, cut and paste of embedded diagrams in every browser. Copy and paste go through the
 * editors' own clipboard handlers with synthetic ClipboardEvents (real clipboard shortcuts are only reliable in headless
 * Chromium; e2e/diagram-embed-safety.spec.ts covers those there), so no browser is skipped.
 */

type DiagramAttrs = { source: { nodes: Array<{ data: { label: string } }> } | null; previewId: string | null; naturalWidth: number; naturalHeight: number; width: number; height: number; title: string };
type StoredDoc = { id: string; content: { doc: unknown } };
type Found = DiagramAttrs & { parent: string };

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

function findDiagrams(node: unknown, parent = 'doc', out: Found[] = []): Found[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push({ ...n.attrs, parent });
  n.content?.forEach((c) => findDiagrams(c, n.type ?? parent, out));
  return out;
}
async function storedDoc(page: Page, id: string) {
  return (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!;
}
const storedDiagrams = async (page: Page, id: string) => findDiagrams((await storedDoc(page, id)).content.doc);

/**
 * Fires a copy or paste ClipboardEvent at `selector` (or the focused element) with a fresh DataTransfer holding `data`,
 * and returns whether it was handled and what the clipboard holds afterwards.
 */
async function clip(page: Page, type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}, selector: string | null = '.ProseMirror') {
  return page.evaluate(
    ({ type, data, selector }) => {
      const dt = new DataTransfer();
      for (const [k, v] of Object.entries(data)) dt.setData(k, v);
      let e: Event | null = null;
      try {
        e = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true });
      } catch {
        e = null;
      }
      if (!e || (e as ClipboardEvent).clipboardData !== dt) {
        e = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(e, 'clipboardData', { value: dt });
      }
      const target = selector ? document.querySelector(selector)! : (document.activeElement ?? document.body);
      target.dispatchEvent(e);
      const out: Record<string, string> = {};
      for (const t of ['text/plain', 'text/html', 'application/x-dcos-diagram']) out[t] = dt.getData(t);
      return { prevented: e.defaultPrevented, out };
    },
    { type, data, selector },
  );
}

/** Puts the document's cursor at the end of the paragraph whose text is `text` (or of the document). */
async function cursorAtEndOf(page: Page, text: string | null) {
  // A document that has just opened may still be setting up its editor (WebKit): retry until the cursor is placed.
  await expect(async () => placeCursor(page, text)).toPass({ timeout: 10_000 });
}
async function placeCursor(page: Page, text: string | null) {
  await page.locator('.ProseMirror').evaluate((el, t) => {
    type Ed = {
      state: { doc: { content: { size: number }; descendants: (f: (n: { isTextblock: boolean; textContent: string; content: { size: number } }, p: number) => void) => void } };
      commands: { focus: () => void; setTextSelection: (p: number) => void };
    };
    const ed = (el as unknown as { editor: Ed }).editor;
    let pos = -1;
    if (t === null) pos = ed.state.doc.content.size - 1;
    else
      ed.state.doc.descendants((n, p) => {
        if (pos < 0 && n.isTextblock && n.textContent === t) pos = p + 1 + n.content.size;
      });
    if (pos < 0) throw new Error(`no paragraph "${t}"`);
    ed.commands.focus();
    ed.commands.setTextSelection(pos);
  }, text);
}

async function newDiagram(page: Page, template: string) {
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: template, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  return dialog;
}

/** A new document with one Flowchart diagram in it. */
async function documentWithDiagram(page: Page) {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  const dialog = await newDiagram(page, 'Flowchart');
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  const [original] = await storedDiagrams(page, id);
  expect(original.source?.nodes.length).toBeGreaterThan(1);
  return { id, original };
}

/** Selects the n-th diagram as a whole and copies it through the editor's copy handler. */
async function copyDiagram(page: Page, n = 0) {
  await page.locator('.ProseMirror .dcos-diagram-box').nth(n).click();
  await expect(page.locator('.ProseMirror .ProseMirror-selectednode')).toHaveCount(1);
  // The preview is read ahead for the clipboard's picture once the diagram is selected.
  let copied = await clip(page, 'copy');
  await expect.poll(async () => (copied = await clip(page, 'copy')).out['text/html']).toContain('src="data:image/png');
  expect(copied.prevented).toBe(true);
  return copied.out;
}

const visibleImages = (page: Page) => page.locator('.ProseMirror .dcos-diagram img');
/** Waits until every diagram picture has loaded. */
async function picturesLoaded(images: Locator, count: number) {
  await expect(images).toHaveCount(count);
  await expect.poll(() => images.evaluateAll((els) => els.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

test('copy gives other apps "[Diagram: title]" and a picture; pasting twice adds two copies; undo, redo and cut', async ({ page }) => {
  const { id, original } = await documentWithDiagram(page);
  const out = await copyDiagram(page);
  expect(out['text/plain']).toBe('[Diagram: Flowchart]');
  const pic = await page.evaluate((html) => {
    const fig = new DOMParser().parseFromString(html, 'text/html').querySelector('figure[data-type="diagram"]')!;
    const img = fig.querySelector('img')!;
    return { data: !!fig.getAttribute('data-diagram'), alt: img.getAttribute('alt'), src: img.getAttribute('src')!.slice(0, 22) };
  }, out['text/html']);
  expect(pic).toEqual({ data: true, alt: 'Flowchart', src: 'data:image/png;base64,' });

  await cursorAtEndOf(page, null);
  expect((await clip(page, 'paste', { 'text/html': out['text/html'], 'text/plain': out['text/plain'] })).prevented).toBe(true);
  await picturesLoaded(visibleImages(page), 2);
  // The pasted diagram is not left selected: a second paste adds another copy instead of replacing it.
  await expect(page.locator('.ProseMirror .ProseMirror-selectednode')).toHaveCount(0);
  await page.waitForTimeout(600); // separate undo steps, as at human speed
  await clip(page, 'paste', { 'text/html': out['text/html'], 'text/plain': out['text/plain'] });
  await picturesLoaded(visibleImages(page), 3);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(3);
  for (const d of await storedDiagrams(page, id)) expect({ ...d, parent: undefined }).toEqual({ ...original, parent: undefined });
  // The picture for other apps is never stored in the document.
  expect(JSON.stringify((await storedDoc(page, id)).content)).not.toContain('data:image');

  await page.waitForTimeout(600);
  await page.locator('.ProseMirror').press(`${mod}+z`);
  await expect(visibleImages(page)).toHaveCount(2);
  await page.locator('.ProseMirror').press(`${mod}+Shift+z`);
  await expect(visibleImages(page)).toHaveCount(3);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(3);

  // Cut takes the diagram out with the same clipboard data; pasting it back restores it whole.
  await page.locator('.ProseMirror .dcos-diagram-box').nth(2).click();
  await expect(page.locator('.ProseMirror .ProseMirror-selectednode')).toHaveCount(1);
  const cut = await clip(page, 'cut');
  expect(cut.prevented).toBe(true);
  expect(cut.out['text/plain']).toBe('[Diagram: Flowchart]');
  await expect(visibleImages(page)).toHaveCount(2);
  await page.waitForTimeout(600);
  await cursorAtEndOf(page, null);
  await clip(page, 'paste', { 'text/html': cut.out['text/html'], 'text/plain': cut.out['text/plain'] });
  await picturesLoaded(visibleImages(page), 3);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(3);
  for (const d of await storedDiagrams(page, id)) expect({ ...d, parent: undefined }).toEqual({ ...original, parent: undefined });
});

test('pastes into a table cell (fitted, same shape), a list item, a text box and another document; a lost preview is drawn again', async ({ page }) => {
  const { id, original } = await documentWithDiagram(page);
  const html = (await copyDiagram(page))['text/html'];

  // Containers to paste into, pasted from "another app".
  await cursorAtEndOf(page, null);
  await clip(page, 'paste', {
    'text/html': '<table><tbody><tr><td><p>left cell</p></td><td><p>right cell</p></td><td><p>third cell</p></td></tr></tbody></table><ul><li><p>list item</p></li></ul><div data-type="text-box"><p>box text</p></div>',
    'text/plain': '',
  });
  await expect(page.locator('.ProseMirror td')).toHaveCount(3);
  for (const where of ['left cell', 'list item', 'box text']) {
    await cursorAtEndOf(page, where);
    await clip(page, 'paste', { 'text/html': html, 'text/plain': '[Diagram: Flowchart]' });
  }
  await picturesLoaded(visibleImages(page), 4);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).map((d) => d.parent)).toEqual(['doc', 'tableCell', 'listItem', 'textBox']);
  const [, cell, item, box] = await storedDiagrams(page, id);
  for (const d of [cell, item, box]) expect({ ...d, width: 0, height: 0, parent: '' }).toEqual({ ...original, width: 0, height: 0, parent: '' });
  // In the narrow cell the diagram was made to fit, keeping its aspect ratio (no letterboxing, right dimensions).
  const cellWidth = await page.locator('.ProseMirror td').first().evaluate((td) => td.clientWidth);
  expect(cell.width).toBeLessThan(original.width);
  expect(cell.width).toBeLessThanOrEqual(cellWidth);
  expect(Math.abs(cell.height / cell.width - original.naturalHeight / original.naturalWidth)).toBeLessThan(0.02);
  const shown = await page.locator('.ProseMirror td .dcos-diagram img').boundingBox();
  expect(Math.abs(shown!.height / shown!.width - original.naturalHeight / original.naturalWidth)).toBeLessThan(0.02);

  // A diagram whose preview is no longer stored (purged elsewhere, another device) gets it drawn again from its data.
  const lost = await page.evaluate((h) => {
    const doc = new DOMParser().parseFromString(h, 'text/html');
    const fig = doc.querySelector('figure[data-type="diagram"]')!;
    const data = JSON.parse(fig.getAttribute('data-diagram')!);
    data.previewId = 'gone-0000000000000000';
    fig.setAttribute('data-diagram', JSON.stringify(data));
    fig.querySelector('img')?.remove();
    return doc.body.innerHTML;
  }, html);

  // Another document: the copy keeps everything; the lost preview is re-created and stored.
  const other = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await waitSaved(page);
  await cursorAtEndOf(page, null);
  await clip(page, 'paste', { 'text/html': html, 'text/plain': '' });
  await page.waitForTimeout(600);
  await clip(page, 'paste', { 'text/html': lost, 'text/plain': '' });
  await picturesLoaded(visibleImages(page), 2);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, other)).map((d) => d.previewId === 'gone-0000000000000000')).toEqual([false, false]);
  const [same, redrawn] = await storedDiagrams(page, other);
  expect({ ...same, parent: '' }).toEqual({ ...original, parent: '' });
  expect(redrawn.source).toEqual(original.source);
  const attachments = await readStore<{ id: string }>(page, 'attachments');
  expect(attachments.map((a) => a.id)).toContain(redrawn.previewId);
});

test('shapes copied in Diagram Studio paste into a document as an embedded diagram, never as JSON text', async ({ page }) => {
  const { id } = await documentWithDiagram(page);
  const dialog = await newDiagram(page, 'Flowchart');
  const labels = (await dialog.locator('.react-flow__node').allTextContents()).map((t) => t.trim()).filter(Boolean);
  const count = await dialog.locator('.react-flow__node').count();
  await dialog.locator('.react-flow__node').first().click();
  await page.keyboard.press(`${mod}+a`);
  await expect(dialog.locator('.react-flow__node.selected')).toHaveCount(count);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const copied = await clip(page, 'copy', {}, null);
  expect(copied.prevented).toBe(true);
  // Other apps get the shape labels as text, not the JSON.
  expect(copied.out['text/plain']).not.toContain('dcos-diagram-clipboard');
  for (const l of labels) expect(copied.out['text/plain']).toContain(l);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await cursorAtEndOf(page, null);
  const data = Object.fromEntries(Object.entries(copied.out).filter(([, v]) => v));
  expect((await clip(page, 'paste', data)).prevented).toBe(true);
  // Drawn off screen by Diagram Studio's renderer, stored, and shown.
  await picturesLoaded(visibleImages(page), 2);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(2);
  const pasted = (await storedDiagrams(page, id))[1];
  expect(pasted.source!.nodes).toHaveLength(count);
  expect(pasted.previewId).toBeTruthy();
  expect(pasted.naturalWidth / pasted.naturalHeight).toBeGreaterThan(0);
  const stored = JSON.stringify((await storedDoc(page, id)).content);
  expect(stored).not.toContain('dcos-diagram-clipboard');
  await expect(page.locator('.ProseMirror')).not.toContainText('dcos-diagram-clipboard');
  // The new diagram opens for editing with the pasted shapes.
  await page.locator('.ProseMirror .dcos-diagram-box').nth(1).dblclick();
  const edit = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(edit.locator('.react-flow__node')).toHaveCount(count);
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();
  // Its one undo step removes it.
  await page.waitForTimeout(600);
  await page.locator('.ProseMirror').press(`${mod}+z`);
  await expect(visibleImages(page)).toHaveCount(1);
});

test('a diagram copied from a document pastes into Diagram Studio as shapes; other clipboard data does not paste old shapes', async ({ page }) => {
  const { original } = await documentWithDiagram(page);
  const copied = await copyDiagram(page);
  const sourceCount = original.source!.nodes.length;

  // Open the diagram for editing and paste the document's copy onto its canvas.
  await page.locator('.ProseMirror .dcos-diagram-box').first().dblclick();
  const dialog = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(dialog.locator('.react-flow__node')).toHaveCount(sourceCount);
  await dialog.locator('.react-flow__node').first().click();
  // Copy a shape in the editor first: its in-memory copy must not be pasted for clipboard data that is something else.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await clip(page, 'copy', {}, null);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); // the user went to another app and copied text
  await dialog.locator('.react-flow__node').first().click();
  // Ctrl+V as a synthetic key press (a real one would also paste the test browser's own, empty, clipboard), then the
  // paste event that brings the other app's text.
  await page.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true })));
  await clip(page, 'paste', { 'text/plain': 'some text from another app' }, null);
  await page.waitForTimeout(300);
  await expect(dialog.locator('.react-flow__node')).toHaveCount(sourceCount);

  await dialog.locator('.react-flow__node').first().click();
  const pasted = await clip(page, 'paste', { 'text/html': copied['text/html'], 'text/plain': copied['text/plain'] }, null);
  expect(pasted.prevented).toBe(true);
  await expect(dialog.locator('.react-flow__node')).toHaveCount(sourceCount * 2);

  page.once('dialog', (d) => void d.accept()); // "Discard your changes?"
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
