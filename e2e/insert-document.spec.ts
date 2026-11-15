import { expect, test, type Page } from './fixtures';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, G-INSERT: equations, shapes, text boxes, and picture alignment and captions, end to end. */

// 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
type StoredDoc = { id: string; content: { schemaVersion: number; doc: Node } };
const stored = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;
function nodesOf(doc: Node, type: string): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (n.type === type) out.push(n);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

async function newAdvancedDocument(page: Page) {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'advanced' }).click();
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  return id;
}

async function insertTab(page: Page) {
  await page.getByRole('tab', { name: 'Insert' }).click();
  return page.getByRole('tabpanel');
}

/** Clicks a ribbon control, scrolling the toolbar first (it scrolls sideways on narrow screens and closes menus while it moves). */
async function ribbonClick(page: Page, name: string) {
  const button = page.getByRole('tabpanel').getByRole('button', { name });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await button.click();
}

async function exportWord(page: Page) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(download));
  return { zip, xml: await zip.file('word/document.xml')!.async('string') };
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('equations: insert with a live preview, edit by double-click, KaTeX fonts bundled, native Word equations', async ({ page, browserName }) => {
  const id = await newAdvancedDocument(page);
  await insertTab(page);
  await ribbonClick(page, 'Insert equation');
  await page.getByRole('menuitem', { name: /display equation/i }).click();
  const dialog = page.getByRole('dialog');
  const latex = dialog.getByRole('textbox', { name: 'LaTeX' });
  await latex.fill('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');
  await expect(dialog.getByTestId('equation-preview').locator('.katex')).toBeVisible();
  await expect(dialog.getByText('Word export: an editable Word equation.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(dialog).toHaveCount(0);

  const display = page.locator('.ProseMirror [data-type="block-math"] .katex-display');
  await expect(display).toBeVisible();
  // KaTeX's fonts come with the app (no CDN): they load from the app's own files.
  expect(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length > 0 && document.fonts.check('16px KaTeX_Main'))).toBe(true);
  const fontUrls = await page.evaluate(() =>
    [...document.querySelectorAll('style')].flatMap((s) => [...(s.textContent ?? '').matchAll(/url\(([^)]*KaTeX_Main-Regular[^)]*\.woff2)\)/g)].map((m) => m[1])),
  );
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const url of fontUrls) expect(new URL(url, page.url()).origin).toBe(new URL(page.url()).origin);

  // An inline equation that Word's converter does not know.
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await ribbonClick(page, 'Insert equation');
  await page.getByRole('menuitem', { name: /inline equation/i }).click();
  await latex.fill('\\overgroup{AB}');
  await expect(dialog.getByText(/a picture of the equation/)).toBeVisible();
  await latex.press('ControlOrMeta+Enter');
  await expect(page.locator('.ProseMirror [data-type="inline-math"] .katex')).toBeVisible();

  // Double-click opens the equation for editing.
  await display.dblclick();
  await expect(dialog.getByRole('heading', { name: 'Edit equation' })).toBeVisible();
  await expect(latex).toHaveValue('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');
  await latex.fill('E = mc^2');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.ProseMirror [data-type="block-math"]')).toHaveAttribute('data-latex', 'E = mc^2');
  expect(await noSideScroll(page)).toBe(true);

  await waitSaved(page);
  const content = await stored(page, id);
  expect(content.schemaVersion).toBe(2);
  expect(nodesOf(content.doc, 'blockMath').map((n) => n.attrs?.latex)).toEqual(['E = mc^2']);
  expect(nodesOf(content.doc, 'inlineMath').map((n) => n.attrs?.latex)).toEqual(['\\overgroup{AB}']);

  const { xml, zip } = await exportWord(page);
  expect(xml).toMatch(/<m:oMathPara><m:oMath>.*<m:sSup>/);
  const toast = page.getByText(/^Exported Word document/);
  if (browserName === 'chromium') {
    // The browser drew the equation Word does not know as a picture (LaTeX kept as alternative text).
    await expect(toast).toContainText('1 equation Word cannot edit natively was written as a picture');
    expect(xml).toContain('descr="\\overgroup{AB}"');
    expect(Object.keys(zip.files).filter((f) => f.startsWith('word/media/'))).toHaveLength(1);
  } else {
    // Browsers that refuse to read back a drawing of HTML write the LaTeX instead; either way it is reported.
    await expect(toast).toContainText(/1 equation (Word cannot edit natively was written as a picture|could not be converted and was written as its LaTeX text)/);
    test.info().annotations.push({ type: 'equation fallback', description: (await toast.textContent()) ?? '' });
  }
});

test('equations print with KaTeX styles and fonts in the print page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Reads the print frame before the print dialog closes it; only headless Chromium returns from print() at once.');
  await newAdvancedDocument(page);
  await insertTab(page);
  await ribbonClick(page, 'Insert equation');
  await page.getByRole('menuitem', { name: /display equation/i }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'LaTeX' }).fill('\\sum_{i=1}^{n} i');
  await page.getByRole('dialog').getByRole('button', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  const frame = await page.waitForFunction(() => {
    const doc = document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]')?.contentDocument;
    const html = doc?.documentElement.outerHTML ?? '';
    // KaTeX's main font, loaded from the app's own files into the print page (it waits for fonts before printing).
    const loaded = doc ? [...(doc.fonts as unknown as Iterable<FontFace>)].filter((f) => f.family.replace(/["']/g, '') === 'KaTeX_Main' && f.status === 'loaded').length : 0;
    return html.includes('katex-display') && loaded > 0 ? { katex: doc!.querySelectorAll('.dcos-doc .katex').length, loaded } : null;
  });
  expect(await frame.jsonValue()).toMatchObject({ katex: 1 });
});

test('shapes: insert, resize with the handle, change fill and text; exported to Word as a picture', async ({ page }) => {
  const id = await newAdvancedDocument(page);
  await insertTab(page);
  await ribbonClick(page, 'Insert shape');
  await page.getByRole('menuitem', { name: 'Rounded rectangle' }).click();
  const shape = page.locator('.ProseMirror .dcos-shape-box');
  await expect(shape.locator('svg rect')).toBeVisible();
  const bar = page.getByRole('toolbar', { name: 'Shape' });
  await expect(bar).toBeVisible();

  const before = (await shape.boundingBox())!;
  const handle = page.locator('.ProseMirror .dcos-shape-handle');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, h.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await shape.boundingBox())!.width)).toBeGreaterThan(Math.round(before.width) + 20);

  await bar.getByLabel('Fill colour').fill('#ffcc00');
  await bar.getByRole('textbox', { name: 'Shape text' }).fill('Hypothesis');
  await bar.getByRole('textbox', { name: 'Shape text' }).press('Enter');
  await expect(shape.locator('svg text')).toHaveText('Hypothesis');
  await expect(shape).toHaveAttribute('aria-label', 'Rounded rectangle: Hypothesis');
  expect(await noSideScroll(page)).toBe(true);

  await waitSaved(page);
  const [s] = nodesOf((await stored(page, id)).doc, 'shape');
  expect(s.attrs).toMatchObject({ kind: 'roundRect', fill: '#ffcc00', text: 'Hypothesis' });
  expect(Number(s.attrs?.width)).toBeGreaterThan(180);
  expect(Number(s.attrs?.height)).toBeGreaterThan(110);

  const { xml, zip } = await exportWord(page);
  await expect(page.getByText(/^Exported Word document/)).toContainText('1 shape was written as a picture');
  expect(xml).toContain('descr="Rounded rectangle: Hypothesis"');
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  expect(media).toHaveLength(1);
  // Drawn at twice the shape's size, for a sharp print.
  const png = await zip.file(media[0])!.async('uint8array');
  const view = new DataView(png.buffer, png.byteOffset);
  expect(view.getUint32(16)).toBe(Number(s.attrs?.width) * 2);
  expect(view.getUint32(20)).toBe(Number(s.attrs?.height) * 2);
});

test('text boxes: insert, type, float right with a width; exported to Word as a floating one-cell table', async ({ page }) => {
  const id = await newAdvancedDocument(page);
  await insertTab(page);
  await ribbonClick(page, 'Insert text box');
  const box = page.locator('.ProseMirror .dcos-textbox');
  await expect(box).toBeVisible();
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.type('Key idea: energy is conserved.');
  await expect(box).toContainText('Key idea: energy is conserved.');
  const bar = page.getByRole('toolbar', { name: 'Text box' });
  await bar.getByRole('combobox', { name: 'Text wrapping' }).selectOption('right');
  const width = bar.getByRole('spinbutton', { name: 'Text box width in pixels' });
  await width.fill('220');
  await width.press('Enter');
  await expect(box).toHaveCSS('float', 'right');
  await expect(box).toHaveCSS('width', '220px');
  await bar.getByLabel('Fill colour').fill('#e0f2fe');
  await expect(box).toHaveCSS('background-color', 'rgb(224, 242, 254)');

  await waitSaved(page);
  const [b] = nodesOf((await stored(page, id)).doc, 'textBox');
  expect(b.attrs).toMatchObject({ float: 'right', width: 220, fill: '#e0f2fe' });
  const { xml } = await exportWord(page);
  await expect(page.getByText(/^Exported Word document/)).toContainText('1 text box was written as a one-cell table');
  expect(xml).toMatch(/<w:tblpPr [^>]*w:tblpXSpec="right"/);
  expect(xml).toContain('Key idea: energy is conserved.');
  expect(xml).toContain('w:fill="E0F2FE"');
});

