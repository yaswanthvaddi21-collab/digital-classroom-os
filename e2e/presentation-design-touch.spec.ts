import { expect, test } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio DESIGN on a touch phone (mobile-chromium). Round 3: the Design tab's Layout menu, opened from
 * the ribbon that scrolls sideways, stays open while the ribbon moves, so its items can be chosen.
 */

type Item = { id: string; content: { slides: Array<{ layoutId: string }> } };

test('the Layout menu in the scrolling ribbon stays open and changes the slide’s layout', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch profile');
  const id = await createFromQuickStart(page, 'Blank presentation');
  await page.getByRole('tab', { name: 'Design' }).tap();
  const layout = page.getByRole('toolbar', { name: 'Design' }).getByRole('button', { name: 'Layout', exact: true });
  await layout.click();
  await page.getByRole('menuitem', { name: 'Two content' }).click();
  await waitSaved(page);
  await expect.poll(async () => (await readStore<Item>(page, 'presentations')).find((i) => i.id === id)!.content.slides[0].layoutId).toBe('layout-twoContent');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
