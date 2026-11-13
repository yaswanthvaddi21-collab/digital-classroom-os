import {
  ConflictError,
  IndexedDbAdapter,
  type Draft,
  type ItemKind,
  type ItemSummary,
  type StorageAdapter,
  type WorkspaceItem,
} from '@dcos/local-storage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// ── Pending-edit registry: everything that must be saved before the page goes away ──────────────────

const flushers = new Set<() => Promise<void>>();
/** Saves every open editor's pending edits. Called before reloads, app updates and schema upgrades. */
export async function flushAll() {
  await Promise.allSettled(Array.from(flushers, (f) => f()));
}

// ── App-wide storage events (another tab upgrading the database, or blocking our upgrade) ───────────

type StorageEvents = { versionChange: boolean; blocked: boolean };
let events: StorageEvents = { versionChange: false, blocked: false };
const eventListeners = new Set<() => void>();
function setEvents(patch: Partial<StorageEvents>) {
  events = { ...events, ...patch };
  eventListeners.forEach((l) => l());
}
export const useStorageEvents = () =>
  useSyncExternalStore(
    (cb) => {
      eventListeners.add(cb);
      return () => eventListeners.delete(cb);
    },
    () => events,
  );

/** The single storage adapter for this app instance. Native shells will inject a SQLite adapter here. */
export const storage: StorageAdapter = new IndexedDbAdapter('digital-classroom-os', {
  onVersionChange: async () => {
    await flushAll();
    setEvents({ versionChange: true });
  },
  onBlocked: () => setEvents({ blocked: true }),
});

// ── Change notifications, within this tab and across tabs ────────────────────────────────────────────

export interface StorageChange {
  kind?: ItemKind;
  id?: string;
}
const listeners = new Set<(change: StorageChange) => void>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dcos-storage') : null;
channel?.addEventListener('message', (e: MessageEvent<StorageChange>) => listeners.forEach((l) => l(e.data ?? {})));

/** Tells list views and open editors, in this tab and other tabs, that stored items changed. */
export function notifyStorageChanged(change: StorageChange = {}) {
  listeners.forEach((l) => l(change));
  channel?.postMessage(change);
}

