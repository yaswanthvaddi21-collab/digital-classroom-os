import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { BACKUP_FORMAT_VERSION, contentSchemaOf, validateBackup } from './backup';
import { toBase64 } from './base64';
import { ConflictError, NotFoundError } from './errors';
import { nowIso, uuid } from './ids';
import type {
  Attachment,
  BackupFile,
  CreateItemInput,
  Draft,
  ImportReport,
  ItemKind,
  ItemSummary,
  ItemVersion,
  ItemVersionSummary,
  SavePatch,
  StorageAdapter,
  StorageInfo,
  VersionReason,
  WorkspaceItem,
} from './types';

/** IndexedDB schema version. v1 = items/versions/meta (frozen). v2 adds item_index, drafts, attachments. */
export const SCHEMA_VERSION = 2;
/** Minimum time between automatic version snapshots of one item. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
/**
 * Versions kept per item. When over the limit, autosave snapshots go first (oldest first), then older manual
 * saves, then older 'before restore' copies. The creation version, the newest manual save and the newest
 * restore point are never pruned.
 */
export const MAX_VERSIONS_PER_ITEM = 50;


interface DcosDB extends DBSchema {
  // ── v1 (frozen: never rename, reshape or remove) ──
  documents: { key: string; value: WorkspaceItem };
  diagrams: { key: string; value: WorkspaceItem };
  document_versions: { key: string; value: ItemVersion; indexes: { by_item: string } };
  diagram_versions: { key: string; value: ItemVersion; indexes: { by_item: string } };
  meta: { key: string; value: { key: string; value: string } };
  // ── v2 ──
  item_index: { key: string; value: ItemSummary; indexes: { by_kind: string } };
  drafts: { key: string; value: Draft };
  attachments: { key: string; value: StoredAttachment; indexes: { by_sha256: string } };
}

/**
 * A second id for bytes already stored under another id. It has no sha256, so the unique by_sha256 index
 * keeps exactly one entry per content. Created when a backup refers to bytes this device holds under its own id.
 */
interface AttachmentAlias {
  id: string;
  aliasOf: string;
  createdAt: string;
}
type StoredAttachment = Attachment | AttachmentAlias;
const isAlias = (a: StoredAttachment): a is AttachmentAlias => 'aliasOf' in a;

type ItemStore = 'documents' | 'diagrams';
type VersionStore = 'document_versions' | 'diagram_versions';
type WriteTx = IDBPTransaction<DcosDB, StoreNames<DcosDB>[], 'readwrite'>;
type UpgradeTx = IDBPTransaction<DcosDB, StoreNames<DcosDB>[], 'versionchange'>;

/** Exhaustive: adding an ItemKind without stores is a compile error. */
const STORES: Record<ItemKind, { items: ItemStore; versions: VersionStore }> = {
  document: { items: 'documents', versions: 'document_versions' },
  diagram: { items: 'diagrams', versions: 'diagram_versions' },
};
const V1_STORES = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'meta'] as const;

/**
 * Ordered schema migrations. Index i upgrades a database from version i to i + 1.
 * Never edit a shipped migration; append a new one and bump SCHEMA_VERSION.
 * Inside a migration only IndexedDB requests may be awaited (anything else lets the transaction commit early).
 */
