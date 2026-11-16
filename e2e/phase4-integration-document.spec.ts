import { expect, test, type Page } from './fixtures';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/**
 * Phase 4 integration (Round 3): Simple mode is a curated core and Advanced shows every control; the ribbon works at
 * phone width; features of different groups work together in the real app (an equation in a table cell and a
 * comment on a heading, exported to Word).
 */

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };
type StoredDoc = { id: string; content: { schemaVersion: number; doc: Node; comments?: Array<{ id: string; text: string }> } };
const stored = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const panel = (page: Page) => page.getByRole('tabpanel');
const tabNames = async (page: Page) => (await page.getByRole('tablist', { name: 'Toolbar' }).getByRole('tab').allTextContents()).map((s) => s.trim());

/** Clicks a ribbon control, scrolling the toolbar first (it scrolls sideways on narrow screens). */
async function ribbonClick(page: Page, name: string) {
  const button = panel(page).getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await button.click();
}

async function selectText(page: Page, selector: string, word: string) {
  const el = page.locator(selector).first();
  await el.evaluate((node, w) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t: globalThis.Node | null;
    while ((t = walker.nextNode())) {
      const i = t.textContent!.indexOf(w);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(t, i);
      range.setEnd(t, i + w.length);
      (node.closest('.ProseMirror') as HTMLElement).focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return;
    }
    throw new Error('text not found');
  }, word);
  // Wait until the editor has taken the selection.
  await page.waitForFunction(() => {
    const ed = (document.querySelector('.ProseMirror') as unknown as { editor?: { state: { selection: { empty: boolean } } } }).editor;
    return ed && !ed.state.selection.empty;
  });
}

test('Simple mode shows a curated core; Advanced shows every tab and control', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'simple' }).click();
  // The Diagram tab (inserting and editing diagrams) is part of the core in both modes.
  expect(await tabNames(page)).toEqual(['Home', 'Insert', 'Diagram']);
  for (const name of ['Undo (Ctrl+Z)', 'Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Underline (Ctrl+U)', 'Text colour', 'Highlight', 'Bulleted list', 'Numbered list', 'Centre', 'Line and paragraph spacing'])
    await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
  await expect(panel(page).getByRole('combobox', { name: 'Text style' })).toHaveCount(1);
  for (const name of ['Subscript', 'Increase indent (Ctrl+M)', 'Bullet style']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole('combobox', { name: 'Font', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Insert' }).click();
  for (const name of ['Link (Ctrl+K)', 'Insert image', 'Insert table']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
  for (const name of ['Insert equation', 'Insert shape', 'Insert text box', 'Table of contents']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(0);

  await page.getByRole('radio', { name: 'advanced' }).click();
  expect(await tabNames(page)).toEqual(['Home', 'Insert', 'Layout', 'Review', 'Diagram']);
  for (const name of ['Insert equation', 'Insert shape', 'Insert text box', 'Table of contents', 'Page break (Ctrl+Enter)']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect(panel(page).getByRole('combobox', { name: 'Font', exact: true })).toHaveCount(1);
  for (const name of ['Subscript', 'Increase indent (Ctrl+M)', 'Bullet style', 'Numbering format', 'Paragraph settings']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Layout' }).click();
  for (const name of ['Breaks', 'Header & footer', 'Page numbers']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Review' }).click();
  for (const name of ['Find and replace (Ctrl+F)', 'New comment']) await expect(panel(page).getByRole('button', { name, exact: true })).toHaveCount(1);
});

test('at phone width every ribbon tab and control is reachable, with no sideways page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'advanced' }).click();
  const width = 375;
  // The mode switch and Export stay on screen.
  for (const loc of [page.getByRole('radiogroup', { name: 'Editor mode' }), page.getByRole('button', { name: 'Export' })]) {
    const box = (await loc.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
  for (const tab of ['Home', 'Insert', 'Layout', 'Review']) {
    await page.getByRole('tab', { name: tab }).click();
    const toolbar = page.getByRole('toolbar', { name: tab });
    // The toolbar row holds most of the screen width on a phone (the mode switch sits on its own row).
    expect((await toolbar.boundingBox())!.width).toBeGreaterThan(width * 0.9);
    const controls = toolbar.locator('button:visible, select:visible, input:visible');
    const n = await controls.count();
    expect(n, tab).toBeGreaterThan(2);
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i);
      await c.scrollIntoViewIfNeeded();
      const box = (await c.boundingBox())!;
      expect(box.x, `${tab} control ${i}`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `${tab} control ${i}`).toBeLessThanOrEqual(width + 1);
    }
    expect(await noSideScroll(page), tab).toBe(true);
  }
  // A popover opened from the scrolled toolbar stays on screen.
  await page.getByRole('tab', { name: 'Home' }).click();
  await ribbonClick(page, 'Line and paragraph spacing');
  const pop = page.getByRole('group', { name: 'Line spacing' });
  await expect(pop).toBeVisible();
  const box = (await pop.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(await noSideScroll(page)).toBe(true);
  await page.keyboard.press('Escape');
  // An Insert control works at this width: a table goes in.
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await ribbonClick(page, 'Insert table');
  await page.getByRole('button', { name: '2 by 2 table' }).click();
  await expect(page.locator('.ProseMirror table')).toHaveCount(1);
  expect(await noSideScroll(page)).toBe(true);
});

test('an equation in a table cell and a comment on a heading, saved and exported to Word', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.getByRole('radio', { name: 'advanced' }).click();
  // A table, then an equation typed into its first body cell from the Insert tab.
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Insert' }).click();
  await ribbonClick(page, 'Insert table');
  await page.getByRole('button', { name: '2 by 2 table' }).click();
  await page.locator('.ProseMirror table td').first().click();
  await ribbonClick(page, 'Insert equation');
  await page.getByRole('menuitem', { name: /inline equation/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'LaTeX' }).fill('E = mc^2');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(page.locator('.ProseMirror table td .katex')).toHaveCount(1);

  // A comment on the "Answer" heading.
  await page.getByRole('tab', { name: 'Review' }).click();
  await selectText(page, '.ProseMirror h2:has-text("Answer")', 'Answer');
  await panel(page).getByRole('button', { name: 'New comment' }).click();
  const comments = page.getByRole('complementary', { name: 'Comments' });
  await comments.getByRole('textbox', { name: 'New comment' }).fill('Rename this heading?');
  await comments.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('.ProseMirror h2 span[data-comment-id]')).toHaveText('Answer');
  await waitSaved(page);

  // Both are stored (schema 2), and survive a reload.
  await expect.poll(async () => (await stored(page, id)).comments?.map((c) => c.text)).toEqual(['Rename this heading?']);
  const content = await stored(page, id);
  expect(content.schemaVersion).toBe(2);
  expect(JSON.stringify(content.doc)).toMatch(/"tableCell"[^\]]*"inlineMath"/);
  await page.reload();
  await expect(page.locator('.ProseMirror table td .katex')).toHaveCount(1);
  await expect(page.locator('.ProseMirror h2 span[data-comment-id]')).toHaveText('Answer');

  // Word: the equation is native OMML inside the cell; the comment's range is inside the heading paragraph.
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(download));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toMatch(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<m:oMath>(?:(?!<\/w:tc>)[\s\S])*<\/w:tc>/);
  const heading = (xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g) ?? []).find((p) => p.includes('>Answer<'))!;
  expect(heading).toContain('w:val="Heading2"');
  expect(heading).toContain('<w:commentRangeStart');
  expect(await zip.file('word/comments.xml')!.async('string')).toContain('Rename this heading?');
});
