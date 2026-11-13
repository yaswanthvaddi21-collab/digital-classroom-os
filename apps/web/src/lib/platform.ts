import { IndexedDbAdapter, type IndexedDbAdapterOptions, type StorageAdapter } from '@dcos/local-storage';

/** Name of the app's database on the web. Frozen since v0.1.0. */
export const DATABASE_NAME = 'digital-classroom-os';

/** What the app hands any storage adapter: platform-neutral hooks, which an adapter may use or ignore. */
export type StorageHooks = Pick<IndexedDbAdapterOptions, 'onVersionChange' | 'onBlocked' | 'extraReferences'>;

/** Builds the app's one storage adapter. */
export type StorageFactory = (hooks: StorageHooks) => StorageAdapter;

/** The web default: IndexedDB in this browser. */
export const defaultStorageFactory: StorageFactory = (hooks) => new IndexedDbAdapter(DATABASE_NAME, hooks);

let factory: StorageFactory = defaultStorageFactory;
let created = false;

/**
 * Lets a native shell (Tauri, Capacitor) provide its own adapter, for example one backed by SQLite. It must be
 * called before the app's storage module is first imported; once the adapter exists, replacing the factory would
 * leave two adapters on the same data, so it throws instead.
 */
export function setStorageFactory(next: StorageFactory) {
  if (created) throw new Error('Storage is already in use. Call setStorageFactory() before the app loads.');
  factory = next;
}

/** Called once, by lib/storage.ts, to create the app's adapter. */
export function createStorage(hooks: StorageHooks): StorageAdapter {
  created = true;
  return factory(hooks);
}
