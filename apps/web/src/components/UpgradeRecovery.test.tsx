// @vitest-environment jsdom
/**
 * The recovery screen shown when the safety copy before the v1 → v2 database update cannot be made (audit STOR-R5).
 * Uses the real IndexedDB adapter (fake-indexeddb) with a simulated full disk.
 */
import 'fake-indexeddb/auto';
import { IndexedDbAdapter, SCHEMA_VERSION, validateBackup, type BackupFile } from '@dcos/local-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UpgradeGate } from './UpgradeRecovery';

let n = 0;
const fixture = (): BackupFile => JSON.parse(readFileSync(join(__dirname, '../../../../tests/fixtures/v0.1.0/backup-v1.json'), 'utf8'));
const diskFull = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));

/** A v0.1.0 database holding the v0.1.0 fixture data. */
async function seedV010() {
  const name = `recovery-ui-${++n}`;
  const backup = fixture();
  const db = await openDB(name, 1, {
    upgrade(d) {
      d.createObjectStore('documents', { keyPath: 'id' });
      d.createObjectStore('diagrams', { keyPath: 'id' });
      d.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
      d.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  for (const item of backup.items) await db.put(item.kind === 'document' ? 'documents' : 'diagrams', item);
  for (const v of backup.versions) await db.put(v.kind === 'document' ? 'document_versions' : 'diagram_versions', v);
  await db.put('meta', { key: 'deviceId', value: backup.deviceId });
  db.close();
  return { name, backup };
}

const versionOf = async (name: string) => (await indexedDB.databases()).find((d) => d.name === name)?.version;
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

function renderGate(adapter: IndexedDbAdapter) {
  const download = vi.fn<(blob: Blob, fileName: string) => void>();
  render(
    <UpgradeGate recovery={adapter} download={download}>
      <p>The app</p>
    </UpgradeGate>,
  );
  return download;
}

describe('UpgradeGate (audit STOR-R5)', () => {
  it('shows the app as usual when no update is waiting', async () => {
    const adapter = new IndexedDbAdapter(`recovery-ui-fresh-${++n}`, { safetyCopy: diskFull });
    renderGate(adapter);
    expect(await screen.findByText('The app')).toBeTruthy();
    await adapter.close();
  });

  it('blocks the app, downloads a valid backup of the old data, and only then offers to update without the copy', async () => {
    const { name, backup } = await seedV010();
    const adapter = new IndexedDbAdapter(name, { safetyCopy: diskFull });
    const download = renderGate(adapter);

    const screenDialog = await screen.findByRole('alertdialog', { name: 'This update needs a safety copy of your data first' });
    expect(screenDialog.textContent).toMatch(/isn't enough free space/);
    expect(screenDialog.textContent).toMatch(/safe and unchanged/);
    expect(screen.queryByText('The app')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update without the on-device copy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download a backup of everything' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [blob, fileName] = download.mock.calls[0];
    expect(fileName).toMatch(/^classroom-os-backup-before-update-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await readBlob(blob)) as BackupFile;
    expect(() => validateBackup(file)).not.toThrow();
    expect(file.schemaVersion).toBe(1);
    expect(file.items).toHaveLength(backup.items.length);
    expect(file.versions).toHaveLength(backup.versions.length);
    expect(await versionOf(name)).toBe(1); // still not upgraded
    expect(await screen.findByText(new RegExp(`Backup file made: ${backup.items.length} items`))).toBeTruthy();

    const update = screen.getByRole('button', { name: 'Update without the on-device copy' }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'I have the backup file saved' }));
    expect(update.disabled).toBe(false);
    fireEvent.click(update);

    expect(await screen.findByText('The app')).toBeTruthy();
    await adapter.listAll();
    expect(await versionOf(name)).toBe(SCHEMA_VERSION);
    for (const item of backup.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    await adapter.close();
  });

  it('says so when trying again still fails, and opens the app once the copy can be made', async () => {
    const { name, backup } = await seedV010();
    let full = true;
    const adapter = new IndexedDbAdapter(name, { safetyCopy: (from, to, v, builtIn) => (full ? diskFull() : builtIn(from, to, v)) });
    renderGate(adapter);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/It still did not work/);
    expect(screen.queryByText('The app')).toBeNull();
    expect(await versionOf(name)).toBe(1);

    full = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The app')).toBeTruthy();
    expect((await adapter.info()).safetyCopies).toEqual([`${name}-backup-v1`]);
    for (const item of backup.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    await adapter.close();
  });
});
