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

/**
 * The name a download is saved under. WebKit on Linux (WebKitGTK) turns the spaces in the name the app gives into
 * underscores; every other browser keeps it.
 */
export function savedFileName(name: string, browserName: string) {
  return browserName === 'webkit' && process.platform === 'linux' ? name.replace(/ /g, '_') : name;
}

/**
 * Headless WebKit on Linux (GitHub CI) can leave a slide show's full-screen request unfinished: the page never
 * becomes full screen, no fullscreenchange arrives, and the browser then keeps the Escape key to itself, so the show
 * cannot be left (CI runs 43676035968 and 43709861278). Specs that run a slide show call this before opening the app:
 * WebKit on Linux then refuses full screen, as a browser may, and the show takes its windowed path, where Escape must
 * end it. Full screen itself is covered in Chromium and Firefox in CI and in WebKit on macOS.
 */
export async function refuseFullscreenOnLinuxWebKit(page: Page, browserName: string) {
  if (browserName !== 'webkit' || process.platform !== 'linux') return;
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Full screen is refused in this test browser.', 'NotAllowedError'));
  });
}
