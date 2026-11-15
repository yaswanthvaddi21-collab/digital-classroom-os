import { expect, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Reads one store of the app's IndexedDB directly, independent of the UI. */
export async function readStore<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('digital-classroom-os');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as T[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );
}

export async function createFromQuickStart(page: Page, label: string) {
  await page.goto('./#/');
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(/#\/(documents|diagrams|presentations)\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

export async function waitSaved(page: Page) {
  await expect(page.getByRole('status', { name: /saved on this device/i })).toBeVisible({ timeout: 10_000 });
}

export async function downloadBytes(download: Download) {
  return readFile((await download.path())!);
}
