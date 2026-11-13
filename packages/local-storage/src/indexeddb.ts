import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { ConflictError, InvalidBackupError, NotFoundError } from './errors';
import { nowIso, uuid } from './ids';
import type {
  BackupFile,
  CreateItemInput,
  ImportReport,
  ItemKind,
  ItemSummary,
  ItemVersion,
  ItemVersionSummary,
  SaveOptions,
  SavePatch,
  StorageAdapter,
  StorageInfo,
  WorkspaceItem,
} from './types';

export const SCHEMA_VERSION = 1;
/** Minimum time between automatic version snapshots of one item. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
/** Versions kept per item; oldest automatic snapshots are pruned first. */
export const MAX_VERSIONS_PER_ITEM = 50;

interface DcosDB extends DBSchema {
  documents: { key: string; value: WorkspaceItem };
  diagrams: { key: string; value: WorkspaceItem };
  document_versions: { key: string; value: ItemVersion; indexes: { by_item: string } };
  diagram_versions: { key: string; value: ItemVersion; indexes: { by_item: string } };
  meta: { key: string; value: { key: string; value: string } };
}

type ItemStore = 'documents' | 'diagrams';
type VersionStore = 'document_versions' | 'diagram_versions';

const itemStore = (kind: ItemKind): ItemStore => (kind === 'document' ? 'documents' : 'diagrams');
const versionStore = (kind: ItemKind): VersionStore => (kind === 'document' ? 'document_versions' : 'diagram_versions');
const ALL_STORES: StoreNames<DcosDB>[] = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'meta'];

/**
 * Ordered schema migrations. Index i upgrades a database from version i to i + 1.
 * Never edit a shipped migration; append a new one and bump SCHEMA_VERSION.
 */
