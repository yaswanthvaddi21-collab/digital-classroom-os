/**
 * Phase 7 (ADR 0014): the kind registry and database version 3.
 *
 * - Every per-kind operation runs for every kind in ITEM_KINDS (documents, diagrams and presentations), so a kind can
 *   never be left out of history, purge, backups or attachment clean-up.
 * - A version-2 database (the Phase 6 layout, with documents, diagrams, versions, drafts, attachments and aliases)
 *   upgrades to version 3 after a verified safety copy, with every existing record unchanged.
 * - A build made for version 2 cannot open a version-3 database (VersionError) and so cannot delete anything; this
 *   build likewise fails closed on a database from a newer app.
 */
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA_URL_MIME } from './blobs';
import { ITEM_STORE_NAMES, IndexedDbAdapter, SCHEMA_VERSION, STORES, VERSION_STORE_NAMES, referenceStores } from './indexeddb';
import { MAX_CONTENT_SCHEMA_BY_KIND, validateBackup } from './backup';
import { ITEM_KINDS, type ItemKind } from './types';

let n = 0;
const open: IndexedDbAdapter[] = [];
const adapter = (db: string, options?: ConstructorParameters<typeof IndexedDbAdapter>[1]) => {
  const a = new IndexedDbAdapter(db, options);
  open.push(a);
  return a;
};
afterEach(async () => {
  for (const a of open.splice(0)) await a.close().catch(() => undefined);
});

/** Every store and record of a database, read without upgrading it, with each store's layout. */
async function rawContents(db: string) {
  const conn = await openDB(db);
  const out: { version: number; stores: Record<string, unknown[]>; layout: Record<string, unknown> } = { version: conn.version, stores: {}, layout: {} };
  for (const s of Array.from(conn.objectStoreNames)) {
    out.stores[s] = await conn.getAll(s);
    const st = conn.transaction(s).objectStore(s);
    out.layout[s] = { keyPath: st.keyPath, indexes: Array.from(st.indexNames).map((i) => ({ name: i, keyPath: st.index(i).keyPath, unique: st.index(i).unique })) };
  }
  conn.close();
  return out;
}
const databaseNames = async () => (await indexedDB.databases()).map((d) => d.name);

const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, seed + 1, seed + 2]).buffer;
/** A data URL longer than the 16 KB limit, so a version holding it is compacted into an attachment. */
const bigDataUrl = (seed: number) => `data:image/png;base64,${String.fromCharCode(65 + (seed % 26)).repeat(20_000)}`;

/** Content shaped like each kind's real content: every kind keeps attachment ids as their own string values. */
function contentFor(kind: ItemKind, ref: string, extra: Record<string, unknown> = {}) {
  if (kind === 'document') return { schemaVersion: 3, doc: { type: 'doc', content: [{ type: 'diagram', attrs: { previewId: ref } }] }, ...extra };
  if (kind === 'diagram') return { schemaVersion: 3, nodes: [{ id: 'n', data: { image: ref } }], edges: [], ...extra };
  return { schemaVersion: 1, slides: [{ id: 's', elements: [{ id: 'e', type: 'image', attachmentId: ref }] }], ...extra };
}

describe('the kind registry', () => {
  it('has an item store and a version store for every kind, and every list of stores comes from it', () => {
    expect(ITEM_KINDS).toEqual(['document', 'diagram', 'presentation']);
    expect(ITEM_STORE_NAMES).toEqual(ITEM_KINDS.map((k) => STORES[k].items));
    expect(VERSION_STORE_NAMES).toEqual(ITEM_KINDS.map((k) => STORES[k].versions));
    expect(STORES.presentation).toEqual({ items: 'presentations', versions: 'presentation_versions' });
    expect(new Set([...ITEM_STORE_NAMES, ...VERSION_STORE_NAMES]).size).toBe(ITEM_KINDS.length * 2);
  });

  it('presentations start at content schema 1 in backups', () => {
    expect(MAX_CONTENT_SCHEMA_BY_KIND.presentation).toBe(1);
  });

  it('attachment clean-up searches every item, version and draft store of the database', async () => {
    const db = `registry-${++n}`;
    const a = adapter(db);
    await a.listAll();
    const conn = await openDB(db);
    const scanned = referenceStores(conn.objectStoreNames);
    conn.close();
    for (const kind of ITEM_KINDS) {
      expect(scanned).toContain(STORES[kind].items);
      expect(scanned).toContain(STORES[kind].versions);
    }
    expect(scanned).toContain('drafts');
    expect(scanned).not.toContain('attachments');
  });
});