const MIGRATIONS: Array<(db: IDBPDatabase<DcosDB>, tx: UpgradeTx) => Promise<void> | void> = [
  (db) => {
    db.createObjectStore('documents', { keyPath: 'id' });
    db.createObjectStore('diagrams', { keyPath: 'id' });
    db.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
    db.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  async (db, tx) => {
    db.createObjectStore('item_index', { keyPath: 'id' }).createIndex('by_kind', 'kind');
    db.createObjectStore('drafts', { keyPath: 'key' });
    db.createObjectStore('attachments', { keyPath: 'id' }).createIndex('by_sha256', 'sha256', { unique: true });
    // Backfill the list index from the existing records. Existing records are only read.
    const index = tx.objectStore('item_index');
    for (const store of ['documents', 'diagrams'] as const) {
      let cursor = await tx.objectStore(store).openCursor();
      while (cursor) {
        await index.put(summarize(cursor.value));
        cursor = await cursor.continue();
      }
    }
  },
];

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Aliases are written out as full attachments under their own id, so every id in the backup carries its bytes. */
function exportAttachments(stored: StoredAttachment[]) {
  const byId = new Map(stored.map((a) => [a.id, a]));
  return stored.flatMap((a) => {
    const target = isAlias(a) ? byId.get(a.aliasOf) : a;
    if (!target || isAlias(target)) return [];
    const { data, ...rest } = target;
    return [{ ...rest, id: a.id, createdAt: a.createdAt, base64: toBase64(data) }];
  });
}

function summarize(item: WorkspaceItem): ItemSummary {
  const { content, ...rest } = item;
  return { ...rest, sizeBytes: JSON.stringify(content ?? null).length };
}

function stripContent(v: ItemVersion): ItemVersionSummary {
  const { content: _content, ...rest } = v;
  return rest;
}

const byNewest = (a: ItemSummary, b: ItemSummary) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
const draftKey = (kind: ItemKind, id: string) => `${kind}:${id}`;

/** Reads the version of an existing database without creating it. Returns 0 when it does not exist. */
async function existingVersion(name: string): Promise<number> {
  if (typeof indexedDB.databases === 'function') {
    const found = (await indexedDB.databases()).find((d) => d.name === name);
    return found?.version ?? 0;
  }
  return new Promise((resolve, reject) => {
    let created = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      created = true;
      req.transaction?.abort(); // it did not exist; do not create it
    };
    req.onsuccess = () => {
      const v = req.result.version;
      req.result.close();
      resolve(v);
    };
    req.onerror = () => (created ? resolve(0) : reject(req.error));
  });
}

