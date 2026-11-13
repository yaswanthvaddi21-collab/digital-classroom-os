// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getPreference, setPreference, usePreferences } from './preferences';

describe('preferences', () => {
  it('follow changes made in another tab', () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.backupReminderDays).toBe(7);
    // Another tab wrote the preference; the browser tells this tab with a storage event.
    localStorage.setItem('dcos.preferences', JSON.stringify({ backupReminderDays: 30, newDocumentMode: 'advanced' }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'dcos.preferences' }));
    });
    expect(result.current).toEqual({ backupReminderDays: 30, newDocumentMode: 'advanced', authorName: '', spellCheck: true });
    expect(getPreference('newDocumentMode')).toBe('advanced');

    // Storage cleared in another tab: back to the defaults.
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current).toEqual({ backupReminderDays: 7, newDocumentMode: 'simple', authorName: '', spellCheck: true });
  });

  it('ignore storage events for other keys', () => {
    setPreference('backupReminderDays', 14);
    localStorage.setItem('dcos.preferences', JSON.stringify({ backupReminderDays: 3 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'dcos.theme' }));
    expect(getPreference('backupReminderDays')).toBe(14);
  });

  it('keep the comment author name and spell check setting, and ignore stored values of the wrong type', () => {
    setPreference('authorName', 'Ada Lovelace');
    setPreference('spellCheck', false);
    expect(JSON.parse(localStorage.getItem('dcos.preferences')!)).toMatchObject({ authorName: 'Ada Lovelace', spellCheck: false });
    localStorage.setItem('dcos.preferences', JSON.stringify({ authorName: 42, spellCheck: 'no' }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'dcos.preferences' }));
    });
    expect(getPreference('authorName')).toBe('');
    expect(getPreference('spellCheck')).toBe(true);
  });
});
