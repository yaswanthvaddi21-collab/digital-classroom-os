import {
  ConflictError,
  IndexedDbAdapter,
  ITEM_KINDS,
  isNotFoundError,
  isQuotaError,
  uuid,
  type CleanUpReport,
  type Draft,
  type ItemKind,
  type ItemSummary,
  type StorageAdapter,
  type UpgradeRecovery,
  type UpgradeStatus,
  type WorkspaceItem,
} from '@dcos/local-storage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createStorage } from './platform';

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
/**
 * Edits larger than this (in characters) are not copied to localStorage when the page is hidden or closed: browsers
 * give a site about 5 MB there. The copy in the database is still attempted.
 */
export const EMERGENCY_DRAFT_MAX_CHARS = 2 * 1024 * 1024;
/** `session`: the editor session that kept it (absent on drafts kept before sessions existed). */
type EmergencyDraft<C> = Pick<Draft<C>, 'title' | 'content' | 'baseVersion' | 'savedAt'> & { session?: string };

/** Writes an emergency draft synchronously. Returns the text written, or null when it was too large or failed. */
function writeEmergencyDraft<C>(kind: ItemKind, id: string, draft: Omit<EmergencyDraft<C>, 'savedAt'>, maxChars = Infinity): string | null {
  try {
    const raw = JSON.stringify({ ...draft, savedAt: new Date().toISOString() });
    if (raw.length > maxChars) return null;
    localStorage.setItem(emergencyDraftKey(kind, id), raw);
    return raw;
  } catch {
    return null;
  }
}

function parseEmergencyDraft<C>(raw: string | null): EmergencyDraft<C> | null {
  try {
    const parsed = raw ? (JSON.parse(raw) as EmergencyDraft<C>) : null;
    if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.baseVersion)) return null;
    return {
      ...parsed,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      session: typeof parsed.session === 'string' ? parsed.session : undefined,
    };
  } catch {
    return null;
  }
}

function readEmergencyDraft<C>(kind: ItemKind, id: string): EmergencyDraft<C> | null {
  try {
    return parseEmergencyDraft<C>(localStorage.getItem(emergencyDraftKey(kind, id)));
  } catch {
    return null;
  }
}

/** Removes the item's emergency draft; with `onlyIf`, only while it still holds exactly that text. */
function removeEmergencyDraft(kind: ItemKind, id: string, onlyIf?: string) {
  try {
    const key = emergencyDraftKey(kind, id);
    if (onlyIf === undefined || localStorage.getItem(key) === onlyIf) localStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}

/** Every emergency draft on this device, as stored text, with the item it belongs to. */
function emergencyDraftEntries(strict = false): Array<{ kind: ItemKind; itemId: string; raw: string }> {
  const found: Array<{ kind: ItemKind; itemId: string; raw: string }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(EMERGENCY_PREFIX)) continue;
      const rest = key.slice(EMERGENCY_PREFIX.length);
      const colon = rest.indexOf(':');
      const kind = rest.slice(0, colon) as ItemKind;
      if (colon < 1 || !ITEM_KINDS.includes(kind)) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) found.push({ kind, itemId: rest.slice(colon + 1), raw });
    }
  } catch (err) {
    // Unreadable localStorage: for listing, there are none. For clean-up (strict) an unknown set of references must
    // stop it, so nothing an emergency draft still uses can be removed.
    if (strict) throw err;
  }
  return found;
}