test('pictures: align right and add a caption; shown in a figure, saved, exported with a Caption paragraph', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await insertTab(page);
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({ name: 'cell.png', mimeType: 'image/png', buffer: PNG });
  const img = page.locator('.ProseMirror figure.dcos-figure img');
  await expect(img).toBeVisible();
  await img.click();
  const bar = page.getByRole('toolbar', { name: 'Picture' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Align right' }).click();
  const caption = bar.getByRole('textbox', { name: 'Caption' });
  await caption.fill('Figure 1. A plant cell');
  await caption.press('Enter');
  const figure = page.locator('.ProseMirror figure.dcos-figure');
  await expect(figure.locator('figcaption')).toHaveText('Figure 1. A plant cell');
  await expect(figure).toHaveAttribute('data-align', 'right');
  await expect(figure.locator('figcaption')).toHaveCSS('text-align', 'right');
  // The picture sits at the right edge of the text.
  const [fig, pic] = [(await figure.boundingBox())!, (await img.boundingBox())!];
  expect(Math.abs(fig.x + fig.width - (pic.x + pic.width))).toBeLessThan(4);
  expect(await noSideScroll(page)).toBe(true);

  await waitSaved(page);
  const content = await stored(page, id);
  expect(nodesOf(content.doc, 'image')[0].attrs).toMatchObject({ align: 'right', caption: 'Figure 1. A plant cell' });
  expect(content.schemaVersion).toBe(2);
  const { xml } = await exportWord(page);
  expect(xml).toMatch(/<w:keepNext\/><w:jc w:val="right"\/><\/w:pPr><w:r><w:drawing>/);
  expect(xml).toMatch(/<w:pStyle w:val="Caption"\/>.*Figure 1\. A plant cell/);
});

test('copy and paste keeps equations, shapes, text boxes and captions (HTML clipboard)', async ({ page }) => {
  const id = await newAdvancedDocument(page);
  await insertTab(page);
  // A picture with an alignment and a caption (first, so later clicks in the text cannot land on another object).
  await page.locator('input[type="file"][accept^="image/"]').setInputFiles({ name: 'cell.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.ProseMirror figure.dcos-figure img').click();
  const pictureBar = page.getByRole('toolbar', { name: 'Picture' });
  await pictureBar.getByRole('button', { name: 'Align left' }).click();
  await pictureBar.getByRole('textbox', { name: 'Caption' }).fill('Figure 1. Copied');
  await pictureBar.getByRole('textbox', { name: 'Caption' }).press('Enter');
  await expect(page.locator('.ProseMirror figcaption')).toHaveText('Figure 1. Copied');
  await ribbonClick(page, 'Insert shape');
  await page.getByRole('menuitem', { name: 'Arrow' }).click();
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await ribbonClick(page, 'Insert text box');
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.type('Boxed');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await ribbonClick(page, 'Insert equation');
  await page.getByRole('menuitem', { name: /inline equation/i }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'LaTeX' }).fill('a^2+b^2=c^2');
  await page.getByRole('dialog').getByRole('button', { name: 'Insert' }).click();
  await waitSaved(page);
  const before = (await stored(page, id)).doc;

  // Copy everything and paste it at the end, through the editor's own HTML clipboard handlers.
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.locator('.ProseMirror').evaluate((el) => {
    const data = new DataTransfer();
    const event = new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true });
    // As for paste below: Firefox's event would not carry `data`, so the editor's copy would not reach it.
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
    (window as unknown as { __copied: string }).__copied = data.getData('text/html');
  });
  // To the end of the document (Ctrl+End; ⌘↓ on a Mac).
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  // The editor reads the moved selection from the browser asynchronously: paste only once it has (or the paste
  // would replace the whole document, still selected).
  await expect
    .poll(() => page.locator('.ProseMirror').evaluate((el) => (el as unknown as { editor: { state: { selection: { empty: boolean } } } }).editor.state.selection.empty))
    .toBe(true);
  await page.locator('.ProseMirror').evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', (window as unknown as { __copied: string }).__copied);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    // Firefox's event does not carry the clipboardData given to its constructor (the paste arrived empty in CI), so it is set here.
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
  });
  await expect(page.locator('.ProseMirror .dcos-shape')).toHaveCount(2);
  await waitSaved(page);
  const after = (await stored(page, id)).doc;
  await expect(page.locator('.ProseMirror figcaption')).toHaveCount(2);
  for (const type of ['shape', 'textBox', 'inlineMath', 'image']) {
    const [original] = nodesOf(before, type);
    const copies = nodesOf(after, type);
    expect(copies, type).toHaveLength(2);
    expect(copies[1].attrs, type).toEqual(original.attrs);
  }
});
