import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio editor core (Phase 7 Round 2a) on a touch screen (phone profile): a tap selects, a second tap
 * edits the text, a tap on the empty slide ends editing, and a finger drags an object. Needs the mobile-chromium
 * project (its testMatch includes every *-touch spec).
 */

type El = { id: string; x: number; y: number; placeholderId?: string; text?: unknown };
type Item = { id: string; content: { slides: Array<{ elements: El[] }> } };

const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });

test('tap to select, tap again to type, tap the slide to finish, and drag with a finger', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'touch profile (Chromium touch events)');
  const id = await createFromQuickStart(page, 'Blank presentation');
  const title = canvas(page).getByRole('option', { name: /^Title placeholder/ });

  await title.tap();
  await expect(title).toHaveAttribute('aria-selected', 'true');
  await title.tap();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type('Field trip');
  // A tap on the slide outside the objects ends editing.
  const stage = (await page.locator('[data-stage]').boundingBox())!;
  await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height - 4);
  await expect(page.locator('[data-stage] .ProseMirror')).toHaveCount(0);
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first()).toHaveAccessibleName('Slide 1: Field trip');

  // Drag the subtitle down with one finger.
  const sub = canvas(page).getByRole('option', { name: /^Subtitle placeholder/ });
  const b = (await sub.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + i * 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitSaved(page);
  const scale = stage.width / 960;
  await expect
    .poll(async () => {
      const item = (await readStore<Item>(page, 'presentations')).find((p) => p.id === id)!;
      return item.content.slides[0].elements.find((e) => e.placeholderId === 'subtitle')!.y;
    })
    .toBeGreaterThan(297 + 20 / scale);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
