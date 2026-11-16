import { expect, test, type Page } from './fixtures';
import { deflateSync } from 'node:zlib';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio CONTENT (Phase 7 Round 2b) in a real browser: pictures stored as attachments (insert, alt text,
 * crop, pasted), shapes with text, tables edited cell by cell, charts drawn from their data and edited in the data
 * grid, and diagrams made in the app's diagram editor and edited again. A reload keeps everything.
 */

type Doc = { type: 'doc'; content: unknown[] };
type El = { id: string; type: string; x: number; y: number; w: number; h: number; [k: string]: unknown };
type Content = { slides: Array<{ id: string; layoutId: string; elements: El[] }> };
type Item = { id: string; content: Content };

const plain = (doc: unknown): string => (JSON.stringify(doc ?? '').match(/"text":"([^"]*)"/g) ?? []).map((m) => m.slice(8, -1)).join('|');
async function stored(page: Page, id: string): Promise<Content> {
  const items = await readStore<Item>(page, 'presentations');
  return items.find((i) => i.id === id)!.content;
}
const elementsOf = async (page: Page, id: string, type: string) => (await stored(page, id)).slides[0].elements.filter((e) => e.type === type);

/** A w × h PNG of one colour. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgb)))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });
const insert = async (page: Page) => {
  await page.getByRole('tab', { name: 'Insert' }).click();
  return page.getByRole('toolbar', { name: 'Insert' });
};

test('pictures, shapes, tables and charts: insert, edit in place, inspector, undo, and a reload that keeps them', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Blank presentation');

  // ── A picture from a file, stored as an attachment ──
  const bar = await insert(page);
  const chooser = page.waitForEvent('filechooser');
  await bar.getByRole('button', { name: 'Picture' }).click();
  await (await chooser).setFiles({ name: 'onion-cells.png', mimeType: 'image/png', buffer: png(200, 100, [200, 40, 40]) });
  const picture = canvas(page).getByRole('option', { name: /^Picture: onion cells/ });
  await expect(picture).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-stage] img')).toHaveJSProperty('naturalWidth', 200);
  await waitSaved(page);
  const [img] = await elementsOf(page, id, 'image');
  expect(img).toMatchObject({ mimeType: 'image/png', naturalWidth: 200, naturalHeight: 100, alt: 'onion cells', fit: 'contain' });
  const attachments = await readStore<{ id: string }>(page, 'attachments');
  expect(attachments.map((a) => a.id)).toContain(img.attachmentId);

  // Alt text and crop from the inspector.
  const pictureSettings = page.getByRole('complementary', { name: 'Picture settings' });
  await pictureSettings.getByLabel('Alt text').fill('Onion skin cells under a microscope');
  await pictureSettings.getByLabel('Left').fill('25');
  await pictureSettings.getByLabel('Left').press('Enter');
  await expect.poll(async () => (await elementsOf(page, id, 'image'))[0]?.crop).toEqual({ left: 0.25, top: 0, right: 0, bottom: 0 });
  await expect.poll(async () => (await elementsOf(page, id, 'image'))[0]?.alt).toBe('Onion skin cells under a microscope');

  // ── A shape with text typed into it ──
  await (await insert(page)).getByRole('button', { name: 'Shapes' }).click();
  await page.getByRole('dialog', { name: 'Shapes' }).getByRole('button', { name: 'Rounded rectangle' }).click();
  await canvas(page).getByRole('option', { name: /^Shape/ }).dblclick();
  await expect(page.locator('[data-shape-text-editor] .ProseMirror')).toBeFocused();
  await page.keyboard.type('Nucleus');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-shape-text-editor]')).toHaveCount(0);
  await page.getByRole('complementary', { name: 'Shape settings' }).getByRole('combobox', { name: 'Fill' }).selectOption('theme:accent2');
  await expect.poll(async () => (await elementsOf(page, id, 'shape'))[0]).toMatchObject({ preset: 'roundRect', fill: { type: 'solid', color: { theme: 'accent2' } } });
  expect(plain((await elementsOf(page, id, 'shape'))[0].text)).toBe('Nucleus');

  // ── A table: insert, type into cells with Tab ──
  await (await insert(page)).getByRole('button', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Insert a table of 3 rows by 2 columns' }).click();
  // A double-click opens the cell under the pointer; another cell is a click away and takes the focus at once
  // (a click on a cell once moved the focus to the page, and the typing was lost).
  await canvas(page).getByRole('option', { name: /^Table/ }).dblclick({ position: { x: 20, y: 18 } });
  await expect(page.getByRole('textbox', { name: 'Cell, row 1, column 1' })).toBeFocused();
  await page.locator('[data-cell="2:1"]').click();
  await expect(page.getByRole('textbox', { name: 'Cell, row 3, column 2' })).toBeFocused();
  await page.locator('[data-cell="0:0"]').click();
  await expect(page.getByRole('textbox', { name: 'Cell, row 1, column 1' })).toBeFocused();
  await page.keyboard.type('Organelle');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Job');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Ribosome');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-table-editor]')).toHaveCount(0);
  const tableSettings = page.getByRole('complementary', { name: 'Table settings' });
  await tableSettings.getByRole('button', { name: 'Row at end' }).click();
  await expect.poll(async () => ((await elementsOf(page, id, 'table'))[0]?.rows as unknown[] | undefined)?.length).toBe(4);
  const table = (await elementsOf(page, id, 'table'))[0] as El & { rows: Array<{ cells: Array<{ text: Doc }> }> };
  expect(table.rows[0].cells.map((c) => plain(c.text))).toEqual(['Organelle', 'Job']);
  expect(plain(table.rows[1].cells[0].text)).toBe('Ribosome');

  // ── A chart: drawn from its data, edited in the data grid ──
  await (await insert(page)).getByRole('button', { name: 'Chart' }).click();
  await page.getByRole('menuitem', { name: 'Column chart' }).click();
  await expect(page.locator('[data-stage] svg[data-chart="column"] rect[data-role^="series-"]')).toHaveCount(8);
  await canvas(page).getByRole('option', { name: /^Chart/ }).dblclick();
  const grid = page.locator('dialog[open]').filter({ has: page.getByRole('heading', { name: 'Edit chart data' }) });
  await grid.getByLabel('Class A, Week 1').fill('95');
  await grid.getByRole('button', { name: 'Remove category Week 4' }).click();
  await grid.getByRole('button', { name: 'Save data' }).click();
  await expect(grid).toBeHidden();
  await expect(page.locator('[data-stage] svg[data-chart="column"] rect[data-role^="series-"]')).toHaveCount(6);
  await expect.poll(async () => (await elementsOf(page, id, 'chart'))[0]).toMatchObject({ categories: ['Week 1', 'Week 2', 'Week 3'], series: [{ name: 'Class A', values: [95, 70, 74] }, { name: 'Class B', values: [55, 64, 69] }] });

  // One undo takes the data edit back (one step), redo brings it again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => ((await elementsOf(page, id, 'chart'))[0]?.categories as string[] | undefined)?.length).toBe(4);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => ((await elementsOf(page, id, 'chart'))[0]?.categories as string[] | undefined)?.length).toBe(3);

  // ── Reload: everything is kept and drawn again ──
  await waitSaved(page);
  const before = await stored(page, id);
  await page.reload();
  await expect(canvas(page).getByRole('option', { name: /^Picture: Onion skin cells/ })).toBeVisible();
  await expect(page.locator('[data-stage] img')).toHaveJSProperty('naturalWidth', 200);
  await expect(page.locator('[data-stage] svg[data-chart="column"]')).toBeVisible();
  expect(await stored(page, id)).toEqual(before);
});

test('pictures pasted from the clipboard are added to the slide', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pasting a synthetic file needs DataTransfer construction, checked in Chromium.');
  const id = await createFromQuickStart(page, 'Blank presentation');
  await canvas(page).focus();
  const bytes = [...png(60, 40, [0, 120, 200])];
  await canvas(page).evaluate((el, data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'pasted.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    // Firefox's event does not carry the clipboardData given to its constructor (the paste arrived empty in CI), so it is set here.
    Object.defineProperty(event, 'clipboardData', { value: dt });
    el.dispatchEvent(event);
  }, bytes);
  await expect(canvas(page).getByRole('option', { name: /^Picture/ })).toBeVisible();
  await waitSaved(page);
  expect((await elementsOf(page, id, 'image'))[0]).toMatchObject({ naturalWidth: 60, naturalHeight: 40 });
});

test('diagrams: made in the app’s diagram editor, placed on the slide, edited again with a double-click', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Blank presentation');
  await (await insert(page)).getByRole('button', { name: 'Diagram' }).click();
  await page.getByRole('menuitem', { name: 'New from “Flowchart”' }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await expect(dialog.getByText('This diagram will be placed on your slide.')).toBeAttached();
  await dialog.getByRole('button', { name: 'Insert on slide' }).click();
  await expect(dialog).toBeHidden();
  const option = canvas(page).getByRole('option', { name: /^Diagram/ });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-stage] [data-element] img')).toHaveJSProperty('complete', true);
  await waitSaved(page);
  const [d] = await elementsOf(page, id, 'diagram');
  expect(typeof d.previewId).toBe('string');
  expect((d.previewId as string).length).toBeGreaterThan(0);
  // The dialog's draft is gone once the diagram is on the slide.
  const drafts = await readStore<{ itemId: string; session: string }>(page, 'drafts');
  expect(drafts.filter((x) => x.itemId === id && x.session.startsWith('diagram-dialog:'))).toEqual([]);

  // Edit it again: same place and width, a new preview.
  await option.dblclick();
  const edit = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(edit.locator('.react-flow__node').first()).toBeVisible();
  await edit.getByRole('textbox', { name: 'Diagram title' }).fill('Lab steps');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(async () => (await elementsOf(page, id, 'diagram'))[0]?.title).toBe('Lab steps');
  const [after] = await elementsOf(page, id, 'diagram');
  expect([after.x, after.y, after.w]).toEqual([d.x, d.y, d.w]);
  expect(typeof after.previewId).toBe('string');
});

test('at phone width the inspector folds away and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createFromQuickStart(page, 'Blank presentation');
  // The ribbon scrolls sideways at this width. A menu opened from it follows its button when the ribbon scrolls
  // (Round 3: it used to close, so the item had to be tapped by its coordinates).
  const chart = (await insert(page)).getByRole('button', { name: 'Chart' });
  await chart.click();
  await page.getByRole('menuitem', { name: 'Pie chart' }).click();
  const settings = page.getByRole('complementary', { name: 'Chart settings' });
  const toggle = settings.getByRole('button', { name: 'Chart', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await settings.getByRole('combobox', { name: 'Legend' }).selectOption('right');
  await expect(page.locator('[data-stage] svg[data-chart="pie"] path[data-role^="slice-"]')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
