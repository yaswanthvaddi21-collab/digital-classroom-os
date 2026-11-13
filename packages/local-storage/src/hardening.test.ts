/**
 * Phase 3 storage hardening (contract section A): drafts per editor session, clear "not found" errors, clean-up of
 * unused attachments, version history without copying large images, and atomic multi-purge.
 */
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, MissingAttachmentError, NotFoundError, isNotFoundError } from './errors';
import { BLOB_PREFIX, DATA_URL_MIME } from './blobs';
import { ATTACHMENT_GRACE_MS, IndexedDbAdapter, MAX_VERSIONS_PER_ITEM } from './indexeddb';
import type { BackupFile, Draft, ItemVersion } from './types';

let n = 0;
let name = '';
let store: IndexedDbAdapter;
const others: IndexedDbAdapter[] = [];

beforeEach(() => {
  name = `hardening-db-${++n}`;
  store = new IndexedDbAdapter(name);
});
afterEach(async () => {
  await store.close();
  for (const o of others.splice(0)) await o.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const adapter = (db: string, options?: ConstructorParameters<typeof IndexedDbAdapter>[1]) => {
  const a = new IndexedDbAdapter(db, options);
  others.push(a);
  return a;
};

/** Reads raw records, bypassing the adapter (so tests see exactly what is stored). */
async function raw<T = unknown>(storeName: string, key?: string): Promise<T> {
  const db = await openDB(name);
  try {
    return (key === undefined ? await db.getAll(storeName) : await db.get(storeName, key)) as T;
  } finally {
    db.close();
  }
}
async function rawPut(storeName: string, value: unknown) {
  const db = await openDB(name);
  try {
    await db.put(storeName, value);
  } finally {
    db.close();
  }
}
async function rawDelete(storeName: string, key: string) {
  const db = await openDB(name);
  try {
    await db.delete(storeName, key);
  } finally {
    db.close();
  }
}

/** A PNG-like data URL of about `kb` KB whose bytes depend on `seed`. */
function dataUrl(seed: number, kb = 40): string {
  const bytes = new Uint8Array(kb * 768);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + seed * 17 + (i >> 7)) & 0xff;
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}
const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, seed + 1, seed + 2]).buffer;
const docWithImage = (url: string, text = 'caption') => ({
  schemaVersion: 1,
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'image', attrs: { src: url, alt: 'figure', width: 320 } }],
});

