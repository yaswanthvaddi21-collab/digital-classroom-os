import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, InvalidBackupError, SafetyCopyError, UpgradeError } from './errors';
import { validateBackup } from './backup';
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const a = await store.create('document', { title: 'A', content: 1 });
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    const b = await store.create('diagram', { title: 'B', content: 2 });
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
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
    const doc = await store.create('document', { title: 'Report', content: { text: 'body' } });
    await store.create('diagram', { title: 'Chart', content: {} });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    expect(backup).toMatchObject({ format: 'dcos-backup', formatVersion: 2, schemaVersion: 1 });

    const other = new IndexedDbAdapter(`${name}-restore`);
    const report = await other.importBackup(backup);
    expect(report).toMatchObject({ added: 2, skipped: 0, copied: 0, unsupported: 0 });
    expect((await other.get('document', doc.id))?.content).toEqual({ text: 'body' });
    expect(await other.listAll()).toHaveLength(2);
    await other.close();
  });

  it('never overwrites diverged local items, and re-importing is a no-op (audit STOR-6)', async () => {
    const doc = await store.create('document', { title: 'Report', content: { text: 'v1' } });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    await store.save('document', doc.id, { content: { text: 'local edit' } }, 1);

    expect(await store.importBackup(JSON.parse(JSON.stringify(await store.exportBackup())))).toMatchObject({ skipped: 1 });
    expect(await store.importBackup(backup)).toMatchObject({ copied: 1 });
    expect(await store.importBackup(backup)).toMatchObject({ copied: 0, skipped: 1 });
    expect((await store.get('document', doc.id))?.content).toEqual({ text: 'local edit' });
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
    await expect(store.importBackup({ ...base, schemaVersion: 3, items: [] })).rejects.toThrow(/newer/);
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

describe('backup content checks and history limit (audit STOR-R7 / STOR-R6)', () => {
  const file = (items: unknown[], versions: unknown[] = [], extra: Record<string, unknown> = {}) => ({
    format: 'dcos-backup', formatVersion: 2, schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', deviceId: 'd', items, versions, ...extra,
  });
  const at = (minute: number) => new Date(Date.parse('2026-01-01T00:00:00.000Z') + minute * 60_000).toISOString();

  for (const [label, bad, words] of [['text', 'just a string', 'text'], ['a list', [1, 2], 'a list'], ['null', null, 'nothing \\(null\\)'], ['a number', 7, 'a number']] as const) {
    it(`refuses a file whose item content is ${label}, names the item, and imports nothing from it`, async () => {
      const attachment = { id: 'att', base64: Buffer.from([1, 2, 3]).toString('base64') };
      const backup = file(
        [
          { id: 'ok', kind: 'diagram', title: 'Fine', version: 1, content: { schemaVersion: 2, nodes: [], edges: [] } },
          { id: 'bad', kind: 'document', title: 'Broken essay', version: 1, content: bad },
        ],
        [{ id: 'v-ok', itemId: 'ok', kind: 'diagram', content: {} }],
        { attachments: [attachment] },
      );
      await expect(store.importBackup(backup)).rejects.toBeInstanceOf(InvalidBackupError);
      await expect(store.importBackup(backup)).rejects.toThrow(new RegExp(`item 2 \\(“Broken essay”, bad\\) is damaged: its content should be a document but is ${words}`));
      expect(await store.listAll()).toHaveLength(0);
      expect(await store.listAll({ trashed: true })).toHaveLength(0);
      expect(await store.get('diagram', 'ok')).toBeUndefined();
      expect(await store.listVersions('diagram', 'ok')).toHaveLength(0);
      expect(await store.getAttachment('att')).toBeUndefined();
    });
  }

  it('refuses a version whose content is not an object', async () => {
    const backup = file(
      [{ id: 'a', kind: 'document', title: 'A', version: 2, content: { schemaVersion: 1 } }],
      [
        { id: 'v1', itemId: 'a', kind: 'document', content: { schemaVersion: 1 } },
        { id: 'v2', itemId: 'a', kind: 'document', content: 'old text' },
      ],
    );
    await expect(store.importBackup(backup)).rejects.toThrow(/version 2 \(v2, of item a\) is damaged: its content should be a document but is text/);
    expect(await store.get('document', 'a')).toBeUndefined();
  });

  it('still accepts the genuine v0.1.0 backup and a current one', async () => {
    const legacy = fixtureBackup();
    expect(await store.importBackup(structuredClone(legacy))).toMatchObject({ added: legacy.items.length, versionsAdded: legacy.versions.length });
    await store.create('diagram', { title: 'New', content: { schemaVersion: 2, nodes: [], edges: [] } });
    const current = JSON.parse(JSON.stringify(await store.exportBackup()));
    const other = new IndexedDbAdapter(`${name}-current`);
    expect(await other.importBackup(current)).toMatchObject({ added: legacy.items.length + 1, versionsAdded: current.versions.length });
    await other.close();
  });

  /** One item with 1 create, 55 autosaves, 3 manual saves and 2 restore points: 61 versions, 11 over the limit. */
  function bigHistory() {
    const versions: Array<Record<string, unknown>> = [];
    const add = (reason: string, minute: number) =>
      versions.push({ id: `v${versions.length}`, itemId: 'big', kind: 'document', version: versions.length + 1, title: 'Big', content: { n: versions.length }, createdAt: at(minute), reason });
    add('create', 0);
    for (let i = 1; i <= 55; i++) add('auto', i);
    add('manual', 56);
    add('restore', 57);
    add('manual', 58);
    add('restore', 59);
    add('manual', 60);
    return file([{ id: 'big', kind: 'document', title: 'Big', version: 61, content: { n: 61 }, createdAt: at(0), updatedAt: at(60) }], versions);
  }

  it('imports at most the version limit per item, never dropping the protected versions', async () => {
    const backup = bigHistory();
    const report = await store.importBackup(structuredClone(backup));
    expect(report).toMatchObject({ added: 1, versionsAdded: MAX_VERSIONS_PER_ITEM });
    const kept = await store.listVersions('document', 'big');
    expect(kept).toHaveLength(MAX_VERSIONS_PER_ITEM);
    const ids = new Set(kept.map((v) => v.id));
    expect(ids.has('v0')).toBe(true); // creation
    expect(ids.has('v60')).toBe(true); // newest manual save
    expect(ids.has('v59')).toBe(true); // newest restore point
    // Only autosaves were over the limit, and the oldest went first.
    expect([...Array(11)].map((_, i) => `v${i + 1}`).some((id) => ids.has(id))).toBe(false);
    expect(ids.has('v12')).toBe(true);
    expect(kept.filter((v) => v.reason === 'manual')).toHaveLength(3);
    expect(kept.filter((v) => v.reason === 'restore')).toHaveLength(2);
  });

  it('applies the limit to a restored copy too, and leaves shorter histories alone', async () => {
    const backup = bigHistory();
    backup.items.push({ id: 'small', kind: 'diagram', title: 'Small', version: 3, content: { schemaVersion: 2 }, createdAt: at(0), updatedAt: at(2) } as never);
    for (let i = 0; i < 3; i++) backup.versions.push({ id: `s${i}`, itemId: 'small', kind: 'diagram', version: i + 1, title: 'Small', content: { i }, createdAt: at(i), reason: i ? 'auto' : 'create' } as never);
    await store.importBackup(structuredClone(backup));
    await store.save('document', 'big', { content: { n: 'local edit' } }, 61);

    const report = await store.importBackup(structuredClone(backup));
    expect(report).toMatchObject({ added: 0, skipped: 1, copied: 1, versionsAdded: MAX_VERSIONS_PER_ITEM });
    const copy = (await store.list('document')).find((d) => d.title === 'Big (restored)')!;
    expect(await store.listVersions('document', copy.id)).toHaveLength(MAX_VERSIONS_PER_ITEM);
    expect(await store.listVersions('diagram', 'small')).toHaveLength(3);
    expect((await store.get('document', 'big'))?.content).toEqual({ n: 'local edit' });
  });
});

describe('attachments (embedded diagram previews)', () => {
  const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, seed + 1]).buffer;

  it('stores bytes once per content and reads them back', async () => {
    const a = await store.putAttachment(png(1), 'image/png');
    const again = await store.putAttachment(new Blob([png(1)]), 'image/png');
    const other = await store.putAttachment(png(2), 'image/png');
    expect(again.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
    expect(a).toMatchObject({ mimeType: 'image/png', sizeBytes: 6 });
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    const stored = (await store.getAttachment(a.id))!;
    expect(new Uint8Array(stored.data)).toEqual(new Uint8Array(png(1)));
  });

  it('travel with backups, keeping their ids so content references stay valid', async () => {
    const a = await store.putAttachment(png(7), 'image/png');
    await store.create('document', { title: 'With preview', content: { schemaVersion: 1, previewId: a.id } });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    expect(backup.attachments).toHaveLength(1);
    expect(backup.schemaVersion).toBe(1); // still readable by v0.1.0, which ignores the attachments field

    const other = new IndexedDbAdapter(`${name}-att`);
    expect(await other.importBackup(backup)).toMatchObject({ added: 1, attachmentsAdded: 1 });
    expect(new Uint8Array((await other.getAttachment(a.id))!.data)).toEqual(new Uint8Array(png(7)));
    expect(await other.importBackup(backup)).toMatchObject({ attachmentsAdded: 0, skipped: 1 });
    await other.close();
  });

  it('imports bytes this device already holds under another id, and keeps both ids working (STOR-IMPORT-ATTACH-SHA)', async () => {
    const a = await store.putAttachment(png(3), 'image/png');
    await store.create('document', { title: 'From A', content: { schemaVersion: 1, previewId: a.id } });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));

    const deviceB = new IndexedDbAdapter(`${name}-b`);
    const b = await deviceB.putAttachment(png(3), 'image/png');
    expect(b.id).not.toBe(a.id);
    expect(await deviceB.importBackup(backup)).toMatchObject({ added: 1, attachmentsAdded: 1 });
    expect(await deviceB.listAll()).toHaveLength(1);
    expect(new Uint8Array((await deviceB.getAttachment(a.id))!.data)).toEqual(new Uint8Array(png(3)));
    expect((await deviceB.getAttachment(a.id))!.id).toBe(a.id);
    expect(new Uint8Array((await deviceB.getAttachment(b.id))!.data)).toEqual(new Uint8Array(png(3)));
    // Still one stored copy per content, and re-importing is a no-op.
    expect((await deviceB.putAttachment(png(3), 'image/png')).id).toBe(b.id);
    expect(await deviceB.importBackup(backup)).toMatchObject({ attachmentsAdded: 0, skipped: 1 });

    // A backup of device B carries bytes for both ids into a third device.
    const fromB = JSON.parse(JSON.stringify(await deviceB.exportBackup()));
    expect(fromB.attachments.map((x: { id: string }) => x.id).sort()).toEqual([a.id, b.id].sort());
    const deviceC = new IndexedDbAdapter(`${name}-c`);
    expect(await deviceC.importBackup(fromB)).toMatchObject({ added: 1, attachmentsAdded: 2 });
    for (const id of [a.id, b.id]) expect(new Uint8Array((await deviceC.getAttachment(id))!.data)).toEqual(new Uint8Array(png(3)));
    await deviceB.close();
    await deviceC.close();
  });

  it('hashes imported bytes itself, so a missing or wrong sha256 cannot collide (STOR-IMPORT-ATTACH-SHA)', async () => {
    const b64 = (seed: number) => Buffer.from(new Uint8Array(png(seed))).toString('base64');
    const file = {
      format: 'dcos-backup', formatVersion: 2, schemaVersion: 1, exportedAt: '2026-01-01T00:00:00Z', deviceId: 'd',
      items: [{ id: 'x', kind: 'document', title: 'X', version: 1, content: {} }],
      versions: [],
      attachments: [
        { id: 'no-sha-1', base64: b64(4) },
        { id: 'no-sha-2', base64: b64(5) },
        { id: 'wrong-sha', sha256: 'f'.repeat(64), base64: b64(6) },
      ],
    };
    expect(await store.importBackup(file)).toMatchObject({ added: 1, attachmentsAdded: 3 });
    for (const [id, seed] of [['no-sha-1', 4], ['no-sha-2', 5], ['wrong-sha', 6]] as const) {
      const got = (await store.getAttachment(id))!;
      expect(new Uint8Array(got.data)).toEqual(new Uint8Array(png(seed)));
      expect(got.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(got.sha256).not.toBe('f'.repeat(64));
    }
    expect((await store.putAttachment(png(4), 'image/png')).id).toBe('no-sha-1');
  });

  it('rejects damaged attachment data without importing anything', async () => {
    const bad = { format: 'dcos-backup', formatVersion: 2, schemaVersion: 1, exportedAt: '2026-01-01T00:00:00Z', deviceId: 'd', items: [{ id: 'x', kind: 'document', title: 'X', version: 1, content: {} }], versions: [], attachments: [{ id: 'a', base64: '!!!not base64' }] };
    await expect(store.importBackup(bad)).rejects.toThrow(/damaged/);
    expect(await store.get('document', 'x')).toBeUndefined();
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

  it('fails clearly, instead of with a closed-connection error, after giving the database away (STOR-VERSIONCHANGE-CLOSED)', async () => {
    const db = `blocking-closed-${n}`;
    const a = new IndexedDbAdapter(db, { onVersionChange: () => undefined });
    const doc = await a.create('document', { title: 'A', content: 1 });
    const newer = await openDB(db, SCHEMA_VERSION + 1);
    await expect(a.save('document', doc.id, { content: 2 }, doc.version)).rejects.toThrow(/updated in another tab/);
    await expect(a.saveDraft({ kind: 'document', itemId: doc.id, baseVersion: 1, content: 2 })).rejects.toThrow(/updated in another tab/);
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

describe('a failed pre-upgrade safety copy (audit STOR-R5)', () => {
  const V1_LAYOUT = {
    documents: undefined,
    diagrams: undefined,
    document_versions: 'by_item',
    diagram_versions: 'by_item',
    meta: undefined,
  } as const;

  /** A v0.1.0 database, built the way v0.1.0 built it, holding the v0.1.0 fixture data. */
  async function seedV010(db: string) {
    const backup = fixtureBackup();
    const v1 = await openDB(db, 1, {
      upgrade(d) {
        for (const [store, index] of Object.entries(V1_LAYOUT)) {
          const s = d.createObjectStore(store, { keyPath: store === 'meta' ? 'key' : 'id' });
          if (index) s.createIndex(index, 'itemId');
        }
      },
    });
    for (const item of backup.items) await v1.put(item.kind === 'document' ? 'documents' : 'diagrams', item);
    for (const v of backup.versions) await v1.put(v.kind === 'document' ? 'document_versions' : 'diagram_versions', v);
    await v1.put('meta', { key: 'deviceId', value: backup.deviceId });
    v1.close();
    return backup;
  }

  /** Every store and record of a database, read without upgrading it. */
  async function rawContents(db: string) {
    const conn = await openDB(db);
    const out: { version: number; stores: Record<string, unknown[]> } = { version: conn.version, stores: {} };
    for (const s of Array.from(conn.objectStoreNames)) out.stores[s] = await conn.getAll(s);
    conn.close();
    return out;
  }

  const databaseNames = async () => (await indexedDB.databases()).map((d) => d.name);
  const diskFull = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));

  it('upgrades nothing, keeps the old database exactly as it was, and says why', async () => {
    const db = `stor-r5-a-${n}`;
    await seedV010(db);
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db, { safetyCopy: diskFull });

    const failure = await adapter.listAll().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SafetyCopyError);
    expect((failure as SafetyCopyError).reason).toBe('quota');
    expect((failure as Error).message).toMatch(/isn't enough free space/);
    expect(adapter.upgradeStatus()).toMatchObject({ state: 'needs-backup', step: 'copy', fromVersion: 1, reason: 'quota' });

    const after = await rawContents(db);
    expect(after.version).toBe(1);
    expect(Object.keys(after.stores).sort()).toEqual(Object.keys(V1_LAYOUT).sort());
    expect(after).toEqual(before);
    expect(await databaseNames()).not.toContain(`${db}-backup-v1`);
  });

  it('removes an incomplete copy, so it is never offered as a backup and frees its space', async () => {
    const db = `stor-r5-b-${n}`;
    await seedV010(db);
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db, {
      safetyCopy: async (_from, to) => {
        const partial = await openDB(to, 1, { upgrade: (d) => void d.createObjectStore('documents', { keyPath: 'id' }) });
        await partial.put('documents', { id: 'half-written' });
        partial.close();
        throw new Error('Write failed');
      },
    });
    await expect(adapter.listAll()).rejects.toThrow(/could not be made \(Write failed\)/);
    expect(adapter.upgradeStatus()).toMatchObject({ state: 'needs-backup', step: 'copy', reason: 'error' });
    expect(await databaseNames()).not.toContain(`${db}-backup-v1`);
    expect(await rawContents(db)).toEqual(before);
  });

  it('exports the old database read-only as a backup this app and v0.1.0 can import', async () => {
    const db = `stor-r5-c-${n}`;
    const fixture = await seedV010(db);
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db, { safetyCopy: diskFull });
    await adapter.listAll().catch(() => undefined);

    const backup = JSON.parse(JSON.stringify(await adapter.exportWithoutUpgrade())) as BackupFile;
    expect(await rawContents(db)).toEqual(before); // still version 1, nothing written
    expect(backup.items).toHaveLength(fixture.items.length);
    expect(backup.items).toEqual(expect.arrayContaining(fixture.items));
    expect(backup.versions).toHaveLength(fixture.versions.length);
    expect(backup.versions).toEqual(expect.arrayContaining(fixture.versions));
    expect(backup.deviceId).toBe(fixture.deviceId);

    // This app's validator accepts it.
    expect(() => validateBackup(backup)).not.toThrow();
    // The v0.1.0 importer's rule: format 'dcos-backup', schemaVersion <= 1, known kinds, typed id/version/title.
    expect(backup.format).toBe('dcos-backup');
    expect(backup.schemaVersion).toBe(1);
    for (const i of backup.items) expect([typeof i.id, typeof i.version, typeof i.title, ['document', 'diagram'].includes(i.kind)]).toEqual(['string', 'number', 'string', true]);
    for (const v of backup.versions) expect([typeof v.id, typeof v.itemId, ['document', 'diagram'].includes(v.kind)]).toEqual(['string', 'string', true]);

    // And it restores everything into a fresh device.
    const fresh = new IndexedDbAdapter(`${db}-fresh`);
    expect(await fresh.importBackup(backup)).toMatchObject({ added: fixture.items.length, versionsAdded: fixture.versions.length });
    for (const item of fixture.items) expect(await fresh.get(item.kind, item.id)).toEqual(item);
    await fresh.close();
  });

  it('will not upgrade without the copy until a backup file was made', async () => {
    const db = `stor-r5-d-${n}`;
    await seedV010(db);
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db, { safetyCopy: diskFull });
    await adapter.listAll().catch(() => undefined);
    await expect(adapter.upgradeWithoutSafetyCopy()).rejects.toThrow(/Download a backup first/);
    expect(adapter.upgradeStatus().state).toBe('needs-backup');
    expect(await rawContents(db)).toEqual(before);
  });

  it('after a backup file was made, upgrades without the copy and keeps every record', async () => {
    const db = `stor-r5-e-${n}`;
    const fixture = await seedV010(db);
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db, { safetyCopy: diskFull });
    await adapter.listAll().catch(() => undefined);
    const backup = await adapter.exportWithoutUpgrade();

    await adapter.upgradeWithoutSafetyCopy();
    expect(adapter.upgradeStatus()).toEqual({ state: 'ready' });
    for (const item of fixture.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    const indexed = [...(await adapter.listAll()), ...(await adapter.listAll({ trashed: true }))];
    expect(indexed.map((i) => i.id).sort()).toEqual(fixture.items.map((i) => i.id).sort());
    expect((await adapter.info()).deviceId).toBe(fixture.deviceId);
    expect(await adapter.getMeta('migratedFrom')).toMatch(/^1@/);
    expect(await adapter.getMeta('upgradeSafetyBackup')).toBe(`file@${backup.exportedAt}`);
    await adapter.close();

    const after = await rawContents(db);
    expect(after.version).toBe(SCHEMA_VERSION);
    for (const store of ['documents', 'diagrams', 'document_versions', 'diagram_versions']) expect(after.stores[store]).toEqual(before.stores[store]);
    expect(await databaseNames()).not.toContain(`${db}-backup-v1`);
  });

  it('tries again when asked, and then makes the copy and upgrades as usual', async () => {
    const db = `stor-r5-f-${n}`;
    const fixture = await seedV010(db);
    let full = true;
    const adapter = new IndexedDbAdapter(db, {
      safetyCopy: (from, to, version, builtIn) => (full ? diskFull() : builtIn(from, to, version)),
    });
    await expect(adapter.info()).rejects.toBeInstanceOf(SafetyCopyError);
    await expect(adapter.retryUpgrade()).rejects.toBeInstanceOf(SafetyCopyError);
    expect(adapter.upgradeStatus().state).toBe('needs-backup');

    full = false; // the user freed some space
    const seen: string[] = [];
    const stop = adapter.subscribeUpgradeStatus(() => seen.push(adapter.upgradeStatus().state));
    await adapter.retryUpgrade();
    stop();
    expect(seen).toEqual(['checking', 'copying', 'opening', 'ready']);
    const info = await adapter.info();
    expect(info.deviceId).toBe(fixture.deviceId);
    expect(info.safetyCopies).toEqual([`${db}-backup-v1`]);
    expect((await adapter.exportSafetyCopy(`${db}-backup-v1`)).items).toEqual(expect.arrayContaining(fixture.items));
    for (const item of fixture.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    expect(await adapter.getMeta('upgradeSafetyBackup')).toBeUndefined();
    await adapter.close();
  });

  it('treats a failed upgrade step like a failed copy: rolled back, nothing changed, and it can be tried again', async () => {
    const db = `stor-r5-h-${n}`;
    const fixture = await seedV010(db);
    // A record the list index cannot summarise (JSON has no BigInt) makes the upgrade transaction fail part-way.
    const odd = { ...fixture.items[0], id: 'cannot-index', content: { n: 1n } };
    const raw = await openDB(db, 1);
    await raw.put('documents', odd);
    raw.close();
    const before = await rawContents(db);
    const adapter = new IndexedDbAdapter(db);

    const failure = await adapter.listAll().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(UpgradeError);
    expect(failure).not.toBeInstanceOf(SafetyCopyError);
    expect(adapter.upgradeStatus()).toMatchObject({ state: 'needs-backup', step: 'upgrade', fromVersion: 1, reason: 'error' });
    expect((failure as Error).message).toMatch(/^The update could not finish .*Nothing was changed\.$/);
    expect(await rawContents(db)).toEqual(before); // rolled back: still version 1, no new stores

    const fix = await openDB(db, 1);
    await fix.delete('documents', 'cannot-index');
    fix.close();
    await adapter.retryUpgrade();
    expect(adapter.upgradeStatus()).toEqual({ state: 'ready' });
    for (const item of fixture.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    await adapter.close();
  });

  /** A database whose upgrade step fails: one record the list index cannot summarise (JSON has no BigInt). */
  async function seedFailingUpgrade(db: string) {
    const fixture = await seedV010(db);
    const raw = await openDB(db, 1);
    await raw.put('documents', { ...fixture.items[0], id: 'cannot-index', content: { n: 1n } });
    raw.close();
    return fixture;
  }

  /** A minimal Web Locks stand-in for Node: tasks with the same name run one after another, like in browsers. */
  function installWebLocks() {
    const tails = new Map<string, Promise<unknown>>();
    const request = (name: string, task: () => Promise<unknown>) => {
      const run = (tails.get(name) ?? Promise.resolve()).then(task);
      tails.set(name, run.catch(() => undefined));
      return run;
    };
    Object.defineProperty(globalThis.navigator, 'locks', { value: { request }, configurable: true });
    return () => void delete (globalThis.navigator as { locks?: unknown }).locks;
  }

  it('never removes a complete safety copy from an earlier attempt when a later attempt fails', async () => {
    const db = `stor-r5-i-${n}`;
    await seedFailingUpgrade(db);
    // First session: the copy is made, then the upgrade step fails.
    await new IndexedDbAdapter(db).listAll().catch(() => undefined);
    const firstCopy = await rawContents(`${db}-backup-v1`);
    expect(firstCopy.stores.__copy).toHaveLength(1);

    // Next session, disk now full: its own copy fails, and only that copy is removed.
    const next = new IndexedDbAdapter(db, { safetyCopy: diskFull });
    await next.listAll().catch(() => undefined);
    expect(next.upgradeStatus()).toMatchObject({ state: 'needs-backup', step: 'copy', reason: 'quota' });
    expect(await rawContents(`${db}-backup-v1`)).toEqual(firstCopy); // still there, untouched
    expect(await databaseNames()).not.toContain(`${db}-backup-v1-2`);
  });

  it('a retry after a failed upgrade step reuses the copy it already made instead of using more space', async () => {
    const db = `stor-r5-j-${n}`;
    const fixture = await seedFailingUpgrade(db);
    let copies = 0;
    const adapter = new IndexedDbAdapter(db, { safetyCopy: (from, to, version, builtIn) => (copies++, builtIn(from, to, version)) });
    await adapter.listAll().catch(() => undefined);
    await adapter.retryUpgrade().catch(() => undefined);
    expect(adapter.upgradeStatus()).toMatchObject({ state: 'needs-backup', step: 'upgrade' });

    const fix = await openDB(db, 1);
    await fix.delete('documents', 'cannot-index');
    fix.close();
    await adapter.retryUpgrade();
    expect(adapter.upgradeStatus()).toEqual({ state: 'ready' });
    expect(copies).toBe(1);
    const names = await databaseNames();
    expect(names).toContain(`${db}-backup-v1`);
    expect(names).not.toContain(`${db}-backup-v1-2`);
    for (const item of fixture.items) expect(await adapter.get(item.kind, item.id)).toEqual(item);
    await adapter.close();
  });

  it('two tabs opening the update at once: one copy, one upgrade, nothing removed, both ready', async () => {
    const uninstall = installWebLocks();
    try {
      const db = `stor-r5-k-${n}`;
      const fixture = await seedV010(db);
      const before = await rawContents(db);
      // Tab B is slower: its copy would only start once tab A has finished upgrading (the case that lost the copy).
      let aUpgraded!: () => void;
      const aDone = new Promise<void>((resolve) => (aUpgraded = resolve));
      const tabA = new IndexedDbAdapter(db);
      tabA.subscribeUpgradeStatus(() => tabA.upgradeStatus().state === 'ready' && aUpgraded());
      const tabB = new IndexedDbAdapter(db, { safetyCopy: (from, to, version, builtIn) => aDone.then(() => builtIn(from, to, version)) });
      await Promise.all([tabA.listAll(), tabB.listAll()]);
      expect(tabA.upgradeStatus()).toEqual({ state: 'ready' });
      expect(tabB.upgradeStatus()).toEqual({ state: 'ready' });

      const names = await databaseNames();
      expect(names).toContain(`${db}-backup-v1`);
      expect(names).not.toContain(`${db}-backup-v1-2`);
      const copy = await rawContents(`${db}-backup-v1`);
      for (const store of Object.keys(V1_LAYOUT)) expect(copy.stores[store]).toEqual(before.stores[store]);
      for (const item of fixture.items) expect(await tabB.get(item.kind, item.id)).toEqual(item);
      await tabA.close();
      await tabB.close();
    } finally {
      uninstall();
    }
  });

  it('reports ready without a copy for a new or current database', async () => {
    const adapter = new IndexedDbAdapter(`stor-r5-g-${n}`, { safetyCopy: diskFull });
    await adapter.listAll();
    expect(adapter.upgradeStatus()).toEqual({ state: 'ready' });
    await adapter.close();
  });
});
