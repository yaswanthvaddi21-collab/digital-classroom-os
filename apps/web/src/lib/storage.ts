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

/**
 * Where an editor's edits stand after a flush: all written ('saved'), some not written but kept as a draft
 * that is offered the next time the item is opened ('kept'), or some not even kept ('failed').
 */
export type FlushOutcome = 'saved' | 'kept' | 'failed';
const worst = (outcomes: FlushOutcome[]): FlushOutcome =>
  outcomes.includes('failed') ? 'failed' : outcomes.includes('kept') ? 'kept' : 'saved';

interface OpenEditor {
  /** Writes pending edits, keeping as a draft whatever could not be written. */
  secure: () => Promise<FlushOutcome>;
  /** The database is closing: stop writing to it and keep unsaved edits without it, synchronously. */
  freeze: () => FlushOutcome;
}
const editors = new Set<OpenEditor>();

/** Saves every open editor's pending edits. Called before reloads, app updates and schema upgrades. */
export async function flushAll(): Promise<FlushOutcome> {
  const results = await Promise.allSettled(Array.from(editors, (e) => e.secure()));
  return worst(results.map((r) => (r.status === 'fulfilled' ? r.value : 'failed')));
}

/** Set when another tab upgraded the database and this tab's connection was closed. Only a reload clears it. */
let databaseClosed = false;

// ── Emergency drafts: kept in localStorage when IndexedDB cannot take them ───────────────────────────

const EMERGENCY_PREFIX = 'dcos-emergency-draft:';
export const emergencyDraftKey = (kind: ItemKind, id: string) => `${EMERGENCY_PREFIX}${kind}:${id}`;
type EmergencyDraft<C> = Pick<Draft<C>, 'title' | 'content' | 'baseVersion' | 'savedAt'>;

