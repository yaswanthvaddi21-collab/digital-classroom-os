import { useSyncExternalStore } from 'react';

/** Per-device user preferences (not part of documents, not synced). */
export interface Preferences {
  newDocumentMode: 'simple' | 'advanced';
  backupReminderDays: number;
}

const DEFAULTS: Preferences = { newDocumentMode: 'simple', backupReminderDays: 7 };
const KEY = 'dcos.preferences';
const listeners = new Set<() => void>();

function read(): Preferences {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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

export const usePreferences = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );
