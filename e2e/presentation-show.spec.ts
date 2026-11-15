import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore, refuseFullscreenOnLinuxWebKit, waitSaved } from './helpers';

/**
 * Presentation Studio slide show (Phase 7 SHOW) in a real browser: transitions and animations set in their tabs and
 * saved, a slide show from the beginning that skips a hidden slide, plays the transition and the build with Web
 * Animations, ends on a black screen and leaves; the transition preview; reduced motion; and the presenter view in a
 * second window, kept in step both ways over a BroadcastChannel.
 */

type El = { id: string; placeholderId?: string; animation?: { effect: string; trigger: string } };
type Slide = { id: string; elements: El[]; hidden?: boolean; transition?: { type: string; direction?: string } };
type Item = { id: string; content: { slides: Slide[] } };

const slides = (page: Page) => page.getByRole('listbox', { name: 'Slides' });
const slideOption = (page: Page, n: number) => slides(page).getByRole('option').nth(n);
const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });
const show = (page: Page) => page.getByRole('dialog', { name: 'Slide show' });
const shownSlide = (page: Page) => page.locator('dialog[open] [data-show-slide]').first();

test.beforeEach(({ page, browserName }) => refuseFullscreenOnLinuxWebKit(page, browserName));

async function stored(page: Page, id: string) {
  return (await readStore<Item>(page, 'presentations')).find((i) => i.id === id)!.content;
}

/** Double-clicks an object on the canvas, types, and leaves the text with Escape. */
async function typeInto(page: Page, object: RegExp, text: string) {
  await canvas(page).getByRole('option', { name: object }).dblclick();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-stage] .ProseMirror')).toHaveCount(0);
}

/**
 * Four slides: Intro (with notes), Hidden (hidden), Method (push transition; its title fades in on a click), End.
 * Returns the presentation id and the stored slides.
 */
async function makeTalk(page: Page) {
  const id = await createFromQuickStart(page, 'Blank presentation');
  await typeInto(page, /^Title placeholder/, 'Intro');
  await page.getByRole('textbox', { name: /speaker notes/i }).click();
  await page.keyboard.type('Say hello first');
  for (const title of ['Hidden', 'Method', 'End']) {
    await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
    await typeInto(page, /^Title placeholder/, title);
  }
  await expect(slides(page).getByRole('option')).toHaveCount(4);

  await slideOption(page, 1).click();
  await page.getByRole('tab', { name: 'Slide Show' }).click();
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'Hide slide' }).click();

  await slideOption(page, 2).click();
  await page.getByRole('tab', { name: 'Transitions' }).click();
  await page.getByRole('toolbar', { name: 'Transitions' }).getByRole('button', { name: 'Push', exact: true }).click();
  await canvas(page).getByRole('option', { name: /^Title placeholder/ }).click();
  await page.getByRole('tab', { name: 'Animations' }).click();
  await page.getByRole('toolbar', { name: 'Animations' }).getByRole('button', { name: 'Fade', exact: true }).click();
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[2].transition?.type).toBe('push');
  const content = await stored(page, id);
  expect(content.slides[1].hidden).toBe(true);
  expect(content.slides[2].elements.find((e) => e.placeholderId === 'title')!.animation).toMatchObject({ effect: 'fade', trigger: 'on-click' });
  return { id, content };
}

test('transitions and animations play in a slide show that skips hidden slides, ends on black and leaves', async ({ page, browserName }) => {
  const { content } = await makeTalk(page);
  const [s1, , s3, s4] = content.slides;
  const titleOf3 = s3.elements.find((e) => e.placeholderId === 'title')!.id;

  // The transition preview plays over the canvas and goes away by itself.
  await page.getByRole('tab', { name: 'Transitions' }).click();
  await page.getByRole('button', { name: 'Preview the transition' }).click();
  await expect(page.locator('[data-show-preview="transition"]')).toBeVisible();
  await expect(page.locator('[data-show-preview]')).toHaveCount(0, { timeout: 5000 });

  await page.getByRole('tab', { name: 'Slide Show' }).click();
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'From beginning' }).click();
  await expect(show(page)).toBeVisible();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s1.id);
  // The click on From beginning makes the page full screen (Chromium; WebKit may refuse it headless, and then says so).
  if (browserName === 'chromium') await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  // The show covers the whole window (in full screen Firefox makes the window the size of the screen, not the viewport).
  const box = (await show(page).boundingBox())!;
  const win = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(Math.round(box.width)).toBe(win.width);
  expect(Math.round(box.height)).toBe(win.height);
  // The controls' full screen button leaves and re-enters full screen without ending the show.
  const controls = page.getByRole('toolbar', { name: 'Slide show controls' });
  if (browserName === 'chromium') {
    await controls.getByRole('button', { name: 'Leave full screen' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(show(page)).toBeVisible();
    await controls.getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  }
  // Its Next and Previous buttons move the show.
  await controls.getByRole('button', { name: 'Next' }).click();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  await controls.getByRole('button', { name: 'Previous' }).click();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s1.id);

  await page.keyboard.press('ArrowRight');
  // The hidden slide is skipped; slide 3 pushes in.
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  const title = page.locator(`dialog[open] [data-show-slide="${s3.id}"] [data-element="${titleOf3}"]`);
  // Its title waits for a click.
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  await page.keyboard.press('Space');
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  await page.keyboard.press('ArrowRight');
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s4.id);
  await page.keyboard.press('ArrowRight');
  await expect(show(page)).toContainText('End of slide show. Click to exit.');
  await page.keyboard.press('ArrowRight');
  await expect(show(page)).toBeHidden();
  // Full screen ends with the show.
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

  // From the current slide (slide 3); Escape ends it and the editor shows the slide it ended on.
  await slideOption(page, 2).click();
  await page.getByRole('tab', { name: 'Slide Show' }).click();
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'From current slide' }).click();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s4.id);
  // In full screen the browser's Escape leaves full screen, which ends the show too.
  await page.keyboard.press('Escape');
  await expect(show(page)).toBeHidden();
  await expect(slideOption(page, 3)).toHaveAttribute('aria-current', 'true');
});

