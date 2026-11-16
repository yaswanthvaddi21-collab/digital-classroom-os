import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/** Writes draft records straight into the app's database, as an editor that could not save would have. */
async function putDrafts(page: Page, drafts: unknown[]) {
  await page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('digital-classroom-os');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('drafts', 'readwrite');
          for (const r of records) tx.objectStore('drafts').put(r);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    drafts,
  );
}

test('Settings → Storage lists unsaved drafts, including one of a deleted document, and recovers them', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await waitSaved(page);
  const [doc] = (await readStore<{ id: string; version: number; content: unknown }>(page, 'documents')).filter((d) => d.id === id);
  const withText = (text: string) => JSON.parse(JSON.stringify(doc.content).replace('Begin your answer here.', text));
  const now = Date.now();
  await putDrafts(page, [
    { key: `document:${id}:session-a`, kind: 'document', itemId: id, session: 'session-a', baseVersion: doc.version, content: withText('Draft of the assignment.'), savedAt: new Date(now - 60_000).toISOString() },
    {
      key: 'document:00000000-0000-4000-8000-000000000001:session-b',
      kind: 'document',
      itemId: '00000000-0000-4000-8000-000000000001',
      session: 'session-b',
      baseVersion: 3,
      title: 'Essay that was deleted',
      content: withText('Words from a deleted essay.'),
      savedAt: new Date(now).toISOString(),
    },
  ]);

  await page.goto('./#/settings/storage');
  const region = page.getByRole('region', { name: 'Unsaved drafts' });
  await expect(region.getByRole('listitem')).toHaveCount(2);
  const orphan = region.getByRole('listitem', { name: 'Unsaved draft: Deleted item' });
  await expect(orphan).toContainText('deleted item');
  await expect(orphan.getByRole('link', { name: 'Open' })).toHaveCount(0);

  // The orphan becomes a new document with its own title.
  await orphan.getByRole('button', { name: 'Save as a new document' }).click();
  await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
  await expect(page.locator('.ProseMirror')).toContainText('Words from a deleted essay.');
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Essay that was deleted (recovered)');

  // The other one opens its document, which offers it for recovery.
  await page.goto('./#/settings/storage');
  await expect(region.getByRole('listitem')).toHaveCount(1);
  await region.getByRole('listitem', { name: 'Unsaved draft: Assignment' }).getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(new RegExp(`#/documents/${id}$`));
  const offer = page.getByRole('alert').filter({ hasText: 'were not saved' });
  await offer.getByRole('button', { name: 'Recover them' }).click();
  await expect(page.locator('.ProseMirror')).toContainText('Draft of the assignment.');

  await page.goto('./#/settings/storage');
  await expect(region).toContainText('No unsaved drafts on this device.');
});

test('discarding an unsaved draft asks first', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await waitSaved(page);
  await putDrafts(page, [{ key: `document:${id}:s`, kind: 'document', itemId: id, session: 's', baseVersion: 1, title: 'Changed title', savedAt: new Date().toISOString() }]);
  await page.goto('./#/settings/storage');
  const row = page.getByRole('listitem', { name: 'Unsaved draft: Assignment' });
  page.once('dialog', (d) => void d.dismiss());
  await row.getByRole('button', { name: 'Discard' }).click();
  await expect(row).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('No unsaved drafts on this device.')).toBeVisible();
  expect(await readStore(page, 'drafts')).toEqual([]);
});
