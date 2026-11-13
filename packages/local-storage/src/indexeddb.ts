import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { BACKUP_FORMAT_VERSION, contentSchemaOf, validateBackup } from './backup';
import { ITEM_KINDS } from './types';
import { toBase64 } from './base64';
import {
  BLOB_PREFIX,
  DATA_URL_MIME,
  blobRefsOf,
  collectExtraReferences,
  collectReferences,
  containsBlobText,
  decodeDataUrl,
  encodeDataUrl,
  findLargeDataUrls,
  mapStrings,
  rehydrate,
} from './blobs';
import { ConflictError, MissingAttachmentError, NotFoundError, SafetyCopyError, UpgradeError } from './errors';
import { nowIso, uuid } from './ids';
import type {
  Attachment,
  BackupFile,
  CleanUpOptions,
  CleanUpReport,
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
  UpgradeRecovery,
  UpgradeStatus,
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
/** Attachments stored or re-used more recently than this are never cleaned up (unless a caller asks otherwise). */
export const ATTACHMENT_GRACE_MS = 24 * 60 * 60 * 1000;

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
  lastUsedAt?: string;
}
type StoredAttachment = Attachment | AttachmentAlias;
const isAlias = (a: StoredAttachment): a is AttachmentAlias => 'aliasOf' in a;

/** Follows aliases to the record holding the bytes (guards against a loop in a damaged database). */
function resolveAttachment(byId: Map<string, StoredAttachment>, id: string): Attachment | undefined {
  let a = byId.get(id);
  for (let hops = 0; a && isAlias(a) && hops < 8; hops++) a = byId.get(a.aliasOf);
  return a && !isAlias(a) ? a : undefined;
}

/**
 * Attachments to keep: those referenced (directly, or through a kept alias) and those `fresh` says to keep.
 * An alias is kept when its own id is referenced or it is fresh; the records it points to are then kept too.
 */
function attachmentsToKeep(stored: StoredAttachment[], references: Set<string>, fresh: (a: StoredAttachment) => boolean): Set<string> {
  const byId = new Map(stored.map((a) => [a.id, a]));
  const keep = new Set<string>();
  for (const a of stored) {
    if (!references.has(a.id) && !fresh(a)) continue;
    keep.add(a.id);
    let target: StoredAttachment | undefined = a;
    for (let hops = 0; target && isAlias(target) && hops < 8; hops++) {
      keep.add(target.aliasOf);
      target = byId.get(target.aliasOf);
    }
  }
  return keep;
}

/** Every attachment id the content of these records may refer to (versions also list moved-out images). */
function referencesOf(records: Array<{ content?: unknown; blobRefs?: unknown }>, into = new Set<string>()): Set<string> {
  for (const r of records) {
    collectReferences(r.content, into);
    for (const id of blobRefsOf(r)) into.add(id);
  }
  return into;
}

/** The data URL an attachment made by version compaction holds, or undefined if it is missing or not one. */
function dataUrlOf(a: Attachment | undefined): string | undefined {
  if (!a || !(a.data instanceof ArrayBuffer || ArrayBuffer.isView(a.data))) return undefined;
  const url = decodeDataUrl(a.data as ArrayBuffer);
  return url.startsWith('data:') ? url : undefined;
}

/**
 * A version as callers see it: images moved out of the record are put back as their original data URLs. When some
 * cannot be found the reference text stays, the version keeps `blobRefs`, and the ids are returned in `missing`.
 */
function rehydrateVersion(v: ItemVersion, lookup: (id: string) => string | undefined): { version: ItemVersion; missing: string[] } {
  const ids = blobRefsOf(v);
  if (!ids.length && v.blobRefs === undefined) return { version: v, missing: [] };
  const { content, missing } = rehydrate(v.content, ids, lookup);
  const { blobRefs: _refs, ...rest } = v;
  return { version: missing.length ? { ...v, content } : { ...rest, content }, missing };
}

