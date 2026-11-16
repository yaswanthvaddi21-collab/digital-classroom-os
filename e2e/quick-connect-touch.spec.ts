import { expect, test } from './fixtures';
import { createFromQuickStart } from './helpers';

// Runs on the phone profile (touch screen): tapping an arrow adds a connected shape.
test('tapping a quick-connect arrow adds a connected shape on a touch screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch profile only');
  await createFromQuickStart(page, 'Flowchart');
  await page.locator('.react-flow__node', { hasText: 'Start' }).tap();
  await expect(page.locator('.dcos-qc-arrow')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add a connected shape to the left' }).tap();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
});