const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
describe('drafts: one per editor session, never silently replaced (STOR-R1 / TD-3)', () => {
  it('keeps the drafts of two sessions side by side; each session replaces only its own', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const doc = await store.create('document', { title: 'Essay', content: { text: 'saved' } });
    await store.saveDraft({ kind: 'document', itemId: doc.id, session: 'tab-a', baseVersion: 1, content: { text: 'from A' } });
    vi.setSystemTime(new Date('2026-01-01T10:01:00Z'));
    await store.saveDraft({ kind: 'document', itemId: doc.id, session: 'tab-b', baseVersion: 1, content: { text: 'from B' } });

    let drafts = await store.listDrafts({ kind: 'document', itemId: doc.id });
    expect(drafts.map((d) => [d.session, d.content])).toEqual([
      ['tab-b', { text: 'from B' }],
      ['tab-a', { text: 'from A' }],
    ]);
    expect(drafts[0].key).toBe(`document:${doc.id}:tab-b`);
    expect((await store.getDraft('document', doc.id))?.content).toEqual({ text: 'from B' });

    // Session A writes again: only A's draft changes; B's draft is still there, and A is now the newest.
    vi.setSystemTime(new Date('2026-01-01T10:02:00Z'));
    await store.saveDraft({ kind: 'document', itemId: doc.id, session: 'tab-a', baseVersion: 1, content: { text: 'from A, later' } });
    drafts = await store.listDrafts({ kind: 'document', itemId: doc.id });
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => [d.session, d.content])).toEqual([
      ['tab-a', { text: 'from A, later' }],
      ['tab-b', { text: 'from B' }],
    ]);
    expect((await store.getDraft('document', doc.id))?.session).toBe('tab-a');

    // Deleting one session's draft leaves the other.
    await store.deleteDraft('document', doc.id, 'tab-a');
    expect((await store.listDrafts({ kind: 'document', itemId: doc.id })).map((d) => d.session)).toEqual(['tab-b']);
  });

  it('still reads, lists and deletes a draft saved before sessions existed (legacy key)', async () => {
    const doc = await store.create('document', { title: 'Old', content: 1 });
    const legacy = { key: `document:${doc.id}`, kind: 'document', itemId: doc.id, baseVersion: 1, content: 'old unsaved edits', savedAt: '2026-01-01T00:00:00.000Z' };
    await rawPut('drafts', legacy);

    expect(await store.getDraft('document', doc.id)).toEqual({ ...legacy, session: '' });
    await store.saveDraft({ kind: 'document', itemId: doc.id, session: 'new-tab', baseVersion: 1, content: 'new unsaved edits' });
    // A new session never replaces the legacy draft.
    const both = await store.listDrafts({ kind: 'document', itemId: doc.id });
    expect(both.map((d) => d.session)).toEqual(['new-tab', '']);
    expect(both[1].content).toBe('old unsaved edits');
    expect((await store.listDrafts()).length).toBe(2);

    // Session '' is the legacy draft, exactly.
    await store.deleteDraft('document', doc.id, '');
    expect(await raw('drafts', `document:${doc.id}`)).toBeUndefined();
    expect((await store.listDrafts({ kind: 'document', itemId: doc.id })).map((d) => d.session)).toEqual(['new-tab']);
  });

  it('an older caller that passes no session keeps using the one legacy slot', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const save = store.saveDraft.bind(store) as (d: Omit<Draft, 'key' | 'savedAt' | 'session'>) => Promise<void>;
    await save({ kind: 'document', itemId: doc.id, baseVersion: 1, content: 'one' });
    await save({ kind: 'document', itemId: doc.id, baseVersion: 1, content: 'two' });
    const drafts = await store.listDrafts({ kind: 'document', itemId: doc.id });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ key: `document:${doc.id}`, session: '', content: 'two' });
  });

  it('matches item ids exactly: ids sharing a prefix never see or delete each other’s drafts', async () => {
    const put = (itemId: string, session: string) => store.saveDraft({ kind: 'document', itemId, session, baseVersion: 1, content: `${itemId}/${session}` });
    await put('a', 's1');
    await put('a', '');
    await put('a-1', 's1');
    await put('ab', 's1');
    await put('a', 'x:y'); // a session id may itself contain ':'
    await store.saveDraft({ kind: 'diagram', itemId: 'a', session: 's1', baseVersion: 1, content: 'diagram a' });

    expect((await store.listDrafts({ kind: 'document', itemId: 'a' })).map((d) => d.content).sort()).toEqual(['a/', 'a/s1', 'a/x:y']);
    expect((await store.listDrafts({ kind: 'document', itemId: 'ab' })).map((d) => d.content)).toEqual(['ab/s1']);
    expect((await store.listDrafts({ kind: 'diagram', itemId: 'a' })).map((d) => d.content)).toEqual(['diagram a']);
    expect(await store.listDrafts()).toHaveLength(6);

    // Without a session: every draft of that item, and nothing else.
    await store.deleteDraft('document', 'a');
    expect(await store.listDrafts({ kind: 'document', itemId: 'a' })).toEqual([]);
    expect((await store.listDrafts()).map((d) => d.content).sort()).toEqual(['a-1/s1', 'ab/s1', 'diagram a']);
  });

  it('purge removes every draft of the item (all sessions and the legacy one), and only those', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const other = await store.create('document', { title: 'B', content: 1 });
    await rawPut('drafts', { key: `document:${doc.id}`, kind: 'document', itemId: doc.id, baseVersion: 1, content: 'legacy', savedAt: '2026-01-01T00:00:00.000Z' });
    for (const session of ['s1', 's2']) await store.saveDraft({ kind: 'document', itemId: doc.id, session, baseVersion: 1, content: session });
    await store.saveDraft({ kind: 'document', itemId: other.id, session: 's1', baseVersion: 1, content: 'keep me' });

    await store.purge('document', doc.id);
    expect(await store.listDrafts({ kind: 'document', itemId: doc.id })).toEqual([]);
    expect((await store.listDrafts()).map((d) => d.content)).toEqual(['keep me']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('missing items: every write throws NotFoundError (TD-4)', () => {
  it('save, snapshot, setFavorite, trash, restore, restoreVersion and duplicate all throw NotFoundError', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const [version] = await store.listVersions('document', doc.id);
    // Deleted in another window.
    const elsewhere = adapter(name);
    await elsewhere.purge('document', doc.id);

    const writes: Array<[string, () => Promise<unknown>]> = [
      ['save', () => store.save('document', doc.id, { content: 2 }, 1)],
      ['snapshot', () => store.snapshot('document', doc.id)],
      ['setFavorite', () => store.setFavorite('document', doc.id, true)],
      ['trash', () => store.trash('document', doc.id)],
      ['restore', () => store.restore('document', doc.id)],
      ['restoreVersion', () => store.restoreVersion('document', doc.id, version.id)],
      ['duplicate', () => store.duplicate('document', doc.id)],
    ];
    for (const [label, write] of writes) {
      const err = await write().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err, label).toBeInstanceOf(NotFoundError);
      expect(isNotFoundError(err), label).toBe(true);
      expect((err as NotFoundError).kind, label).toBe('document');
      expect((err as NotFoundError).id, label).toBe(doc.id);
    }
    // Nothing was created by any of them.
    expect(await store.listAll()).toEqual([]);
    expect(await store.listAll({ trashed: true })).toEqual([]);
  });

  it('a missing version (item still there) is a NotFoundError about the version, and changes nothing', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const err = await store.restoreVersion('document', doc.id, 'no-such-version').catch((e: unknown) => e);
    expect(isNotFoundError(err)).toBe(true);
    expect(err).toMatchObject({ kind: 'document version', id: 'no-such-version' });
    expect(await store.get('document', doc.id)).toMatchObject({ version: 1, content: 1 });
    expect(await store.listVersions('document', doc.id)).toHaveLength(1);
  });

  it('isNotFoundError tells "not found" apart from everything else', async () => {
    const doc = await store.create('document', { title: 'A', content: 1 });
    const conflict = await store.save('document', doc.id, { content: 2 }, 99).catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(ConflictError);
    expect(isNotFoundError(conflict)).toBe(false);
    expect(isNotFoundError(new Error('document x not found'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError('NotFoundError')).toBe(false);
    // Also from another copy of the class (another bundle or realm), where instanceof fails.
    expect(isNotFoundError({ name: 'NotFoundError', message: 'gone', kind: 'document', id: 'x' })).toBe(true);
    // IndexedDB's own NotFoundError (a missing store or index) is a storage fault, not a deleted item.
    expect(isNotFoundError(new DOMException('No objectStore named x', 'NotFoundError'))).toBe(false);
    expect(isNotFoundError({ name: 'NotFoundError', message: 'gone' })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('cleanUpAttachments (STOR-R3 / TD-1)', () => {
  const T0 = Date.parse('2026-03-01T00:00:00Z');
  const at = (ms: number) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + ms);
  };
  const ids = async () => ((await raw<Array<{ id: string }>>('attachments')).map((a) => a.id)).sort();

  it('keeps everything that is referenced, and removes only the rest', async () => {
    at(0);
    const live = await store.putAttachment(png(1), 'image/png');
    const trashed = await store.putAttachment(png(2), 'image/png');
    const inVersion = await store.putAttachment(png(3), 'image/png');
    const inDraft = await store.putAttachment(png(4), 'image/png');
    const extraOpt = await store.putAttachment(png(5), 'image/png');
    const unused = await store.putAttachment(png(6), 'image/png');
    const purged = await store.putAttachment(png(7), 'image/png');

    const embed = (id: string) => ({ schemaVersion: 1, content: [{ type: 'diagramEmbed', attrs: { previewId: id } }] });
    await store.create('document', { title: 'Live', content: embed(live.id) });
    const t = await store.create('document', { title: 'Trashed', content: embed(trashed.id) });
    await store.trash('document', t.id);
    // Only an old version still refers to this one.
    const v = await store.create('document', { title: 'Versioned', content: embed(inVersion.id) });
    await store.save('document', v.id, { content: { schemaVersion: 1, content: [] } }, 1);
    // Only an unsaved draft refers to this one.
    const d = await store.create('diagram', { title: 'Drafted', content: {} });
    await store.saveDraft({ kind: 'diagram', itemId: d.id, session: 's', baseVersion: 1, content: { nodes: [{ data: { previewId: inDraft.id } }] } });
    const p = await store.create('document', { title: 'Purged', content: embed(purged.id) });
    await store.purge('document', p.id);

    at(2 * DAY);
    const report = await store.cleanUpAttachments({ extraReferences: [extraOpt.id] });
    expect(report).toEqual({ removed: 2, freedBytes: 14 });
    expect(await ids()).toEqual([live.id, trashed.id, inVersion.id, inDraft.id, extraOpt.id].sort());
    expect(await store.getAttachment(unused.id)).toBeUndefined();
    expect(await store.getAttachment(purged.id)).toBeUndefined();
    // What is kept is intact.
    expect(new Uint8Array((await store.getAttachment(live.id))!.data)).toEqual(new Uint8Array(png(1)));

    // Running again finds nothing more to remove.
    expect(await store.cleanUpAttachments({ extraReferences: [extraOpt.id] })).toEqual({ removed: 0, freedBytes: 0 });
  });

  it('a trashed item keeps its attachments until it is purged', async () => {
    at(0);
    const a = await store.putAttachment(png(1), 'image/png');
    const doc = await store.create('document', { title: 'A', content: { previewId: a.id } });
    await store.trash('document', doc.id);
    at(3 * DAY);
    expect(await store.cleanUpAttachments()).toEqual({ removed: 0, freedBytes: 0 });
    await store.purge('document', doc.id);
    expect(await store.cleanUpAttachments()).toEqual({ removed: 1, freedBytes: 7 });
  });

  it('never removes anything stored or re-used within the grace period (default 24 hours)', async () => {
    at(0);
    const a = await store.putAttachment(png(1), 'image/png'); // a dialog stored a preview; its document has not saved yet
    at(ATTACHMENT_GRACE_MS - 60_000);
    expect(await store.cleanUpAttachments()).toEqual({ removed: 0, freedBytes: 0 });
    // Stored again (same bytes, deduplicated): counts as fresh, although it was created long ago.
    at(ATTACHMENT_GRACE_MS + DAY / 2);
    const again = await store.putAttachment(new Blob([png(1)]), 'image/png');
    expect(again.id).toBe(a.id);
    expect(again.lastUsedAt).toBe(new Date(T0 + ATTACHMENT_GRACE_MS + DAY / 2).toISOString());
    at(2 * ATTACHMENT_GRACE_MS);
    expect(await store.cleanUpAttachments()).toEqual({ removed: 0, freedBytes: 0 });
    // A shorter grace period can be asked for.
    expect(await store.cleanUpAttachments({ graceMs: 60_000 })).toEqual({ removed: 1, freedBytes: 7 });
  });

  it('keeps an attachment whose age cannot be read', async () => {
    await rawPut('attachments', { id: 'odd', sha256: 'x'.repeat(64), mimeType: 'image/png', sizeBytes: 3, data: new Uint8Array([1, 2, 3]).buffer, createdAt: 'not a date' });
    expect(await store.cleanUpAttachments({ graceMs: 0 })).toEqual({ removed: 0, freedBytes: 0 });
    expect(await ids()).toEqual(['odd']);
  });

  it('aliases: kept when referenced (with their target); removed with an unreferenced target otherwise', async () => {
    at(0);
    const stored = (id: string, seed: number) => ({ id, sha256: `${seed}`.padStart(64, '0'), mimeType: 'image/png', sizeBytes: 7, data: png(seed), createdAt: new Date(T0).toISOString() });
    // t1 is only reachable through alias a1; t2 is referenced directly while its alias a2 is not; t3/a3 unused.
    for (const rec of [stored('t1', 1), stored('t2', 2), stored('t3', 3)]) await rawPut('attachments', rec);
    for (const [alias, target] of [['a1', 't1'], ['a2', 't2'], ['a3', 't3']]) await rawPut('attachments', { id: alias, aliasOf: target, createdAt: new Date(T0).toISOString() });
    await store.create('document', { title: 'A', content: { a: 'a1', b: ['t2'] } });

    at(2 * DAY);
    expect(await store.cleanUpAttachments()).toEqual({ removed: 1, freedBytes: 7 }); // t3 (aliases hold no bytes)
    expect(await ids()).toEqual(['a1', 't1', 't2']);
    expect(new Uint8Array((await store.getAttachment('a1'))!.data)).toEqual(new Uint8Array(png(1)));
  });

  it('includes references held outside the database (adapter option), also inside JSON text', async () => {
    at(0);
    const a = await store.putAttachment(png(1), 'image/png');
    const b = await store.putAttachment(png(2), 'image/png');
    const c = await store.putAttachment(png(3), 'image/png');
    const emergency = JSON.stringify({ itemId: 'x', content: { image: { previewId: b.id } } });
    const scoped = adapter(name, { extraReferences: () => [a.id, emergency] });
    at(2 * DAY);
    expect(await scoped.cleanUpAttachments()).toEqual({ removed: 1, freedBytes: 7 });
    expect(await scoped.getAttachment(a.id)).toBeTruthy();
    expect(await scoped.getAttachment(b.id)).toBeTruthy();
    expect(await scoped.getAttachment(c.id)).toBeUndefined();
  });

  it('removes nothing when the outside references cannot be read', async () => {
    at(0);
    await store.putAttachment(png(1), 'image/png');
    const failing = adapter(name, {
      extraReferences: () => {
        throw new Error('localStorage unavailable');
      },
    });
    at(2 * DAY);
    await expect(failing.cleanUpAttachments()).rejects.toThrow(/localStorage unavailable/);
    expect(await ids()).toHaveLength(1);
  });

  it('runs under the Web Lock dcos-gc:<database name> when the browser has one', async () => {
    const names: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: (lock: string, task: () => Promise<unknown>) => (names.push(lock), task()) } });
    await store.cleanUpAttachments();
    expect(names).toEqual([`dcos-gc:${name}`]);
  });

  it('is all-or-nothing: a failure while deleting removes nothing', async () => {
    at(0);
    await store.putAttachment(png(1), 'image/png');
    await store.putAttachment(png(2), 'image/png');
    at(2 * DAY);
    const original = IDBObjectStore.prototype.delete;
    let calls = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (this.name === 'attachments' && ++calls === 2) throw new DOMException('disk error', 'UnknownError');
      return original.call(this, key);
    });
    await expect(store.cleanUpAttachments()).rejects.toThrow(/disk error/);
    spy.mockRestore();
    expect(await ids()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('backups carry only referenced attachments', () => {
  it('exports only what items and versions refer to, and re-imports identically', async () => {
    const live = await store.putAttachment(png(1), 'image/png');
    const trashed = await store.putAttachment(png(2), 'image/png');
    const versionOnly = await store.putAttachment(png(3), 'image/png');
    const orphan = await store.putAttachment(png(4), 'image/png');
    // Bytes this device already holds under another id, referenced by that second id only.
    await rawPut('attachments', { id: 'alias-of-live', aliasOf: live.id, createdAt: '2026-01-01T00:00:00.000Z' });

    const a = await store.create('document', { title: 'A', content: { schemaVersion: 1, previewId: live.id, also: 'alias-of-live' } });
    const b = await store.create('diagram', { title: 'B', content: { previewId: trashed.id } });
    await store.trash('diagram', b.id);
    const c = await store.create('document', { title: 'C', content: { previewId: versionOnly.id } });
    await store.save('document', c.id, { content: { previewId: null } }, 1);

    const backup: BackupFile = JSON.parse(JSON.stringify(await store.exportBackup()));
    expect(backup.attachments!.map((x) => x.id).sort()).toEqual([live.id, 'alias-of-live', trashed.id, versionOnly.id].sort());
    expect(backup.attachments!.some((x) => x.id === orphan.id)).toBe(false);
    expect(backup.attachments!.every((x) => !('lastUsedAt' in x))).toBe(true);
    expect(backup.schemaVersion).toBe(1);
    expect(backup).not.toHaveProperty('missingAttachments');

    const other = adapter(`${name}-other`);
    expect(await other.importBackup(backup)).toMatchObject({ added: 3, attachmentsAdded: 4 });
    for (const item of [a, b, c]) {
      const kind = item.kind;
      expect(await other.get(kind, item.id)).toEqual(await store.get(kind, item.id));
      expect((await other.listVersions(kind, item.id)).map((v) => v.id).sort()).toEqual((await store.listVersions(kind, item.id)).map((v) => v.id).sort());
    }
    for (const [id, seed] of [[live.id, 1], ['alias-of-live', 1], [trashed.id, 2], [versionOnly.id, 3]] as const) {
      expect(new Uint8Array((await other.getAttachment(id))!.data)).toEqual(new Uint8Array(png(seed)));
    }
    expect(await other.getAttachment(orphan.id)).toBeUndefined();
    // Importing the same file again adds nothing.
    expect(await other.importBackup(backup)).toMatchObject({ added: 0, skipped: 3, attachmentsAdded: 0, versionsAdded: 0 });
    // A backup of the other device is the same set again.
    const again: BackupFile = JSON.parse(JSON.stringify(await other.exportBackup()));
    expect(again.attachments!.map((x) => x.id).sort()).toEqual(backup.attachments!.map((x) => x.id).sort());
  });

  it('imported attachments count as just used, so a clean-up right after the import keeps them', async () => {
    const a = await store.putAttachment(png(1), 'image/png');
    await store.create('document', { title: 'A', content: { previewId: a.id } });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    backup.attachments[0].createdAt = '2020-01-01T00:00:00.000Z';
    backup.items = []; // the attachment arrives, the item is not imported (e.g. left out of the file)
    const other = adapter(`${name}-other`);
    expect(await other.importBackup(backup)).toMatchObject({ attachmentsAdded: 1 });
    expect(await other.cleanUpAttachments()).toEqual({ removed: 0, freedBytes: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('version history stores a large image once (STOR-R4 / TD-2), losslessly', () => {
  const versionsRaw = async () => [...(await raw<ItemVersion[]>('document_versions')), ...(await raw<ItemVersion[]>('diagram_versions'))];
  const blobsRaw = async () => (await raw<Array<{ id: string; mimeType: string }>>('attachments')).filter((a) => a.mimeType === DATA_URL_MIME);

  it('moves a large inline image out of the new version record; the document itself keeps it inline', async () => {
    const url = dataUrl(1);
    const content = docWithImage(url);
    const doc = await store.create('document', { title: 'Lab report', content });

    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toHaveLength(1);
    const ref = `${BLOB_PREFIX}${stored.blobRefs![0]}`;
    expect(JSON.stringify(stored.content)).not.toContain('data:image/png');
    expect((stored.content as typeof content).content[1].attrs!.src).toBe(ref);
    expect(JSON.stringify(stored.content).length).toBeLessThan(1000);
    // Everything else in the version is exactly as it was.
    expect({ ...(stored.content as typeof content), content: [(stored.content as typeof content).content[0]] }).toEqual({ ...content, content: [content.content[0]] });

    // The live document is never compacted.
    expect((await raw<{ content: unknown }>('documents', doc.id)).content).toEqual(content);
    expect(await store.get('document', doc.id)).toMatchObject({ content });
    // The attachment holds the exact text of the data URL.
    const [blob] = await blobsRaw();
    expect(new TextDecoder().decode((await store.getAttachment(blob.id))!.data)).toBe(url);
  });

  it('restoreVersion gives back the exact original content, byte for byte', async () => {
    const url = dataUrl(2);
    const original = docWithImage(url, 'first');
    const doc = await store.create('document', { title: 'A', content: original });
    await store.save('document', doc.id, { content: docWithImage(dataUrl(3), 'second') }, 1);
    const create = (await store.listVersions('document', doc.id)).find((v) => v.reason === 'create')!;

    const restored = await store.restoreVersion('document', doc.id, create.id);
    expect(JSON.stringify(restored.content)).toBe(JSON.stringify(original));
    expect((restored.content as typeof original).content[1].attrs!.src).toBe(url);
    expect(JSON.stringify((await store.get('document', doc.id))!.content)).toBe(JSON.stringify(original));
    // The 'before restore' version written by restoreVersion is compacted too, and restoring it is exact as well.
    const before = (await store.listVersions('document', doc.id)).find((v) => v.reason === 'restore')!;
    expect(before.blobRefs).toHaveLength(1);
    const back = await store.restoreVersion('document', doc.id, before.id);
    expect(JSON.stringify(back.content)).toBe(JSON.stringify(docWithImage(dataUrl(3), 'second')));
  });

  it('50 versions of a document with the same image store the image once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let t = Date.parse('2026-01-01T00:00:00Z');
    vi.setSystemTime(t);
    const url = dataUrl(4, 100);
    const doc = await store.create('document', { title: 'A', content: docWithImage(url, 'v0') });
    let version = 1;
    for (let i = 1; i <= MAX_VERSIONS_PER_ITEM + 5; i++) {
      t += 11 * 60 * 1000; // an autosave version every time
      vi.setSystemTime(t);
      version = (await store.save('document', doc.id, { content: docWithImage(url, `v${i}`) }, version)).version;
    }
    const versions = await versionsRaw();
    expect(versions).toHaveLength(MAX_VERSIONS_PER_ITEM);
    expect(versions.every((v) => v.blobRefs?.length === 1)).toBe(true);
    expect(await blobsRaw()).toHaveLength(1);
    const total = versions.reduce((sum, v) => sum + JSON.stringify(v).length, 0);
    expect(total).toBeLessThan(url.length); // all 50 versions together are smaller than one copy of the image
  });

  it('only data URLs over 16 KB are moved; several images, and repeats of one, each come back in place', async () => {
    const small = `data:image/png;base64,${'A'.repeat(16 * 1024 - 'data:image/png;base64,'.length)}`; // exactly 16 KB: stays inline
    const big1 = dataUrl(5);
    const big2 = `data:image/svg+xml,${encodeURIComponent('<svg>' + 'x'.repeat(20_000) + '</svg>')}`; // not base64
    expect(small.length).toBe(16 * 1024);
    const content = { schemaVersion: 1, images: [big1, small, big2, big1], nested: { deep: [{ src: big2 }] }, n: 3, flag: true, none: null };
    const doc = await store.create('diagram', { title: 'Many', content });

    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toHaveLength(2);
    const c = stored.content as typeof content;
    expect(c.images[1]).toBe(small);
    expect(c.images[0]).toBe(c.images[3]);
    expect(c.nested.deep[0].src).toBe(c.images[2]);
    expect(c.images[0].startsWith(BLOB_PREFIX)).toBe(true);
    expect(c.images[2].startsWith(BLOB_PREFIX)).toBe(true);

    await store.save('diagram', doc.id, { content: {} }, 1);
    const create = (await store.listVersions('diagram', doc.id)).find((v) => v.reason === 'create')!;
    expect(JSON.stringify((await store.restoreVersion('diagram', doc.id, create.id)).content)).toBe(JSON.stringify(content));
  });

  it('a data URL that UTF-8 cannot carry exactly stays inline, and still restores exactly', async () => {
    const odd = `data:text/plain,${'x'.repeat(20_000)}\uD800`; // a lone surrogate
    const doc = await store.create('document', { title: 'A', content: { src: odd } });
    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toBeUndefined();
    expect((stored.content as { src: string }).src).toBe(odd);
    await store.save('document', doc.id, { content: {} }, 1);
    const create = (await store.listVersions('document', doc.id)).find((v) => v.reason === 'create')!;
    expect((await store.restoreVersion('document', doc.id, create.id)).content).toEqual({ src: odd });
  });

  it('content that already holds dcos-blob text is never compacted, so that text is never changed', async () => {
    const content = { note: `${BLOB_PREFIX}something the user typed`, src: dataUrl(6) };
    const doc = await store.create('document', { title: 'A', content });
    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toBeUndefined();
    expect(stored.content).toEqual(content);
    await store.save('document', doc.id, { content: {} }, 1);
    const create = (await store.listVersions('document', doc.id)).find((v) => v.reason === 'create')!;
    expect((await store.restoreVersion('document', doc.id, create.id)).content).toEqual(content);
  });

  it('snapshot() still sees "same as the newest version" when that version was compacted', async () => {
    const content = docWithImage(dataUrl(7));
    const doc = await store.create('document', { title: 'A', content });
    expect((await versionsRaw())[0].blobRefs).toHaveLength(1);
    expect(await store.snapshot('document', doc.id)).toBe(false);
    await store.save('document', doc.id, { content: docWithImage(dataUrl(7), 'changed') }, 1);
    expect(await store.snapshot('document', doc.id)).toBe(true);
    expect(await store.snapshot('document', doc.id)).toBe(false);
    expect(await store.listVersions('document', doc.id)).toHaveLength(2);
    expect(await blobsRaw()).toHaveLength(1);
  });

  it('backups hold versions with their images inline (same file layout as before) and re-import exactly', async () => {
    const url = dataUrl(8);
    const doc = await store.create('document', { title: 'A', content: docWithImage(url, 'one') });
    await store.save('document', doc.id, { content: { schemaVersion: 1, type: 'doc', content: [] } }, 1);
    const backup: BackupFile = JSON.parse(JSON.stringify(await store.exportBackup()));
    const text = JSON.stringify(backup);
    expect(text).not.toContain(BLOB_PREFIX);
    expect(backup.versions[0]).not.toHaveProperty('blobRefs');
    expect((backup.versions[0].content as ReturnType<typeof docWithImage>).content[1].attrs!.src).toBe(url);
    // Nothing refers to the version's image attachment once the image is inline, so it is not in the file.
    expect(backup.attachments).toEqual([]);
    expect(backup.schemaVersion).toBe(1);

    const other = adapter(`${name}-other`);
    expect(await other.importBackup(backup)).toMatchObject({ added: 1, versionsAdded: 1 });
    const create = (await other.listVersions('document', doc.id))[0];
    expect(create.blobRefs).toHaveLength(1); // compacted again on the other device
    const restored = await other.restoreVersion('document', doc.id, create.id);
    expect(JSON.stringify(restored.content)).toBe(JSON.stringify(docWithImage(url, 'one')));
    // And its own backup is again the same inline content.
    const again: BackupFile = JSON.parse(JSON.stringify(await other.exportBackup()));
    expect(again.versions.find((v) => v.id === create.id)?.content).toEqual(docWithImage(url, 'one'));
  });

  it('if compaction fails, the inline version stays complete and the save still succeeds', async () => {
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'attachments') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    const content = docWithImage(dataUrl(9));
    const doc = await store.create('document', { title: 'A', content });
    spy.mockRestore();
    expect(doc.content).toEqual(content);
    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toBeUndefined();
    expect(stored.content).toEqual(content);
    expect(await raw('attachments')).toEqual([]);
    await store.save('document', doc.id, { content: {} }, 1);
    expect((await store.restoreVersion('document', doc.id, stored.id)).content).toEqual(content);
  });

  it('if hashing fails, the inline version stays complete', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no crypto'));
    const content = docWithImage(dataUrl(10));
    await store.create('document', { title: 'A', content });
    const [stored] = await versionsRaw();
    expect(stored.blobRefs).toBeUndefined();
    expect(stored.content).toEqual(content);
  });

  it('does not touch a version that changed or disappeared before compaction ran', async () => {
    const doc = await store.create('document', { title: 'A', content: { text: 'small' } });
    const [stored] = await versionsRaw();
    const compact = (store as unknown as { compactVersion(kind: string, v: ItemVersion): Promise<void> }).compactVersion.bind(store);
    // What compaction was told was written differs from what is stored now.
    await compact('document', { ...stored, content: { src: dataUrl(11) } });
    expect((await versionsRaw())[0]).toEqual(stored);
    // The version is gone by the time compaction runs.
    await store.purge('document', doc.id);
    await compact('document', { ...stored, content: { src: dataUrl(11) } });
    expect(await versionsRaw()).toEqual([]);
    expect(await raw('attachments')).toEqual([]);
  });

  it('versions written before this change are left exactly as they are, and still restore', async () => {
    const url = dataUrl(12);
    const doc = await store.create('document', { title: 'A', content: { text: 'now' } });
    const old: ItemVersion = { id: 'pre-phase', itemId: doc.id, kind: 'document', version: 1, title: 'A', content: { src: url }, createdAt: '2025-01-01T00:00:00.000Z', reason: 'manual' };
    await rawPut('document_versions', old);
    await store.save('document', doc.id, { content: { text: 'later' } }, 1);
    await store.cleanUpAttachments({ graceMs: 0 });
    expect(await raw('document_versions', 'pre-phase')).toEqual(old);
    expect((await store.restoreVersion('document', doc.id, 'pre-phase')).content).toEqual({ src: url });
  });

  it('a missing image is reported: restore refuses and changes nothing; export leaves the reference', async () => {
    const doc = await store.create('document', { title: 'A', content: docWithImage(dataUrl(13)) });
    await store.save('document', doc.id, { content: { text: 'edited' } }, 1);
    const [stored] = await versionsRaw();
    const blobId = stored.blobRefs![0];
    await rawDelete('attachments', blobId); // damaged storage

    const err = await store.restoreVersion('document', doc.id, stored.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingAttachmentError);
    expect((err as MissingAttachmentError).attachmentIds).toEqual([blobId]);
    expect((err as Error).message).toMatch(/no longer stored on this device.*Nothing was changed/);
    expect(await store.get('document', doc.id)).toMatchObject({ version: 2, content: { text: 'edited' } });
    expect(await store.listVersions('document', doc.id)).toHaveLength(1);

    const backup = await store.exportBackup();
    expect(backup.missingAttachments).toEqual([blobId]);
    const v = backup.versions.find((x) => x.id === stored.id)!;
    expect(v.blobRefs).toEqual([blobId]);
    expect(JSON.stringify(v.content)).toContain(`${BLOB_PREFIX}${blobId}`);
    // snapshot() does not treat the damaged version as "same", so the current state gets a fresh version.
    expect(await store.snapshot('document', doc.id)).toBe(true);
  });

  it('clean-up keeps an image while any version refers to it, and removes it once none does', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
    const doc = await store.create('document', { title: 'A', content: docWithImage(dataUrl(14)) });
    await store.save('document', doc.id, { content: { text: 'no image any more' } }, 1);
    vi.setSystemTime(Date.parse('2026-01-05T00:00:00Z'));
    expect(await store.cleanUpAttachments()).toEqual({ removed: 0, freedBytes: 0 });
    const [create] = await store.listVersions('document', doc.id);
    expect(JSON.stringify((await store.restoreVersion('document', doc.id, create.id)).content)).toBe(JSON.stringify(docWithImage(dataUrl(14))));
    await store.purge('document', doc.id);
    const report = await store.cleanUpAttachments();
    expect(report.removed).toBe(1);
    expect(report.freedBytes).toBe(dataUrl(14).length);
  });

  it('exports a safety copy with images put back from that copy’s own attachments', async () => {
    const url = dataUrl(15);
    const copyName = `${name}-backup-v1`;
    const copy = await openDB(copyName, 1, {
      upgrade(d) {
        d.createObjectStore('documents', { keyPath: 'id' });
        d.createObjectStore('diagrams', { keyPath: 'id' });
        d.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('meta', { keyPath: 'key' });
        d.createObjectStore('attachments', { keyPath: 'id' }).createIndex('by_sha256', 'sha256', { unique: true });
      },
    });
    const bytes = new TextEncoder().encode(url);
    await copy.put('attachments', { id: 'blob-1', sha256: 'b'.repeat(64), mimeType: DATA_URL_MIME, sizeBytes: bytes.byteLength, data: bytes.buffer, createdAt: '2026-01-01T00:00:00.000Z' });
    await copy.put('attachments', { id: 'preview', sha256: 'c'.repeat(64), mimeType: 'image/png', sizeBytes: 7, data: png(1), createdAt: '2026-01-01T00:00:00.000Z' });
    await copy.put('attachments', { id: 'unused', sha256: 'd'.repeat(64), mimeType: 'image/png', sizeBytes: 7, data: png(2), createdAt: '2026-01-01T00:00:00.000Z' });
    await copy.put('documents', { id: 'd1', kind: 'document', title: 'D', content: { previewId: 'preview' }, version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, ownerDeviceId: 'x', favorite: false, templateId: null, lastSnapshotAt: null });
    await copy.put('document_versions', { id: 'v1', itemId: 'd1', kind: 'document', version: 1, title: 'D', content: { src: `${BLOB_PREFIX}blob-1` }, createdAt: '2026-01-01T00:00:00.000Z', reason: 'create', blobRefs: ['blob-1'] });
    copy.close();

    const backup = await store.exportSafetyCopy(copyName);
    expect(backup.versions[0].content).toEqual({ src: url });
    expect(backup.versions[0]).not.toHaveProperty('blobRefs');
    expect(backup.attachments!.map((a) => a.id)).toEqual(['preview']);
    expect(backup).not.toHaveProperty('missingAttachments');
    await store.deleteSafetyCopy(copyName);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('purgeMany (Empty trash): one transaction', () => {
  it('removes every listed item with its list row, versions and all drafts; leaves the rest', async () => {
    const a = await store.create('document', { title: 'A', content: 1 });
    const b = await store.create('diagram', { title: 'B', content: 2 });
    const keep = await store.create('document', { title: 'Keep', content: 3 });
    await store.save('document', a.id, { content: 4 }, 1);
    await store.snapshot('document', a.id);
    for (const item of [a, b, keep]) {
      await store.saveDraft({ kind: item.kind, itemId: item.id, session: 's1', baseVersion: 1, content: 'x' });
      await store.saveDraft({ kind: item.kind, itemId: item.id, session: 's2', baseVersion: 1, content: 'y' });
    }
    await rawPut('drafts', { key: `diagram:${b.id}`, kind: 'diagram', itemId: b.id, baseVersion: 1, content: 'legacy', savedAt: '2026-01-01T00:00:00.000Z' });
    await store.trash('document', a.id);
    await store.trash('diagram', b.id);

    await store.purgeMany([
      { kind: 'document', id: a.id },
      { kind: 'diagram', id: b.id },
      { kind: 'diagram', id: b.id }, // listed twice: still fine
    ]);
    expect(await store.get('document', a.id)).toBeUndefined();
    expect(await store.get('diagram', b.id)).toBeUndefined();
    expect(await store.listAll({ trashed: true })).toEqual([]);
    expect((await store.listAll()).map((i) => i.id)).toEqual([keep.id]);
    expect(await store.listVersions('document', a.id)).toEqual([]);
    expect(await store.listVersions('diagram', b.id)).toEqual([]);
    expect((await store.listDrafts()).map((d) => d.itemId)).toEqual([keep.id, keep.id]);
    expect(await store.listVersions('document', keep.id)).toHaveLength(1);
  });

  it('is all-or-nothing: if one item cannot be removed, none is', async () => {
    const a = await store.create('document', { title: 'A', content: 1 });
    const b = await store.create('diagram', { title: 'B', content: 2 });
    await store.saveDraft({ kind: 'document', itemId: a.id, session: 's', baseVersion: 1, content: 'x' });
    const original = IDBObjectStore.prototype.delete;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (this.name === 'diagrams') throw new DOMException('disk error', 'UnknownError');
      return original.call(this, key);
    });
    await expect(
      store.purgeMany([
        { kind: 'document', id: a.id },
        { kind: 'diagram', id: b.id },
      ]),
    ).rejects.toThrow(/disk error/);
    spy.mockRestore();
    expect(await store.get('document', a.id)).toMatchObject({ content: 1 });
    expect(await store.get('diagram', b.id)).toMatchObject({ content: 2 });
    expect(await store.listAll()).toHaveLength(2);
    expect(await store.listVersions('document', a.id)).toHaveLength(1);
    expect(await store.listDrafts({ kind: 'document', itemId: a.id })).toHaveLength(1);
  });

  it('refuses an unknown kind before removing anything; an empty list does nothing', async () => {
    const a = await store.create('document', { title: 'A', content: 1 });
    await expect(store.purgeMany([{ kind: 'document', id: a.id }, { kind: 'spreadsheet' as never, id: 'x' }])).rejects.toThrow(/Unknown item kind/);
    expect(await store.get('document', a.id)).toBeTruthy();
    await store.purgeMany([]);
    expect(await store.listAll()).toHaveLength(1);
  });
});