/** Builds a backup file from records read in one transaction. Versions are written with their images inline. */
function buildBackup(
  items: WorkspaceItem[],
  storedVersions: ItemVersion[],
  stored: StoredAttachment[],
  deviceId: string,
  onlyReferenced: boolean,
): BackupFile {
  const byId = new Map(stored.map((a) => [a.id, a]));
  const lookup = (id: string) => dataUrlOf(resolveAttachment(byId, id));
  const missing = new Set<string>();
  const versions = storedVersions.map((v) => {
    const r = rehydrateVersion(v, lookup);
    r.missing.forEach((id) => missing.add(id));
    return r.version;
  });
  const wanted = onlyReferenced ? attachmentsToKeep(stored, referencesOf([...items, ...versions]), () => false) : undefined;
  return {
    format: 'dcos-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    // Older apps accept the file only while every piece of content is still schema 1 (see backup.ts).
    // A loop, not Math.max(...spread): long histories would exceed the engine's argument limit.
    schemaVersion: [...items, ...versions].reduce((max, r) => Math.max(max, contentSchemaOf(r.content)), 1),
    exportedAt: nowIso(),
    deviceId,
    items,
    versions,
    attachments: exportAttachments(stored, wanted),
    ...(missing.size ? { missingAttachments: [...missing] } : {}),
  };
}

/**
 * Runs `body` inside `tx` and waits for the commit. If `body` throws, the transaction is aborted, so nothing it
 * did is kept (without this, work done before the throw would still be committed).
 */
async function inTransaction<T>(tx: { abort(): void; done: Promise<void> }, body: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await body();
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
  await tx.done;
  return result;
}

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

/**
 * Aliases are written out as full attachments under their own id, so every id in the backup carries its bytes.
 * With `wanted`, only those ids are written.
 */
function exportAttachments(stored: StoredAttachment[], wanted?: Set<string>) {
  const byId = new Map(stored.map((a) => [a.id, a]));
  return stored.flatMap((a) => {
    if (wanted && !wanted.has(a.id)) return [];
    const target = resolveAttachment(byId, a.id);
    if (!target) return [];
    const { data, lastUsedAt: _used, ...rest } = target;
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

/** `${kind}:${id}:${session}`; session '' is the key drafts had before sessions existed. */
const draftKey = (kind: ItemKind, id: string, session = '') => (session ? `${kind}:${id}:${session}` : `${kind}:${id}`);
/** Keys from `${kind}:${id}` up to, not including, `${kind}:${id};` (';' follows ':'): the item's drafts and a few neighbours. */
const draftRange = (kind: ItemKind, id: string) => IDBKeyRange.bound(draftKey(kind, id), `${kind}:${id};`, false, true);
/** Exactly the drafts of this item: ids may share a prefix ('a' and 'a-1'), so the key must end or go on with ':'. */
function isDraftOf(d: Draft, kind: ItemKind, id: string): boolean {
  const base = draftKey(kind, id);
  if (d.key !== base && !d.key.startsWith(`${base}:`)) return false;
  // Also check the record itself (an imported id could contain ':'); records without these fields are kept in.
  return (d.itemId === undefined || d.itemId === id) && (d.kind === undefined || d.kind === kind);
}
/** Drafts saved before sessions existed have no `session`: they read back as ''. */
const readDraft = <C>(d: Draft): Draft<C> => ({ ...d, session: typeof d.session === 'string' ? d.session : '' }) as Draft<C>;
const draftsNewestFirst = (a: Draft, b: Draft) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || a.key.localeCompare(b.key);

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

/** A safety copy counts only once its data and its `__copy` record were committed together. */
async function isCompleteCopy(name: string): Promise<boolean> {
  const version = await existingVersion(name);
  if (version === 0) return false;
  const db = await openDB(name, version);
  try {
    return db.objectStoreNames.contains('__copy') && (await db.get('__copy', 'info')) !== undefined;
  } finally {
    db.close();
  }
}

/**
 * A name no database has yet, for a new safety copy. An attempt only ever deletes the copy it created itself, so an
 * earlier copy (complete or not, from this tab or another) is never replaced or removed.
 */
async function unusedCopyName(base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if ((await existingVersion(name)) === 0) return name;
  }
}

/**
 * Runs `task` while holding a lock shared by every tab of this origin. Without the Web Locks API (very old
 * browsers) the task runs unguarded, as before.
 */
async function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? ((await locks.request(name, task)) as T) : task();
}

/** Only one tab at a time copies and upgrades the database. */
const withUpgradeLock = <T>(dbName: string, task: () => Promise<T>) => withLock(`dcos-upgrade:${dbName}`, task);

/** Copies every store of `from` (at its current version) into a new database `to`, before an upgrade. */
async function copyDatabase(from: string, to: string, fromVersion: number) {
  const src = await openDB(from, fromVersion);
  const data: Record<string, unknown[]> = {};
  let layout: Array<{ name: string; keyPath: string; indexes: Array<{ name: string; keyPath: string }> }>;
  try {
    for (const name of Array.from(src.objectStoreNames)) data[name] = await src.getAll(name);
    layout = Array.from(src.objectStoreNames).map((name) => {
      const s = src.transaction(name).objectStore(name);
      return { name, keyPath: s.keyPath as string, indexes: Array.from(s.indexNames).map((i) => ({ name: i, keyPath: s.index(i).keyPath as string })) };
    });
  } finally {
    src.close();
  }
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
  // Always close the copy, also when a write fails (storage full): an open connection would block removing it.
  try {
    const tx = dst.transaction([...layout.map((l) => l.name), '__copy'], 'readwrite');
    await Promise.all([
      ...layout.flatMap((l) => data[l.name].map((rec) => tx.objectStore(l.name).put(rec))),
      tx.objectStore('__copy').put({ key: 'info', copiedAt: nowIso(), fromVersion, source: from }),
      tx.done,
    ]);
    // Verify before the original is upgraded.
    for (const l of layout) {
      if ((await dst.count(l.name)) !== data[l.name].length) throw new Error(`Safety copy of ${l.name} is incomplete; upgrade stopped`);
    }
  } finally {
    dst.close();
  }
}

/**
 * Builds a backup file from database `name` at the version it already has. Opening at the existing version runs
 * no upgrade, and only read-only transactions are used, so the database is left exactly as it was.
 */
async function readBackupAt(name: string, version: number): Promise<BackupFile> {
  const db = await openDB(name, version);
  try {
    const wanted = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'meta', 'attachments'];
    const present = wanted.filter((s) => db.objectStoreNames.contains(s));
    const tx = db.transaction(present, 'readonly');
    const read = (s: string) => (present.includes(s) ? tx.objectStore(s).getAll() : Promise.resolve([]));
    const [documents, diagrams, dv, gv, meta, attachments] = await Promise.all(wanted.map(read));
    await tx.done;
    // Same rules as exportBackup: a v0.1.0 database holds only schema 1 content, so v0.1.0 can import this file.
    // Every attachment is kept here: this is the way out when an upgrade cannot run, so nothing is left behind.
    return buildBackup(
      [...documents, ...diagrams] as WorkspaceItem[],
      [...dv, ...gv] as ItemVersion[],
      attachments as StoredAttachment[],
      (meta as Array<{ key: string; value: string }>).find((m) => m.key === 'deviceId')?.value ?? 'unknown-device',
      false,
    );
  } finally {
    db.close();
  }
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
  /**
   * Test seam: replaces the pre-upgrade safety copy, e.g. to simulate a full disk. Receives the built-in copy
   * so a test can wrap it. Production code leaves this unset.
   */
  safetyCopy?: (from: string, to: string, fromVersion: number, builtIn: typeof copyDatabase) => Promise<void>;
  /**
   * Attachment references held outside the database (for example emergency drafts in localStorage). Added to every
   * cleanUpAttachments() run. Text that is itself JSON is searched as well.
   */
  extraReferences?: () => Iterable<string>;
}

