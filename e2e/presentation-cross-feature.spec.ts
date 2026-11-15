import { expect, test, type Page } from './fixtures';
import JSZip from 'jszip';
import { deflateSync, inflateSync } from 'node:zlib';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/**
 * Phase 7 Round 3, the cross-feature case: one presentation that uses every group's work at once — a theme, a custom
 * slide master (DESIGN), a picture, a chart, a table and a diagram (CONTENT), a transition, an animation and speaker
 * notes (SHOW) — made through the real UI, then taken through save, reload, a saved version and its restore, the trash
 * and back, a backup restored into an empty profile, the slide show, and both exports (EXPORT). Nothing may change on
 * the way, and every feature must reach the files.
 */

type El = { id: string; type: string; placeholderId?: string; animation?: { effect: string; trigger: string }; attachmentId?: string; previewId?: string; [k: string]: unknown };
type Slide = { id: string; layoutId: string; elements: El[]; notes: unknown; transition?: { type: string } };
type Content = { themeId: string; theme: { colors: Record<string, string> }; masters: Array<{ decorations: El[]; placeholders: Array<{ id: string; style: { fontSize: number } }> }>; slides: Slide[] };
type Item = { id: string; title: string; content: Content; deletedAt: string | null };

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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

const slides = (page: Page) => page.getByRole('listbox', { name: 'Slides' });
const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });
const insert = async (page: Page) => {
  await page.getByRole('tab', { name: 'Insert' }).click();
  return page.getByRole('toolbar', { name: 'Insert' });
};
const show = (page: Page) => page.getByRole('dialog', { name: 'Slide show' });

async function item(page: Page, id: string): Promise<Item> {
  return (await readStore<Item>(page, 'presentations')).find((i) => i.id === id)!;
}

async function exportFile(page: Page, menuItem: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: menuItem }).click()]);
  return downloadBytes(file);
}

function pdfOf(bytes: Buffer) {
  const raw = bytes.toString('latin1');
  let streams = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      streams += m[1];
    }
  }
  return { pages: (raw.match(/\/Type \/Page\b/g) ?? []).length, streams, images: (raw.match(/\/Subtype \/Image/g) ?? []).length };
}

/** What the PowerPoint file holds, checked against the stored presentation. */
async function checkPptx(bytes: Buffer, content: Content, slideIndex: number, words: { notes: string; cell: string }) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const read = (n: string) => zip.file(n)!.async('string');
  expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(content.slides.length);
  const slide = await read(`ppt/slides/slide${slideIndex + 1}.xml`);
  // CONTENT: a native table with the typed cell, a native chart, the picture and the diagram as pictures.
  expect(slide).toContain('<a:tbl>');
  expect(slide).toContain(`<a:t>${words.cell}</a:t>`);
  expect(slide).toMatch(/<c:chart [^>]*r:id=/);
  expect((slide.match(/<p:pic>/g) ?? []).length).toBe(2);
  expect(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(true);
  expect(names.some((n) => /^ppt\/embeddings\/.*\.xlsx$/.test(n))).toBe(true);
  // The diagram's PNG carries its data (editable when brought back into Classroom OS).
  const media = await Promise.all(names.filter((n) => /^ppt\/media\/.*\.png$/.test(n)).map((n) => zip.file(n)!.async('nodebuffer')));
  expect(media.some((b) => b.includes(Buffer.from('dcos-diagram')))).toBe(true);
  // SHOW: the transition and the chart's animation, in schema order.
  expect(slide).toMatch(/<\/p:clrMapOvr><p:transition[^>]*>[\s\S]*<\/p:transition><p:timing>/);
  expect(slide).toContain('presetClass="entr"');
  const notesRel = await read(`ppt/slides/_rels/slide${slideIndex + 1}.xml.rels`);
  const notesPart = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(notesRel)![1];
  expect(await read(`ppt/notesSlides/${notesPart}`)).toContain(words.notes);
  // DESIGN: the theme's colours, and the custom master's added rectangle on the layouts.
  const theme = await read('ppt/theme/theme1.xml');
  expect(theme.toLowerCase()).toContain(content.theme.colors.accent1.replace('#', '').toLowerCase());
  const layoutXml = await Promise.all(names.filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).map(read));
  expect(layoutXml.some((x) => x.includes('prst="rect"'))).toBe(true);
}

test.use({ actionTimeout: 20_000 });

