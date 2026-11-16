import { expect, test } from './fixtures';
import { createFromQuickStart, downloadBytes } from './helpers';

// Touch and phone-width checks of the diagram editor's toolbar and panels (mobile-chromium; skipped elsewhere).
// The Export options test moved here from diagram-export.spec.ts so the mobile project runs it.

test('the export options dialog works by touch at phone width', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch layout check');
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.getByRole('button', { name: 'Export' }).tap();
  await page.getByRole('menuitem', { name: /Export options…/ }).tap();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Export diagram' });
  await expect(dialog).toBeVisible();
  // Fits the screen without sideways scrolling.
  const box = (await dialog.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  await dialog.getByText('PDF (vector)').tap();
  await expect(dialog.getByRole('radio', { name: 'PDF (vector)' })).toBeChecked();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export PDF' }).tap()]);
  expect((await downloadBytes(file)).subarray(0, 4).toString('latin1')).toBe('%PDF');
});