export class IndexedDbAdapter implements StorageAdapter, UpgradeRecovery {
  private dbPromise: Promise<IDBPDatabase<DcosDB>>;
  private deviceIdPromise: Promise<string> | null = null;
  /** Set once another tab's upgrade made us close the connection; every later call fails clearly. */
  private closedForUpgrade = false;
  private readonly safetyPrefix: string;
  private status: UpgradeStatus = { state: 'checking' };
  private readonly statusListeners = new Set<() => void>();
  /** When exportWithoutUpgrade() last produced a backup file in this session (the only way to skip the copy). */
  private preUpgradeBackupAt: string | null = null;
  /** The complete safety copy this adapter made, so a retry after a failed upgrade step doesn't copy again. */
  private sessionCopy: { name: string; fromVersion: number } | null = null;

  constructor(
    private readonly dbName = 'digital-classroom-os',
    private readonly options: IndexedDbAdapterOptions = {},
  ) {
    this.safetyPrefix = `${dbName}-backup-v`;
    this.dbPromise = this.start();
  }

  /** Opens the database. Callers see a failure through db(); this only keeps it from being reported as unhandled. */
  private start(backupFileAt?: string) {
    const opening = this.open(backupFileAt);
    opening.catch(() => undefined);
    return opening;
  }

  private setStatus(status: UpgradeStatus) {
    this.status = status;
    this.statusListeners.forEach((l) => l());
  }

