import { expect, test, type Locator, type Page } from '@playwright/test';

// Phase 5 Round 3: the Diagram toolbar and its panels at phone width, by touch (mobile-chromium; skipped elsewhere).
test.skip(({ hasTouch }) => !hasTouch, 'touch only');

const inView = async (page: Page, el: Locator) => {
  const b = (await el.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(b.x).toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width).toBeLessThanOrEqual(vw + 1);
};
const noSideScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('every toolbar control is reachable and the Layers panel, Format panel, Order menu and shortcut help fit a phone', async ({ page }) => {
  await page.goto('./#/diagrams');
  await page.getByRole('button', { name: /^New diagram/ }).first().tap();
  await page.getByRole('dialog').getByText('Business process (BPMN)', { exact: true }).tap();
  await expect(page.locator('.react-flow__node[data-id="write"]')).toBeVisible();
  await noSideScroll(page);

  // The toolbar scrolls inside itself; each control can be scrolled into view and tapped.
  const toolbar = page.getByRole('toolbar', { name: 'Diagram tools' });
  for (const name of ['Undo (Ctrl+Z)', 'Layers', 'Keyboard shortcuts (?)', 'Select several (tap shapes to add or remove them)']) {
    const b = toolbar.getByRole('button', { name, exact: true });
    await b.scrollIntoViewIfNeeded();
    await inView(page, b);
  }
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();

  // A shape's Format panel floats over the canvas and fits.
  await page.locator('.react-flow__node[data-id="write"]').tap();
  const format = page.locator('.react-flow__panel.top.right');
  await expect(format).toBeVisible();
  await inView(page, format);
  // Order menu (shown for a selection).
  const order = toolbar.getByRole('button', { name: 'Order' });
  await order.scrollIntoViewIfNeeded();
  await order.tap();
  const front = page.getByRole('menuitem', { name: /Bring to front/ });
  await expect(front).toBeVisible();
  await inView(page, front);
  await page.keyboard.press('Escape');

  // Layers: the panel fits, and the Format panel steps aside while it is open (both cannot fit side by side).
  const layersButton = toolbar.getByRole('button', { name: 'Layers', exact: true });
  await layersButton.scrollIntoViewIfNeeded();
  await layersButton.tap();
  const panel = page.getByRole('region', { name: 'Layers' });
  await expect(panel).toBeVisible();
  await inView(page, panel);
  await expect(page.locator('.react-flow__panel.top.right')).toBeHidden();
  await panel.getByRole('button', { name: 'Add layer' }).tap();
  await expect(panel.getByRole('button', { name: /^Layer 2/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Close layers' }).tap();
  await expect(page.locator('.react-flow__panel.top.right')).toBeVisible();

  // Shortcut help.
  const help = toolbar.getByRole('button', { name: 'Keyboard shortcuts (?)' });
  await help.scrollIntoViewIfNeeded();
  await help.tap();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await inView(page, dialog);
  await noSideScroll(page);
});
