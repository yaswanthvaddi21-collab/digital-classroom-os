import { expect, test } from '@playwright/test';

// Every route that existed in v0.1.0 must keep resolving (links and bookmarks depend on them).
const ROUTES: Array<[string, RegExp]> = [
  ['./#/', /good (morning|afternoon|evening)/i],
  ['./#/documents', /search documents/i],
  ['./#/diagrams', /search diagrams/i],
  ['./#/trash', /search trash/i],
  ['./#/settings', /backup and restore/i],
];

for (const [url, marker] of ROUTES) {
  test(`v0.1.0 route ${url} still resolves`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText(marker).or(page.getByPlaceholder(marker)).first()).toBeVisible();
  });
}

test('theme preference survives a reload', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'Dark theme' }).first().click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('dcos.theme'))).toBe('dark');
});