  /**
   * Opens the database, upgrading it if needed. An upgrade runs only after a full copy of the old database was
   * made on this device, or, when that copy could not be made, after the user downloaded a backup file
   * (`backupFileAt`, see upgradeWithoutSafetyCopy). If the copy fails, nothing is upgraded: the old database
   * stays as it was and the status becomes 'needs-backup' (audit STOR-R5).
   */
  private async open(backupFileAt?: string) {
    this.setStatus({ state: 'checking' });
    const current = await this.versionOnDisk();
    if (!(current > 0 && current < SCHEMA_VERSION)) return this.finishOpen(false, current, backupFileAt);
    // Only one tab copies and upgrades at a time. Another tab may have finished while this one waited, so look again.
    return withUpgradeLock(this.dbName, async () => {
      const now = await this.versionOnDisk();
      const upgrading = now > 0 && now < SCHEMA_VERSION;
      if (upgrading && !backupFileAt) await this.makeSafetyCopy(now);
      return this.finishOpen(upgrading, now, backupFileAt);
    });
  }

  private async versionOnDisk() {
    try {
      return await existingVersion(this.dbName);
    } catch (err) {
      this.setStatus({ state: 'failed', message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /** Makes and verifies a full copy of the database before it is upgraded; stops the upgrade if that fails. */
  private async makeSafetyCopy(fromVersion: number) {
    this.setStatus({ state: 'copying', fromVersion });
    const earlier = this.sessionCopy;
    if (earlier?.fromVersion === fromVersion && (await isCompleteCopy(earlier.name).catch(() => false))) return;
    let created: string | undefined;
    try {
      created = await unusedCopyName(`${this.safetyPrefix}${fromVersion}`);
      await (this.options.safetyCopy ?? copyDatabase)(this.dbName, created, fromVersion, copyDatabase);
      this.sessionCopy = { name: created, fromVersion };
    } catch (err) {
      // An incomplete copy is not a backup: remove it, so it frees its space and is never offered as one.
      // Only the copy this attempt created is removed; nothing else is touched.
      if (created) await deleteDatabase(created).catch(() => undefined);
      throw this.upgradeStopped(new SafetyCopyError(fromVersion, err));
    }
  }

  private async finishOpen(upgrading: boolean, current: number, backupFileAt?: string) {
    this.setStatus({ state: 'opening' });
    let db: IDBPDatabase<DcosDB>;
    try {
      db = await this.openCurrent();
    } catch (err) {
      // A failed upgrade (e.g. storage full while building the index) is rolled back by IndexedDB as a whole,
      // so the old database is unchanged: offer the same ways out as a failed copy instead of locking the app.
      if (upgrading) throw this.upgradeStopped(new UpgradeError('upgrade', current, err));
      this.setStatus({ state: 'failed', message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    if (upgrading) {
      // Informational only: the upgrade has already happened, so a failure here must not stop the app.
      await db.put('meta', { key: 'migratedFrom', value: `${current}@${nowIso()}` }).catch(() => undefined);
      if (backupFileAt) await db.put('meta', { key: 'upgradeSafetyBackup', value: `file@${backupFileAt}` }).catch(() => undefined);
    }
    this.setStatus({ state: 'ready' });
    return db;
  }

  private upgradeStopped(error: UpgradeError) {
    this.setStatus({ state: 'needs-backup', step: error.step, fromVersion: error.fromVersion, reason: error.reason, message: error.message });
    return error;
  }

  private async openCurrent() {
    const options = this.options;
    const markClosed = () => {
      this.closedForUpgrade = true;
    };
    let migrationError: unknown;
    const opening = openDB<DcosDB>(this.dbName, SCHEMA_VERSION, {
      async upgrade(database, oldVersion, _newVersion, tx) {
        try {
          for (let v = oldVersion; v < SCHEMA_VERSION; v++) await MIGRATIONS[v](database, tx);
        } catch (err) {
          // A migration that throws must not leave a half-migrated database behind. IndexedDB only rolls the
          // upgrade back when it is aborted; an error inside an async migration does not do that by itself.
          migrationError = err;
          tx.done.catch(() => undefined); // the open request reports the failure
          try {
            tx.abort();
          } catch {
            // Already finished or aborted.
          }
        }
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
    const db = await opening.catch((err: unknown) => {
      throw migrationError ?? err;
    });
    return db;
  }

  upgradeStatus(): UpgradeStatus {
    return this.status;
  }

  subscribeUpgradeStatus(listener: () => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async exportWithoutUpgrade(): Promise<BackupFile> {
    const version = await existingVersion(this.dbName);
    if (version === 0) throw new Error('There is no saved data on this device to back up.');
    const backup = await readBackupAt(this.dbName, version);
    this.preUpgradeBackupAt = backup.exportedAt;
    return backup;
  }

  async retryUpgrade(): Promise<void> {
    if (this.status.state === 'needs-backup') {
      this.deviceIdPromise = null;
      this.dbPromise = this.start();
    }
    await this.dbPromise;
  }

  async upgradeWithoutSafetyCopy(): Promise<void> {
    if (this.status.state === 'needs-backup') {
      if (!this.preUpgradeBackupAt) throw new Error('Download a backup first. The update needs either a copy on this device or a backup file.');
      this.deviceIdPromise = null;
      this.dbPromise = this.start(this.preUpgradeBackupAt);
    }
    await this.dbPromise;
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
    const first = this.versionOf(item as WorkspaceItem, 'create');
    const tx = db.transaction([STORES[kind].items, STORES[kind].versions, 'item_index'], 'readwrite');
    await tx.objectStore(STORES[kind].items).add(item as WorkspaceItem);
    await tx.objectStore(STORES[kind].versions).add(first);
    await tx.objectStore('item_index').put(summarize(item as WorkspaceItem));
    await tx.done;
    await this.compactVersions(kind, [first]);
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
    const added: ItemVersion[] = [];
    if (contentChanged && due) {
      next.lastSnapshotAt = now;
      added.push(this.versionOf(next, 'auto'));
      await tx.objectStore(versionStore).add(added[0]);
      await this.prune(tx, kind, id);
    }
    await items.put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    await this.compactVersions(kind, added);
    return next as WorkspaceItem<C>;
  }

  async snapshot(kind: ItemKind, id: string): Promise<boolean> {
    const db = await this.db();
    const { items: itemStore, versions: versionStore } = STORES[kind];
    const tx = db.transaction([itemStore, versionStore, 'item_index', 'attachments'], 'readwrite');
    const current = await tx.objectStore(itemStore).get(id);
    if (!current) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new NotFoundError(kind, id);
    }
    const versions = await tx.objectStore(versionStore).index('by_item').getAll(id);
    // Newest first; versions written in the same millisecond are ordered by item version.
    const stored = versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version)[0];
    // Compare with the newest version as it was saved (images put back). If an image is missing, they differ.
    const newest = stored && (await this.readVersion(tx, stored));
    if (newest && !newest.missing.length && newest.version.title === current.title && JSON.stringify(newest.version.content) === JSON.stringify(current.content)) {
      await tx.done;
      return false;
    }
    const next = { ...current, lastSnapshotAt: nowIso() };
    const added = this.versionOf(next, 'manual');
    await tx.objectStore(versionStore).add(added);
    await this.prune(tx, kind, id);
    await tx.objectStore(itemStore).put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    await this.compactVersions(kind, [added]);
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
    await this.purgeMany([{ kind, id }]);
  }

  async purgeMany(items: Array<{ kind: ItemKind; id: string }>): Promise<void> {
    const unique = new Map<string, { kind: ItemKind; id: string }>();
    for (const { kind, id } of items) {
      if (!STORES[kind]) throw new TypeError(`Unknown item kind: ${String(kind)}`);
      unique.set(`${kind}:${id}`, { kind, id });
    }
    if (!unique.size) return;
    const db = await this.db();
    const names = new Set<StoreNames<DcosDB>>(['item_index', 'drafts']);
    for (const { kind } of unique.values()) names.add(STORES[kind].items).add(STORES[kind].versions);
    // One transaction: either every item, with its versions and drafts, is removed, or nothing is.
    const tx = db.transaction([...names], 'readwrite') as WriteTx;
    await inTransaction(tx, async () => {
      const drafts = tx.objectStore('drafts');
      for (const { kind, id } of unique.values()) {
        await tx.objectStore(STORES[kind].items).delete(id);
        await tx.objectStore('item_index').delete(id);
        for (const d of await drafts.getAll(draftRange(kind, id))) if (isDraftOf(d, kind, id)) await drafts.delete(d.key);
        const versions = tx.objectStore(STORES[kind].versions);
        for (const key of await versions.index('by_item').getAllKeys(id)) await versions.delete(key);
      }
    });
  }

  async listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]> {
    const db = await this.db();
    const versions = await db.getAllFromIndex(STORES[kind].versions, 'by_item', id);
    return versions.map(stripContent).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  }

  async restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem> {
    const db = await this.db();
    const { items: itemStore, versions: versionStore } = STORES[kind];
    const tx = db.transaction([itemStore, versionStore, 'item_index', 'attachments'], 'readwrite');
    const items = tx.objectStore(itemStore);
    const current = await items.get(id);
    const stored = await tx.objectStore(versionStore).get(versionId);
    const stop = async (err: Error) => {
      tx.abort();
      await tx.done.catch(() => undefined);
      return err;
    };
    if (!current) throw await stop(new NotFoundError(kind, id));
    if (!stored || stored.itemId !== id) throw await stop(new NotFoundError(`${kind} version`, versionId));
    // Images moved out of the version are put back exactly; if one is gone, nothing is restored (never a broken image).
    const snapshot = await this.readVersion(tx, stored);
    if (snapshot.missing.length) throw await stop(new MissingAttachmentError(snapshot.missing));
    const now = nowIso();
    // Keep the pre-restore state as a version too, so restoring is itself reversible.
    const before = this.versionOf(current, 'restore');
    await tx.objectStore(versionStore).add(before);
    const next: WorkspaceItem = {
      ...current,
      title: snapshot.version.title,
      content: structuredClone(snapshot.version.content),
      version: current.version + 1,
      updatedAt: now,
      lastSnapshotAt: now,
    };
    await this.prune(tx, kind, id);
    await items.put(next);
    await tx.objectStore('item_index').put(summarize(next));
    await tx.done;
    await this.compactVersions(kind, [before]);
    return next;
  }

  async exportBackup(): Promise<BackupFile> {
    const db = await this.db();
    const deviceId = await this.deviceId();
    // One read-only transaction, so items, versions and attachments are from the same moment.
    const tx = db.transaction(['documents', 'diagrams', 'document_versions', 'diagram_versions', 'attachments'], 'readonly');
    const [documents, diagrams, documentVersions, diagramVersions, attachments] = await Promise.all([
      tx.objectStore('documents').getAll(),
      tx.objectStore('diagrams').getAll(),
      tx.objectStore('document_versions').getAll(),
      tx.objectStore('diagram_versions').getAll(),
      tx.objectStore('attachments').getAll(),
    ]);
    await tx.done;
    // Versions go out with their images inline (same file layout as before), and only attachments the exported
    // items and versions refer to are included.
    return buildBackup([...documents, ...diagrams], [...documentVersions, ...diagramVersions], attachments, deviceId, true);
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
    // Counted as just used, so a clean-up right after the import cannot remove them.
    const importedAt = nowIso();
    for (const a of attachments) {
      const store = tx.objectStore('attachments');
      if (await store.get(a.id)) continue;
      const sameBytes = await store.index('by_sha256').get(a.sha256);
      await store.add(sameBytes ? { id: a.id, aliasOf: sameBytes.id, createdAt: a.createdAt, lastUsedAt: importedAt } : { ...a, lastUsedAt: importedAt });
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
    const touched = new Map<string, { kind: ItemKind; id: string }>();
    const added: ItemVersion[] = [];
    for (const v of versions) {
      const targetId = idMap.get(v.itemId);
      if (!targetId) continue;
      const store = tx.objectStore(STORES[v.kind].versions);
      const id = targetId === v.itemId ? v.id : uuid();
      if (await store.get(id)) continue;
      const record = { ...v, id, itemId: targetId };
      await store.add(record);
      added.push(record);
      touched.set(`${v.kind}:${targetId}`, { kind: v.kind, id: targetId });
      report.versionsAdded++;
    }
    // A file can carry more history than this device keeps (an older app, or an edited file): apply the usual
    // limit, with its protected versions, to every item this import wrote to (audit STOR-R6).
    for (const { kind, id } of touched.values()) {
      const byItem = tx.objectStore(STORES[kind].versions).index('by_item');
      const before = await byItem.count(id);
      await this.prune(tx, kind, id);
      report.versionsAdded -= before - (await byItem.count(id));
    }
    await tx.done;
    // Versions removed by the limit above are simply skipped.
    for (const kind of ITEM_KINDS) await this.compactVersions(kind, added.filter((v) => v.kind === kind));
    return report;
  }

  async putAttachment(input: Blob | ArrayBuffer, mimeType: string): Promise<Omit<Attachment, 'data'>> {
    const data = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const sha256 = await sha256Hex(data);
    const db = await this.db();
    const tx = db.transaction('attachments', 'readwrite');
    const existing = (await tx.store.index('by_sha256').get(sha256)) as Attachment | undefined;
    if (existing) {
      // Stored again: counts as new for clean-up, so the grace period protects it until its document is saved.
      const used: Attachment = { ...existing, lastUsedAt: nowIso() };
      try {
        await tx.store.put(used);
        await tx.done;
      } catch {
        // Refreshing the date failed (e.g. storage full). The bytes are stored already, so re-using them still works;
        // only the clean-up grace period is not renewed.
        const { data: _old, ...existingMeta } = existing;
        return existingMeta;
      }
      const { data: _data, ...meta } = used;
      return meta;
    }
    const now = nowIso();
    const record: Attachment = { id: uuid(), sha256, mimeType, sizeBytes: data.byteLength, data, createdAt: now, lastUsedAt: now };
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
    // A caller from before sessions existed passes none: it keeps using the one draft slot it always had.
    const session = typeof draft.session === 'string' ? draft.session : '';
    await (await this.db()).put('drafts', { ...draft, session, key: draftKey(draft.kind, draft.itemId, session), savedAt: nowIso() } as Draft);
  }

  async getDraft<C>(kind: ItemKind, itemId: string): Promise<Draft<C> | undefined> {
    return (await this.listDrafts<C>({ kind, itemId }))[0];
  }

  async listDrafts<C>(filter?: { kind: ItemKind; itemId: string }): Promise<Draft<C>[]> {
    const db = await this.db();
    const found = filter
      ? (await db.getAll('drafts', draftRange(filter.kind, filter.itemId))).filter((d) => isDraftOf(d, filter.kind, filter.itemId))
      : await db.getAll('drafts');
    return found.map((d) => readDraft<C>(d)).sort(draftsNewestFirst);
  }

  async deleteDraft(kind: ItemKind, itemId: string, session?: string): Promise<void> {
    const db = await this.db();
    if (session !== undefined) return void (await db.delete('drafts', draftKey(kind, itemId, session)));
    const tx = db.transaction('drafts', 'readwrite');
    await inTransaction(tx, async () => {
      for (const d of await tx.store.getAll(draftRange(kind, itemId))) if (isDraftOf(d, kind, itemId)) await tx.store.delete(d.key);
    });
  }

  async exportSafetyCopy(name: string): Promise<BackupFile> {
    if (!name.startsWith(this.safetyPrefix)) throw new Error(`${name} is not a safety copy`);
    const copy = await openDB(name);
    const read = (s: string) => (copy.objectStoreNames.contains(s) ? copy.getAll(s) : Promise.resolve([]));
    let records: unknown[][];
    try {
      records = await Promise.all(['documents', 'diagrams', 'document_versions', 'diagram_versions', 'meta', 'attachments'].map(read));
    } finally {
      copy.close();
    }
    const [documents, diagrams, dv, gv, meta, attachments] = records;
    // Versions are rebuilt from the copy's own attachments, and the attachments its items refer to go with it.
    return buildBackup(
      [...documents, ...diagrams] as WorkspaceItem[],
      [...dv, ...gv] as ItemVersion[],
      attachments as StoredAttachment[],
      (meta as Array<{ key: string; value: string }>).find((m) => m.key === 'deviceId')?.value ?? 'unknown-device',
      true,
    );
  }

  async cleanUpAttachments(opts: CleanUpOptions = {}): Promise<CleanUpReport> {
    const graceMs = typeof opts.graceMs === 'number' && Number.isFinite(opts.graceMs) && opts.graceMs >= 0 ? opts.graceMs : ATTACHMENT_GRACE_MS;
    // References from outside the database are gathered first. If that fails, nothing is removed.
    const extra = new Set<string>();
    collectExtraReferences(opts.extraReferences, extra);
    collectExtraReferences(this.options.extraReferences?.(), extra);
    // One clean-up per database at a time across tabs. db() refuses while the database is closed for an upgrade.
    return withLock(`dcos-gc:${this.dbName}`, async () => {
      const db = await this.db();
      const stores = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'drafts', 'attachments'] as const;
      // Reading what is referenced and deleting what is not happen in one transaction, so nothing saved in between
      // (a new reference, a new attachment) can be missed.
      const tx = db.transaction([...stores], 'readwrite') as WriteTx;
      return inTransaction(tx, async () => {
        const [documents, diagrams, dv, gv, drafts, stored] = await Promise.all([
          tx.objectStore('documents').getAll(),
          tx.objectStore('diagrams').getAll(),
          tx.objectStore('document_versions').getAll(),
          tx.objectStore('diagram_versions').getAll(),
          tx.objectStore('drafts').getAll(),
          tx.objectStore('attachments').getAll(),
        ]);
        // Trashed items are items too: their attachments stay until they are purged.
        const references = referencesOf([...documents, ...diagrams, ...dv, ...gv, ...drafts], extra);
        const now = Date.now();
        const fresh = (a: StoredAttachment) => {
          const times = [a.createdAt, a.lastUsedAt].map((t) => (typeof t === 'string' ? Date.parse(t) : NaN)).filter(Number.isFinite);
          // No readable time: the age is unknown, so it is kept.
          return !times.length || now - Math.max(...times) < graceMs;
        };
        const keep = attachmentsToKeep(stored, references, fresh);
        const report: CleanUpReport = { removed: 0, freedBytes: 0 };
        for (const a of stored) {
          if (keep.has(a.id)) continue;
          await tx.objectStore('attachments').delete(a.id);
          if (isAlias(a)) continue;
          report.removed++;
          report.freedBytes += typeof a.sizeBytes === 'number' ? a.sizeBytes : (a.data?.byteLength ?? 0);
        }
        return report;
      });
    });
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

  /**
   * A stored version with the images moved out of it put back, read inside `tx` (which must include 'attachments').
   * Ids that could not be found are returned in `missing`; their reference text is left in place.
   */
  private async readVersion(tx: { objectStore(name: 'attachments'): { get(id: string): Promise<StoredAttachment | undefined> } }, v: ItemVersion) {
    const ids = blobRefsOf(v);
    const urls = new Map<string, string | undefined>();
    for (const id of ids) {
      let a = await tx.objectStore('attachments').get(id);
      for (let hops = 0; a && isAlias(a) && hops < 8; hops++) a = await tx.objectStore('attachments').get(a.aliasOf);
      urls.set(id, dataUrlOf(a && !isAlias(a) ? a : undefined));
    }
    return rehydrateVersion(v, (id) => urls.get(id));
  }

  /**
   * Moves large inline data URLs out of version records just written, into the attachments store, so an image is
   * stored once instead of once per version. Runs after the version was committed inline. The record is replaced
   * only if it is still exactly as written and its content provably comes back unchanged; on any failure the
   * inline version stays as it is. Never throws.
   */
  private async compactVersions(kind: ItemKind, written: ItemVersion[]) {
    for (const v of written) {
      try {
        await this.compactVersion(kind, v);
      } catch {
        // The version stays inline: larger, but complete.
      }
    }
  }

  private async compactVersion(kind: ItemKind, written: ItemVersion) {
    if (written.blobRefs !== undefined) return;
    const urls = findLargeDataUrls(written.content);
    // Content that already holds reference-like text is left alone, so putting images back can never touch it.
    if (!urls.length || containsBlobText(written.content)) return;
    // Hashing is async, so it happens before the transaction (only IndexedDB requests may be awaited inside one).
    const blobs: Array<{ url: string; data: ArrayBuffer; sha256: string }> = [];
    for (const url of urls) {
      const data = encodeDataUrl(url);
      if (data) blobs.push({ url, data, sha256: await sha256Hex(data) });
    }
    if (!blobs.length) return;
    const db = await this.db();
    const versionStore = STORES[kind].versions;
    const tx = db.transaction([versionStore, 'attachments'], 'readwrite');
    await inTransaction(tx, async () => {
      const current = await tx.objectStore(versionStore).get(written.id);
      // Gone (pruned, purged) or no longer what was written: leave it.
      if (!current || current.blobRefs !== undefined || current.title !== written.title || JSON.stringify(current.content) !== JSON.stringify(written.content)) return;
      const attachments = tx.objectStore('attachments');
      const idOf = new Map<string, string>();
      const now = nowIso();
      for (const b of blobs) {
        const same = await attachments.index('by_sha256').get(b.sha256);
        if (same) {
          // Re-use the stored bytes only when they really are this data URL; otherwise keep this one inline.
          if (!isAlias(same) && dataUrlOf(same) === b.url) idOf.set(b.url, same.id);
          continue;
        }
        const id = uuid();
        await attachments.add({ id, sha256: b.sha256, mimeType: DATA_URL_MIME, sizeBytes: b.data.byteLength, data: b.data, createdAt: now, lastUsedAt: now });
        idOf.set(b.url, id);
      }
      if (!idOf.size) return;
      const content = mapStrings(current.content, (s) => {
        const id = idOf.get(s);
        return id === undefined ? s : `${BLOB_PREFIX}${id}`;
      });
      // Prove the round trip before replacing anything: putting the images back must give the original exactly.
      const urlOf = new Map([...idOf].map(([url, id]) => [id, url]));
      const back = rehydrate(content, urlOf.keys(), (id) => urlOf.get(id));
      if (back.missing.length || JSON.stringify(back.content) !== JSON.stringify(current.content)) throw new Error('Version compaction check failed');
      await tx.objectStore(versionStore).put({ ...current, content, blobRefs: [...urlOf.keys()] });
    });
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
