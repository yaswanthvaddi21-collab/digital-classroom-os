import { useSyncExternalStore } from 'react';

/** Per-device user preferences (not part of documents, not synced). */
export interface Preferences {
  newDocumentMode: 'simple' | 'advanced';
  backupReminderDays: number;
  // @phase4:review — the name comments are written under, and whether documents open with spell checking on.
  authorName: string;
  spellCheck: boolean;
}

const DEFAULTS: Preferences = { newDocumentMode: 'simple', backupReminderDays: 7, authorName: '', spellCheck: true };
const KEY = 'dcos.preferences';
const listeners = new Set<() => void>();

function read(): Preferences {
  try {
    const prefs: Preferences = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // @phase4:review — values the editor relies on are checked; anything else falls back to the default.
    if (typeof prefs.authorName !== 'string') prefs.authorName = DEFAULTS.authorName;
    if (typeof prefs.spellCheck !== 'boolean') prefs.spellCheck = DEFAULTS.spellCheck;
    return prefs;
  } catch {
    return DEFAULTS;
  }
}

let cache = read();

export function getPreference<K extends keyof Preferences>(key: K): Preferences[K] {
  return cache[key];
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  cache = { ...cache, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable: the preference lasts for this session only.
  }
  listeners.forEach((l) => l());
}

// Follow changes made in other tabs (the storage event fires only in the tabs that did not make the change).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // key null: localStorage was cleared.
    if (e.key !== null && e.key !== KEY) return;
    cache = read();
    listeners.forEach((l) => l());
  });
}

export const usePreferences = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );
