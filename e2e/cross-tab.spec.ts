import { expect, test } from './fixtures';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/** An open editor follows what another tab does to its item (Phase 3, B4 and B1 not-found). */
test('trash and permanent deletion in another tab show in the open editor, and the edits can be saved as a new document', async ({ page, context }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await waitSaved(page);

  const other = await context.newPage();
  await other.goto('./#/documents');
  const row = other.locator('div.group', { hasText: 'Assignment' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'More actions' }).click();
  await other.getByRole('menuitem', { name: 'Move to trash' }).click();

  // The first tab shows the trash notice without a reload, and still saves.
  await expect(page.getByRole('alert').filter({ hasText: 'This document is in the trash' })).toBeVisible();
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed while in the trash.');
  await waitSaved(page);

  // Deleted forever in the other tab: the first tab says so at once, keeps the edits and offers a new document.
  await other.goto('./#/trash');
  await other.getByRole('button', { name: 'Empty trash' }).click();
  await other.getByRole('button', { name: 'Delete forever' }).click();
  await expect(other.getByText('Trash is empty')).toBeVisible();

  const notice = page.getByRole('alert').filter({ hasText: 'This document was deleted in another window' });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('status', { name: 'Not saved' })).toBeVisible();
  await page.keyboard.type(' And after it was deleted.');
  await notice.getByRole('button', { name: 'Save as a new document' }).click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
  const copyId = page.url().split('/').pop()!;
  await expect(page.locator('.ProseMirror')).toContainText('Typed while in the trash. And after it was deleted.');
  await waitSaved(page);
  const docs = await readStore<{ id: string; content: unknown }>(page, 'documents');
  expect(docs.some((d) => d.id === id)).toBe(false);
  expect(JSON.stringify(docs.find((d) => d.id === copyId)?.content)).toContain('And after it was deleted.');
  // Nothing is left behind as a draft of the deleted document.
  expect((await readStore<{ itemId: string }>(page, 'drafts')).filter((d) => d.itemId === id)).toEqual([]);
});
