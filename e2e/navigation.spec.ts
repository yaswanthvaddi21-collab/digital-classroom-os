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

// Phase 7 (ADR 0014): presentations have their own list and editor routes; the v0.1.0 routes above are unchanged.
test('the presentations list and a presentation open from the sidebar', async ({ page, isMobile }) => {
  await page.goto('./#/');
  // At phone width the sidebar is a drawer behind "Open navigation" (AppShell).
  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Presentations' }).click();
  await expect(page).toHaveURL(/#\/presentations$/);
  await expect(page.getByPlaceholder(/search presentations/i)).toBeVisible();
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Blank presentation', exact: true }).click();
  await expect(page).toHaveURL(/#\/presentations\/[0-9a-f-]{36}$/);
  const slides = page.getByRole('listbox', { name: 'Slides' });
  await expect(slides.getByRole('option')).toHaveCount(1);
  // Phase 7 Round 2a: the slide opens in the editor (its objects are a listbox on the canvas).
  await expect(page.getByRole('listbox', { name: 'Objects on slide 1' })).toBeVisible();
  // The slide list is a strip along the top at phone width and a column when wide, and says which.
  await expect(slides).toHaveAttribute('aria-orientation', isMobile ? 'horizontal' : 'vertical');
  // Nothing on the page scrolls sideways, also at phone width (the mobile-chromium project runs this spec).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('theme preference survives a reload', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'Dark theme' }).first().click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('dcos.theme'))).toBe('dark');
});
