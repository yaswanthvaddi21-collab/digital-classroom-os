import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, InvalidBackupError } from './errors';
import { IndexedDbAdapter, MAX_VERSIONS_PER_ITEM, SCHEMA_VERSION } from './indexeddb';
import type { BackupFile } from './types';

let n = 0;
let name = '';
let store: IndexedDbAdapter;

beforeEach(() => {
  name = `test-db-${++n}`;
  store = new IndexedDbAdapter(name);
});
afterEach(async () => {
  await store.close();
  vi.useRealTimers();
});

const fixtureBackup = (): BackupFile =>
  JSON.parse(readFileSync(join(__dirname, '../../../tests/fixtures/v0.1.0/backup-v1.json'), 'utf8'));

describe('IndexedDbAdapter basics', () => {
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

  it('lists all kinds together, newest first', async () => {
    const a = await store.create('document', { title: 'A', content: 1 });
    const b = await store.create('diagram', { title: 'B', content: 2 });
    await store.save('document', a.id, { content: 3 }, 1);
    expect((await store.listAll()).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('persists across connections (simulated app restart)', async () => {
    const doc = await store.create('diagram', { title: 'Flow', content: { nodes: [1] } });
    await store.close();
    store = new IndexedDbAdapter(name);
    expect((await store.get('diagram', doc.id))?.content).toEqual({ nodes: [1] });
  });

  it('increments version on save and rejects stale writes', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const saved = await store.save('document', doc.id, { content: 2 }, 1);
    expect(saved.version).toBe(2);
    await expect(store.save('document', doc.id, { content: 3 }, 1)).rejects.toBeInstanceOf(ConflictError);
    const current = await store.get('document', doc.id);
    expect(current?.content).toBe(2);
    expect(current?.version).toBe(2);
  });

  it('keeps the previous record intact when a save is aborted mid-transaction', async () => {
    const doc = await store.create('document', { title: 'A', content: { ok: true } });
    await expect(store.save('document', doc.id, { content: { bad: () => 1 } as never }, 1)).rejects.toBeTruthy();
    const current = await store.get('document', doc.id);
    expect(current?.content).toEqual({ ok: true });
    expect(current?.version).toBe(1);
    expect((await store.list('document'))[0].version).toBe(1);
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
    expect(await store.listAll()).toHaveLength(0);
  });

  it('duplicates with a fresh id', async () => {
    const doc = await store.create('diagram', { title: 'Tree', content: { a: 1 } });
    const copy = await store.duplicate('diagram', doc.id);
    expect(copy.id).not.toBe(doc.id);
    expect(copy.title).toBe('Tree (copy)');
    expect(copy.content).toEqual({ a: 1 });
  });
});

describe('metadata does not count as an edit (audit CODE-6 / FUNC-4)', () => {
  it('favorite, trash and restore leave version and updatedAt untouched', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    await store.setFavorite('document', doc.id, true);
    await store.trash('document', doc.id);
    await store.restore('document', doc.id);
    const current = (await store.get('document', doc.id))!;
    expect(current.favorite).toBe(true);
    expect(current.version).toBe(doc.version);
    expect(current.updatedAt).toBe(doc.updatedAt);
    // An editor holding the original version can still save.
    await expect(store.save('document', doc.id, { content: 2 }, doc.version)).resolves.toMatchObject({ version: 2 });
  });

  it('a favorite-only save patch also leaves the version alone', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const saved = await store.save('document', doc.id, { favorite: true }, 1);
    expect(saved.version).toBe(1);
    expect(saved.favorite).toBe(true);
  });
});

