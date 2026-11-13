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
  key: string;
  kind: ItemKind;
  itemId: string;
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
  /** Permanently removes an item and its versions. */
  purge(kind: ItemKind, id: string): Promise<void>;
  listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]>;
  restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem>;
  exportBackup(): Promise<BackupFile>;
  importBackup(file: unknown): Promise<ImportReport>;
  /** Stores a binary (deduplicated by content) and returns its record without the bytes. */
  putAttachment(data: Blob | ArrayBuffer, mimeType: string): Promise<Omit<Attachment, 'data'>>;
  getAttachment(id: string): Promise<Attachment | undefined>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  saveDraft<C = unknown>(draft: Omit<Draft<C>, 'key' | 'savedAt'>): Promise<void>;
  getDraft<C = unknown>(kind: ItemKind, itemId: string): Promise<Draft<C> | undefined>;
  deleteDraft(kind: ItemKind, itemId: string): Promise<void>;
  /** Builds a backup file from a pre-upgrade safety copy, for export or re-import. */
  exportSafetyCopy(name: string): Promise<BackupFile>;
  deleteSafetyCopy(name: string): Promise<void>;
}
