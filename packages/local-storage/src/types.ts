/** Kinds of workspace items persisted by the local store. Each kind has its own store and version store. */
export type ItemKind = 'document' | 'diagram';

export const ITEM_KINDS: readonly ItemKind[] = ['document', 'diagram'];

export interface WorkspaceItem<C = unknown> {
  id: string;
  kind: ItemKind;
  title: string;
  content: C;
  /** Incremented on every content or title change. Used for optimistic concurrency. */
  version: number;
  createdAt: string;
  /** Last content or title change. Metadata changes (favorite, trash) do not move it. */
  updatedAt: string;
  /** Soft-delete marker. Items with a value here are in the trash. */
  deletedAt: string | null;
  /** Device that created the item. Ownership for future sharing / sync. */
  ownerDeviceId: string;
  favorite: boolean;
  templateId: string | null;
  /** Timestamp of the most recent version snapshot. */
  lastSnapshotAt: string | null;
  /** Set on copies made by a backup import, so importing the same file again is a no-op. */
  restoredFrom?: { itemId: string; version: number; updatedAt: string };
}

export type ItemSummary = Omit<WorkspaceItem, 'content'> & { sizeBytes: number };

export type VersionReason = 'manual' | 'auto' | 'restore' | 'create';

export interface ItemVersion<C = unknown> {
  id: string;
  itemId: string;
  kind: ItemKind;
  version: number;
  title: string;
  content: C;
  createdAt: string;
  reason: VersionReason;
  /**
   * Attachments holding large inline images that were moved out of this version's content to save space. In
   * `content` each one appears as the text `dcos-blob:<id>`; every reader puts the original data URL back, so
   * callers always see the content exactly as it was saved. Absent on versions that were not compacted.
   */
  blobRefs?: string[];
}

export type ItemVersionSummary = Omit<ItemVersion, 'content'>;

export interface CreateItemInput<C = unknown> {
  title: string;
  content: C;
  templateId?: string | null;
}

export interface SavePatch<C = unknown> {
  title?: string;
  content?: C;
  /** @deprecated Use setFavorite(). Kept so older callers keep working; it no longer bumps the content version. */
  favorite?: boolean;
}

/** Unsaved edits kept when they could not be written (conflict, error, app closed mid-save). */
export interface Draft<C = unknown> {
  /** `${kind}:${itemId}:${session}`, or `${kind}:${itemId}` for drafts saved before drafts had sessions. */
  key: string;
  kind: ItemKind;
  itemId: string;
  /**
   * Editor session that kept the draft. Each session has its own draft, so one session never replaces another's.
   * Drafts saved before sessions existed read back as ''.
   */
  session: string;
  /** Item version the edits were based on. */
  baseVersion: number;
  title?: string;
  content?: C;
  savedAt: string;
}

/** A binary stored beside documents, e.g. the rendered preview of an embedded diagram. */
export interface Attachment {
  id: string;
  /** Content hash; identical files are stored once. */
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  data: ArrayBuffer;
  createdAt: string;
  /** Last time the same bytes were stored again (deduplicated). Clean-up treats a re-used attachment as new. */
  lastUsedAt?: string;
}

/** Result of removing attachments nothing refers to any more. */
export interface CleanUpReport {
  /** Stored files removed (second ids for the same bytes are not counted: they hold no bytes of their own). */
  removed: number;
  freedBytes: number;
}

export interface CleanUpOptions {
  /** Anything stored or re-used more recently than this is kept. Default 24 hours. */
  graceMs?: number;
  /** References held outside the database (for example emergency drafts in localStorage). */
  extraReferences?: Iterable<string>;
}

/** An attachment inside a backup file: same fields, bytes as base64. */
export type BackupAttachment = Omit<Attachment, 'data'> & { base64: string };

export interface BackupFile {
  format: 'dcos-backup';
  /** Backup layout version. 1 = items + versions only; 2 adds formatVersion/appVersion/restoredFrom. */
  formatVersion?: number;
  /**
   * Highest content schema in the file. v0.1.0 importers accept only 1, so a backup is readable by them
   * exactly when all of its content is still schema 1.
   */
  schemaVersion: number;
  appVersion?: string;
  exportedAt: string;
  deviceId: string;
  items: WorkspaceItem[];
  versions: ItemVersion[];
  /** formatVersion 2: attachments referenced by items (older readers ignore this field). */
  attachments?: BackupAttachment[];
  /**
   * Images a version refers to that were not found on the device when the backup was made. Their reference text
   * (`dcos-blob:<id>`) was left in that version. Absent when nothing was missing.
   */
  missingAttachments?: string[];
}

export interface ImportReport {
  added: number;
  /** Items that already existed unchanged, or were already restored from this same backup. */
  skipped: number;
  /** Items that differed from the local copy: imported as new copies, never overwriting. */
  copied: number;
  versionsAdded: number;
  /** Records of kinds this app version does not know (from a newer app). Left out, not lost from the file. */
  unsupported: number;
  attachmentsAdded: number;
}