function useStorageChanges(onChange: (change: StorageChange) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const l = (c: StorageChange) => ref.current(c);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** Items of one kind, or of every kind when `kind` is omitted. */
export function useItems(kind?: ItemKind, opts: { trashed?: boolean } = {}) {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trashed = !!opts.trashed;
  const reload = useCallback(async () => {
    try {
      setItems(kind ? await storage.list(kind, { trashed }) : await storage.listAll({ trashed }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [kind, trashed]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useStorageChanges(() => void reload());
  return { items, loading, error, reload };
}

// ── Persistent storage and backup status (audit H-1 / STOR-4) ────────────────────────────────────────

export type PersistState = 'unsupported' | 'persisted' | 'not-persisted';

/** Asks the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  if (await navigator.storage.persisted()) return 'persisted';
  return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted';
}

export async function persistState(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted';
}

const BACKUP_KEY = 'lastBackupAt';
export async function recordBackup() {
  await storage.setMeta(BACKUP_KEY, new Date().toISOString());
  notifyStorageChanged();
}

/** Persistence and last-backup state for banners and Settings; refreshes after storage changes. */
export function useDataSafety() {
  const [state, setState] = useState<{ persist: PersistState; lastBackupAt: string | null; itemCount: number } | null>(null);
  const refresh = useCallback(async () => {
    const [persist, lastBackupAt, items] = await Promise.all([persistState(), storage.getMeta(BACKUP_KEY), storage.listAll()]);
    setState({ persist, lastBackupAt: lastBackupAt ?? null, itemCount: items.length });
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useStorageChanges(() => void refresh());
  return { ...state, refresh };
}

/** At startup: if this device already holds work, ask for persistent storage straight away. */
export async function protectExistingData() {
  try {
    if ((await storage.listAll()).length > 0) await requestPersistentStorage();
  } catch {
    // Storage unavailable: the UI reports that separately.
  }
}

// ── Online status ────────────────────────────────────────────────────────────────────────────────────

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

// ── Editing one item ─────────────────────────────────────────────────────────────────────────────────

export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'missing' | 'load-error';

export const AUTOSAVE_DELAY_MS = 600;
const RETRY_DELAYS_MS = [1000, 3000, 10_000];

interface Pending<C> {
  title?: string;
  content?: C;
}

/**
 * Loads one item and keeps it saved.
 * - Edits are debounced and written one at a time through a queue, with optimistic concurrency.
 * - A version conflict stops autosave until the user decides; failed writes retry with backoff.
 * - Edits that cannot be written (conflict, repeated errors, page closing) are kept as a recovery draft.
 * - The title shown while typing is local state, so saves never overwrite what the user is typing.
 */
export function useEditableItem<C>(kind: ItemKind, id: string) {
  const [item, setItem] = useState<WorkspaceItem<C> | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [conflict, setConflict] = useState<WorkspaceItem<C> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft<C> | null>(null);
  /** Bumped when the stored item changed underneath an idle editor (another tab), so the page remounts it. */
  const [externalRevision, setExternalRevision] = useState(0);

  const version = useRef(0);
  const pending = useRef<Pending<C> | null>(null);
  const lastSavedContent = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);
  const attempts = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const load = useCallback(async () => {
    try {
      const loaded = await storage.get<C>(kind, id);
      if (!loaded) {
        setStatus('missing');
        return;
      }
      version.current = loaded.version;
      lastSavedContent.current = JSON.stringify(loaded.content);
      setItem(loaded);
      setTitle(loaded.title);
      setStatus('saved');
      const existing = await storage.getDraft<C>(kind, id);
      const differs =
        existing &&
        ((existing.content !== undefined && JSON.stringify(existing.content) !== lastSavedContent.current) ||
          (existing.title !== undefined && existing.title !== loaded.title));
      if (differs) setDraft(existing);
      else if (existing) await storage.deleteDraft(kind, id);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      setStatus('load-error');
    }
  }, [kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Keeps edits that could not be written so they can be recovered next time the item is opened. */
  const keepAsDraft = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    try {
      await storage.saveDraft<C>({ kind, itemId: id, baseVersion: version.current, ...p });
    } catch {
      // Nothing more we can do; the error state is already visible.
    }
  }, [kind, id]);

  /** Writes pending edits. Runs strictly one at a time; reads the version only when its turn comes. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const run = async () => {
      const patch = pending.current;
      if (!patch) return;
      if (blocked.current) {
        await keepAsDraft();
        return;
      }
      pending.current = null;
      setStatus('saving');
      try {
        const saved = await storage.save<C>(kind, id, patch, version.current);
        version.current = saved.version;
        attempts.current = 0;
        if (patch.content !== undefined) lastSavedContent.current = JSON.stringify(patch.content);
        setItem(saved);
        setLastError(null);
        setStatus(pending.current ? 'pending' : 'saved');
        if (patch.title !== undefined) notifyStorageChanged({ kind, id });
        else channel?.postMessage({ kind, id });
      } catch (err) {
        // Put the edits back, merged under anything typed while this save was in flight.
        const since = pending.current as Pending<C> | null;
        pending.current = { ...patch, ...since };
        if (err instanceof ConflictError) {
          blocked.current = true;
          setConflict(err.current as WorkspaceItem<C>);
          setStatus('conflict');
          await keepAsDraft();
          return;
        }
        setLastError(err instanceof Error ? err.message : String(err));
        setStatus('error');
        const delay = RETRY_DELAYS_MS[attempts.current++];
        if (delay !== undefined) timer.current = setTimeout(() => void flush(), delay);
        else await keepAsDraft();
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, [kind, id, keepAsDraft]);

  const schedule = useCallback(() => {
    if (blocked.current) return;
    setStatus('pending');
    attempts.current = 0;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  const updateContent = useCallback(
    (content: C) => {
      const serialized = JSON.stringify(content);
      // Selection-only changes produce identical content; don't write those.
      if (serialized === lastSavedContent.current && pending.current?.content === undefined) return;
      pending.current = { ...pending.current, content };
      if (blocked.current) {
        void keepAsDraft();
        return;
      }
      schedule();
    },
    [schedule, keepAsDraft],
  );

  const rename = useCallback(
    (next: string) => {
      setTitle(next);
      pending.current = { ...pending.current, title: next };
      if (blocked.current) {
        void keepAsDraft();
        return;
      }
      schedule();
    },
    [schedule, keepAsDraft],
  );

  /** On blur: show the title as stored (trimmed, 'Untitled' when empty) once nothing newer is pending. */
  const commitTitle = useCallback(async () => {
    await flush();
    if (pending.current?.title === undefined) {
      const stored = await storage.get(kind, id);
      if (stored) setTitle(stored.title);
    }
  }, [flush, kind, id]);

  /** Ctrl/⌘+S: write pending edits, then record a version if anything changed since the last one. */
  const saveNow = useCallback(async () => {
    await flush();
    if (blocked.current || statusRef.current === 'error') return false;
    const created = await storage.snapshot(kind, id);
    if (created) notifyStorageChanged({ kind, id });
    return created;
  }, [flush, kind, id]);

  /** Conflict resolution: either keep the edits as a new copy, or discard them and load the stored version. */
  const resolveConflict = useCallback(
    async (choice: 'save-copy' | 'load-latest') => {
      const stored = conflict;
      if (!stored) return null;
      let copy: WorkspaceItem<C> | null = null;
      if (choice === 'save-copy' && pending.current) {
        copy = await storage.create<C>(kind, {
          title: `${pending.current.title ?? item?.title ?? 'Untitled'} (my copy)`,
          content: (pending.current.content ?? item?.content) as C,
        });
        notifyStorageChanged({ kind, id: copy.id });
      }
      pending.current = null;
      blocked.current = false;
      version.current = stored.version;
      lastSavedContent.current = JSON.stringify(stored.content);
      await storage.deleteDraft(kind, id);
      setConflict(null);
      setItem(stored);
      setTitle(stored.title);
      setStatus('saved');
      return copy;
    },
    [conflict, item, kind, id],
  );

  /**
   * Recovery of edits kept from an earlier session. If nothing changed since they were made they are applied
   * to the item; otherwise they become a separate copy, so neither version is lost.
   */
  const recoverDraft = useCallback(async (): Promise<{ appliedTo: 'item' | 'copy'; id: string } | null> => {
    if (!draft) return null;
    const current = await storage.get<C>(kind, id);
    if (!current) return null;
    let result: { appliedTo: 'item' | 'copy'; id: string };
    if (current.version === draft.baseVersion) {
      const saved = await storage.save<C>(kind, id, { title: draft.title, content: draft.content }, current.version);
      version.current = saved.version;
      lastSavedContent.current = JSON.stringify(saved.content);
      setItem(saved);
      setTitle(saved.title);
      result = { appliedTo: 'item', id };
    } else {
      const copy = await storage.create<C>(kind, {
        title: `${draft.title ?? current.title} (recovered)`,
        content: (draft.content ?? current.content) as C,
      });
      result = { appliedTo: 'copy', id: copy.id };
    }
    await storage.deleteDraft(kind, id);
    setDraft(null);
    notifyStorageChanged({ kind, id });
    return result;
  }, [draft, kind, id]);

  const discardDraft = useCallback(async () => {
    await storage.deleteDraft(kind, id);
    setDraft(null);
  }, [kind, id]);

  // Another tab changed this item: if we have nothing unsaved, adopt its version silently.
  useStorageChanges((change) => {
    if (change.id !== id || change.kind !== kind) return;
    if (pending.current || blocked.current || statusRef.current !== 'saved') return;
    void storage.get<C>(kind, id).then((latest) => {
      if (!latest || latest.version <= version.current || pending.current) return;
      version.current = latest.version;
      lastSavedContent.current = JSON.stringify(latest.content);
      setItem(latest);
      setTitle(latest.title);
      setExternalRevision((r) => r + 1);
    });
  });

  // Save when the window is hidden (tab switch, app backgrounded on Android, window closed),
  // and warn before leaving while anything is unsaved.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    const onPageHide = () => {
      void flush();
      if (pending.current) void keepAsDraft();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || ['pending', 'saving', 'error', 'conflict'].includes(statusRef.current)) {
        void flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    flushers.add(flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushers.delete(flush);
      if (timer.current) clearTimeout(timer.current);
      void flush().then(() => {
        if (pending.current) void keepAsDraft();
      });
    };
  }, [flush, keepAsDraft]);

  return {
    item,
    title,
    status,
    conflict,
    lastError,
    draft,
    externalRevision,
    updateContent,
    rename,
    commitTitle,
    flush,
    saveNow,
    resolveConflict,
    recoverDraft,
    discardDraft,
  };
}
