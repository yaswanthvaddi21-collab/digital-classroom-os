/** Kinds of workspace items persisted by the local store. Each kind has its own store and version store. */
export type ItemKind = 'document' | 'diagram';

export interface WorkspaceItem<C = unknown> {
  id: string;
  kind: ItemKind;
  title: string;
  content: C;
  /** Incremented on every successful save. Used for optimistic concurrency. */
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete marker. Items with a value here are in the trash. */
  deletedAt: string | null;
  /** Device that created the item. Ownership for future sharing / sync. */
  ownerDeviceId: string;
  favorite: boolean;
  templateId: string | null;
  /** Timestamp of the most recent version snapshot. */
  lastSnapshotAt: string | null;
}

export type ItemSummary = Omit<WorkspaceItem, 'content'> & { sizeBytes: number };

export interface ItemVersion<C = unknown> {
  id: string;
  itemId: string;
  kind: ItemKind;
  version: number;
  title: string;
  content: C;
  createdAt: string;
  reason: 'manual' | 'auto' | 'restore' | 'create';
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
  favorite?: boolean;
}

export interface SaveOptions {
  /** Force a version snapshot (e.g. explicit Cmd+S). Otherwise snapshots are time-based. */
  snapshot?: boolean;
}

export interface BackupFile {
  format: 'dcos-backup';
  schemaVersion: number;
  exportedAt: string;
  deviceId: string;
  items: WorkspaceItem[];
  versions: ItemVersion[];
}

export interface ImportReport {
  added: number;
  /** Items that already existed unchanged. */
  skipped: number;
  /** Items that differed from the local copy: imported as new copies, never overwriting. */
  copied: number;
  versionsAdded: number;
}

export interface StorageInfo {
  deviceId: string;
  schemaVersion: number;
  backend: string;
}

/**
 * Platform-neutral persistence contract. The web app uses IndexedDB; Tauri and Capacitor builds will
 * provide SQLite-backed implementations of the same interface (see docs/DATABASE.md).
 */
export interface StorageAdapter {
  info(): Promise<StorageInfo>;
  list(kind: ItemKind, opts?: { trashed?: boolean }): Promise<ItemSummary[]>;
  get<C = unknown>(kind: ItemKind, id: string): Promise<WorkspaceItem<C> | undefined>;
  create<C = unknown>(kind: ItemKind, input: CreateItemInput<C>): Promise<WorkspaceItem<C>>;
  /** Throws ConflictError when expectedVersion is not the stored version. Never overwrites silently. */
  save<C = unknown>(kind: ItemKind, id: string, patch: SavePatch<C>, expectedVersion: number, opts?: SaveOptions): Promise<WorkspaceItem<C>>;
  duplicate(kind: ItemKind, id: string): Promise<WorkspaceItem>;
  trash(kind: ItemKind, id: string): Promise<void>;
  restore(kind: ItemKind, id: string): Promise<void>;
  /** Permanently removes an item and its versions. */
  purge(kind: ItemKind, id: string): Promise<void>;
  listVersions(kind: ItemKind, id: string): Promise<ItemVersionSummary[]>;
  restoreVersion(kind: ItemKind, id: string, versionId: string): Promise<WorkspaceItem>;
  exportBackup(): Promise<BackupFile>;
  importBackup(file: unknown): Promise<ImportReport>;
}
