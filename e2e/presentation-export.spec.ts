import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { inflateSync } from 'node:zlib';
import { createFromQuickStart, downloadBytes, waitSaved } from './helpers';

/**
 * Presentation Studio exports (Phase 7 EXPORT) in a real browser: the Export menu in the editor's ribbon downloads a
 * PowerPoint file and two PDFs (slides, and notes pages) built from what is on screen, and says what it did.
 */

const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });

async function typeInto(page: Page, object: RegExp, text: string) {
  await canvas(page).getByRole('option', { name: object }).dblclick();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-stage] .ProseMirror')).toHaveCount(0);
}

async function exportFile(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  return { name: file.suggestedFilename(), bytes: await downloadBytes(file) };
}

/** The PDF's objects as text, with its content streams inflated. */
function readPdf(bytes: Buffer) {
  const raw = bytes.toString('latin1');
  let streams = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      streams += m[1];
    }
  }
  return { raw, streams, pages: (raw.match(/\/Type \/Page\b/g) ?? []).length, boxes: [...raw.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number)) };
}

test('exports PowerPoint, PDF and PDF with speaker notes from the editor', async ({ page }) => {
  await createFromQuickStart(page, 'Blank presentation');
  await typeInto(page, /^Title placeholder/, 'Export check');
  await page.getByRole('textbox', { name: 'Speaker notes for slide 1' }).click();
  await page.keyboard.type('First note');
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await typeInto(page, /^Title placeholder/, 'Second slide');
  await waitSaved(page);

  // PowerPoint.
  const pptx = await exportFile(page, /^PowerPoint/);
  expect(pptx.name).toMatch(/\.pptx$/);
  await expect(page.getByRole('status').filter({ hasText: 'Exported PowerPoint (2 slides)' })).toBeVisible();
  const zip = await JSZip.loadAsync(pptx.bytes);
  const parts = Object.keys(zip.files);
  expect(parts.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(2);
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide1).toContain('<a:t>Export check</a:t>');
  expect(slide1).toMatch(/<p:ph[^>]*type="title"/);
  expect(await zip.file('ppt/slides/slide2.xml')!.async('string')).toContain('<a:t>Second slide</a:t>');
  expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')).toContain('<a:t>First note</a:t>');
  expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('<p:sldSz cx="9144000" cy="5143500"/>');

  // PDF: one 16:9 page per slide with real text.
  const pdf = await exportFile(page, /^PDF one page per slide/);
  expect(pdf.name).toMatch(/\.pdf$/);
  const slides = readPdf(pdf.bytes);
  expect(slides.raw.startsWith('%PDF')).toBe(true);
  expect(slides.pages).toBe(2);
  for (const b of slides.boxes) expect(b).toEqual([0, 0, 720, 405]);
  expect(slides.streams).toMatch(/\(Export check\)\s*Tj/);
  expect(slides.streams).toMatch(/\(Second slide\)\s*Tj/);
  await expect(page.getByRole('status').filter({ hasText: 'Exported PDF (2 slides)' })).toBeVisible();

  // PDF with speaker notes: portrait notes pages.
  const notes = await exportFile(page, /^PDF with speaker notes/);
  expect(notes.name).toMatch(/\(notes\)\.pdf$/);
  const pages = readPdf(notes.bytes);
  expect(pages.pages).toBe(2);
  expect(pages.boxes[0]).toEqual([0, 0, 540, 720]);
  expect(pages.streams).toMatch(/\(First note\)\s*Tj/);
  expect(pages.streams).toMatch(/\(Export check\)\s*Tj/);
});

test('hidden slides stay in the PowerPoint file and are left out of the PDF, which says so', async ({ page }) => {
  await createFromQuickStart(page, 'Blank presentation');
  await typeInto(page, /^Title placeholder/, 'Shown');
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await typeInto(page, /^Title placeholder/, 'Hidden one');
  const second = page.getByRole('listbox', { name: 'Slides' }).getByRole('option').nth(1);
  await second.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Hide slide/ }).click();
  await expect(second).toHaveAccessibleName(/hidden in the slide show/);

  const pptx = await JSZip.loadAsync((await exportFile(page, /^PowerPoint/)).bytes);
  expect(await pptx.file('ppt/slides/slide2.xml')!.async('string')).toMatch(/<p:sld [^>]*show="0"/);

  const pdf = readPdf((await exportFile(page, /^PDF one page per slide/)).bytes);
  expect(pdf.pages).toBe(1);
  expect(pdf.streams).not.toMatch(/\(Hidden one\)/);
  await expect(page.getByRole('status').filter({ hasText: '1 hidden slide was left out.' })).toBeVisible();
});

test('the Export menu works from the keyboard alone (Round 3)', async ({ page }) => {
  await createFromQuickStart(page, 'Blank presentation');
  await typeInto(page, /^Title placeholder/, 'Keys only');
  await page.getByRole('button', { name: 'Export' }).focus();
  await page.keyboard.press('Enter');
  // The first item has the focus once the menu is open; the arrow keys move along it.
  await expect(page.getByRole('menuitem', { name: /^PowerPoint/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /^PDF one page per slide/ })).toBeFocused();
  const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readPdf(await downloadBytes(file)).streams).toMatch(/\(Keys only\)\s*Tj/);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Export menu fits the screen and exports', async ({ page }) => {
    await createFromQuickStart(page, 'Blank presentation');
    await typeInto(page, /^Title placeholder/, 'Pocket');
    const button = page.getByRole('button', { name: 'Export' });
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await button.click();
    for (const item of await page.getByRole('menuitem').all()) {
      const b = (await item.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    await page.keyboard.press('Escape');
    const pdf = readPdf((await exportFile(page, /^PDF one page per slide/)).bytes);
    expect(pdf.streams).toMatch(/\(Pocket\)\s*Tj/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
