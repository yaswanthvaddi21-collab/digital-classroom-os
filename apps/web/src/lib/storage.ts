import { ConflictError, IndexedDbAdapter, type ItemKind, type ItemSummary, type StorageAdapter, type WorkspaceItem } from '@dcos/local-storage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** The single storage adapter for this app instance. Native shells will inject a SQLite adapter here. */
export const storage: StorageAdapter = new IndexedDbAdapter();

const listeners = new Set<() => void>();
/** Tells every list view that stored items changed. */
export function notifyStorageChanged() {
  listeners.forEach((l) => l());
}

export function useItems(kind: ItemKind, opts: { trashed?: boolean } = {}) {
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const trashed = !!opts.trashed;
  const reload = useCallback(async () => {
    setItems(await storage.list(kind, { trashed }));
    setLoading(false);
  }, [kind, trashed]);
  useEffect(() => {
    reload();
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
  return { items, loading, reload };
}

let persistRequested = false;
/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  if (persistRequested) return false;
  persistRequested = true;
  return navigator.storage.persist();
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'missing';

const AUTOSAVE_DELAY_MS = 600;

/**
 * Loads one item and keeps it saved. Edits are debounced, written with optimistic concurrency, and flushed
 * when the page is hidden or the editor unmounts. A version conflict stops autosave until the user decides.
 */
export function useEditableItem<C>(kind: ItemKind, id: string) {
  const [item, setItem] = useState<WorkspaceItem<C> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [conflict, setConflict] = useState<WorkspaceItem<C> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const version = useRef(0);
  const pending = useRef<{ title?: string; content?: C } | null>(null);
  const lastSavedContent = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    storage.get<C>(kind, id).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setStatus('missing');
        return;
      }
      version.current = loaded.version;
      lastSavedContent.current = JSON.stringify(loaded.content);
      setItem(loaded);
      setStatus('saved');
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const flush = useCallback(
    async (opts: { snapshot?: boolean } = {}) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (inFlight.current) await inFlight.current;
      const patch = pending.current;
      if (blocked.current || (!patch && !opts.snapshot)) return;
      pending.current = null;
      setStatus('saving');
      const run = (async () => {
        try {
          const saved = await storage.save<C>(kind, id, patch ?? {}, version.current, opts);
          version.current = saved.version;
          if (patch?.content !== undefined) lastSavedContent.current = JSON.stringify(patch.content);
          setItem(saved);
          setStatus(pending.current ? 'pending' : 'saved');
          setLastError(null);
          if (patch?.title !== undefined) notifyStorageChanged();
        } catch (err) {
          if (err instanceof ConflictError) {
            blocked.current = true;
            // Keep the unsaved edits so the user can save them as a copy.
            pending.current = { ...patch, ...pending.current };
            setConflict(err.current as WorkspaceItem<C>);
            setStatus('conflict');
          } else {
            pending.current = { ...patch, ...pending.current };
            setLastError(err instanceof Error ? err.message : String(err));
            setStatus('error');
          }
        }
      })();
      inFlight.current = run;
      await run;
      inFlight.current = null;
    },
    [kind, id],
  );

  const schedule = useCallback(() => {
    if (blocked.current) return;
    setStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  const updateContent = useCallback(
    (content: C) => {
      const serialized = JSON.stringify(content);
      // Selection-only changes produce identical content; don't write those.
      if (serialized === lastSavedContent.current && pending.current?.content === undefined) return;
      pending.current = { ...pending.current, content };
      schedule();
    },
    [schedule],
  );

  const rename = useCallback(
    (title: string) => {
      pending.current = { ...pending.current, title };
      setItem((it) => (it ? { ...it, title } : it));
      schedule();
    },
    [schedule],
  );

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
        notifyStorageChanged();
      }
      pending.current = null;
      blocked.current = false;
      version.current = stored.version;
      lastSavedContent.current = JSON.stringify(stored.content);
      setConflict(null);
      setItem(stored);
      setStatus('saved');
      return copy;
    },
    [conflict, item, kind],
  );

  // Flush when the window is hidden (tab switch, app backgrounded on Android, window closed).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    const onUnload = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      void flush();
    };
  }, [flush]);

  return { item, status, conflict, lastError, updateContent, rename, saveNow: () => flush({ snapshot: true }), resolveConflict };
}
