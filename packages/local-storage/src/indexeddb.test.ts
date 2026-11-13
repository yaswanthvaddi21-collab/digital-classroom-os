import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, InvalidBackupError } from './errors';
import { IndexedDbAdapter } from './indexeddb';

let n = 0;
let store: IndexedDbAdapter;

beforeEach(() => {
  store = new IndexedDbAdapter(`test-db-${++n}`);
});
afterEach(async () => {
  await store.close();
});

describe('IndexedDbAdapter', () => {
  it('creates, reads and lists items with a creation version', async () => {
    const doc = await store.create('document', { title: 'Essay', content: { text: 'hi' } });
    expect(doc.version).toBe(1);
    expect(doc.deletedAt).toBeNull();
    expect((await store.get('document', doc.id))?.content).toEqual({ text: 'hi' });
    const list = await store.list('document');
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('content');
    expect(await store.list('diagram')).toHaveLength(0);
    expect(await store.listVersions('document', doc.id)).toHaveLength(1);
  });

  it('persists across connections (simulated app restart)', async () => {
    const doc = await store.create('diagram', { title: 'Flow', content: { nodes: [1] } });
    await store.close();
    store = new IndexedDbAdapter(`test-db-${n}`);
    expect((await store.get('diagram', doc.id))?.content).toEqual({ nodes: [1] });
  });

  it('increments version on save and rejects stale writes', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const saved = await store.save('document', doc.id, { content: 2 }, 1);
    expect(saved.version).toBe(2);
    await expect(store.save('document', doc.id, { content: 3 }, 1)).rejects.toBeInstanceOf(ConflictError);
    // The rejected write must leave the stored record untouched.
    const current = await store.get('document', doc.id);
    expect(current?.content).toBe(2);
    expect(current?.version).toBe(2);
  });

  it('keeps the previous record intact when a save is aborted mid-transaction', async () => {
    const doc = await store.create('document', { title: 'A', content: { ok: true } });
    // A non-cloneable value makes the put fail inside the transaction.
    await expect(store.save('document', doc.id, { content: { bad: () => 1 } as never }, 1)).rejects.toBeTruthy();
    const current = await store.get('document', doc.id);
    expect(current?.content).toEqual({ ok: true });
    expect(current?.version).toBe(1);
  });

  it('snapshots on manual save and restores versions reversibly', async () => {
    const doc = await store.create('document', { title: 'A', content: 'one' });
    await store.save('document', doc.id, { content: 'two' }, 1, { snapshot: true });
    const versions = await store.listVersions('document', doc.id);
    expect(versions.map((v) => v.reason).sort()).toEqual(['create', 'manual']);
    const first = versions.find((v) => v.reason === 'create')!;
    const restored = await store.restoreVersion('document', doc.id, first.id);
    expect(restored.content).toBe('one');
    expect((await store.listVersions('document', doc.id)).some((v) => v.reason === 'restore')).toBe(true);
  });

  it('soft-deletes to trash, restores, and purges', async () => {
    const doc = await store.create('document', { title: 'A', content: null });
    await store.trash('document', doc.id);
    expect(await store.list('document')).toHaveLength(0);
    expect(await store.list('document', { trashed: true })).toHaveLength(1);
    await store.restore('document', doc.id);
    expect(await store.list('document')).toHaveLength(1);
    await store.purge('document', doc.id);
    expect(await store.get('document', doc.id)).toBeUndefined();
    expect(await store.listVersions('document', doc.id)).toHaveLength(0);
  });

  it('duplicates with a fresh id', async () => {
    const doc = await store.create('diagram', { title: 'Tree', content: { a: 1 } });
    const copy = await store.duplicate('diagram', doc.id);
    expect(copy.id).not.toBe(doc.id);
    expect(copy.title).toBe('Tree (copy)');
    expect(copy.content).toEqual({ a: 1 });
  });

  it('round-trips a backup into an empty device', async () => {
    const doc = await store.create('document', { title: 'Report', content: 'body' });
    await store.create('diagram', { title: 'Chart', content: {} });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));

    const other = new IndexedDbAdapter(`test-db-restore-${n}`);
    const report = await other.importBackup(backup);
    expect(report).toMatchObject({ added: 2, skipped: 0, copied: 0 });
    expect((await other.get('document', doc.id))?.content).toBe('body');
    await other.close();
  });

  it('never overwrites diverged local items on import', async () => {
    const doc = await store.create('document', { title: 'Report', content: 'v1' });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    await store.save('document', doc.id, { content: 'local edit' }, 1);

    expect(await store.importBackup(JSON.parse(JSON.stringify(await store.exportBackup())))).toMatchObject({ skipped: 1 });
    const report = await store.importBackup(backup);
    expect(report.copied).toBe(1);
    expect((await store.get('document', doc.id))?.content).toBe('local edit');
    const titles = (await store.list('document')).map((d) => d.title).sort();
    expect(titles).toEqual(['Report', 'Report (restored)']);
  });

  it('rejects malformed backups', async () => {
    await expect(store.importBackup({ format: 'other' })).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(store.importBackup({ format: 'dcos-backup', schemaVersion: 99, items: [], versions: [] })).rejects.toBeInstanceOf(InvalidBackupError);
  });
});
