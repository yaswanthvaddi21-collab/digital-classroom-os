import { expect, test } from '@playwright/test';
import { createFromQuickStart, readStore } from './helpers';

/** Phase 5 G-SHAPES on a phone: the shape library strip (search, categories, tap to add) and Add lane by touch. */

type Stored = { id: string; content: { nodes: Array<{ id: string; parentId?: string; data: { shape: string } }> } };
const stored = async (page: import('@playwright/test').Page, id: string) => (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content;

test.skip(({ hasTouch }) => !hasTouch, 'touch only');

test('phone: search and tap a shape, switch category, all without sideways page scrolling', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  const library = page.getByRole('complementary', { name: 'Shapes' });
  const search = library.getByRole('searchbox', { name: 'Search shapes' });
  await search.tap();
  await search.fill('printer');
  await library.getByRole('button', { name: /^Printer/ }).tap();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect.poll(async () => (await stored(page, id)).nodes.some((n) => n.data.shape === 'netPrinter')).toBe(true);

  await search.fill('');
  await library.getByRole('combobox', { name: 'Shape category' }).selectOption('network');
  await expect(library.getByRole('button')).toHaveCount(11);
  // The strip scrolls sideways inside itself; the page does not.
  const last = library.getByRole('button', { name: /^Wi-Fi access point/ });
  await last.scrollIntoViewIfNeeded();
  await last.tap();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('phone: tap a pool and Add lane', async ({ page }) => {
  await page.goto('./#/diagrams');
  await page.getByRole('button', { name: /^New diagram|^New$/ }).first().tap();
  await page.getByRole('dialog').getByText('Business process (BPMN)', { exact: true }).tap();
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  const pool = (await page.locator('.react-flow__node[data-id="pool"]').boundingBox())!;
  await page.touchscreen.tap(pool.x + 4, pool.y + pool.height / 2);
  await page.getByRole('button', { name: 'Add lane' }).tap();
  await expect(page.locator('.react-flow__node')).toHaveCount(14);
  await expect.poll(async () => (await stored(page, id)).nodes.filter((n) => n.data.shape === 'bpmnLane' && n.parentId === 'pool').length).toBe(3);
});
