import { chromium, expect, test } from './fixtures';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('./#/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/good (morning|afternoon|evening)/i)).toBeVisible();

  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.type('Written offline. ');
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('Written offline.');
  expect((await readStore<{ id: string }>(page, 'documents')).some((d) => d.id === id)).toBe(true);
  await context.setOffline(false);
});

test('data survives closing and relaunching the browser', async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), 'dcos-profile-'));
  try {
    let ctx = await chromium.launchPersistentContext(profile, { baseURL });
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    const id = await createFromQuickStart(page, 'Assignment');
    await waitSaved(page);
    await ctx.close();

    ctx = await chromium.launchPersistentContext(profile, { baseURL });
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`./#/documents/${id}`);
    await expect(page.locator('.ProseMirror')).toContainText('Assignment Title');
    await ctx.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test('embedding and editing a diagram works and saves offline', async ({ page, context }) => {
  await page.goto('./#/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  // Load the diagram editor code once while online, as a user would have on first use.
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await context.setOffline(true);

  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Mind map', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  const docs = await readStore<{ id: string; content: { schemaVersion: number } }>(page, 'documents');
  expect(docs.find((d) => d.id === id)?.content.schemaVersion).toBe(2);
  await context.setOffline(false);
});

test('when another tab upgrades the database, open work is saved and editing stops with a clear message', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.type('Typed just before the upgrade. ');

  // What a newer build does in another tab: open the same database at a higher version (this build's is 3 since
  // Phase 7, so the "newer build" opens it at 4).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('digital-classroom-os', 4);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error);
      }),
  );

  const overlay = page.getByRole('alertdialog', { name: 'This app was updated in another tab' });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/saved/i);
  await expect(overlay.getByRole('button', { name: 'Reload' })).toBeVisible();
  // The editor behind it can't be typed into, so nothing is silently lost.
  await expect(page.locator('.ProseMirror')).not.toBeFocused();

  // The edit made just before the upgrade reached the database.
  const docs = await readStore<{ id: string; content: unknown }>(page, 'documents');
  expect(JSON.stringify(docs.find((d) => d.id === id)?.content)).toContain('Typed just before the upgrade.');
});