test('one presentation with every feature survives save, reload, versions, trash, backup and restore, the show and both exports', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);

  // ── DESIGN: a themed template, another theme, and a custom master ──
  const id = await createFromQuickStart(page, 'Lecture slides');
  await expect(slides(page).getByRole('option')).toHaveCount(6);
  await page.getByRole('tab', { name: 'Design' }).click();
  const design = page.getByRole('toolbar', { name: 'Design' });
  await design.getByRole('button', { name: 'Themes' }).click();
  await page.getByRole('radio', { name: 'Midnight theme' }).click();
  await page.keyboard.press('Escape');
  await design.getByRole('button', { name: 'Edit the slide master and layouts' }).click();
  await page.getByRole('listbox', { name: 'Slide master and layouts' }).getByRole('option', { name: /^Slide master/ }).click();
  await page.getByRole('listbox', { name: 'Objects on the slide master' }).getByRole('option', { name: /^Title placeholder/ }).click();
  const master = page.getByRole('toolbar', { name: 'Slide Master' });
  await master.getByRole('combobox', { name: 'Font size' }).selectOption('40');
  await master.getByRole('button', { name: 'Rectangle' }).click();
  await page.getByRole('button', { name: 'Close master view' }).click();
  await waitSaved(page);
  await expect.poll(async () => (await item(page, id)).content.masters[0].decorations.length).toBe(3);

  // ── CONTENT on a new slide: picture, chart, table, diagram ──
  await slides(page).getByRole('option').last().click();
  await page.getByRole('tab', { name: 'Home' }).click();
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await expect(slides(page).getByRole('option')).toHaveCount(7);
  const at = 6;
  const chooser = page.waitForEvent('filechooser');
  await (await insert(page)).getByRole('button', { name: 'Picture' }).click();
  await (await chooser).setFiles({ name: 'onion-cells.png', mimeType: 'image/png', buffer: png(160, 90, [200, 40, 40]) });
  await expect(canvas(page).getByRole('option', { name: /^Picture: onion cells/ })).toBeVisible();

  await (await insert(page)).getByRole('button', { name: 'Chart' }).click();
  await page.getByRole('menuitem', { name: 'Column chart' }).click();
  await expect(page.locator('[data-stage] svg[data-chart="column"]')).toBeVisible();
  // SHOW: the new chart (selected) fades in on a click. (Set now: the objects inserted next lie over it.)
  await expect(canvas(page).getByRole('option', { name: /^Chart/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Animations' }).click();
  await page.getByRole('toolbar', { name: 'Animations' }).getByRole('button', { name: 'Fade', exact: true }).click();

  await (await insert(page)).getByRole('button', { name: 'Table' }).click();
  await page.getByRole('button', { name: 'Insert a table of 2 rows by 2 columns' }).click();
  await canvas(page).getByRole('option', { name: /^Table/ }).dblclick({ position: { x: 20, y: 18 } });
  await expect(page.getByRole('textbox', { name: 'Cell, row 1, column 1' })).toBeFocused();
  await page.keyboard.type('Organelle');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-table-editor]')).toHaveCount(0);

  await (await insert(page)).getByRole('button', { name: 'Diagram' }).click();
  await page.getByRole('menuitem', { name: 'New from “Flowchart”' }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert on slide' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-stage] [data-element] img').last()).toHaveJSProperty('complete', true);

  // ── SHOW: a transition and notes ──
  await page.getByRole('tab', { name: 'Transitions' }).click();
  await page.getByRole('toolbar', { name: 'Transitions' }).getByRole('button', { name: 'Fade', exact: true }).click();
  await page.getByRole('textbox', { name: /speaker notes/i }).click();
  await page.keyboard.type('Point at the chart last');
  await waitSaved(page);
  await expect
    .poll(async () => {
      const s = (await item(page, id)).content.slides[at];
      return [s.elements.map((e) => e.type).filter((t) => t !== 'text').sort().join(','), s.transition?.type, s.elements.find((e) => e.type === 'chart')?.animation?.effect, JSON.stringify(s.notes).includes('Point at the chart last')];
    })
    .toEqual(['chart,diagram,image,table', 'fade', 'fade', true]);

  // ── Save a version (Ctrl/⌘+S), then reload: nothing changes ──
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(async () => (await readStore<{ itemId: string; reason: string }>(page, 'presentation_versions')).filter((v) => v.itemId === id && v.reason === 'manual').length, { timeout: 10_000 }).toBe(1);
  const saved = (await item(page, id)).content;
  expect(saved.themeId).toBe('midnight');
  expect(saved.masters[0].placeholders.find((p) => p.id === 'title')!.style.fontSize).toBe(40);
  await page.reload();
  await expect(slides(page).getByRole('option')).toHaveCount(7);
  expect((await item(page, id)).content).toEqual(saved);
  await slides(page).getByRole('option').nth(at).click();
  await expect(page.locator('[data-stage] svg[data-chart="column"]')).toBeVisible();
  await expect(page.locator('[data-stage] img').first()).toHaveJSProperty('naturalWidth', 160);

  // ── The slide show from this slide: the chart waits for its click ──
  await page.keyboard.press('Shift+F5');
  await expect(show(page)).toBeVisible();
  const chartId = saved.slides[at].elements.find((e) => e.type === 'chart')!.id;
  const chart = page.locator(`dialog[open] [data-show-slide="${saved.slides[at].id}"] [data-element="${chartId}"]`);
  await expect.poll(() => chart.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  await page.keyboard.press('Space');
  await expect.poll(() => chart.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  await page.keyboard.press('Escape');
  await expect(show(page)).toBeHidden();
  expect((await item(page, id)).content).toEqual(saved);

  // ── A later edit, then the saved version restored ──
  await page.getByRole('tab', { name: 'Transitions' }).click();
  await page.getByRole('toolbar', { name: 'Transitions' }).getByRole('button', { name: 'None', exact: true }).click();
  await waitSaved(page);
  await expect.poll(async () => (await item(page, id)).content.slides[at].transition).toBeUndefined();
  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await history.getByRole('listitem').filter({ hasText: 'Saved version' }).getByRole('button', { name: 'Restore' }).click();
  await expect(history).toBeHidden();
  await expect.poll(async () => (await item(page, id)).content).toEqual(saved);
  await expect(slides(page).getByRole('option')).toHaveCount(7);

  // ── To the trash and back ──
  await page.goto('./#/presentations');
  const row = page.locator('div.group', { hasText: 'Lecture' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await expect.poll(async () => (await item(page, id)).deletedAt).not.toBeNull();
  await page.goto('./#/trash');
  const trashed = page.locator('div.group', { hasText: 'Lecture' }).first();
  await trashed.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect.poll(async () => (await item(page, id)).deletedAt).toBeNull();
  expect((await item(page, id)).content).toEqual(saved);

  // ── Both exports from this profile ──
  await page.goto(`./#/presentations/${id}`);
  await expect(slides(page).getByRole('option')).toHaveCount(7);
  await checkPptx(await exportFile(page, /^PowerPoint/), saved, at, { notes: 'Point at the chart last', cell: 'Organelle' });
  const pdf = pdfOf(await exportFile(page, /^PDF one page per slide/));
  expect(pdf.pages).toBe(saved.slides.length);
  expect(pdf.streams).toMatch(/\(Organelle\)\s*Tj/);
  expect(pdf.images).toBeGreaterThanOrEqual(2);
  const notesPdf = pdfOf(await exportFile(page, /^PDF with speaker notes/));
  expect(notesPdf.streams).toMatch(/\(Point at the chart last\)\s*Tj/);

  // ── A backup restored into an empty profile: the same presentation, pictures included, and it exports the same ──
  await page.goto('./#/settings/backup');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const backup = await downloadBytes(download);
  const usedAttachments = new Set(saved.slides[at].elements.flatMap((e) => [e.attachmentId, e.previewId].filter((x): x is string => !!x)));
  expect(usedAttachments.size).toBeGreaterThanOrEqual(2);
  const context = await browser.newContext({ baseURL });
  try {
    const page2 = await context.newPage();
    await page2.goto('./#/settings/backup');
    await expect(page2.getByRole('button', { name: 'Restore from file' })).toBeVisible();
    await page2.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await expect.poll(async () => (await readStore<Item>(page2, 'presentations')).find((i) => i.id === id)?.content, { timeout: 20_000 }).toEqual(saved);
    const attachments2 = new Set((await readStore<{ id: string }>(page2, 'attachments')).map((a) => a.id));
    for (const a of usedAttachments) expect(attachments2.has(a), a).toBe(true);
    expect((await readStore<{ itemId: string }>(page2, 'presentation_versions')).filter((v) => v.itemId === id).length).toBeGreaterThanOrEqual(2);
    await page2.goto(`./#/presentations/${id}`);
    await slides(page2).getByRole('option').nth(at).click();
    await expect(page2.locator('[data-stage] svg[data-chart="column"]')).toBeVisible();
    await expect(page2.locator('[data-stage] img').first()).toHaveJSProperty('naturalWidth', 160);
    await checkPptx(await exportFile(page2, /^PowerPoint/), saved, at, { notes: 'Point at the chart last', cell: 'Organelle' });
  } finally {
    await context.close();
  }
});
