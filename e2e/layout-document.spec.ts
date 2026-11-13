import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, G-LAYOUT: the Layout tab end to end (page sizes, sections, columns, header/footer parts, page numbers). */

type Stored = { id: string; content: { schemaVersion: number; doc: { content: Array<{ type: string; attrs?: Record<string, unknown> }> }; page: Record<string, unknown> } };
const stored = async (page: Page, id: string) => (await readStore<Stored>(page, 'documents')).find((d) => d.id === id)!.content;

/** Opens the Layout tab of a new Assignment in Advanced mode, with the cursor at the end of the answer line. */
async function openLayout(page: Page) {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'advanced' }).click();
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Layout' }).click();
  return { id, panel: page.getByRole('tabpanel') };
}

/** Clicks a ribbon control, scrolling the toolbar first (a scrolling toolbar closes menus on narrow screens). */
async function press(page: Page, name: string) {
  const button = page.getByRole('tabpanel').getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await button.click();
}

test('Layout: paper size, a landscape two-column section, header/footer parts and page numbers save and export as Word sections', async ({ page }) => {
  const { id, panel } = await openLayout(page);

  await panel.getByRole('combobox', { name: 'Paper size' }).selectOption('A5');
  await press(page, 'Breaks');
  await page.getByRole('menuitem', { name: 'Section break (next page)' }).click();
  await expect(panel.getByText('Section 2 of 2')).toBeVisible();
  await panel.getByRole('combobox', { name: 'Orientation (section 2)' }).selectOption('landscape');
  await panel.getByRole('combobox', { name: 'Columns (section 2)' }).selectOption('2');
  const marker = page.locator('.ProseMirror [data-type="section-break"]');
  await expect(marker).toHaveAttribute('data-label', 'Section break — section 2: Next page · Landscape · 2 columns');
  await expect(marker).toHaveAttribute('role', 'separator');

  await press(page, 'Header & footer');
  const hf = page.getByRole('dialog').filter({ hasText: 'Header and footer' });
  await hf.getByRole('textbox', { name: 'Header: left' }).fill('Physics');
  await hf.getByRole('textbox', { name: 'Header: right' }).fill('Asha R.');
  await hf.getByRole('checkbox', { name: 'Different first page' }).check();
  await hf.getByRole('textbox', { name: 'First page header: centre' }).fill('Cover');
  await hf.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.dcos-paper-header')).toHaveText('Cover');

  await press(page, 'Page numbers');
  const pn = page.getByRole('dialog').filter({ hasText: 'Page numbers' });
  await pn.getByRole('combobox', { name: 'Position' }).selectOption('right');
  await pn.getByRole('combobox', { name: 'Number format' }).selectOption('lowerRoman');
  await pn.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.dcos-paper-footer span').last()).toHaveText('Page # of #');

  await waitSaved(page);
  const content = await stored(page, id);
  expect(content.schemaVersion).toBe(2);
  expect(content.page).toMatchObject({ size: 'A5', orientation: 'portrait', headerLeft: 'Physics', headerRight: 'Asha R.', pageNumberAlign: 'right', pageNumberFormat: 'lowerRoman' });
  expect(content.page.firstPage).toMatchObject({ header: { center: 'Cover' }, pageNumbers: false });
  const brk = content.doc.content.find((n) => n.type === 'sectionBreak');
  expect(brk?.attrs).toMatchObject({ breakType: 'nextPage', orientation: 'landscape', columns: 2 });

  // Survives a reload.
  await page.reload();
  await expect(page.locator('.ProseMirror [data-type="section-break"]')).toHaveAttribute('data-label', /Landscape · 2 columns/);

  // Word: two real sections, the second landscape with two columns; the first page has its own header.
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(download));
  const xml = await zip.file('word/document.xml')!.async('string');
  const sections = xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [];
  expect(sections).toHaveLength(2);
  expect(sections[0]).toContain('<w:pgSz w:w="8391" w:h="11906" w:orient="portrait"/>');
  expect(sections[0]).toContain('<w:titlePg/>');
  expect(sections[0]).toContain('<w:pgNumType w:fmt="lowerRoman"/>');
  expect(sections[1]).toContain('<w:type w:val="nextPage"/>');
  expect(sections[1]).toContain('<w:pgSz w:w="11906" w:h="8391" w:orient="landscape"/>');
  expect(sections[1]).toMatch(/<w:cols [^>]*w:num="2"/);
});