describe('version history (audit CODE-1 / STOR-7)', () => {
  it('snapshot records a manual version without bumping the item, and skips duplicates', async () => {
    const doc = await store.create('document', { title: 'A', content: 'one' });
    expect(await store.snapshot('document', doc.id)).toBe(false); // identical to the creation version
    await store.save('document', doc.id, { content: 'two' }, 1);
    expect(await store.snapshot('document', doc.id)).toBe(true);
    expect(await store.snapshot('document', doc.id)).toBe(false);
    const current = (await store.get('document', doc.id))!;
    expect(current.version).toBe(2);
    expect((await store.listVersions('document', doc.id)).map((v) => v.reason).sort()).toEqual(['create', 'manual']);
  });

  it('restores versions reversibly', async () => {
    const doc = await store.create('document', { title: 'A', content: 'one' });
    await store.save('document', doc.id, { content: 'two' }, 1);
    await store.snapshot('document', doc.id);
    const first = (await store.listVersions('document', doc.id)).find((v) => v.reason === 'create')!;
    const restored = await store.restoreVersion('document', doc.id, first.id);
    expect(restored.content).toBe('one');
    expect((await store.listVersions('document', doc.id)).some((v) => v.reason === 'restore')).toBe(true);
  });

  it('keeps exactly the limit, dropping autosaves before manual saves, and never the protected versions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let t = Date.parse('2026-01-01T00:00:00Z');
    vi.setSystemTime(t);
    const doc = await store.create('document', { title: 'A', content: 0 });
    let version = 1;
    // 30 autosave snapshots (edits 11 minutes apart), then 30 manual saves (edits 1 minute apart, no autosave due).
    for (let i = 1; i <= 60; i++) {
      t += (i <= 30 ? 11 : 1) * 60 * 1000;
      vi.setSystemTime(t);
      version = (await store.save('document', doc.id, { content: i }, version)).version;
      if (i > 30) expect(await store.snapshot('document', doc.id)).toBe(true);
    }
    const versions = await store.listVersions('document', doc.id);
    expect(versions).toHaveLength(MAX_VERSIONS_PER_ITEM);
    const reasons = versions.map((v) => v.reason);
    expect(reasons).toContain('create');
    // 30 auto + 30 manual + 1 create = 61; the 11 removed are the oldest autosaves.
    expect(reasons.filter((r) => r === 'manual')).toHaveLength(30);
    expect(reasons.filter((r) => r === 'auto')).toHaveLength(19);
  });

  it('never prunes the newest restore point, and prunes on restore too', async () => {
    const doc = await store.create('document', { title: 'A', content: 0 });
    let v = 1;
    for (let i = 1; i <= MAX_VERSIONS_PER_ITEM + 5; i++) {
      v = (await store.save('document', doc.id, { content: i }, v)).version;
      await store.snapshot('document', doc.id);
    }
    const create = (await store.listVersions('document', doc.id)).find((x) => x.reason === 'create')!;
    await store.restoreVersion('document', doc.id, create.id);
    const versions = await store.listVersions('document', doc.id);
    expect(versions).toHaveLength(MAX_VERSIONS_PER_ITEM);
    expect(versions.filter((x) => x.reason === 'restore')).toHaveLength(1);
    expect(versions.filter((x) => x.reason === 'create')).toHaveLength(1);
  });
});

describe('backup and restore', () => {
  it('round-trips a backup into an empty device', async () => {
    const doc = await store.create('document', { title: 'Report', content: 'body' });
    await store.create('diagram', { title: 'Chart', content: {} });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    expect(backup).toMatchObject({ format: 'dcos-backup', formatVersion: 2, schemaVersion: 1 });

    const other = new IndexedDbAdapter(`${name}-restore`);
    const report = await other.importBackup(backup);
    expect(report).toMatchObject({ added: 2, skipped: 0, copied: 0, unsupported: 0 });
    expect((await other.get('document', doc.id))?.content).toBe('body');
    expect(await other.listAll()).toHaveLength(2);
    await other.close();
  });

  it('never overwrites diverged local items, and re-importing is a no-op (audit STOR-6)', async () => {
    const doc = await store.create('document', { title: 'Report', content: 'v1' });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    await store.save('document', doc.id, { content: 'local edit' }, 1);

    expect(await store.importBackup(JSON.parse(JSON.stringify(await store.exportBackup())))).toMatchObject({ skipped: 1 });
    expect(await store.importBackup(backup)).toMatchObject({ copied: 1 });
    expect(await store.importBackup(backup)).toMatchObject({ copied: 0, skipped: 1 });
    expect((await store.get('document', doc.id))?.content).toBe('local edit');
    expect((await store.list('document')).map((d) => d.title).sort()).toEqual(['Report', 'Report (restored)']);
  });

  it('fills missing optional fields instead of misfiling records (audit STOR-5)', async () => {
    const backup = {
      format: 'dcos-backup',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'dev',
      items: [{ id: 'a', kind: 'document', title: 'No dates', version: 3, content: { x: 1 } }],
      versions: [{ id: 'v', itemId: 'a', kind: 'document', content: { x: 1 } }],
    };
    expect(await store.importBackup(backup)).toMatchObject({ added: 1, versionsAdded: 1 });
    const item = (await store.get('document', 'a'))!;
    expect(item.deletedAt).toBeNull();
    expect(item.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(item.favorite).toBe(false);
    expect(await store.list('document')).toHaveLength(1);
  });

  it('rejects broken or newer backups and imports nothing from them', async () => {
    const base = { format: 'dcos-backup', schemaVersion: 1, exportedAt: '2026-01-01T00:00:00Z', deviceId: 'd', versions: [] };
    await expect(store.importBackup({ format: 'other' })).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(store.importBackup({ ...base, schemaVersion: -1, items: [] })).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(store.importBackup({ ...base, schemaVersion: 2, items: [] })).rejects.toThrow(/newer/);
    await expect(store.importBackup({ ...base, formatVersion: 3, items: [] })).rejects.toThrow(/newer/);
    const mixed = {
      ...base,
      items: [
        { id: 'ok', kind: 'document', title: 'Fine', version: 1, content: {} },
        { id: 'broken', kind: 'document', title: 'No content', version: 1 },
      ],
    };
    await expect(store.importBackup(mixed)).rejects.toThrow(/no content/);
    expect(await store.get('document', 'ok')).toBeUndefined();
  });

  it('counts records of unknown kinds instead of failing (newer app backups)', async () => {
    const report = await store.importBackup({
      format: 'dcos-backup',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00Z',
      deviceId: 'd',
      items: [
        { id: 'p', kind: 'presentation', title: 'Slides', version: 1, content: {} },
        { id: 'd', kind: 'diagram', title: 'D', version: 1, content: {} },
      ],
      versions: [],
    });
    expect(report).toMatchObject({ added: 1, unsupported: 1 });
  });

  it('writes backups that the v0.1.0 importer still accepts', async () => {
    await store.create('document', { title: 'A', content: { schemaVersion: 1 } });
    const backup = await store.exportBackup();
    // The v0.1.0 rule: format 'dcos-backup', schemaVersion <= 1, kinds document|diagram.
    expect(backup.schemaVersion).toBeLessThanOrEqual(1);
    expect(backup.items.every((i) => ['document', 'diagram'].includes(i.kind))).toBe(true);
  });
});

describe('meta and drafts', () => {
  it('stores meta values', async () => {
    expect(await store.getMeta('lastBackupAt')).toBeUndefined();
    await store.setMeta('lastBackupAt', '2026-11-13T00:00:00Z');
    expect(await store.getMeta('lastBackupAt')).toBe('2026-11-13T00:00:00Z');
  });

  it('keeps one draft per item and removes it on purge', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    await store.saveDraft({ kind: 'document', itemId: doc.id, baseVersion: 1, content: 'unsaved' });
    expect(await store.getDraft('document', doc.id)).toMatchObject({ baseVersion: 1, content: 'unsaved' });
    await store.deleteDraft('document', doc.id);
    expect(await store.getDraft('document', doc.id)).toBeUndefined();
    await store.saveDraft({ kind: 'document', itemId: doc.id, baseVersion: 1, content: 'again' });
    await store.purge('document', doc.id);
    expect(await store.getDraft('document', doc.id)).toBeUndefined();
  });
});