export interface StorageInfo {
  deviceId: string;
  schemaVersion: number;
  backend: string;
  /** Databases holding a copy of the data taken before a schema upgrade. */
  safetyCopies: string[];
}

/**
 * Platform-neutral persistence contract. The web app uses IndexedDB; Tauri and Capacitor builds will
 * provide SQLite-backed implementations of the same interface (see docs/DATABASE.md).
 */
export interface StorageAdapter {
  info(): Promise<StorageInfo>;
  list(kind: ItemKind, opts?: { trashed?: boolean }): Promise<ItemSummary[]>;
  /** All kinds at once (dashboard, trash, favorites, file manager). */
  listAll(opts?: { trashed?: boolean }): Promise<ItemSummary[]>;
  get<C = unknown>(kind: ItemKind, id: string): Promise<WorkspaceItem<C> | undefined>;
  create<C = unknown>(kind: ItemKind, input: CreateItemInput<C>): Promise<WorkspaceItem<C>>;
  /** Throws ConflictError when expectedVersion is not the stored version. Never overwrites silently. */
  save<C = unknown>(kind: ItemKind, id: string, patch: SavePatch<C>, expectedVersion: number): Promise<WorkspaceItem<C>>;
  /**
   * Records the current state as a 'manual' version. Does not change the item's version or updatedAt.
   * Returns false when the newest version already holds this exact state.
   */
  snapshot(kind: ItemKind, id: string): Promise<boolean>;
  setFavorite(kind: ItemKind, id: string, favorite: boolean): Promise<void>;
  duplicate(kind: ItemKind, id: string): Promise<WorkspaceItem>;
  trash(kind: ItemKind, id: string): Promise<void>;
  restore(kind: ItemKind, id: string): Promise<void>;
  /** Permanently removes an item, its versions and all of its drafts. */
  purge(kind: ItemKind, id: string): Promise<void>;
  /** purge() for several items in one transaction (Empty trash): either all of them are removed or none. */
  purgeMany(items: Array<{ kind: ItemKind; id: string }>): Promise<void>;
  listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]>;
  restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem>;
  exportBackup(): Promise<BackupFile>;
  importBackup(file: unknown): Promise<ImportReport>;
  /** Stores a binary (deduplicated by content) and returns its record without the bytes. */
  putAttachment(data: Blob | ArrayBuffer, mimeType: string): Promise<Omit<Attachment, 'data'>>;
  getAttachment(id: string): Promise<Attachment | undefined>;
  /**
   * Removes attachments that no item, trashed item, version or draft refers to any more. Anything stored or
   * re-used within the grace period is kept.
   */
  cleanUpAttachments(opts?: CleanUpOptions): Promise<CleanUpReport>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  /** Keeps or replaces this session's draft of the item. Drafts of other sessions are never replaced. */
  saveDraft<C = unknown>(draft: Omit<Draft<C>, 'key' | 'savedAt'>): Promise<void>;
  /** The newest draft of the item, from any session. */
  getDraft<C = unknown>(kind: ItemKind, itemId: string): Promise<Draft<C> | undefined>;
  /** Drafts of one item, or every draft on this device; newest first. */
  listDrafts<C = unknown>(filter?: { kind: ItemKind; itemId: string }): Promise<Draft<C>[]>;
  /** With `session`: that session's draft only ('' = a draft saved before sessions). Without: every draft of the item. */
  deleteDraft(kind: ItemKind, itemId: string, session?: string): Promise<void>;
  /** Builds a backup file from a pre-upgrade safety copy, for export or re-import. */
  exportSafetyCopy(name: string): Promise<BackupFile>;
  deleteSafetyCopy(name: string): Promise<void>;
}

/**
 * Progress of opening the database. Before a schema upgrade a full copy of the old database is made; when that
 * copy cannot be made the upgrade does not run and the state is 'needs-backup' until the user acts.
 */
export type UpgradeStatus =
  | { state: 'checking' }
  | { state: 'copying'; fromVersion: number }
  | { state: 'opening' }
  | { state: 'ready' }
  | { state: 'failed'; message: string }
  /** The upgrade did not happen; `step` says whether the copy or the upgrade itself failed. Nothing was changed. */
  | { state: 'needs-backup'; step: 'copy' | 'upgrade'; fromVersion: number; reason: 'quota' | 'error'; message: string };

/** Ways out of the 'needs-backup' state. None of them deletes or changes the old data. */
export interface UpgradeRecovery {
  upgradeStatus(): UpgradeStatus;
  subscribeUpgradeStatus(listener: () => void): () => void;
  /** Builds a backup file from the database at the version it has now, read-only: no upgrade runs. */
  exportWithoutUpgrade(): Promise<BackupFile>;
  /** Tries the safety copy and the upgrade again (for example after space was freed). */
  retryUpgrade(): Promise<void>;
  /**
   * Upgrades without the copy on this device. Allowed only after exportWithoutUpgrade() produced a backup file
   * in this session: that file is the safety backup.
   */
  upgradeWithoutSafetyCopy(): Promise<void>;
}
