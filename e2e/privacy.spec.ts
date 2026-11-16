import { expect, test } from './fixtures';
import { createFromQuickStart, waitSaved } from './helpers';

/**
 * "Personal documents are private by default" (Phase 3, B8): creating, editing, autosaving and exporting a document
 * and a diagram makes no request to any origin but the app's own. No fonts, analytics or CDNs.
 */
test('no request leaves the app while creating, editing, autosaving and exporting', async ({ page, context, baseURL }) => {
  const own = new URL(baseURL!).origin;
  const elsewhere: string[] = [];
  const check = (url: string) => {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.origin !== own) elsewhere.push(url);
  };
  context.on('request', (r) => check(r.url()));
  page.on('websocket', (ws) => check(ws.url()));

  // Document: create, type, autosave, embed a diagram, export.
  await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Private notes.');
  await waitSaved(page);
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Mind map', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  for (const item of [/word document/i, /plain text/i]) {
    await page.getByRole('button', { name: /export/i }).click();
    await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  }

  // Diagram: create, edit, autosave, export.
  await createFromQuickStart(page, 'Tree diagram');
  await page.locator('.react-flow__node', { hasText: 'Branch C' }).click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Leaf C2');
  await page.keyboard.press('Enter');
  await waitSaved(page);
  for (const item of [/^PNG/, /^PDF/, /^SVG/]) {
    await page.getByRole('button', { name: /export/i }).click();
    await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  }

  // A full backup export.
  await page.goto('./#/settings/backup');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);

  expect(elsewhere).toEqual([]);
});
