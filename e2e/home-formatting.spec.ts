import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, G-FORMAT: Home tab formatting — styles, spacing, indents, the ruler, list styles, colours and sizes. */

type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };
type StoredDoc = { id: string; content: { schemaVersion: number; doc: Json; page: { margins: { left: number; right: number } } } };
const stored = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;
const blocks = async (page: Page, id: string) => (await stored(page, id)).doc.content ?? [];
const panel = (page: Page) => page.getByRole('tabpanel');
const body = (page: Page) => page.locator('.ProseMirror');

/** A new Advanced document with just three Normal paragraphs; the cursor ends in the first. */
async function newDocument(page: Page) {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'advanced' }).click();
  // Start from an empty page: clear the template's text and return to Normal.
  await body(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await panel(page).getByRole('combobox', { name: 'Text style' }).selectOption('normal');
  await page.keyboard.type('First paragraph of the essay.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Third paragraph.');
  await clickText(page, 'First paragraph');
  return id;
}

/**
 * Clicks into a paragraph and lets the editor take the new cursor position. ProseMirror reads a click's selection
 * from the browser's (asynchronous) selectionchange event, and ignores it once focus has moved on, so a toolbar
 * control used in the same instant (as only a test can) would still see the old cursor.
 */
async function clickText(page: Page, text: string) {
  await body(page).getByText(text).click();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
}

async function openPopover(page: Page, name: string) {
  const button = panel(page).getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await button.click();
}