describe.each(ITEM_KINDS)('every operation works for %s', (kind) => {
  const fresh = () => adapter(`${kind}-${++n}`);

  it('creates, lists, reads, saves (refusing stale writes), trashes, restores and duplicates', async () => {
    const s = fresh();
    const item = await s.create(kind, { title: 'One', content: contentFor(kind, 'x') });
    expect((await s.list(kind)).map((i) => i.id)).toEqual([item.id]);
    for (const other of ITEM_KINDS.filter((k) => k !== kind)) expect(await s.list(other)).toEqual([]);
    expect(await s.get(kind, item.id)).toEqual(item);
    const saved = await s.save(kind, item.id, { content: contentFor(kind, 'y') }, 1);
    expect(saved.version).toBe(2);
    await expect(s.save(kind, item.id, { content: contentFor(kind, 'z') }, 1)).rejects.toThrow();
    await s.trash(kind, item.id);
    expect(await s.list(kind, { trashed: true })).toHaveLength(1);
    await s.restore(kind, item.id);
    const copy = await s.duplicate(kind, item.id);
    expect(copy).toMatchObject({ kind, title: 'One (copy)', content: contentFor(kind, 'y') });
    expect((await s.listAll()).map((i) => i.kind)).toEqual([kind, kind]);
  });

  it('keeps versions, restores one reversibly, and purges the item with its versions and drafts', async () => {
    const s = fresh();
    const item = await s.create(kind, { title: 'History', content: contentFor(kind, 'a') });
    await s.save(kind, item.id, { content: contentFor(kind, 'b') }, 1);
    expect(await s.snapshot(kind, item.id)).toBe(true);
    const versions = await s.listVersions(kind, item.id);
    const created = versions.find((v) => v.reason === 'create')!;
    const restored = await s.restoreVersion(kind, item.id, created.id);
    expect(restored.content).toEqual(contentFor(kind, 'a'));
    expect((await s.listVersions(kind, item.id)).some((v) => v.reason === 'restore')).toBe(true);
    await s.saveDraft({ kind, itemId: item.id, session: 's1', baseVersion: 1, content: contentFor(kind, 'draft') });
    expect(await s.getDraft(kind, item.id)).toMatchObject({ kind, itemId: item.id });
    await s.purgeMany([{ kind, id: item.id }]);
    expect(await s.get(kind, item.id)).toBeUndefined();
    expect(await s.listVersions(kind, item.id)).toEqual([]);
    expect(await s.getDraft(kind, item.id)).toBeUndefined();
  });

  it('moves a large image out of version history and puts it back exactly', async () => {
    const s = fresh();
    const url = bigDataUrl(ITEM_KINDS.indexOf(kind));
    const item = await s.create(kind, { title: 'Big', content: contentFor(kind, url) });
    const conn = await openDB(`${kind}-${n}`);
    const [stored] = await conn.getAll(STORES[kind].versions);
    const blobs = (await conn.getAll('attachments')).filter((a) => a.mimeType === DATA_URL_MIME);
    conn.close();
    expect(stored.blobRefs).toHaveLength(1);
    expect(blobs).toHaveLength(1);
    const [version] = await s.listVersions(kind, item.id);
    expect((await s.restoreVersion(kind, item.id, version.id)).content).toEqual(contentFor(kind, url));
  });

  it('round-trips through a backup with its versions and attachments', async () => {
    const s = fresh();
    const att = await s.putAttachment(png(1), 'image/png');
    const item = await s.create(kind, { title: 'Backed up', content: contentFor(kind, att.id) });
    await s.snapshot(kind, item.id);
    const backup = JSON.parse(JSON.stringify(await s.exportBackup()));
    expect(backup.items.map((i: { kind: string }) => i.kind)).toEqual([kind]);
    expect(backup.attachments.map((a: { id: string }) => a.id)).toEqual([att.id]);
    expect(() => validateBackup(backup)).not.toThrow();

    const other = adapter(`${kind}-restore-${++n}`);
    expect(await other.importBackup(backup)).toMatchObject({ added: 1, unsupported: 0, attachmentsAdded: 1 });
    expect(await other.get(kind, item.id)).toEqual(await s.get(kind, item.id));
    expect(await other.listVersions(kind, item.id)).toEqual(await s.listVersions(kind, item.id));
    expect(new Uint8Array((await other.getAttachment(att.id))!.data)).toEqual(new Uint8Array(png(1)));
  });

  for (const where of ['item', 'trashed item', 'version', 'draft'] as const) {
    it(`attachment clean-up keeps an image referenced only by a ${kind} ${where}`, async () => {
      const s = fresh();
      const kept = await s.putAttachment(png(10), 'image/png');
      const unused = await s.putAttachment(png(20), 'image/png');
      const item = await s.create(kind, { title: 'Refs', content: contentFor(kind, where === 'item' || where === 'trashed item' ? kept.id : 'none') });
      if (where === 'trashed item') await s.trash(kind, item.id);
      if (where === 'version') {
        await s.save(kind, item.id, { content: contentFor(kind, kept.id) }, 1);
        await s.snapshot(kind, item.id);
        await s.save(kind, item.id, { content: contentFor(kind, 'gone') }, 2);
      }
      if (where === 'draft') await s.saveDraft({ kind, itemId: item.id, session: 's', baseVersion: 1, content: contentFor(kind, kept.id) });
      const report = await s.cleanUpAttachments({ graceMs: 0 });
      expect(report.removed).toBe(1);
      expect(await s.getAttachment(kept.id)).toBeDefined();
      expect(await s.getAttachment(unused.id)).toBeUndefined();
    });
  }
});

