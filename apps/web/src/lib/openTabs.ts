import type { ItemKind } from '@dcos/local-storage';
import { useSyncExternalStore } from 'react';

/**
 * The open items (documents and diagrams) shown as tabs above the editor. Kept per device in localStorage, like
 * preferences; never part of the items themselves. The order is the order they were opened in.
 */
export interface OpenTab {
  kind: ItemKind;
  id: string;
}

const KEY = 'dcos.openTabs';
/** At most this many tabs: opening another closes the one used least recently (never the current one). */
export const MAX_OPEN_TABS = 12;
const listeners = new Set<() => void>();
const KINDS: readonly string[] = ['document', 'diagram'];

function read(): OpenTab[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is OpenTab => !!t && typeof t === 'object' && KINDS.includes((t as OpenTab).kind) && typeof (t as OpenTab).id === 'string').slice(0, MAX_OPEN_TABS);
  } catch {
    return [];
  }
}

let cache = read();
/** When each tab was last shown (this session), to choose which one to close when there are too many. */
const lastShown = new Map<string, number>();
let clock = 0;
const key = (t: OpenTab) => `${t.kind}:${t.id}`;

function write(next: OpenTab[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the tabs last for this session only.
  }
  listeners.forEach((l) => l());
}

export const getOpenTabs = () => cache;

/** Adds an item when it is opened (at the end), keeping at most MAX_OPEN_TABS. */
export function openTab(tab: OpenTab) {
  lastShown.set(key(tab), ++clock);
  if (cache.some((t) => key(t) === key(tab))) return;
  let next = [...cache, tab];
  while (next.length > MAX_OPEN_TABS) {
    const oldest = next.filter((t) => key(t) !== key(tab)).sort((a, b) => (lastShown.get(key(a)) ?? 0) - (lastShown.get(key(b)) ?? 0))[0];
    next = next.filter((t) => t !== oldest);
  }
  write(next);
}

/** Removes a tab. Returns the tab to show instead when it was the current one: the next one, else the previous. */
export function closeTab(tab: OpenTab): OpenTab | null {
  const i = cache.findIndex((t) => key(t) === key(tab));
  if (i < 0) return null;
  const next = cache.filter((_, j) => j !== i);
  write(next);
  return next[i] ?? next[i - 1] ?? null;
}

/** Drops tabs whose items no longer exist (deleted forever, or from a cleared device). */
export function forgetTabs(keep: (tab: OpenTab) => boolean) {
  const next = cache.filter(keep);
  if (next.length !== cache.length) write(next);
}

/** The tab `step` places from `current` (wrapping round), for the keyboard shortcut. */
export function neighbourTab(current: OpenTab, step: 1 | -1): OpenTab | null {
  const i = cache.findIndex((t) => key(t) === key(current));
  if (i < 0 || cache.length < 2) return null;
  return cache[(i + step + cache.length) % cache.length];
}

// Other windows of the app on this device share the tabs (the storage event fires only in the windows that did not
// make the change).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== KEY) return;
    cache = read();
    listeners.forEach((l) => l());
  });
}

export const useOpenTabs = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );

/** For tests: forget everything. */
export function resetOpenTabs() {
  lastShown.clear();
  write([]);
}