test('named styles, line spacing and the Paragraph dialog format the text, save as schema 2 and survive a reload', async ({ page }) => {
  const id = await newDocument(page);
  const style = panel(page).getByRole('combobox', { name: 'Text style' });
  await style.selectOption('title');
  const first = body(page).locator('p').first();
  await expect(first).toHaveAttribute('data-paragraph-style', 'title');
  expect(parseFloat(await first.evaluate((el) => getComputedStyle(el).fontSize))).toBeCloseTo(34.667, 2); // 26pt
  await expect(style).toHaveValue('title');

  await clickText(page, 'Second paragraph');
  await openPopover(page, 'Line and paragraph spacing');
  await page.getByRole('button', { name: 'Line spacing 2.0' }).click();
  const second = body(page).locator('p').nth(1);
  // Word "double" for Calibri/Carlito: 2 × 1.2207 em at 12pt (16px).
  expect(parseFloat(await second.evaluate((el) => getComputedStyle(el).lineHeight))).toBeCloseTo(2.4414 * 16, 0);

  await clickText(page, 'Third paragraph');
  await panel(page).getByRole('button', { name: 'Paragraph settings', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Left (cm)').fill('2');
  await dialog.getByLabel('Special').selectOption('hanging');
  await dialog.getByLabel('By (cm)').fill('1');
  await dialog.getByLabel('Before (pt)').fill('12');
  await dialog.getByLabel('After (pt)').fill('6');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  const third = body(page).locator('p').nth(2);
  const css = await third.evaluate((el) => {
    const s = getComputedStyle(el);
    return { marginLeft: s.marginLeft, textIndent: s.textIndent, paddingTop: s.paddingTop, paddingBottom: s.paddingBottom };
  });
  expect(parseFloat(css.marginLeft)).toBeCloseTo(75.6, 0); // 2 cm
  expect(parseFloat(css.textIndent)).toBeCloseTo(-37.8, 0); // hanging 1 cm
  expect(css.paddingTop).toBe('16px'); // 12pt
  expect(css.paddingBottom).toBe('8px'); // 6pt

  await waitSaved(page);
  const saved = await stored(page, id);
  expect(saved.schemaVersion).toBe(2);
  expect(saved.doc.content![0].attrs).toMatchObject({ paragraphStyle: 'title' });
  expect(saved.doc.content![1].attrs).toMatchObject({ lineSpacing: 2 });
  expect(saved.doc.content![2].attrs).toMatchObject({ indentLeft: 56.69, indentFirstLine: -28.35, spaceBefore: 12, spaceAfter: 6 });

  await page.reload();
  await expect(body(page).locator('p').first()).toHaveAttribute('data-paragraph-style', 'title');
  await expect(body(page).locator('p').nth(2)).toHaveAttribute('data-indent-left', '56.69');
  await expect(page.getByText('Opened read-only')).toHaveCount(0);

  // Undo and redo the line spacing.
  await clickText(page, 'Second paragraph');
  await openPopover(page, 'Line and paragraph spacing');
  await page.getByRole('button', { name: 'Line spacing 1.0' }).click();
  await expect(body(page).locator('p').nth(1)).toHaveAttribute('data-line-spacing', '1');
  await expect(body(page)).toBeFocused(); // the format controls hand the focus back to the text
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body(page).locator('p').nth(1)).toHaveAttribute('data-line-spacing', '2');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(body(page).locator('p').nth(1)).toHaveAttribute('data-line-spacing', '1');
});

test('the ruler shows the indents and margins; its markers drag and move with the keyboard', async ({ page }) => {
  const id = await newDocument(page);
  const ruler = page.getByRole('group', { name: 'Ruler' });
  await expect(ruler).toBeVisible();
  const left = ruler.getByRole('slider', { name: 'Left indent' });
  await expect(left).toHaveAttribute('aria-valuetext', '0 cm');

  // Drag the left indent marker 1 cm to the right (37.8 px; it snaps to 0.25 cm).
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2 + 38, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(left).toHaveAttribute('aria-valuetext', '1 cm');
  const p1 = body(page).locator('p').first();
  expect(parseFloat(await p1.evaluate((el) => getComputedStyle(el).marginLeft))).toBeCloseTo(37.8, 0);
  // The marker sits where the text now starts.
  const textLeft = await p1.evaluate((el) => el.getBoundingClientRect().left);
  const markerBox = (await left.boundingBox())!;
  expect(Math.abs(markerBox.x + markerBox.width / 2 - textLeft)).toBeLessThan(2);

  // Keyboard: first line one step (0.25 cm) right of the left indent, right indent 1 cm.
  const firstLine = ruler.getByRole('slider', { name: 'First line indent' });
  await firstLine.focus();
  await page.keyboard.press('ArrowRight');
  await expect(firstLine).toHaveAttribute('aria-valuetext', '1.25 cm');
  const rightIndent = ruler.getByRole('slider', { name: 'Right indent' });
  await rightIndent.focus();
  await page.keyboard.press('PageUp');
  await expect(rightIndent).toHaveAttribute('aria-valuetext', '1 cm');
  // The left page margin, in millimetres.
  const margin = ruler.getByRole('slider', { name: 'Left page margin' });
  await margin.focus();
  await page.keyboard.press('ArrowRight');
  await expect(margin).toHaveAttribute('aria-valuetext', '26.4 mm');

  await waitSaved(page);
  const saved = await stored(page, id);
  expect(saved.doc.content![0].attrs).toMatchObject({ indentLeft: 28.35, indentFirstLine: 7.09, indentRight: 28.35 });
  expect(saved.page.margins.left).toBe(26.4);

  // Simple mode hides the ruler; Advanced shows it again.
  await page.getByRole('radio', { name: 'simple' }).click();
  await expect(ruler).toHaveCount(0);
});

test('list styles: bullet glyphs, number formats and start numbers, shown by the browser and kept in DOCX', async ({ page }) => {
  const id = await newDocument(page);
  await openPopover(page, 'Bullet style');
  await page.getByRole('button', { name: /Square/ }).click();
  const ul = body(page).locator('ul').first();
  await expect(ul).toHaveAttribute('data-bullet-style', 'square');
  expect(await ul.evaluate((el) => getComputedStyle(el).listStyleType)).toBe('square');
  await openPopover(page, 'Bullet style');
  await page.getByRole('button', { name: /Dash/ }).click();
  expect(await ul.evaluate((el) => getComputedStyle(el).listStyleType)).toBe('"–  "');

  await clickText(page, 'Third paragraph');
  await openPopover(page, 'Numbering format');
  await page.getByRole('button', { name: 'i, ii, iii', exact: true }).click();
  const ol = body(page).locator('ol').first();
  expect(await ol.evaluate((el) => getComputedStyle(el).listStyleType)).toBe('lower-roman');
  await openPopover(page, 'Numbering format');
  await page.getByRole('spinbutton', { name: 'Start numbering at' }).fill('4');
  await page.getByRole('spinbutton', { name: 'Start numbering at' }).press('Enter');
  await expect(ol).toHaveAttribute('start', '4');

  await waitSaved(page);
  const doc = await blocks(page, id);
  expect(doc.find((n) => n.type === 'bulletList')?.attrs).toMatchObject({ bulletStyle: 'dash' });
  expect(doc.find((n) => n.type === 'orderedList')?.attrs).toMatchObject({ numberFormat: 'lower-roman', start: 4 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Word document/ }).click();
  const zip = await JSZip.loadAsync(await downloadBytes(await downloadPromise));
  const numbering = await zip.file('word/numbering.xml')!.async('string');
  expect(numbering).toContain('<w:lvlText w:val="–"/>');
  expect(numbering).toMatch(/<w:start w:val="4"\/>\s*<w:numFmt w:val="lowerRoman"\/>|<w:numFmt w:val="lowerRoman"\/>[\s\S]*?<w:start w:val="4"\/>|<w:start w:val="4"\/>[\s\S]{0,80}lowerRoman/);
  const styles = await zip.file('word/styles.xml')!.async('string');
  for (const id of ['Title', 'Subtitle', 'Heading1', 'Quote', 'Caption', 'Code']) expect(styles).toContain(`w:styleId="${id}"`);
});

test('custom colours and font sizes, and a copied formatted paragraph keeps its formatting when pasted', async ({ page }) => {
  const id = await newDocument(page);
  await body(page).getByText('First paragraph').dblclick();
  // Wait until the editor itself has taken the selected word (under load WebKit can report it late), so the colour
  // is applied to text rather than stored for the next typing.
  await expect
    .poll(() => page.evaluate(() => !(document.querySelector('.ProseMirror') as unknown as { editor: { state: { selection: { empty: boolean } } } }).editor.state.selection.empty))
    .toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
  await openPopover(page, 'Text colour');
  const hex = page.getByRole('textbox', { name: 'Custom text colour (hex)' });
  await hex.fill('#0e7490');
  await hex.press('Enter');
  await expect(body(page).locator('span[style*="color"]').first()).toHaveCSS('color', 'rgb(14, 116, 144)');
  const size = panel(page).getByRole('spinbutton', { name: 'Custom font size (pt)' });
  await size.scrollIntoViewIfNeeded();
  await size.fill('13.5');
  await size.press('Enter');
  await expect(body(page).locator('span[style*="font-size"]').first()).toHaveCSS('font-size', '18px');
  await expect(panel(page).getByRole('combobox', { name: 'Font size' })).toHaveValue('13.5pt');

  // Format the second paragraph, then paste the editor's own HTML for it after the third (as a copy and paste does).
  await clickText(page, 'Second paragraph');
  await panel(page).getByRole('combobox', { name: 'Text style' }).selectOption('subtitle');
  await panel(page).getByRole('button', { name: 'Increase indent (Ctrl+M)' }).click();
  // A copied block range is a closed ProseMirror slice ("0 0"), as when whole paragraphs are copied.
  const html = await body(page).locator('p').nth(1).evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.setAttribute('data-pm-slice', '0 0 []');
    return copy.outerHTML;
  });
  await clickText(page, 'Third paragraph');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await body(page).evaluate((el, h) => {
    const data = new DataTransfer();
    data.setData('text/html', h);
    data.setData('text/plain', 'Second paragraph.');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, html);
  await waitSaved(page);
  const doc = await blocks(page, id);
  const pasted = doc.filter((n) => n.attrs?.paragraphStyle === 'subtitle');
  expect(pasted).toHaveLength(2);
  for (const n of pasted) expect(n.attrs).toMatchObject({ indentLeft: 36 });
  expect(JSON.stringify(doc)).toContain('"fontSize":"13.5pt"');
  expect(JSON.stringify(doc)).toContain('"color":"#0e7490"');
});

test('on a phone-sized screen the Home tab keeps styles and line spacing, the ruler is hidden and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await newDocument(page);
  await expect(page.getByRole('group', { name: 'Ruler' })).toBeHidden();
  await panel(page).getByRole('combobox', { name: 'Text style' }).selectOption('h2');
  await expect(body(page).locator('h2')).toHaveText('First paragraph of the essay.');
  await openPopover(page, 'Line and paragraph spacing');
  await page.getByRole('button', { name: 'Line spacing 1.5' }).click();
  await expect(body(page).locator('h2')).toHaveAttribute('data-line-spacing', '1.5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