describe('IndexedDB v2 → v3 upgrade (Phase 7, ADR 0014)', () => {
  const at = '2026-11-01T10:00:00.000Z';
  const old = '2026-01-01T00:00:00.000Z';
  const item = (id: string, kind: 'document' | 'diagram', content: unknown, extra: Record<string, unknown> = {}) => ({
    id, kind, title: `T ${id}`, content, version: 2, createdAt: old, updatedAt: at, deletedAt: null, ownerDeviceId: 'phase6-device', favorite: false, templateId: null, lastSnapshotAt: at, ...extra,
  });
  const summary = (i: ReturnType<typeof item>) => {
    const { content, ...rest } = i;
    return { ...rest, sizeBytes: JSON.stringify(content).length };
  };

  /** A version-2 database built with exactly the Phase 6 (650cf63) layout, holding realistic Phase 6 data. */
  async function seedV2(db: string) {
    const conn = await openDB(db, 2, {
      upgrade(d) {
        d.createObjectStore('documents', { keyPath: 'id' });
        d.createObjectStore('diagrams', { keyPath: 'id' });
        d.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
        d.createObjectStore('meta', { keyPath: 'key' });
        d.createObjectStore('item_index', { keyPath: 'id' }).createIndex('by_kind', 'kind');
        d.createObjectStore('drafts', { keyPath: 'key' });
        d.createObjectStore('attachments', { keyPath: 'id' }).createIndex('by_sha256', 'sha256', { unique: true });
      },
    });
    const doc = item('doc-1', 'document', { schemaVersion: 3, doc: { type: 'doc', content: [{ type: 'diagram', attrs: { previewId: 'att-preview', svgPreviewId: 'att-alias' } }] } });
    const trashed = item('doc-2', 'document', { schemaVersion: 1, doc: { type: 'doc', content: [] } }, { deletedAt: at, favorite: true });
    const dia = item('dia-1', 'diagram', { schemaVersion: 3, nodes: [], edges: [] });
    for (const i of [doc, trashed]) await conn.put('documents', i);
    await conn.put('diagrams', dia);
    for (const i of [doc, trashed, dia]) await conn.put('item_index', summary(i));
    await conn.put('document_versions', { id: 'dv-1', itemId: 'doc-1', kind: 'document', version: 1, title: 'T doc-1', content: { schemaVersion: 3, img: 'dcos-blob:att-blob' }, createdAt: old, reason: 'create', blobRefs: ['att-blob'] });
    await conn.put('diagram_versions', { id: 'gv-1', itemId: 'dia-1', kind: 'diagram', version: 1, title: 'T dia-1', content: { schemaVersion: 3, nodes: [], edges: [] }, createdAt: old, reason: 'manual' });
    await conn.put('drafts', { key: 'document:doc-1:session-a', kind: 'document', itemId: 'doc-1', session: 'session-a', baseVersion: 2, content: { schemaVersion: 3, previewId: 'att-draft' }, savedAt: at });
    await conn.put('attachments', { id: 'att-preview', sha256: 'a'.repeat(64), mimeType: 'image/png', sizeBytes: 7, data: png(1), createdAt: old });
    await conn.put('attachments', { id: 'att-alias', aliasOf: 'att-preview', createdAt: old });
    await conn.put('attachments', { id: 'att-draft', sha256: 'b'.repeat(64), mimeType: 'image/png', sizeBytes: 7, data: png(2), createdAt: old });
    const blob = new TextEncoder().encode(bigDataUrl(3)).buffer;
    await conn.put('attachments', { id: 'att-blob', sha256: 'c'.repeat(64), mimeType: DATA_URL_MIME, sizeBytes: blob.byteLength, data: blob, createdAt: old });
    await conn.put('meta', { key: 'deviceId', value: 'phase6-device' });
    await conn.put('meta', { key: 'lastAttachmentCleanUpAt', value: old });
    conn.close();
  }

  it('keeps every Phase 6 record and store layout unchanged, adds the presentation stores, and leaves a verified safety copy', async () => {
    const db = `v2-upgrade-${++n}`;
    await seedV2(db);
    const before = await rawContents(db);
    expect(before.version).toBe(2);

    const upgraded = adapter(db);
    expect(await upgraded.listAll()).toHaveLength(2);
    expect(upgraded.upgradeStatus()).toEqual({ state: 'ready' });
    expect(await upgraded.getMeta('migratedFrom')).toMatch(/^2@/);
    const info = await upgraded.info();
    expect(info.schemaVersion).toBe(3);
    expect(info.safetyCopies).toEqual([`${db}-backup-v2`]);
    await upgraded.close();

    const after = await rawContents(db);
    expect(after.version).toBe(SCHEMA_VERSION);
    for (const [store, records] of Object.entries(before.stores)) {
      if (store === 'meta') continue;
      expect(after.stores[store]).toEqual(records);
      expect(after.layout[store]).toEqual(before.layout[store]);
    }
    expect(after.stores.meta).toEqual(expect.arrayContaining(before.stores.meta));
    expect(after.layout.meta).toEqual(before.layout.meta);
    // Only the two presentation stores are new, both empty, shaped like the document stores.
    expect(Object.keys(after.stores).filter((s) => !(s in before.stores)).sort()).toEqual(['presentation_versions', 'presentations']);
    expect(after.stores.presentations).toEqual([]);
    expect(after.stores.presentation_versions).toEqual([]);
    expect(after.layout.presentations).toEqual(after.layout.documents);
    expect(after.layout.presentation_versions).toEqual(after.layout.document_versions);

    // The safety copy holds every v2 record, and exports as a complete backup (images put back from its own blobs).
    const copy = await rawContents(`${db}-backup-v2`);
    for (const [store, records] of Object.entries(before.stores)) expect(copy.stores[store]).toEqual(records);
    expect(copy.stores.__copy).toEqual([expect.objectContaining({ fromVersion: 2, source: db })]);
    const again = adapter(db);
    const fromCopy = await again.exportSafetyCopy(`${db}-backup-v2`);
    expect(fromCopy.items.map((i) => i.id).sort()).toEqual(['dia-1', 'doc-1', 'doc-2']);
    expect(fromCopy.versions.find((v) => v.id === 'dv-1')!.content).toEqual({ schemaVersion: 3, img: bigDataUrl(3) });
  });

  it('the first clean-up after the upgrade removes nothing that Phase 6 data still uses', async () => {
    const db = `v2-cleanup-${++n}`;
    await seedV2(db);
    const before = await rawContents(db);
    const upgraded = adapter(db);
    expect(await upgraded.cleanUpAttachments({ graceMs: 0 })).toEqual({ removed: 0, freedBytes: 0 });
    await upgraded.close();
    expect((await rawContents(db)).stores.attachments).toEqual(before.stores.attachments);
  });

  it('an older build (opening at version 2) gets VersionError and can neither read nor delete anything', async () => {
    const db = `v3-old-build-${++n}`;
    const current = adapter(db);
    const att = await current.putAttachment(png(5), 'image/png');
    const pres = await current.create('presentation', { title: 'Slides', content: contentFor('presentation', att.id) });
    await current.create('document', { title: 'Doc', content: contentFor('document', 'none') });
    await current.close();
    const before = await rawContents(db);
    expect(before.version).toBe(3);

    // What every build up to Phase 6 does on start-up: open the database at its own version, 2.
    const refused = await openDB(db, 2).then(
      (conn) => (conn.close(), null),
      (err: unknown) => err,
    );
    expect((refused as DOMException | null)?.name).toBe('VersionError');

    expect(await rawContents(db)).toEqual(before);
    expect(await databaseNames()).toContain(db);
    const reopened = adapter(db);
    expect(await reopened.get('presentation', pres.id)).toEqual(pres);
    expect(await reopened.getAttachment(att.id)).toBeDefined();
  });

  it('this build fails closed the same way on a database made by a newer app: nothing is read, changed or removed', async () => {
    const db = `v4-newer-${++n}`;
    const newer = await openDB(db, SCHEMA_VERSION + 1, {
      upgrade(d) {
        d.createObjectStore('documents', { keyPath: 'id' }).put({ id: 'from-the-future', kind: 'document' });
        d.createObjectStore('attachments', { keyPath: 'id' });
      },
    });
    newer.close();
    const before = await rawContents(db);
    const a = adapter(db);
    await expect(a.listAll()).rejects.toMatchObject({ name: 'VersionError' });
    await expect(a.cleanUpAttachments({ graceMs: 0 })).rejects.toMatchObject({ name: 'VersionError' });
    expect(a.upgradeStatus()).toMatchObject({ state: 'failed', newerData: true });
    expect(await rawContents(db)).toEqual(before);
    expect((await databaseNames()).filter((d) => d?.startsWith(db))).toEqual([db]);
  });
});
