import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFromQuickStart } from './helpers';

/**
 * Phase 7 Round 3 (menu-height): the shared ribbon Menu is placed with position: fixed and had no height limit, so a long
 * menu (Insert > Diagram lists every diagram template) ran off the bottom of a 1280 × 720 window: its last items could
 * not be clicked, and End focused an item nobody could see. The menu now fits the room below its trigger and scrolls.
 */
test.use({ viewport: { width: 1280, height: 720 } });

/** The menu lies wholly inside the window, and the item is visible inside the menu (scrolled to, if need be). */
async function expectOnScreen(page: Page, menu: Locator, item: Locator) {
  const vh = page.viewportSize()!.height;
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  const it = (await item.boundingBox())!;
  expect(it.y).toBeGreaterThanOrEqual(box.y - 1);
  expect(it.y + it.height).toBeLessThanOrEqual(box.y + box.height + 1);
}

test('presentation Insert > Diagram: the whole menu fits a 720 px window, End shows the last item, and it can be clicked', async ({ page }) => {
  await createFromQuickStart(page, 'Blank presentation');
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Diagram' }).click();
  const menu = page.getByRole('menu');
  const last = menu.getByRole('menuitem', {
    name: 'From a diagrams.net file…',
  });
  expect(await menu.getByRole('menuitem').count()).toBeGreaterThan(15); // long enough to have overflowed before

  // Keyboard: End focuses the last item and scrolls it into view.
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expectOnScreen(page, menu, last);
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await expectOnScreen(page, menu, menu.getByRole('menuitem').first());

  // Pointer: the last item is reachable (Playwright scrolls the menu to it) and a real click opens the file picker.
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
  await last.click();
  await chooser;
  await expect(menu).toHaveCount(0);
});

test('document Insert > Diagram: the menu fits a 720 px window and its last item can be clicked', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Insert diagram' }).click();
  const menu = page.getByRole('menu');
  const last = menu.getByRole('menuitem', { name: 'Import diagrams.net…' });
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expectOnScreen(page, menu, last);
  const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
  await last.click();
  await chooser;
});

test('a short menu keeps its look: it opens just under its trigger and is not cut short', async ({ page }) => {
  await createFromQuickStart(page, 'Blank presentation');
  await page.getByRole('tab', { name: 'Insert' }).click();
  const trigger = page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Chart' });
  await trigger.click();
  const menu = page.getByRole('menu');
  const t = (await trigger.boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(Math.abs(m.y - (t.y + t.height + 4))).toBeLessThan(6);
  expect(await menu.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
});
