import { expect, test } from './fixtures';
import { createFromQuickStart } from './helpers';

/**
 * Phase 6 (DIALOG): opening the diagram dialog on a phone must not focus a text field, which would bring up the
 * soft keyboard over the canvas. With a mouse, focus still starts inside the dialog (on the title field). Runs on
 * mobile-chromium (touch, phone width) and on the desktop projects.
 */
test('opening the diagram dialog keeps focus inside it, and off text fields on touch screens', async ({ page }, testInfo) => {
  const touch = !!testInfo.project.use.hasTouch;
  await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();

  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { inDialog: !!el?.closest('dialog'), tag: el?.tagName ?? '', editable: !!el?.isContentEditable, label: el?.getAttribute('aria-label') ?? '' };
  });
  expect(focused.inDialog).toBe(true);
  if (touch) {
    expect(['INPUT', 'TEXTAREA']).not.toContain(focused.tag);
    expect(focused.editable).toBe(false);
  } else {
    expect(focused).toMatchObject({ tag: 'INPUT', label: 'Diagram title' });
  }

  // Cancel still works from there and nothing was inserted.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram')).toHaveCount(0);
});
