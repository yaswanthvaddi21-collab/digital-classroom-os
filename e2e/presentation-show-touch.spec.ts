import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart } from './helpers';

/**
 * The slide show on a phone (Phase 7 SHOW; mobile-chromium, whose testMatch includes every *-touch spec): the
 * presenter view opens in the page (no second window), a finger swipe and taps move the show (a tap on the left third
 * goes back), and nothing scrolls sideways.
 */

const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });
const show = (page: Page) => page.getByRole('dialog', { name: 'Slide show' });
const shownSlide = (page: Page) => page.locator('dialog[open] [data-show-slide]').first();
/** The presenter view's slide counter. */
const counter = (page: Page) => show(page).locator('[data-presenter-view] header [role="status"]');

async function swipe(page: Page, from: { x: number; y: number }, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / 6, y: from.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('on a phone the presenter view is in the page, and swipes and taps move the show', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'touch profile (Chromium touch events)');
  await createFromQuickStart(page, 'Blank presentation');
  // Two more slides, each titled so the show can be followed.
  for (let i = 0; i < 2; i++) await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option')).toHaveCount(3);
  await expect(canvas(page)).toBeVisible();
  // The presenter view starts at the current slide: the first.
  await page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first().tap();
  await expect(canvas(page)).toHaveAccessibleName('Objects on slide 1');

  await page.getByRole('tab', { name: 'Slide Show' }).click();
  const presenterButton = page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'Presenter view' });
  await expect(presenterButton).toHaveAttribute('title', /on this screen/);
  let popups = 0;
  page.on('popup', () => popups++);
  await presenterButton.click();
  await expect(show(page)).toHaveAttribute('data-slide-show', 'presenter');
  expect(popups).toBe(0);
  await expect(counter(page)).toHaveText(/^Slide 1 of 3/);
  await expect(show(page).getByRole('region', { name: 'Speaker notes' })).toBeVisible();

  const tap = show(page).locator('[data-show-tap]');
  const b = (await tap.boundingBox())!;
  // Swipe left: next slide.
  await swipe(page, { x: b.x + b.width * 0.8, y: b.y + b.height / 2 }, -Math.min(200, b.width * 0.6));
  await expect(counter(page)).toHaveText(/^Slide 2 of 3/);
  // Tap on the right: next; on the left third: back.
  await page.touchscreen.tap(b.x + b.width * 0.8, b.y + b.height / 2);
  await expect(counter(page)).toHaveText(/^Slide 3 of 3/);
  await page.touchscreen.tap(b.x + b.width * 0.1, b.y + b.height / 2);
  await expect(counter(page)).toHaveText(/^Slide 2 of 3/);
  // Swipe right: back.
  await swipe(page, { x: b.x + b.width * 0.2, y: b.y + b.height / 2 }, Math.min(200, b.width * 0.6));
  await expect(counter(page)).toHaveText(/^Slide 1 of 3/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await show(page).getByRole('button', { name: /End show/ }).click();
  await expect(show(page)).toBeHidden();

  // The audience view: taps move it, and its End show button leaves.
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'From beginning' }).click();
  await expect(show(page)).toHaveAttribute('data-slide-show', 'audience');
  const first = await shownSlide(page).getAttribute('data-show-slide');
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width * 0.8, vp.height / 2);
  await expect(shownSlide(page)).not.toHaveAttribute('data-show-slide', first!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await show(page).getByRole('button', { name: 'End show' }).click();
  await expect(show(page)).toBeHidden();
});
