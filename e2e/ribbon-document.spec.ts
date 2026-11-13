import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, round 1: the Word-style ribbon and the audited document fixes, end to end. */

// 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

type StoredDoc = { id: string; content: { schemaVersion: number; doc: unknown } };
const stored = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;

async function placeCursorAfterAnswer(page: Page) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
}

/** Pastes HTML into the editor the way a browser does for content copied from a web page. */
async function pasteHtml(page: Page, html: string) {
  await page.locator('.ProseMirror').evaluate((el, h) => {
    const data = new DataTransfer();
    data.setData('text/html', h);
    data.setData('text/plain', '');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, html);
}

test('the ribbon has Word-style tabs; Simple shows the core, Advanced everything, and the keyboard moves between tabs', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  const tablist = page.getByRole('tablist', { name: 'Toolbar' });
  await expect(tablist.getByRole('tab')).toHaveText(['Home', 'Insert', 'Diagram']);
  await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Bold (Ctrl+B)' })).toBeVisible();

  await page.getByRole('radio', { name: 'advanced' }).click();
  await expect(tablist.getByRole('tab')).toHaveText(['Home', 'Insert', 'Layout', 'Review', 'Diagram']);

  await page.getByRole('tab', { name: 'Home' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Insert' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Insert' })).toBeFocused();
  await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Insert image' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tabpanel').getByRole('button', { name: /page setup/i })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  // On narrow screens the tab's controls scroll sideways; scroll first, since a scrolling toolbar closes popovers.
  const wordCount = page.getByRole('tabpanel').getByRole('button', { name: 'Word count' });
  await wordCount.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await wordCount.click();
  await expect(page.getByLabel('Word count', { exact: true })).toContainText('Words');

  // The ribbon fits the screen: no horizontal page scroll (mobile widths included).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('a link typed without https:// works, and a javascript: link is refused (DS-7)', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).dblclick();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Link (Ctrl+K)' }).click();
  const address = page.getByRole('textbox', { name: 'Link address' });
  await address.fill('javascript:alert(1)');
  await address.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'not allowed' })).toBeVisible();
  await address.fill('example.com/notes');
  await address.press('Enter');
  await expect(page.locator('.ProseMirror a')).toHaveAttribute('href', 'https://example.com/notes');
  await waitSaved(page);
  expect(JSON.stringify((await stored(page, id)).doc)).toContain('https://example.com/notes');
});

test('pasted web images are stored in the document, or kept and clearly marked when the website refuses (DS-3)', async ({ page }) => {
  // "shared.png" lets other sites read it (CORS); "private.png" can be shown but not read, as most websites do:
  // reading it fails with a network error, exactly as a CORS refusal does.
  await page.route('https://images.example.test/**', (route) => {
    const req = route.request();
    if (req.url().endsWith('private.png') && req.resourceType() === 'fetch') return route.abort('accessdenied');
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const id = await createFromQuickStart(page, 'Assignment');
  await placeCursorAfterAnswer(page);
  await pasteHtml(page, '<p>From the web:</p><img src="https://images.example.test/shared.png" alt="Shared"><img src="https://images.example.test/private.png" alt="Private">');

  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('img[alt="Shared"]')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(editor.locator('img[alt="Private"]')).toHaveAttribute('src', 'https://images.example.test/private.png');
  await expect(editor.locator('.dcos-image-remote')).toHaveCount(1);
  await expect(editor.locator('.dcos-image-remote')).toHaveAttribute('data-offline-label', 'Not saved for offline use');
  await waitSaved(page);
  const json = JSON.stringify((await stored(page, id)).doc);
  expect(json).not.toContain('shared.png');
  expect(json).toContain('private.png');

  await page.getByRole('button', { name: 'Export' }).click();
  const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  expect((await downloadBytes(docx)).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByText('1 image was not saved for offline use and was written as a placeholder', { exact: false })).toBeVisible();
});

// Pasting over the whole document puts the image last, so the editor appends a trailing paragraph, and the web
// address in the text is autolinked: both are extra transactions in the same paste, which once lost the image.
test('a web image pasted at the end of the document, with a web address in the text, is stored too (DS-3)', async ({ page }) => {
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  const id = await createFromQuickStart(page, 'Assignment');
  await placeCursorAfterAnswer(page);
  await page.keyboard.press('ControlOrMeta+a');
  await pasteHtml(page, '<p>Source: https://example.org/page</p><img src="https://images.example.test/last.png" alt="Last">');

  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('a[href="https://example.org/page"]')).toBeVisible();
  await expect(editor.locator('img[alt="Last"]')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(editor.locator('.dcos-image-remote')).toHaveCount(0);
  await waitSaved(page);
  expect(JSON.stringify((await stored(page, id)).doc)).not.toContain('last.png');
});

test('a pasted diagram without its data offers Remove instead of a stuck dialog, and has no dead-end download (WEB-3, DS-8)', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await placeCursorAfterAnswer(page);
  await pasteHtml(page, '<figure data-type="diagram" data-diagram="{&quot;title&quot;:&quot;Broken&quot;}"></figure>');
  const box = page.locator('.ProseMirror .dcos-diagram-box');
  await expect(box).toBeVisible();

  await box.click();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /download/i }).click();
  await expect(page.getByRole('menuitem', { name: 'PNG image' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /svg|pdf/i })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await box.dblclick();
  const alert = page.locator('.dcos-diagram-alert');
  await expect(alert).toContainText('data is missing');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await alert.getByRole('button', { name: 'Remove diagram' }).click();
  await expect(box).toHaveCount(0);
  await waitSaved(page);
  expect(JSON.stringify((await stored(page, id)).doc)).not.toContain('"diagram"');
});

test('the PDF export says it uses the print dialog and what the header and footer need (DS-5)', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  await page.getByRole('button', { name: 'Export' }).click();
  const pdf = page.getByRole('menuitem', { name: /PDF/ });
  await expect(pdf).toContainText('print dialog');
  await expect(pdf).toContainText('header, footer and page numbers');
});