/** Copies every store of `from` (at its current version) into a new database `to`, before an upgrade. */
async function copyDatabase(from: string, to: string, fromVersion: number) {
  const src = await openDB(from, fromVersion);
  const data: Record<string, unknown[]> = {};
  for (const name of Array.from(src.objectStoreNames)) data[name] = await src.getAll(name);
  const layout = Array.from(src.objectStoreNames).map((name) => {
    const s = src.transaction(name).objectStore(name);
    return { name, keyPath: s.keyPath as string, indexes: Array.from(s.indexNames).map((i) => ({ name: i, keyPath: s.index(i).keyPath as string })) };
  });
  src.close();
  await deleteDatabase(to);
  const dst = await openDB(to, 1, {
    upgrade(db) {
      for (const l of layout) {
        const store = db.createObjectStore(l.name, { keyPath: l.keyPath });
        for (const ix of l.indexes) store.createIndex(ix.name, ix.keyPath);
      }
      db.createObjectStore('__copy', { keyPath: 'key' });
    },
  });
  const tx = dst.transaction([...layout.map((l) => l.name), '__copy'], 'readwrite');
  for (const l of layout) for (const rec of data[l.name]) await tx.objectStore(l.name).put(rec);
  await tx.objectStore('__copy').put({ key: 'info', copiedAt: nowIso(), fromVersion, source: from });
  await tx.done;
  // Verify before the original is upgraded.
  for (const l of layout) {
    if ((await dst.count(l.name)) !== data[l.name].length) throw new Error(`Safety copy of ${l.name} is incomplete; upgrade stopped`);
  }
  dst.close();
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

export interface IndexedDbAdapterOptions {
  /** Another tab is upgrading the database. The connection closes once the returned promise settles. */
  onVersionChange?: () => void | Promise<void>;
  /** This tab wants to upgrade but another tab still has the old version open. */
  onBlocked?: () => void;
}

export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBPDatabase<DcosDB>>;
  private deviceIdPromise: Promise<string> | null = null;
  /** Set once another tab's upgrade made us close the connection; every later call fails clearly. */
  private closedForUpgrade = false;
  private readonly safetyPrefix: string;

  constructor(
    private readonly dbName = 'digital-classroom-os',
    private readonly options: IndexedDbAdapterOptions = {},
  ) {
    this.safetyPrefix = `${dbName}-backup-v`;
    this.dbPromise = this.open();
  }

  private async open() {
    const current = await existingVersion(this.dbName);
    if (current > 0 && current < SCHEMA_VERSION) {
      await copyDatabase(this.dbName, `${this.safetyPrefix}${current}`, current);
    }
    const options = this.options;
    const markClosed = () => {
      this.closedForUpgrade = true;
    };
    const db = await openDB<DcosDB>(this.dbName, SCHEMA_VERSION, {
      async upgrade(database, oldVersion, _newVersion, tx) {
        for (let v = oldVersion; v < SCHEMA_VERSION; v++) await MIGRATIONS[v](database, tx);
      },
      blocked() {
        options.onBlocked?.();
      },
      blocking() {
        // Let the app save pending edits first; the upgrading tab waits until we close.
        Promise.resolve(options.onVersionChange?.())
          .catch(() => undefined)
          .finally(() => {
            markClosed();
            db.close();
          });
      },
    });
    if (current > 0 && current < SCHEMA_VERSION) {
      await db.put('meta', { key: 'migratedFrom', value: `${current}@${nowIso()}` });
    }
    return db;
  }

  private db() {
    if (this.closedForUpgrade) return Promise.reject(new Error('The app was updated in another tab. Reload to keep working.'));
    return this.dbPromise;
  }

  private deviceId(): Promise<string> {
    if (!this.deviceIdPromise) {
      this.deviceIdPromise = (async () => {
        const db = await this.db();
        const tx = db.transaction('meta', 'readwrite');
        const existing = await tx.store.get('deviceId');
        if (existing) {
          await tx.done;
          return existing.value;
        }
        const id = uuid();
        await tx.store.put({ key: 'deviceId', value: id });
        await tx.done;
        return id;
      })();
    }
    return this.deviceIdPromise;
  }

  async info(): Promise<StorageInfo> {
    const names = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name ?? '') : [];
    return {
      deviceId: await this.deviceId(),
      schemaVersion: SCHEMA_VERSION,
      backend: 'IndexedDB',
      safetyCopies: names.filter((n) => n.startsWith(this.safetyPrefix)),
    };
  }

  async list(kind: ItemKind, opts: { trashed?: boolean } = {}): Promise<ItemSummary[]> {
    const db = await this.db();
    const all = await db.getAllFromIndex('item_index', 'by_kind', kind);
    return all.filter((i) => (opts.trashed ? i.deletedAt !== null : i.deletedAt === null)).sort(byNewest);
  }

  async listAll(opts: { trashed?: boolean } = {}): Promise<ItemSummary[]> {
    const db = await this.db();
    const all = await db.getAll('item_index');
    return all.filter((i) => (opts.trashed ? i.deletedAt !== null : i.deletedAt === null)).sort(byNewest);
  }

  async get<C>(kind: ItemKind, id: string): Promise<WorkspaceItem<C> | undefined> {
    const db = await this.db();
    return (await db.get(STORES[kind].items, id)) as WorkspaceItem<C> | undefined;
  }

  async create<C>(kind: ItemKind, input: CreateItemInput<C>): Promise<WorkspaceItem<C>> {
    const db = await this.db();
    const deviceId = await this.deviceId();
    const now = nowIso();
    const item: WorkspaceItem<C> = {
      id: uuid(),
      kind,
      title: input.title.trim() || 'Untitled',
      content: input.content,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ownerDeviceId: deviceId,
      favorite: false,
      templateId: input.templateId ?? null,
      lastSnapshotAt: now,
    };
    const tx = db.transaction([STORES[kind].items, STORES[kind].versions, 'item_index'], 'readwrite');
    await tx.objectStore(STORES[kind].items).add(item as WorkspaceItem);
    await tx.objectStore(STORES[kind].versions).add(this.versionOf(item as WorkspaceItem, 'create'));
    await tx.objectStore('item_index').put(summarize(item as WorkspaceItem));
    await tx.done;
    return item;
  }

  async save<C>(kind: ItemKind, id: string, patch: SavePatch<C>, expectedVersion: number): Promise<WorkspaceItem<C>> {
    const db = await this.db();
    const { items: itemStore, versions: versionStore } = STORES[kind];
    // Read-check-write in a single transaction: either the whole save lands or nothing does.
    const tx = db.transaction([itemStore, versionStore, 'item_index'], 'readwrite');
    const items = tx.objectStore(itemStore);
    const current = await items.get(id);
    if (!current) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(kind, id);
    }
    if (current.version !== expectedVersion) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new ConflictError(current, expectedVersion);
    }
    const contentChanged = patch.content !== undefined || patch.title !== undefined;
    const now = nowIso();
    const next: WorkspaceItem = {
      ...current,
      title: patch.title !== undefined ? patch.title.trim() || 'Untitled' : current.title,
      content: patch.content !== undefined ? patch.content : current.content,
      favorite: patch.favorite ?? current.favorite,
      // Metadata-only patches (favorite) neither count as an edit nor invalidate open editors.
      version: contentChanged ? current.version + 1 : current.version,
      updatedAt: contentChanged ? now : current.updatedAt,
    };
    const due = !current.lastSnapshotAt || Date.now() - Date.parse(current.lastSnapshotAt) >= AUTO_SNAPSHOT_INTERVAL_MS;
    if (contentChanged && due) {
      next.lastSnapshotAt = now;
      await tx.objectStore(versionStore).add(this.versionOf(next, 'auto'));
      await this.prune(tx, kind, id);
    }
    await items.put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    return next as WorkspaceItem<C>;
  }

  async snapshot(kind: ItemKind, id: string): Promise<boolean> {
    const db = await this.db();
    const { items: itemStore, versions: versionStore } = STORES[kind];
    const tx = db.transaction([itemStore, versionStore, 'item_index'], 'readwrite');
    const current = await tx.objectStore(itemStore).get(id);
    if (!current) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(kind, id);
    }
    const versions = await tx.objectStore(versionStore).index('by_item').getAll(id);
    // Newest first; versions written in the same millisecond are ordered by item version.
    const newest = versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version)[0];
    if (newest && newest.title === current.title && JSON.stringify(newest.content) === JSON.stringify(current.content)) {
      await tx.done;
      return false;
    }
    const next = { ...current, lastSnapshotAt: nowIso() };
    await tx.objectStore(versionStore).add(this.versionOf(next, 'manual'));
    await this.prune(tx, kind, id);
    await tx.objectStore(itemStore).put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    return true;
  }

  async setFavorite(kind: ItemKind, id: string, favorite: boolean): Promise<void> {
    await this.updateMetadata(kind, id, { favorite });
  }

  async duplicate(kind: ItemKind, id: string): Promise<WorkspaceItem> {
    const source = await this.get(kind, id);
    if (!source) throw new NotFoundError(kind, id);
    return this.create(kind, { title: `${source.title} (copy)`, content: structuredClone(source.content), templateId: source.templateId });
  }

  async trash(kind: ItemKind, id: string): Promise<void> {
    await this.updateMetadata(kind, id, { deletedAt: nowIso() });
  }

  async restore(kind: ItemKind, id: string): Promise<void> {
    await this.updateMetadata(kind, id, { deletedAt: null });
  }

  /** Favorite and trash state live beside the content: changing them does not bump version or updatedAt. */
  private async updateMetadata(kind: ItemKind, id: string, patch: Partial<Pick<WorkspaceItem, 'favorite' | 'deletedAt'>>) {
    const db = await this.db();
    const tx = db.transaction([STORES[kind].items, 'item_index'], 'readwrite');
    const current = await tx.objectStore(STORES[kind].items).get(id);
    if (!current) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(kind, id);
    }
    const next = { ...current, ...patch };
    await tx.objectStore(STORES[kind].items).put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
  }

  async purge(kind: ItemKind, id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES[kind].items, STORES[kind].versions, 'item_index', 'drafts'], 'readwrite');
    await tx.objectStore(STORES[kind].items).delete(id);
    await tx.objectStore('item_index').delete(id);
    await tx.objectStore('drafts').delete(draftKey(kind, id));
    const versions = tx.objectStore(STORES[kind].versions);
    for (const key of await versions.index('by_item').getAllKeys(id)) await versions.delete(key);
    await tx.done;
  }

  async listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]> {
    const db = await this.db();
    const versions = await db.getAllFromIndex(STORES[kind].versions, 'by_item', id);
    return versions.map(stripContent).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  }

  async restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem> {
    const db = await this.db();
    const { items: itemStore, versions: versionStore } = STORES[kind];
    const tx = db.transaction([itemStore, versionStore, 'item_index'], 'readwrite');
    const items = tx.objectStore(itemStore);
    const current = await items.get(id);
    const snapshot = await tx.objectStore(versionStore).get(versionId);
    if (!current || !snapshot || snapshot.itemId !== id) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(kind, id);
    }
    const now = nowIso();
    // Keep the pre-restore state as a version too, so restoring is itself reversible.
    await tx.objectStore(versionStore).add(this.versionOf(current, 'restore'));
    const next: WorkspaceItem = {
      ...current,
      title: snapshot.title,
      content: structuredClone(snapshot.content),
      version: current.version + 1,
      updatedAt: now,
      lastSnapshotAt: now,
    };
    await this.prune(tx, kind, id);
    await items.put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    return next;
  }

  async exportBackup(): Promise<BackupFile> {
    const db = await this.db();
    const tx = db.transaction(['documents', 'diagrams', 'document_versions', 'diagram_versions'], 'readonly');
    const [documents, diagrams, documentVersions, diagramVersions] = await Promise.all([
      tx.objectStore('documents').getAll(),
      tx.objectStore('diagrams').getAll(),
      tx.objectStore('document_versions').getAll(),
      tx.objectStore('diagram_versions').getAll(),
    ]);
    await tx.done;
    const items = [...documents, ...diagrams];
    const versions = [...documentVersions, ...diagramVersions];
    return {
      format: 'dcos-backup',
      formatVersion: BACKUP_FORMAT_VERSION,
      // Older apps accept the file only while every piece of content is still schema 1 (see backup.ts).
      schemaVersion: Math.max(1, ...items.map((i) => contentSchemaOf(i.content)), ...versions.map((v) => contentSchemaOf(v.content))),
      exportedAt: nowIso(),
      deviceId: await this.deviceId(),
      items,
      versions,
      attachments: exportAttachments(await db.getAll('attachments')),
    };
  }

  async importBackup(raw: unknown): Promise<ImportReport> {
    const { items, versions, unsupported, attachments } = validateBackup(raw);
    // Hash the bytes ourselves (before the transaction: only IndexedDB requests may be awaited inside it).
    // A missing or wrong sha256 in the file must not collide with, or impersonate, other stored bytes.
    for (const a of attachments) a.sha256 = await sha256Hex(a.data);
    const db = await this.db();
    const report: ImportReport = { added: 0, skipped: 0, copied: 0, versionsAdded: 0, unsupported, attachmentsAdded: 0 };
    const idMap = new Map<string, string>();
    const tx = db.transaction(['documents', 'diagrams', 'document_versions', 'diagram_versions', 'item_index', 'attachments'], 'readwrite');
    const index = tx.objectStore('item_index');
    // Attachments first: content refers to them by id, which is kept so references stay valid.
    // Bytes already stored under another id get an alias, so the import never fails on the unique hash index.
    for (const a of attachments) {
      const store = tx.objectStore('attachments');
      if (await store.get(a.id)) continue;
      const sameBytes = await store.index('by_sha256').get(a.sha256);
      await store.add(sameBytes ? { id: a.id, aliasOf: sameBytes.id, createdAt: a.createdAt } : a);
      report.attachmentsAdded++;
    }
    const restoredKeys = new Set(
      (await index.getAll()).filter((s) => s.restoredFrom).map((s) => `${s.restoredFrom!.itemId}@${s.restoredFrom!.version}@${s.restoredFrom!.updatedAt}`),
    );

    for (const item of items) {
      const store = tx.objectStore(STORES[item.kind].items);
      const existing = await store.get(item.id);
      if (!existing) {
        await store.add(item);
        await index.put(summarize(item));
        idMap.set(item.id, item.id);
        report.added++;
      } else if (existing.version === item.version && existing.updatedAt === item.updatedAt) {
        report.skipped++;
      } else if (restoredKeys.has(`${item.id}@${item.version}@${item.updatedAt}`)) {
        // This exact copy was already restored from a backup earlier.
        report.skipped++;
      } else {
        // Divergent copy: never overwrite local work. Import alongside it under a new id.
        const copy: WorkspaceItem = {
          ...item,
          id: uuid(),
          title: `${item.title} (restored)`,
          restoredFrom: { itemId: item.id, version: item.version, updatedAt: item.updatedAt },
        };
        await store.add(copy);
        await index.put(summarize(copy));
        idMap.set(item.id, copy.id);
        report.copied++;
      }
    }
    for (const v of versions) {
      const targetId = idMap.get(v.itemId);
      if (!targetId) continue;
      const store = tx.objectStore(STORES[v.kind].versions);
      const id = targetId === v.itemId ? v.id : uuid();
      if (await store.get(id)) continue;
      await store.add({ ...v, id, itemId: targetId });
      report.versionsAdded++;
    }
    await tx.done;
    return report;
  }

  async putAttachment(input: Blob | ArrayBuffer, mimeType: string): Promise<Omit<Attachment, 'data'>> {
    const data = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const sha256 = await sha256Hex(data);
    const db = await this.db();
    const tx = db.transaction('attachments', 'readwrite');
    const existing = (await tx.store.index('by_sha256').get(sha256)) as Attachment | undefined;
    if (existing) {
      await tx.done;
      const { data: _data, ...meta } = existing;
      return meta;
    }
    const record: Attachment = { id: uuid(), sha256, mimeType, sizeBytes: data.byteLength, data, createdAt: nowIso() };
    await tx.store.add(record);
    await tx.done;
    const { data: _bytes, ...meta } = record;
    return meta;
  }

  async getAttachment(id: string): Promise<Attachment | undefined> {
    const db = await this.db();
    const found = await db.get('attachments', id);
    if (!found || !isAlias(found)) return found;
    const target = await db.get('attachments', found.aliasOf);
    return target && !isAlias(target) ? { ...target, id } : undefined;
  }

  async getMeta(key: string): Promise<string | undefined> {
    return (await (await this.db()).get('meta', key))?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await (await this.db()).put('meta', { key, value });
  }

  async saveDraft<C>(draft: Omit<Draft<C>, 'key' | 'savedAt'>): Promise<void> {
    await (await this.db()).put('drafts', { ...draft, key: draftKey(draft.kind, draft.itemId), savedAt: nowIso() } as Draft);
  }

  async getDraft<C>(kind: ItemKind, itemId: string): Promise<Draft<C> | undefined> {
    return (await (await this.db()).get('drafts', draftKey(kind, itemId))) as Draft<C> | undefined;
  }

  async deleteDraft(kind: ItemKind, itemId: string): Promise<void> {
    await (await this.db()).delete('drafts', draftKey(kind, itemId));
  }

  async exportSafetyCopy(name: string): Promise<BackupFile> {
    if (!name.startsWith(this.safetyPrefix)) throw new Error(`${name} is not a safety copy`);
    const copy = await openDB(name);
    const read = (s: string) => (copy.objectStoreNames.contains(s) ? copy.getAll(s) : Promise.resolve([]));
    const [documents, diagrams, dv, gv, meta] = await Promise.all([read('documents'), read('diagrams'), read('document_versions'), read('diagram_versions'), read('meta')]);
    copy.close();
    const items = [...documents, ...diagrams] as WorkspaceItem[];
    const versions = [...dv, ...gv] as ItemVersion[];
    return {
      format: 'dcos-backup',
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: Math.max(1, ...items.map((i) => contentSchemaOf(i.content))),
      exportedAt: nowIso(),
      deviceId: (meta as Array<{ key: string; value: string }>).find((m) => m.key === 'deviceId')?.value ?? 'unknown-device',
      items,
      versions,
    };
  }

  async deleteSafetyCopy(name: string): Promise<void> {
    if (!name.startsWith(this.safetyPrefix)) throw new Error(`${name} is not a safety copy`);
    await deleteDatabase(name);
  }

  private versionOf(item: WorkspaceItem, reason: VersionReason): ItemVersion {
    return {
      id: uuid(),
      itemId: item.id,
      kind: item.kind,
      version: item.version,
      title: item.title,
      content: structuredClone(item.content),
      createdAt: nowIso(),
      reason,
    };
  }

  /** Brings an item's history down to MAX_VERSIONS_PER_ITEM. Call after adding a version in the same transaction. */
  private async prune(tx: WriteTx, kind: ItemKind, id: string) {
    const store = tx.objectStore(STORES[kind].versions);
    const versions = (await store.index('by_item').getAll(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let excess = versions.length - MAX_VERSIONS_PER_ITEM;
    if (excess <= 0) return;
    const newest = (reason: VersionReason) => versions.filter((v) => v.reason === reason).at(-1)?.id;
    const keep = new Set([newest('manual'), newest('restore')]);
    const candidates = [
      ...versions.filter((v) => v.reason === 'auto'),
      ...versions.filter((v) => v.reason === 'manual' && !keep.has(v.id)),
      ...versions.filter((v) => v.reason === 'restore' && !keep.has(v.id)),
    ];
    for (const v of candidates) {
      if (excess-- <= 0) break;
      await store.delete(v.id);
    }
  }

  /** Closes the connection. Mainly for tests. */
  async close() {
    (await this.dbPromise).close();
  }

  /** Database names, for tests and diagnostics. */
  static readonly V1_STORES = V1_STORES;
}