describe('IndexedDB v1 → v2 upgrade (MIGRATION-PLAN §4)', () => {
  async function seedV1(db: string) {
    const backup = fixtureBackup();
    const v1 = await openDB(db, 1, {
      upgrade(d) {
        d.createObjectStore('documents', { keyPath: 'id' });
        d.createObjectStore('diagrams', { keyPath: 'id' });
        d.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    for (const item of backup.items) await v1.put(item.kind === 'document' ? 'documents' : 'diagrams', item);
    for (const v of backup.versions) await v1.put(v.kind === 'document' ? 'document_versions' : 'diagram_versions', v);
    await v1.put('meta', { key: 'deviceId', value: backup.deviceId });
    v1.close();
    return backup;
  }

  it('keeps every v1 record byte-identical, builds the index and leaves a verified safety copy', async () => {
    const db = `upgrade-${n}`;
    const backup = await seedV1(db);
    const upgraded = new IndexedDbAdapter(db);

    for (const item of backup.items) expect(await upgraded.get(item.kind, item.id)).toEqual(item);
    const versionCount = (await Promise.all(backup.items.map((i) => upgraded.listVersions(i.kind, i.id)))).flat().length;
    expect(versionCount).toBe(backup.versions.length);
    const indexed = [...(await upgraded.listAll()), ...(await upgraded.listAll({ trashed: true }))];
    expect(indexed.map((i) => i.id).sort()).toEqual(backup.items.map((i) => i.id).sort());
    expect((await upgraded.info()).deviceId).toBe(backup.deviceId);
    expect(await upgraded.getMeta('migratedFrom')).toMatch(/^1@/);

    const info = await upgraded.info();
    expect(info.schemaVersion).toBe(SCHEMA_VERSION);
    expect(info.safetyCopies).toEqual([`${db}-backup-v1`]);
    const copy = await upgraded.exportSafetyCopy(`${db}-backup-v1`);
    expect(copy.items).toEqual(expect.arrayContaining(backup.items));
    expect(copy.versions).toHaveLength(backup.versions.length);
    await upgraded.close();
  });

  it('does not copy or re-migrate an already current database', async () => {
    const db = `current-${n}`;
    const first = new IndexedDbAdapter(db);
    await first.create('document', { title: 'A', content: 1 });
    await first.close();
    const second = new IndexedDbAdapter(db);
    expect((await second.info()).safetyCopies).toEqual([]);
    expect(await second.listAll()).toHaveLength(1);
    await second.close();
  });

  it('tells the app when another tab upgrades, instead of reloading', async () => {
    const db = `blocking-${n}`;
    const onVersionChange = vi.fn();
    const a = new IndexedDbAdapter(db, { onVersionChange });
    await a.listAll();
    const newer = await openDB(db, SCHEMA_VERSION + 1);
    expect(onVersionChange).toHaveBeenCalledTimes(1);
    newer.close();
  });

  it('waits for pending work to be saved before giving the database to the upgrading tab', async () => {
    const db = `blocking-wait-${n}`;
    const order: string[] = [];
    const a = new IndexedDbAdapter(db, {
      onVersionChange: async () => {
        await new Promise((r) => setTimeout(r, 50));
        order.push('flushed');
      },
    });
    await a.listAll();
    const newer = await openDB(db, SCHEMA_VERSION + 1, { upgrade: () => void order.push('upgraded') });
    expect(order).toEqual(['flushed', 'upgraded']);
    newer.close();
  });
});
