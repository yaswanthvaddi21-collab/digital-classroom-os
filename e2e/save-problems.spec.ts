import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Storage full while editing (Phase 3, B1). The full disk is simulated as scripts/upgrade-test.mjs does: an init
 * script makes IndexedDB put/add throw QuotaExceededError while a flag is set. Everything else is the real app.
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const g = globalThis as unknown as { __dcosDiskFull?: boolean };
    g.__dcosDiskFull = false;
    for (const method of ['put', 'add'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        if (g.__dcosDiskFull) throw new DOMException('The quota has been exceeded. (simulated full disk)', 'QuotaExceededError');
        return original.apply(this, args);
      };
    }
  });
});

const setDiskFull = (page: Page, full: boolean) =>
  page.evaluate((f) => {
    (globalThis as unknown as { __dcosDiskFull?: boolean }).__dcosDiskFull = f;
  }, full);

async function typeOnFullDisk(page: Page, text: string) {
  const id = await createFromQuickStart(page, 'Assignment');
  await waitSaved(page);
  await setDiskFull(page, true);
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  const notice = page.getByRole('alert').filter({ hasText: 'out of storage space' });
  // One retry after a short delay, then saving stops and says so.
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toContainText('kept as a draft on this device');
  await expect(page.getByRole('status', { name: 'Not saved' })).toBeVisible();
  await expect(page.getByText(/retrying/i)).toHaveCount(0);
  return { id, notice };
}

const storedText = async (page: Page, id: string) => JSON.stringify((await readStore<{ id: string; content: unknown }>(page, 'documents')).find((d) => d.id === id)?.content);

test('storage full: the editor says so, keeps the edits, and Try again saves them once there is space', async ({ page }) => {
  const { id, notice } = await typeOnFullDisk(page, ' Written on a full disk.');
  expect(await storedText(page, id)).not.toContain('Written on a full disk.');
  // The edits were kept outside the full database.
  const kept = await page.evaluate((key) => localStorage.getItem(key), `dcos-emergency-draft:document:${id}`);
  expect(kept).toContain('Written on a full disk.');

  await setDiskFull(page, false);
  await notice.getByRole('button', { name: 'Try again' }).click();
  await waitSaved(page);
  await expect(notice).toBeHidden();
  expect(await storedText(page, id)).toContain('Written on a full disk.');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), `dcos-emergency-draft:document:${id}`)).toBeNull();
});

test('storage full: Free up space opens Settings → Storage, and the kept edits are offered when the document is opened again', async ({ page }) => {
  const { id, notice } = await typeOnFullDisk(page, ' Kept while the disk was full.');
  const key = `dcos-emergency-draft:document:${id}`;
  const keptAt = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').savedAt as string | undefined, key);
  const before = await keptAt();
  await notice.getByRole('button', { name: 'Free up space' }).click();
  await expect(page).toHaveURL(/#\/settings\/storage$/);
  await expect(page.getByRole('button', { name: 'Free up space' })).toBeVisible();
  // Leaving the editor tried one last save, which failed on the full disk and kept the edits again.
  await expect.poll(keptAt).not.toBe(before);
  await setDiskFull(page, false);
  // The draft is listed in Settings too.
  await expect(page.getByRole('region', { name: 'Unsaved drafts' }).getByRole('listitem', { name: 'Unsaved draft: Assignment' })).toBeVisible();

  await page.getByRole('button', { name: 'Free up space' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Nothing to remove|Removed \d+ unused image/ })).toBeVisible();

  await page.goto(`./#/documents/${id}`);
  const offer = page.getByRole('alert').filter({ hasText: 'were not saved' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Recover them' }).click();
  await expect(page.locator('.ProseMirror')).toContainText('Kept while the disk was full.');
  await expect.poll(() => storedText(page, id)).toContain('Kept while the disk was full.');
});