const MIGRATIONS: Array<(db: IDBPDatabase<DcosDB>) => void> = [
  (db) => {
    db.createObjectStore('documents', { keyPath: 'id' });
    db.createObjectStore('diagrams', { keyPath: 'id' });
    db.createObjectStore('document_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
    db.createObjectStore('diagram_versions', { keyPath: 'id' }).createIndex('by_item', 'itemId');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
];

function summarize(item: WorkspaceItem): ItemSummary {
  const { content, ...rest } = item;
  return { ...rest, sizeBytes: JSON.stringify(content ?? null).length };
}

function stripContent(v: ItemVersion): ItemVersionSummary {
  const { content: _content, ...rest } = v;
  return rest;
}

export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBPDatabase<DcosDB>>;
  private deviceIdPromise: Promise<string> | null = null;

  constructor(dbName = 'digital-classroom-os') {
    this.dbPromise = openDB<DcosDB>(dbName, SCHEMA_VERSION, {
      upgrade(db, oldVersion) {
        for (let v = oldVersion; v < SCHEMA_VERSION; v++) MIGRATIONS[v](db);
      },
      blocking() {
        // Another tab wants to upgrade the schema; reload picks up the new version.
        if (typeof location !== 'undefined') location.reload();
      },
    });
  }

  private db() {
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
    return { deviceId: await this.deviceId(), schemaVersion: SCHEMA_VERSION, backend: 'IndexedDB' };
  }

  async list(kind: ItemKind, opts: { trashed?: boolean } = {}): Promise<ItemSummary[]> {
    const db = await this.db();
    const all = await db.getAll(itemStore(kind));
    return all
      .filter((i) => (opts.trashed ? i.deletedAt !== null : i.deletedAt === null))
      .map(summarize)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get<C>(kind: ItemKind, id: string): Promise<WorkspaceItem<C> | undefined> {
    const db = await this.db();
    return (await db.get(itemStore(kind), id)) as WorkspaceItem<C> | undefined;
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
    const tx = db.transaction([itemStore(kind), versionStore(kind)], 'readwrite');
    await tx.objectStore(itemStore(kind)).add(item as WorkspaceItem);
    await tx.objectStore(versionStore(kind)).add(this.versionOf(item as WorkspaceItem, 'create'));
    await tx.done;
    return item;
  }

  async save<C>(kind: ItemKind, id: string, patch: SavePatch<C>, expectedVersion: number, opts: SaveOptions = {}): Promise<WorkspaceItem<C>> {
    const db = await this.db();
    // Read-check-write in a single transaction: either the whole save lands or nothing does.
    const tx = db.transaction([itemStore(kind), versionStore(kind)], 'readwrite');
    const items = tx.objectStore(itemStore(kind));
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
    const now = nowIso();
    const next: WorkspaceItem = {
      ...current,
      title: patch.title !== undefined ? patch.title.trim() || 'Untitled' : current.title,
      content: patch.content !== undefined ? patch.content : current.content,
      favorite: patch.favorite ?? current.favorite,
      version: current.version + 1,
      updatedAt: now,
    };
    const contentChanged = patch.content !== undefined || patch.title !== undefined;
    const due = !current.lastSnapshotAt || Date.now() - Date.parse(current.lastSnapshotAt) >= AUTO_SNAPSHOT_INTERVAL_MS;
    if (opts.snapshot || (contentChanged && due)) {
      next.lastSnapshotAt = now;
      await tx.objectStore(versionStore(kind)).add(this.versionOf(next, opts.snapshot ? 'manual' : 'auto'));
      await this.prune(tx, kind, id);
    }
    await items.put(next);
    await tx.done;
    return next as WorkspaceItem<C>;
  }

  async duplicate(kind: ItemKind, id: string): Promise<WorkspaceItem> {
    const source = await this.get(kind, id);
    if (!source) throw new NotFoundError(kind, id);
    return this.create(kind, { title: `${source.title} (copy)`, content: structuredClone(source.content), templateId: source.templateId });
  }

  async trash(kind: ItemKind, id: string): Promise<void> {
    await this.setDeleted(kind, id, nowIso());
  }

  async restore(kind: ItemKind, id: string): Promise<void> {
    await this.setDeleted(kind, id, null);
  }

  private async setDeleted(kind: ItemKind, id: string, deletedAt: string | null) {
    const db = await this.db();
    const tx = db.transaction(itemStore(kind), 'readwrite');
    const current = await tx.store.get(id);
    if (!current) throw new NotFoundError(kind, id);
    await tx.store.put({ ...current, deletedAt, version: current.version + 1, updatedAt: nowIso() });
    await tx.done;
  }

  async purge(kind: ItemKind, id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([itemStore(kind), versionStore(kind)], 'readwrite');
    await tx.objectStore(itemStore(kind)).delete(id);
    const versions = tx.objectStore(versionStore(kind));
    for (const key of await versions.index('by_item').getAllKeys(id)) await versions.delete(key);
    await tx.done;
  }

  async listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]> {
    const db = await this.db();
    const versions = await db.getAllFromIndex(versionStore(kind), 'by_item', id);
    return versions.map(stripContent).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  }

  async restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem> {
    const db = await this.db();
    const tx = db.transaction([itemStore(kind), versionStore(kind)], 'readwrite');
    const items = tx.objectStore(itemStore(kind));
    const current = await items.get(id);
    const snapshot = await tx.objectStore(versionStore(kind)).get(versionId);
    if (!current || !snapshot || snapshot.itemId !== id) throw new NotFoundError(kind, id);
    const now = nowIso();
    // Keep the pre-restore state as a version too, so restoring is itself reversible.
    await tx.objectStore(versionStore(kind)).add(this.versionOf(current, 'restore'));
    const next: WorkspaceItem = {
      ...current,
      title: snapshot.title,
      content: structuredClone(snapshot.content),
      version: current.version + 1,
      updatedAt: now,
      lastSnapshotAt: now,
    };
    await items.put(next);
    await tx.done;
    return next;
  }

  async exportBackup(): Promise<BackupFile> {
    const db = await this.db();
    const tx = db.transaction(ALL_STORES, 'readonly');
    const [documents, diagrams, documentVersions, diagramVersions] = await Promise.all([
      tx.objectStore('documents').getAll(),
      tx.objectStore('diagrams').getAll(),
      tx.objectStore('document_versions').getAll(),
      tx.objectStore('diagram_versions').getAll(),
    ]);
    await tx.done;
    return {
      format: 'dcos-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      deviceId: await this.deviceId(),
      items: [...documents, ...diagrams],
      versions: [...documentVersions, ...diagramVersions],
    };
  }

  async importBackup(raw: unknown): Promise<ImportReport> {
    const file = validateBackup(raw);
    const db = await this.db();
    const report: ImportReport = { added: 0, skipped: 0, copied: 0, versionsAdded: 0 };
    const idMap = new Map<string, string>();
    const tx = db.transaction(['documents', 'diagrams', 'document_versions', 'diagram_versions'], 'readwrite');

    for (const item of file.items) {
      const store = tx.objectStore(itemStore(item.kind));
      const existing = await store.get(item.id);
      if (!existing) {
        await store.add(item);
        idMap.set(item.id, item.id);
        report.added++;
      } else if (existing.version === item.version && existing.updatedAt === item.updatedAt) {
        report.skipped++;
      } else {
        // Divergent copy: never overwrite local work. Import alongside it under a new id.
        const copyId = uuid();
        await store.add({ ...item, id: copyId, title: `${item.title} (restored)` });
        idMap.set(item.id, copyId);
        report.copied++;
      }
    }
    for (const v of file.versions) {
      const targetId = idMap.get(v.itemId);
      if (!targetId) continue;
      const store = tx.objectStore(versionStore(v.kind));
      const id = targetId === v.itemId ? v.id : uuid();
      if (await store.get(id)) continue;
      await store.add({ ...v, id, itemId: targetId });
      report.versionsAdded++;
    }
    await tx.done;
    return report;
  }

  private versionOf(item: WorkspaceItem, reason: ItemVersion['reason']): ItemVersion {
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

  private async prune(tx: IDBPTransaction<DcosDB, StoreNames<DcosDB>[], 'readwrite'>, kind: ItemKind, id: string) {
    const store = tx.objectStore(versionStore(kind));
    const versions = await store.index('by_item').getAll(id);
    const excess = versions.length + 1 - MAX_VERSIONS_PER_ITEM;
    if (excess <= 0) return;
    const removable = versions
      .filter((v) => v.reason !== 'create')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const v of removable.slice(0, excess)) await store.delete(v.id);
  }

  /** Closes the connection. Mainly for tests. */
  async close() {
    (await this.db()).close();
  }
}

function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new InvalidBackupError('not an object');
  const f = raw as Partial<BackupFile>;
  if (f.format !== 'dcos-backup') throw new InvalidBackupError('unrecognised format');
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) {
    throw new InvalidBackupError(`schema version ${String(f.schemaVersion)} is newer than this app supports`);
  }
  if (!Array.isArray(f.items) || !Array.isArray(f.versions)) throw new InvalidBackupError('missing items or versions');
  const kinds: ItemKind[] = ['document', 'diagram'];
  for (const i of f.items) {
    if (!i || typeof i.id !== 'string' || !kinds.includes(i.kind) || typeof i.version !== 'number' || typeof i.title !== 'string') {
      throw new InvalidBackupError('malformed item record');
    }
  }
  for (const v of f.versions) {
    if (!v || typeof v.id !== 'string' || typeof v.itemId !== 'string' || !kinds.includes(v.kind)) {
      throw new InvalidBackupError('malformed version record');
    }
  }
  return f as BackupFile;
}
