import { expect, test } from './fixtures';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

test('create → edit → autosave → reload → export', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('Assignment Title');

  await editor.getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Stacks are last-in, first-out.');
  await waitSaved(page);

  const [stored] = (await readStore<{ id: string; content: unknown }>(page, 'documents')).filter((d) => d.id === id);
  expect(JSON.stringify(stored.content)).toContain('last-in, first-out');

  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('Stacks are last-in, first-out.');

  // Deep link from a fresh page load opens the same document.
  await page.goto(`./#/documents/${id}`);
  await expect(page.locator('.ProseMirror')).toContainText('last-in, first-out');

  await page.getByRole('button', { name: /export/i }).click();
  const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
  expect(docx.suggestedFilename()).toBe('Assignment.docx');
  expect((await downloadBytes(docx)).subarray(0, 2).toString()).toBe('PK');

  await page.getByRole('button', { name: /export/i }).click();
  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /plain text/i }).click()]);
  expect((await downloadBytes(txt)).toString()).toContain('last-in, first-out');
});

test('favourite, trash and restore keep the document', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await waitSaved(page);
  await page.goto('./#/documents');
  const row = page.locator('div.group', { hasText: 'Assignment' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Favorite' }).click();
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await page.goto('./#/trash');
  const trashed = page.locator('div.group', { hasText: 'Assignment' }).first();
  await trashed.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await page.goto('./#/documents');
  await expect(page.locator('div.group', { hasText: 'Assignment' }).first()).toBeVisible();
  const [stored] = (await readStore<{ id: string; deletedAt: string | null; favorite: boolean }>(page, 'documents')).filter((d) => d.id === id);
  expect(stored.deletedAt).toBeNull();
  expect(stored.favorite).toBe(true);
});

for (const template of ['Lab report', 'Assignment']) {
  test(`${template} template opens with its content (never blank)`, async ({ page }) => {
    await createFromQuickStart(page, template);
    await expect(page.locator('.ProseMirror')).toContainText(template === 'Lab report' ? 'Aim' : 'Question');
  });
}