test('a continuous section changes only its columns; removing the break returns to one section', async ({ page }) => {
  const { id, panel } = await openLayout(page);
  await press(page, 'Breaks');
  await page.getByRole('menuitem', { name: 'Section break (continuous)' }).click();
  await expect(panel.getByText('Section 2 of 2')).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Orientation (section 2)' })).toBeDisabled();
  await panel.getByRole('combobox', { name: 'Columns (section 2)' }).selectOption('3');
  await expect(page.locator('.ProseMirror [data-type="section-break"]')).toHaveAttribute('data-label', 'Section break — section 2: Continuous · 3 columns');

  // The keyboard reaches the section settings.
  const settings = panel.getByRole('button', { name: 'Section 2 settings' });
  await settings.scrollIntoViewIfNeeded();
  await settings.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog').filter({ hasText: 'Section 2 of 2' });
  await expect(dialog.getByRole('combobox', { name: 'Orientation' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Remove section break' }).click();
  await expect(page.locator('.ProseMirror [data-type="section-break"]')).toHaveCount(0);
  await expect(panel.getByText('Section 1 of 1')).toBeVisible();
  await waitSaved(page);
  const content = await stored(page, id);
  expect(content.doc.content.some((n) => n.type === 'sectionBreak')).toBe(false);
  // Nothing beyond v0.1.0 is left, so the document is readable by v0.1.0 again.
  expect(content.schemaVersion).toBe(1);

  // The Layout controls fit the screen: no horizontal page scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

/** Makes a landscape two-column second section and returns the print page the PDF export builds. */
async function printHtml(page: Page) {
  const { panel } = await openLayout(page);
  await press(page, 'Breaks');
  await page.getByRole('menuitem', { name: 'Section break (next page)' }).click();
  await panel.getByRole('combobox', { name: 'Orientation (section 2)' }).selectOption('landscape');
  await panel.getByRole('combobox', { name: 'Columns (section 2)' }).selectOption('2');
  await waitSaved(page);

  // Capture the print page instead of opening the system print dialog.
  await page.evaluate(() => {
    const w = window as unknown as { __printHtml?: string };
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes)) {
          if (n instanceof HTMLIFrameElement && n.contentWindow) {
            n.contentWindow.print = () => {
              w.__printHtml = n.contentDocument!.documentElement.outerHTML;
            };
          }
        }
    }).observe(document.body, { childList: true });
  });
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __printHtml?: string }).__printHtml)).toBe(true);
  return page.evaluate(() => (window as unknown as { __printHtml: string }).__printHtml);
}

test('print: each section is wrapped for its columns and named page, without the break markers', async ({ page }) => {
  const html = await printHtml(page);
  expect(html).not.toContain('data-type="section-break"');
  expect(html).toContain('<div class="dcos-print-section" data-section="1">');
  expect(html).toContain('data-section="2" style="column-count: 2; column-gap: 12.7mm; break-before: page; page: dcos-g1"');
  expect(html).toContain('@page dcos-g1 { size: 297mm 210mm;');
});

test('print: Chromium prints the landscape section on landscape pages', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'page.pdf() is Chromium-only');
  const html = await printHtml(page);
  const printPage = await context.newPage();
  await printPage.setContent(html);
  const pdf = (await printPage.pdf({ preferCSSPageSize: true })).toString('latin1');
  const boxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => (Number(m[1]) > Number(m[2]) ? 'landscape' : 'portrait'));
  // The first page is portrait A4; the section's page is landscape.
  expect(boxes).toEqual(['portrait', 'landscape']);
});
