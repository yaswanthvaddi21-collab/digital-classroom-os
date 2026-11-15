import { expect, test } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio CONTENT on a touch phone (mobile-chromium): a tap on the selected table edits its cells (there
 * is no double-click), the inspector folds away below the slide, and nothing scrolls sideways.
 */

type El = { type: string; rows?: Array<{ cells: Array<{ text: unknown }> }>; text?: unknown };
const plain = (doc: unknown): string => (JSON.stringify(doc ?? '').match(/"text":"([^"]*)"/g) ?? []).map((m) => m.slice(8, -1)).join('|');

test('tap to insert a table, tap the selected table to edit a cell, and open the folded inspector', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'touch profile (Chromium touch events)');
  const id = await createFromQuickStart(page, 'Blank presentation');
  const canvas = page.getByRole('listbox', { name: /^Objects on slide/ });
  await page.getByRole('tab', { name: 'Insert' }).tap();
  const table = page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Table' });
  await table.scrollIntoViewIfNeeded();
  await table.tap();
  const size = page.getByRole('button', { name: 'Insert a table of 2 rows by 2 columns' });
  const box = (await size.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const option = canvas.getByRole('option', { name: /^Table/ });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  // Second tap on the selected table: its cell editor. (The canvas settles first: the inspector below it just
  // appeared, so the slide moves once.)
  let t = (await option.boundingBox())!;
  await expect
    .poll(async () => {
      const now = (await option.boundingBox())!;
      const same = now.x === t.x && now.y === t.y;
      t = now;
      return same;
    })
    .toBe(true);
  await page.touchscreen.tap(t.x + t.width * 0.25, t.y + t.height * 0.25);
  await expect(page.getByRole('textbox', { name: 'Cell, row 1, column 1' })).toBeFocused();
  await page.keyboard.type('Cell');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-table-editor]')).toHaveCount(0);

  // The inspector is folded below the slide until opened.
  const settings = page.getByRole('complementary', { name: 'Table settings' });
  const toggle = settings.getByRole('button', { name: 'Table', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(settings.getByRole('button', { name: 'Edit cells' })).toBeVisible();

  await waitSaved(page);
  const [item] = (await readStore<{ id: string; content: { slides: Array<{ elements: El[] }> } }>(page, 'presentations')).filter((i) => i.id === id);
  const stored = item.content.slides[0].elements.find((e) => e.type === 'table')!;
  expect(plain(stored.rows![0].cells[0].text)).toBe('Cell');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