function keepEmergencyDraft<C>(kind: ItemKind, id: string, draft: Omit<EmergencyDraft<C>, 'savedAt'>): boolean {
  try {
    localStorage.setItem(emergencyDraftKey(kind, id), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

function readEmergencyDraft<C>(kind: ItemKind, id: string): EmergencyDraft<C> | null {
  try {
    const raw = localStorage.getItem(emergencyDraftKey(kind, id));
    const parsed = raw ? (JSON.parse(raw) as EmergencyDraft<C>) : null;
    if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.baseVersion)) return null;
    return { ...parsed, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '' };
  } catch {
    return null;
  }
}

function removeEmergencyDraft(kind: ItemKind, id: string) {
  try {
    localStorage.removeItem(emergencyDraftKey(kind, id));
  } catch {
    // Nothing to clean up.
  }
}

// ── App-wide storage events (another tab upgrading the database, or blocking our upgrade) ───────────

/** `work`: after a version change, whether this tab's edits were all saved, kept as drafts, or not kept. */
type StorageEvents = { versionChange: boolean; blocked: boolean; work: FlushOutcome };
let events: StorageEvents = { versionChange: false, blocked: false, work: 'saved' };
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
    // The connection closes as soon as this returns. Anything still unsaved is kept outside IndexedDB.
    databaseClosed = true;
    setEvents({ versionChange: true, work: worst(Array.from(editors, (e) => e.freeze())) });
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

/** 'reload-required': another tab upgraded the database; this editor no longer writes and must be reloaded. */
export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'missing' | 'load-error' | 'reload-required';

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
 * - After another tab upgrades the database the editor stops writing ('reload-required') and keeps
 *   unsaved edits in localStorage; they are offered as a recovery draft after the reload.
 */
export function useEditableItem<C>(kind: ItemKind, id: string) {
  const [item, setItem] = useState<WorkspaceItem<C> | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [conflict, setConflict] = useState<WorkspaceItem<C> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft<C> | null>(null);
  const [reloadRequired, setReloadRequired] = useState(databaseClosed);
  /** Bumped when the stored item changed underneath an idle editor (another tab), so the page remounts it. */
  const [externalRevision, setExternalRevision] = useState(0);

  const version = useRef(0);
  const pending = useRef<Pending<C> | null>(null);
  const lastSavedContent = useRef<string>('');
  /** Serialized content of the save in flight, if it carries content: what storage will hold once it lands. */
  const writing = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(databaseClosed);
  const attempts = useRef(0);
  const holds = useRef(0);
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
      let existing = await storage.getDraft<C>(kind, id);
      // Edits kept in localStorage when the database was closed join the normal draft flow.
      const emergency = readEmergencyDraft<C>(kind, id);
      if (emergency) {
        if (!existing || emergency.savedAt >= existing.savedAt) {
          const { savedAt: _savedAt, ...kept } = emergency;
          try {
            await storage.saveDraft<C>({ ...kept, kind, itemId: id });
            existing = await storage.getDraft<C>(kind, id);
            removeEmergencyDraft(kind, id);
          } catch {
            existing = { ...emergency, key: `${kind}:${id}`, kind, itemId: id };
          }
        } else removeEmergencyDraft(kind, id);
      }
      const differs =
        existing &&
        ((existing.content !== undefined && JSON.stringify(existing.content) !== lastSavedContent.current) ||
          (existing.title !== undefined && existing.title !== loaded.title));
      if (differs) setDraft(existing ?? null);
      else if (existing) {
        await storage.deleteDraft(kind, id);
        removeEmergencyDraft(kind, id);
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      setStatus('load-error');
    }
  }, [kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Keeps edits that could not be written so they can be recovered next time the item is opened. Falls back
   * to localStorage when IndexedDB is closed or failing. Returns false only when the edits could not be kept.
   */
  const keepAsDraft = useCallback(async (): Promise<boolean> => {
    const p = pending.current;
    if (!p) return true;
    const kept = { baseVersion: version.current, ...p };
    if (!databaseClosed) {
      try {
        await storage.saveDraft<C>({ ...kept, kind, itemId: id });
        return true;
      } catch {
        // Fall back to localStorage below.
      }
    }
    const ok = keepEmergencyDraft(kind, id, kept);
    if (databaseClosed && events.versionChange) setEvents({ work: worst([events.work, ok ? 'kept' : 'failed']) });
    return ok;
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
      writing.current = patch.content !== undefined ? JSON.stringify(patch.content) : null;
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
        if (databaseClosed) {
          await keepAsDraft();
          return;
        }
        const delay = RETRY_DELAYS_MS[attempts.current++];
        if (delay !== undefined) timer.current = setTimeout(() => void flush(), delay);
        else await keepAsDraft();
      } finally {
        writing.current = null;
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, [kind, id, keepAsDraft]);

  /** Runs `task` in the save queue, after every write queued before it. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(task, task);
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

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
      // Selection-only changes produce identical content; don't write those. While a save is in flight,
      // compare with what it is writing, so undoing back to the last saved state still gets saved.
      if (serialized === (writing.current ?? lastSavedContent.current) && pending.current?.content === undefined) return;
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
    if (databaseClosed) return;
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
      if (!stored || databaseClosed) return null;
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
   * Recovery of edits kept from an earlier session. They are applied to the item only if nothing changed since
   * they were made: no newer save and nothing typed since. Otherwise they become a separate copy, so neither
   * version is lost. Runs in the save queue after anything already typed, and the state they replace is kept
   * as a version first.
   */
  const recoverDraft = useCallback(async (): Promise<{ appliedTo: 'item' | 'copy'; id: string } | null> => {
    if (!draft || databaseClosed) return null;
    void flush();
    const result = await enqueue(async (): Promise<{ appliedTo: 'item' | 'copy'; id: string } | null> => {
      const current = await storage.get<C>(kind, id);
      if (!current) return null;
      const untouched = current.version === draft.baseVersion && version.current === draft.baseVersion && !pending.current && !blocked.current;
      if (untouched) {
        await storage.snapshot(kind, id);
        const saved = await storage.save<C>(kind, id, { title: draft.title, content: draft.content }, current.version);
        // Anything typed during recovery stays on the old version, so it meets a conflict instead of replacing the draft.
        if (!pending.current) {
          version.current = saved.version;
          lastSavedContent.current = JSON.stringify(saved.content);
          setItem(saved);
          setTitle(saved.title);
        }
        return { appliedTo: 'item', id };
      }
      const copy = await storage.create<C>(kind, {
        title: `${draft.title ?? current.title} (recovered)`,
        content: (draft.content ?? current.content) as C,
      });
      return { appliedTo: 'copy', id: copy.id };
    });
    if (!result) return null;
    await storage.deleteDraft(kind, id);
    removeEmergencyDraft(kind, id);
    setDraft(null);
    notifyStorageChanged({ kind, id });
    return result;
  }, [draft, kind, id, flush, enqueue]);

  const discardDraft = useCallback(async () => {
    if (databaseClosed) return;
    await storage.deleteDraft(kind, id);
    removeEmergencyDraft(kind, id);
    setDraft(null);
  }, [kind, id]);

  /** Adopts a newer stored version when this editor has nothing unsaved and nothing holds external updates. */
  const adoptExternal = useCallback(() => {
    const idle = () => holds.current === 0 && !pending.current && !blocked.current && statusRef.current === 'saved';
    if (!idle()) return;
    void storage
      .get<C>(kind, id)
      .then((latest) => {
        if (!latest || latest.version <= version.current || !idle()) return;
        version.current = latest.version;
        lastSavedContent.current = JSON.stringify(latest.content);
        setItem(latest);
        setTitle(latest.title);
        setExternalRevision((r) => r + 1);
      })
      .catch(() => undefined);
  }, [kind, id]);

  // Another tab changed this item: if we have nothing unsaved, adopt its version silently.
  useStorageChanges((change) => {
    if (change.id === id && change.kind === kind) adoptExternal();
  });

  /**
   * Stops adopting other tabs' changes until the returned release is called (it is safe to call twice).
   * Edits made meanwhile save against the version held, so a change elsewhere surfaces as a normal conflict.
   * The last release adopts a newer stored version if the editor is idle by then.
   */
  const holdExternalUpdates = useCallback(() => {
    holds.current++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--holds.current === 0) adoptExternal();
    };
  }, [adoptExternal]);

  // Save when the window is hidden (tab switch, app backgrounded on Android, window closed),
  // and warn before leaving while anything is unsaved.
  useEffect(() => {
    const keepNow = () => !pending.current || keepEmergencyDraft(kind, id, { baseVersion: version.current, ...pending.current });
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    const onPageHide = () => {
      void flush();
      if (pending.current) void keepAsDraft();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (databaseClosed) {
        if (!keepNow()) {
          e.preventDefault();
          e.returnValue = '';
        }
        return;
      }
      if (pending.current || ['pending', 'saving', 'error', 'conflict'].includes(statusRef.current)) {
        void flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const editor: OpenEditor = {
      secure: async () => {
        await flush();
        if (!pending.current) return 'saved';
        return (await keepAsDraft()) ? 'kept' : 'failed';
      },
      freeze: () => {
        blocked.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setReloadRequired(true);
        if (!pending.current) return 'saved';
        return keepNow() ? 'kept' : 'failed';
      },
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    editors.add(editor);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      editors.delete(editor);
      if (timer.current) clearTimeout(timer.current);
      void flush().then(() => {
        if (pending.current) void keepAsDraft();
      });
    };
  }, [flush, keepAsDraft, kind, id]);

  return {
    item,
    title,
    status: reloadRequired ? ('reload-required' as const) : status,
    reloadRequired,
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
    holdExternalUpdates,
  };
}