test('the transition and the build animate with Web Animations, and are cuts with reduced motion', async ({ page }) => {
  const { content } = await makeTalk(page);
  const s3 = content.slides[2];
  await slideOption(page, 0).click();
  await page.keyboard.press('F5');
  await expect(show(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  // The 0.75 s push is running right after the key press.
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(show(page)).toBeHidden();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Slide Show' }).click();
  await expect(page.getByRole('toolbar', { name: 'Slide Show' })).toContainText('Reduced motion is on');
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'From beginning' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(show(page)).toBeHidden();
});

test('the presenter view opens in a second window and stays in step with the show both ways', async ({ page }) => {
  const { content } = await makeTalk(page);
  const [s1, , s3, s4] = content.slides;
  await slideOption(page, 0).click();
  await page.getByRole('tab', { name: 'Slide Show' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'Presenter view' }).click();
  const presenter = await popupPromise;
  await expect(presenter).toHaveURL(/#\/presentations\/presenter\/[\w-]+$/);

  // The handshake: the presenter window shows the show's slide, its notes and the next slide.
  await expect(presenter.getByText(/^Slide 1 of 4/)).toBeVisible({ timeout: 15_000 });
  await expect(show(page)).toContainText('The presenter view is open in the other window.');
  await expect(presenter.getByRole('region', { name: 'Speaker notes' })).toContainText('Say hello first');
  await expect(presenter.getByRole('region', { name: 'Next slide' }).getByRole('img')).toHaveAccessibleName('Next: slide 3');
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s1.id);

  // Presenter → show.
  await presenter.getByRole('button', { name: /Next/ }).click();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s3.id);
  await expect(presenter.getByText(/^Slide 3 of 4/)).toBeVisible();
  await expect(presenter.getByText('(1 animation step left on this slide)')).toBeVisible();
  // Show → presenter.
  await page.keyboard.press('Space');
  await expect(presenter.getByText('(1 animation step left on this slide)')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(presenter.getByText(/^Slide 4 of 4/)).toBeVisible();
  await expect(shownSlide(page)).toHaveAttribute('data-show-slide', s4.id);
  await presenter.getByRole('button', { name: /Black screen/ }).click();
  await expect(page.locator('dialog[open] [data-show-blank="black"]')).toBeVisible();
  await presenter.getByRole('button', { name: /Previous/ }).click();
  await expect(page.locator('dialog[open] [data-show-blank]')).toHaveCount(0);

  // End show in the presenter window ends the show, and the presenter window closes itself.
  const closed = presenter.waitForEvent('close');
  await presenter.getByRole('button', { name: /End show/ }).click();
  await expect(show(page)).toBeHidden();
  await closed;
});

test('closing the show’s window ends the show in the presenter window too, which closes itself (Round 3)', async ({ page, context }) => {
  await makeTalk(page);
  await slideOption(page, 0).click();
  await page.getByRole('tab', { name: 'Slide Show' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('toolbar', { name: 'Slide Show' }).getByRole('button', { name: 'Presenter view' }).click();
  const presenter = await popupPromise;
  await expect(presenter.getByText(/^Slide 1 of 4/)).toBeVisible({ timeout: 15_000 });
  // A click on a presenter button gives Space back to the show (it does not press the button again).
  await presenter.getByRole('button', { name: 'Pause timer' }).click();
  await presenter.keyboard.press('Space');
  await expect(presenter.getByText(/^Slide 3 of 4/)).toBeVisible();
  await expect(presenter.getByRole('button', { name: 'Resume timer' })).toBeVisible();
  // The show's window goes away (closed or reloaded): it tells the presenter window the show has ended, and the
  // presenter window (opened by the show) closes itself rather than keep offering Next and End show.
  expect(context.pages()).toContain(presenter);
  const closed = presenter.waitForEvent('close', { timeout: 10_000 });
  await page.close();
  await closed;
});