/** Attachment references held in emergency drafts, which the database cannot see (used by attachment clean-up). */
export function emergencyDraftTexts(): string[] {
  return emergencyDraftEntries(true).map((e) => e.raw);
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

/**
 * The single storage adapter for this app instance. It comes from the platform's storage factory (IndexedDB on the
 * web); native shells replace the factory before the app loads (see platform.ts).
 */
export const storage: StorageAdapter = createStorage({
  onVersionChange: async () => {
    await flushAll();
    // The connection closes as soon as this returns. Anything still unsaved is kept outside IndexedDB.
    databaseClosed = true;
    setEvents({ versionChange: true, work: worst(Array.from(editors, (e) => e.freeze())) });
  },
  onBlocked: () => setEvents({ blocked: true }),
  // Emergency drafts live in localStorage; images they use must not be cleaned up.
  extraReferences: emergencyDraftTexts,
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

/** Calls `onChange` whenever stored items change, in this tab or another one. */
export function useStorageChanges(onChange: (change: StorageChange) => void) {
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

// ── Permanent deletion and attachment clean-up ───────────────────────────────────────────────────────

const CLEAN_UP_META_KEY = 'lastAttachmentCleanUpAt';
/** Unused attachments are looked for at most once a day on start-up. */
export const CLEAN_UP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Removes stored images nothing uses any more (the adapter keeps anything used in the last day) and records when. */
export async function cleanUpAttachments(): Promise<CleanUpReport> {
  const report = await storage.cleanUpAttachments();
  try {
    await storage.setMeta(CLEAN_UP_META_KEY, new Date().toISOString());
  } catch {
    // Only the time of the last run is lost; the next start-up runs it again.
  }
  return report;
}

/** Runs the clean-up unless it already ran in the last day. Returns null when it did not run. */
export async function runDailyCleanUp(now = Date.now()): Promise<CleanUpReport | null> {
  if (databaseClosed) return null;
  const last = Date.parse((await storage.getMeta(CLEAN_UP_META_KEY)) ?? '');
  if (Number.isFinite(last) && last <= now && now - last < CLEAN_UP_INTERVAL_MS) return null;
  return cleanUpAttachments();
}

/** After start-up, once the page is idle, runs the daily clean-up. Returns a function that cancels it. */
export function scheduleDailyCleanUp(delayMs = 20_000): () => void {
  let idle: number | undefined;
  const run = () => void runDailyCleanUp().catch(() => undefined);
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run, { timeout: 60_000 });
    else run();
  }, delayMs);
  return () => {
    clearTimeout(timer);
    if (idle !== undefined) cancelIdleCallback(idle);
  };
}

/**
 * Permanently deletes items, all together or none (Empty trash), with their versions and drafts, tells every view,
 * then frees images only they used. The clean-up runs in the background; its failure changes nothing.
 */
export async function purgeItems(items: ReadonlyArray<{ kind: ItemKind; id: string }>): Promise<void> {
  await storage.purgeMany(items.map(({ kind, id }) => ({ kind, id })));
  for (const { kind, id } of items) removeEmergencyDraft(kind, id);
  notifyStorageChanged();
  void cleanUpAttachments().catch(() => undefined);
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
    try {
      const [persist, lastBackupAt, items] = await Promise.all([persistState(), storage.getMeta(BACKUP_KEY), storage.listAll()]);
      setState({ persist, lastBackupAt: lastBackupAt ?? null, itemCount: items.length });
    } catch {
      // Storage unavailable: pages that need it report that themselves.
    }
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

// ── Upgrade recovery: the safety copy before a database upgrade could not be made (audit STOR-R5) ────

/** The recovery actions of the storage adapter, when it has them (the IndexedDB adapter does). */
export const upgradeRecovery: UpgradeRecovery | null = storage instanceof IndexedDbAdapter ? storage : null;

// "Open in another tab" describes one attempt only: each new attempt, and success, starts without it.
upgradeRecovery?.subscribeUpgradeStatus(() => {
  const { state } = upgradeRecovery.upgradeStatus();
  if (events.blocked && (state === 'checking' || state === 'ready')) setEvents({ blocked: false });
});

const NO_UPGRADE: UpgradeStatus = { state: 'ready' };

/** Where opening the database stands; 'needs-backup' means the update is waiting for the user. */
export function useUpgradeStatus(recovery: UpgradeRecovery | null = upgradeRecovery): UpgradeStatus {
  return useSyncExternalStore(
    useCallback((cb: () => void) => recovery?.subscribeUpgradeStatus(cb) ?? (() => undefined), [recovery]),
    () => recovery?.upgradeStatus() ?? NO_UPGRADE,
  );
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

// ── Unsaved drafts on this device (Settings → Storage) ───────────────────────────────────────────────

/** A draft kept on this device, in the database or (when that failed) in localStorage, with the item it belongs to. */
export interface UnsavedDraft {
  /** Unique among the listed drafts. */
  key: string;
  kind: ItemKind;
  itemId: string;
  /** Editor session that kept it ('' for drafts from before sessions); null when it is kept in localStorage. */
  session: string | null;
  title?: string;
  content?: unknown;
  savedAt: string;
  /** The item it belongs to, or null when that item no longer exists (it was permanently deleted). */
  item: { title: string; content: unknown; deletedAt: string | null } | null;
}

/** Every unsaved draft on this device, newest first, including drafts of items that no longer exist. */
export async function listUnsavedDrafts(): Promise<UnsavedDraft[]> {
  const rows: Array<Omit<UnsavedDraft, 'item'>> = [];
  if (!databaseClosed) {
    for (const d of await storage.listDrafts()) {
      rows.push({ key: `db:${d.key}`, kind: d.kind, itemId: d.itemId, session: d.session ?? '', title: d.title, content: d.content, savedAt: d.savedAt });
    }
  }
  const same = (a: { title?: string; content?: unknown }, b: { title?: string; content?: unknown }) =>
    a.title === b.title && JSON.stringify(a.content) === JSON.stringify(b.content);
  for (const e of emergencyDraftEntries()) {
    const d = parseEmergencyDraft(e.raw);
    if (d && rows.some((r) => r.kind === e.kind && r.itemId === e.itemId && same(r, d))) continue;
    if (d) rows.push({ key: `local:${e.kind}:${e.itemId}`, kind: e.kind, itemId: e.itemId, session: null, title: d.title, content: d.content, savedAt: d.savedAt });
  }
  const items = new Map<string, UnsavedDraft['item']>();
  for (const r of rows) {
    const ref = `${r.kind}:${r.itemId}`;
    if (items.has(ref)) continue;
    const item = databaseClosed ? undefined : await storage.get(r.kind, r.itemId);
    items.set(ref, item ? { title: item.title, content: item.content, deletedAt: item.deletedAt } : null);
  }
  return rows
    .map((r) => ({ ...r, item: items.get(`${r.kind}:${r.itemId}`) ?? null }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.key.localeCompare(b.key));
}

/** Deletes one unsaved draft. */
export async function discardUnsavedDraft(draft: UnsavedDraft): Promise<void> {
  if (draft.session === null) removeEmergencyDraft(draft.kind, draft.itemId);
  else await storage.deleteDraft(draft.kind, draft.itemId, draft.session);
  notifyStorageChanged();
}

/** Whether a draft can become a new item: it holds content, or its item still exists to take the content from. */
export const canSaveDraftAsNew = (draft: UnsavedDraft) => draft.content !== undefined || draft.item !== null;

/** Saves an unsaved draft as a new item (its own title, marked recovered), then removes the draft. */
export async function saveUnsavedDraftAsNew(draft: UnsavedDraft): Promise<WorkspaceItem> {
  const content = draft.content !== undefined ? draft.content : draft.item?.content;
  if (content === undefined) throw new Error('This draft holds only a title, so there is nothing to save as a new item.');
  const copy = await storage.create(draft.kind, { title: `${draft.title ?? draft.item?.title ?? 'Untitled'} (recovered)`, content });
  await discardUnsavedDraft(draft);
  notifyStorageChanged({ kind: draft.kind, id: copy.id });
  return copy;
}

// ── Editing one item ─────────────────────────────────────────────────────────────────────────────────

/**
 * - 'error': the last save failed and another attempt is scheduled.
 * - 'not-saved': saving stopped (storage full, or repeated failures); see `problem`. Edits are kept as a draft when possible.
 * - 'deleted': the item was permanently deleted elsewhere; edits are kept and can be saved as a new item.
 * - 'reload-required': another tab upgraded the database; this editor no longer writes and must be reloaded.
 */
export type SaveStatus =
  | 'loading'
  | 'saved'
  | 'pending'
  | 'saving'
  | 'error'
  | 'not-saved'
  | 'deleted'
  | 'conflict'
  | 'missing'
  | 'load-error'
  | 'reload-required';

/** Why saving stopped: the device is out of space, the item was deleted elsewhere, or saves kept failing. */
export type SaveProblem = 'quota' | 'deleted' | 'failed';
/** Whether edits that could not be saved were kept on this device as a draft. */
export type KeptState = 'kept' | 'not-kept';

export const AUTOSAVE_DELAY_MS = 600;
const RETRY_DELAYS_MS = [1000, 3000, 10_000];
/** Storage full: one more attempt after this delay (space may be freed meanwhile), then saving stops. */
export const QUOTA_RETRY_DELAY_MS = 2000;

interface Pending<C> {
  title?: string;
  content?: C;
}

/** A draft offered for recovery. `fromEmergency`: it could only be read from localStorage, not moved into the database. */
type OfferedDraft<C> = Draft<C> & { fromEmergency?: boolean };

/**
 * Loads one item and keeps it saved.
 * - Edits are debounced and written one at a time through a queue, with optimistic concurrency.
 * - A version conflict stops autosave until the user decides; other failed writes retry with backoff, a full disk
 *   once. When saving stops, `problem` says why and `kept` whether the edits were kept as a draft.
 * - Each editor instance is its own draft session: its drafts never replace another session's. Drafts from other
 *   sessions are offered one at a time, newest first.
 * - The title shown while typing is local state, so saves never overwrite what the user is typing.
 * - After another tab upgrades the database the editor stops writing ('reload-required') and keeps
 *   unsaved edits in localStorage; they are offered as a recovery draft after the reload.
 * - Moving the item to the trash in another tab shows here; deleting it permanently there stops saving ('deleted').
 */
export function useEditableItem<C>(kind: ItemKind, id: string) {
  const [item, setItem] = useState<WorkspaceItem<C> | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [conflict, setConflict] = useState<WorkspaceItem<C> | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<OfferedDraft<C>[]>([]);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [kept, setKept] = useState<KeptState | null>(null);
  const [reloadRequired, setReloadRequired] = useState(databaseClosed);
  /** Bumped when the stored item changed underneath an idle editor (another tab), so the page remounts it. */
  const [externalRevision, setExternalRevision] = useState(0);
  /** This editor's draft session. */
  const [session] = useState(uuid);

  const version = useRef(0);
  const itemRef = useRef<WorkspaceItem<C> | null>(null);
  itemRef.current = item;
  const loaded = useRef(false);
  const pending = useRef<Pending<C> | null>(null);
  /** The edits of the save in flight, until it lands or fails. */
  const inFlight = useRef<Pending<C> | null>(null);
  const lastSavedContent = useRef<string>('');
  /** Serialized content of the save in flight, if it carries content: what storage will hold once it lands. */
  const writing = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(databaseClosed);
  const attempts = useRef(0);
  const quotaRetried = useRef(false);
  const holds = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  /** Set once this session kept a draft (database or localStorage), so a later complete save can remove it. */
  const keptDraft = useRef(false);
  /** The text of this session's last emergency draft, so only that one is removed (another tab may share the key). */
  const emergencyWritten = useRef<string | null>(null);
  /** Set when the editor unmounts: a failed final save is kept as a draft instead of being retried later. */
  const disposed = useRef(false);

  const load = useCallback(async () => {
    try {
      const stored = await storage.get<C>(kind, id);
      if (!stored) {
        setStatus('missing');
        return;
      }
      version.current = stored.version;
      lastSavedContent.current = JSON.stringify(stored.content);
      setItem(stored);
      setTitle(stored.title);
      setStatus('saved');
      loaded.current = true;
      const same = (d: Pending<C>) =>
        (d.content === undefined || JSON.stringify(d.content) === lastSavedContent.current) && (d.title === undefined || d.title === stored.title);
      // Drafts that cannot be read now stay stored (Settings → Storage lists them); the item still opens.
      let offered: OfferedDraft<C>[] = await storage.listDrafts<C>({ kind, itemId: id }).catch(() => []);
      // Edits kept in localStorage (database closed, or failing) join the normal draft flow.
      const emergency = readEmergencyDraft<C>(kind, id);
      if (emergency) {
        const { savedAt, session: from = '', ...rest } = emergency;
        const sameSession = offered.find((d) => d.session === from);
        if (same(emergency) || (sameSession && sameSession.savedAt > savedAt)) removeEmergencyDraft(kind, id);
        else {
          try {
            await storage.saveDraft<C>({ ...rest, kind, itemId: id, session: from });
            removeEmergencyDraft(kind, id);
            offered = await storage.listDrafts<C>({ kind, itemId: id }).catch(() => offered);
          } catch {
            const fallback: OfferedDraft<C> = { ...emergency, key: emergencyDraftKey(kind, id), kind, itemId: id, session: from, fromEmergency: true };
            offered = [fallback, ...offered.filter((d) => d.session !== from)].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
          }
        }
      }
      // Drafts that hold nothing beyond what is stored are removed without asking.
      const differing: OfferedDraft<C>[] = [];
      for (const d of offered) {
        if (!same(d)) differing.push(d);
        else if (d.fromEmergency) removeEmergencyDraft(kind, id);
        else await storage.deleteDraft(kind, id, d.session).catch(() => undefined);
      }
      setDrafts(differing);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      setStatus('load-error');
    }
  }, [kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Keeps this session's unsaved edits in localStorage, synchronously. Returns false when they could not be kept. */
  const keepEmergency = useCallback(
    (maxChars?: number): boolean => {
      if (!pending.current && !inFlight.current) return true;
      // Include a save still in flight: if the page goes away before it lands, it is not lost.
      const edits = { ...inFlight.current, ...pending.current };
      const raw = writeEmergencyDraft(kind, id, { baseVersion: version.current, session, ...edits }, maxChars);
      if (raw === null) return false;
      emergencyWritten.current = raw;
      keptDraft.current = true;
      return true;
    },
    [kind, id, session],
  );

  /**
   * Keeps edits that could not be written so they can be recovered next time the item is opened. Falls back
   * to localStorage when IndexedDB is closed or failing. Returns false only when the edits could not be kept,
   * and says so through `kept`.
   */
  const keepAsDraft = useCallback(async (): Promise<boolean> => {
    const p = pending.current;
    if (!p) return true;
    let ok = false;
    if (!databaseClosed) {
      try {
        await storage.saveDraft<C>({ baseVersion: version.current, ...p, kind, itemId: id, session });
        keptDraft.current = true;
        ok = true;
      } catch {
        // Fall back to localStorage below.
      }
    }
    if (!ok) ok = keepEmergency();
    if (databaseClosed && events.versionChange) setEvents({ work: worst([events.work, ok ? 'kept' : 'failed']) });
    setKept(ok ? 'kept' : 'not-kept');
    return ok;
  }, [kind, id, session, keepEmergency]);

  /** Everything is saved: drop the drafts this session kept along the way. */
  const settle = useCallback(async () => {
    setProblem(null);
    setKept(null);
    if (!keptDraft.current) return;
    keptDraft.current = false;
    if (emergencyWritten.current !== null) removeEmergencyDraft(kind, id, emergencyWritten.current);
    emergencyWritten.current = null;
    if (!databaseClosed) await storage.deleteDraft(kind, id, session).catch(() => undefined);
  }, [kind, id, session]);

  /** Saving stopped: say why and keep the edits as a draft. */
  const stop = useCallback(
    async (why: SaveProblem) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setStatus(why === 'deleted' ? 'deleted' : 'not-saved');
      setProblem(why);
      await keepAsDraft();
    },
    [keepAsDraft],
  );

  /** The item no longer exists (permanently deleted in another tab): stop saving, keep the edits. */
  const markDeleted = useCallback(async () => {
    blocked.current = true;
    // A conflict with an item that no longer exists has only one way out: saving the edits as a new item.
    setConflict(null);
    await stop('deleted');
  }, [stop]);

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
      inFlight.current = patch;
      writing.current = patch.content !== undefined ? JSON.stringify(patch.content) : null;
      setStatus('saving');
      try {
        const saved = await storage.save<C>(kind, id, patch, version.current);
        version.current = saved.version;
        attempts.current = 0;
        quotaRetried.current = false;
        if (patch.content !== undefined) lastSavedContent.current = JSON.stringify(patch.content);
        setItem(saved);
        setLastError(null);
        setStatus(pending.current ? 'pending' : 'saved');
        if (patch.title !== undefined) notifyStorageChanged({ kind, id });
        else channel?.postMessage({ kind, id });
        if (!pending.current) await settle();
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
        if (databaseClosed) {
          setStatus('error');
          await keepAsDraft();
          return;
        }
        // Retrying cannot bring back a deleted item.
        // Only a confirmed absence counts as 'deleted elsewhere'; anything else is a storage fault and is retried.
        if (isNotFoundError(err) && !(await storage.get(kind, id).catch(() => true))) return void (await markDeleted());
        let delay: number | undefined;
        if (isQuotaError(err)) {
          delay = quotaRetried.current ? undefined : QUOTA_RETRY_DELAY_MS;
          quotaRetried.current = true;
        } else delay = RETRY_DELAYS_MS[attempts.current++];
        if (delay === undefined || disposed.current) return void (await stop(isQuotaError(err) ? 'quota' : 'failed'));
        setStatus('error');
        timer.current = setTimeout(() => void flush(), delay);
      } finally {
        writing.current = null;
        inFlight.current = null;
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, [kind, id, keepAsDraft, settle, stop, markDeleted]);

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
    quotaRetried.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  /** 'Try again' after saving stopped: one attempt now, no automatic retries if it fails again. */
  const retry = useCallback(async () => {
    if (blocked.current || databaseClosed) return;
    attempts.current = RETRY_DELAYS_MS.length;
    quotaRetried.current = true;
    if (!pending.current) {
      setStatus('saved');
      await settle();
      return;
    }
    await flush();
  }, [flush, settle]);

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
    if (databaseClosed || blocked.current) return;
    if (pending.current?.title === undefined) {
      const stored = await storage.get(kind, id).catch(() => undefined);
      if (stored) setTitle(stored.title);
    }
  }, [flush, kind, id]);

  /** Ctrl/⌘+S: write pending edits, then record a version if anything changed since the last one. */
  const saveNow = useCallback(async () => {
    await flush();
    if (blocked.current || ['error', 'not-saved', 'deleted'].includes(statusRef.current)) return false;
    try {
      const created = await storage.snapshot(kind, id);
      if (created) notifyStorageChanged({ kind, id });
      return created;
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
      await markDeleted();
      return false;
    }
  }, [flush, kind, id, markDeleted]);

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
      keptDraft.current = true;
      await settle();
      setConflict(null);
      setItem(stored);
      setTitle(stored.title);
      setStatus('saved');
      return copy;
    },
    [conflict, item, kind, id, settle],
  );

  /**
   * The item was deleted in another window: saves the current title and content (with unsaved edits) as a new
   * item, and removes the draft kept for the deleted one. Returns the new item.
   */
  const saveAsNew = useCallback(async (): Promise<WorkspaceItem<C> | null> => {
    const current = itemRef.current;
    if (!current || databaseClosed) return null;
    const copy = await storage.create<C>(kind, {
      title: pending.current?.title ?? current.title,
      content: (pending.current?.content !== undefined ? pending.current.content : current.content) as C,
      templateId: current.templateId,
    });
    pending.current = null;
    keptDraft.current = true;
    await settle();
    notifyStorageChanged({ kind, id: copy.id });
    return copy;
  }, [kind, settle]);

  const draft = drafts[0] ?? null;
  const dropOffered = useCallback(
    async (d: OfferedDraft<C>) => {
      if (d.fromEmergency) removeEmergencyDraft(kind, id);
      else await storage.deleteDraft(kind, id, d.session);
      setDrafts((all) => all.filter((x) => x !== d));
    },
    [kind, id],
  );

  /**
   * Recovery of edits kept from an earlier session. They are applied to the item only if nothing changed since
   * they were made: no newer save and nothing typed since. Otherwise they become a separate copy, so neither
   * version is lost. Runs in the save queue after anything already typed, and the state they replace is kept
   * as a version first. The next draft from another session, if any, is offered after this one.
   */
  const recoverDraft = useCallback(async (): Promise<{ appliedTo: 'item' | 'copy'; id: string } | null> => {
    if (!draft || databaseClosed) return null;
    void flush();
    const result = await enqueue(async (): Promise<{ appliedTo: 'item' | 'copy'; id: string } | null> => {
      const current = await storage.get<C>(kind, id);
      if (!current) {
        // The item was deleted (e.g. in another window): the draft becomes a new item instead of being lost.
        if (draft.content === undefined) return null;
        const copy = await storage.create<C>(kind, { title: `${draft.title ?? title} (recovered)`, content: draft.content as C });
        return { appliedTo: 'copy', id: copy.id };
      }
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
    await dropOffered(draft);
    notifyStorageChanged({ kind, id });
    return result;
  }, [draft, kind, id, title, flush, enqueue, dropOffered]);

  const discardDraft = useCallback(async () => {
    if (!draft || databaseClosed) return;
    await dropOffered(draft);
  }, [draft, dropOffered]);

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

  /**
   * Follows changes that do not bump the version (trash, restore, favorite), and notices at once when the item
   * was permanently deleted, instead of only after a failed save.
   */
  const followMetadata = useCallback(() => {
    if (!loaded.current || databaseClosed) return;
    void storage
      .get<C>(kind, id)
      .then((latest) => {
        if (!latest) {
          if (statusRef.current !== 'deleted') void markDeleted();
          return;
        }
        setItem((prev) =>
          prev && (prev.deletedAt !== latest.deletedAt || prev.favorite !== latest.favorite)
            ? { ...prev, deletedAt: latest.deletedAt, favorite: latest.favorite }
            : prev,
        );
      })
      .catch(() => undefined);
  }, [kind, id, markDeleted]);

  // Another tab changed this item (or items in general): follow it, and if we have nothing unsaved, adopt its version.
  useStorageChanges((change) => {
    if (change.id !== undefined && (change.id !== id || change.kind !== kind)) return;
    followMetadata();
    adoptExternal();
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

  // Save when the window is hidden (tab switch, app backgrounded on Android, window closed), keeping a synchronous
  // copy in localStorage first in case the page is gone before the save lands; warn before leaving while anything
  // is unsaved.
  useEffect(() => {
    const unsaved = () => !!pending.current || !!inFlight.current;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      if (unsaved()) keepEmergency(EMERGENCY_DRAFT_MAX_CHARS);
      void flush();
    };
    const onPageHide = () => {
      if (unsaved()) keepEmergency(EMERGENCY_DRAFT_MAX_CHARS);
      void flush();
      if (pending.current) void keepAsDraft();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (databaseClosed) {
        if (!keepEmergency()) {
          e.preventDefault();
          e.returnValue = '';
        }
        return;
      }
      if (pending.current || ['pending', 'saving', 'error', 'not-saved', 'deleted', 'conflict'].includes(statusRef.current)) {
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
        return keepEmergency() ? 'kept' : 'failed';
      },
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    editors.add(editor);
    disposed.current = false;
    return () => {
      disposed.current = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      editors.delete(editor);
      if (timer.current) clearTimeout(timer.current);
      void flush().then(() => {
        if (pending.current) void keepAsDraft();
      });
    };
  }, [flush, keepAsDraft, keepEmergency]);

  return {
    item,
    title,
    status: reloadRequired ? ('reload-required' as const) : status,
    reloadRequired,
    conflict,
    lastError,
    /** The draft from another session offered now (newest first), or null. */
    draft,
    /** How many drafts from other sessions are waiting, including `draft`. */
    draftCount: drafts.length,
    problem,
    kept,
    session,
    externalRevision,
    updateContent,
    rename,
    commitTitle,
    flush,
    retry,
    saveNow,
    resolveConflict,
    saveAsNew,
    recoverDraft,
    discardDraft,
    holdExternalUpdates,
  };
}
