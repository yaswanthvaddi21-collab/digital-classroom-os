import { expect, test, type CDPSession, type Page } from './fixtures';
import { createFromQuickStart, readStore } from './helpers';

// Phase 5 G-CONNECT: the Quick Connect palette by keyboard (every project) and by touch (the phone profile:
// the file name matches mobile-chromium's testMatch). DS-R5 / DS-R6.

type StoredDiagram = { id: string; content: { nodes: Array<{ id: string; data: { shape: string; label: string } }>; edges: Array<{ source: string; target: string }> } };
const content = async (page: Page, id: string) => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content;
const node = (page: Page, label: string) => page.locator('.react-flow__node', { hasText: label });

test('keyboard: Down opens the palette with focus on the first shape, arrows move, Enter picks, Escape returns', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow runs on the desktop profiles');
  await page.setViewportSize({ width: 1400, height: 900 });
  const id = await createFromQuickStart(page, 'Flowchart');
  await node(page, 'End').click();
  const arrow = page.getByRole('button', { name: 'Add a connected shape to the right' });
  await arrow.focus();
  await expect(arrow).toHaveAttribute('aria-haspopup', 'menu');
  const menu = page.getByRole('menu', { name: 'Shapes to add to the right' });
  await expect(menu).toBeVisible(); // focus shows it, as hovering does
  await expect(arrow).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('ArrowDown');
  const items = menu.getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await expect(items.first()).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.dcos-qc-ghost')).toBeVisible(); // preview of what Enter adds
  await page.keyboard.press('ArrowRight');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(6)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();

  // Escape closes the palette and puts focus back on the arrow; nothing was added.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(arrow).toBeFocused();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);

  // Up opens it at the last shape; Enter adds that shape, connected.
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  const name = (await items.nth(-2).getAttribute('aria-label'))!;
  expect(name).toMatch(/^Add .+ to the right$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect.poll(async () => (await content(page, id)).nodes.length).toBe(7);

  // Tab also closes the palette (it lives outside the canvas, so focus must not get lost).
  await page.getByRole('button', { name: /fit view/i }).click(); // the new shape was scrolled into view
  await node(page, 'Start').click();
  const up = page.getByRole('button', { name: 'Add a connected shape above' });
  await up.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'Shapes to add above' }).getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu', { name: 'Shapes to add above' })).toHaveCount(0);
  await expect(up).toBeFocused();
  // Enter on the arrow still adds a copy, as before.
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
});

/** Real touch input through the DevTools protocol (Chromium), so pointerType is "touch". */
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
}

test('touch: long-press an arrow opens the palette without adding a copy; tap a shape adds it; drag connects', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'touch profile (Chromium) only');
  const id = await createFromQuickStart(page, 'Flowchart');
  await node(page, 'Start').tap();
  const arrow = page.getByRole('button', { name: 'Add a connected shape to the left' });
  await expect(arrow).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const a = (await arrow.boundingBox())!;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;

  await touch(cdp, 'touchStart', ax, ay);
  await page.waitForTimeout(700);
  await touch(cdp, 'touchEnd', ax, ay);
  const menu = page.getByRole('menu', { name: 'Shapes to add to the left' });
  await expect(menu).toBeVisible();
  await page.waitForTimeout(400); // the palette must stay open after the finger lifts
  await expect(menu).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(6); // no copy was added

  await menu.getByRole('menuitem', { name: 'Add Decision to the left' }).tap();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect.poll(async () => (await content(page, id)).nodes.filter((n) => n.data.shape === 'diamond').length).toBe(2);

  // The phone's floating Format panel covers the top right while a shape is selected, and the new shape was scrolled
  // into view: clear the selection and fit the diagram before tapping the next shape.
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  const clearAndFit = async () => {
    await page.touchscreen.tap(pane.x + 20, pane.y + pane.height / 2);
    await page.getByRole('button', { name: /fit view/i }).tap();
  };

  // Tapping elsewhere closes an open palette.
  await clearAndFit();
  await node(page, 'End').tap({ position: { x: 12, y: 30 } });
  const right = page.getByRole('button', { name: 'Add a connected shape to the right' });
  const r = (await right.boundingBox())!;
  await touch(cdp, 'touchStart', r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(700);
  await touch(cdp, 'touchEnd', r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByRole('menu', { name: 'Shapes to add to the right' })).toBeVisible();
  await page.touchscreen.tap(pane.x + 20, pane.y + pane.height / 2);
  await expect(page.getByRole('menu', { name: 'Shapes to add to the right' })).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(7);

  // Drag an arrow by touch onto another shape: they are connected.
  await clearAndFit();
  await node(page, 'Print "Even"').tap({ position: { x: 12, y: 12 } });
  const left = page.getByRole('button', { name: 'Add a connected shape to the right' });
  const l = (await left.boundingBox())!;
  const target = (await node(page, 'Print "Odd"').boundingBox())!;
  const from = { x: l.x + l.width / 2, y: l.y + l.height / 2 };
  const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await touch(cdp, 'touchStart', from.x, from.y);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await touch(cdp, 'touchEnd', to.x, to.y);
  await expect(page.locator('.react-flow__edge')).toHaveCount(8);
  await expect.poll(async () => (await content(page, id)).edges.length).toBe(8);
  await expect(page.locator('.react-flow__node')).toHaveCount(7); // connected, nothing created
});
