// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme';

function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', () => mq);
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((l) => l());
    },
  };
}

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <button type="button" onClick={() => setPreference('dark')}>
      {preference}:{resolved}
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('ThemeProvider', () => {
  it('follows the system theme by default and reacts to changes', () => {
    const media = stubMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('system:light');
    act(() => media.set(true));
    expect(screen.getByRole('button').textContent).toBe('system:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores and persists the stored preference under the dcos.theme key', () => {
    stubMatchMedia(false);
    localStorage.setItem('dcos.theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('light:light');
    act(() => screen.getByRole('button').click());
    expect(localStorage.getItem('dcos.theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('still renders when localStorage throws', () => {
    stubMatchMedia(true);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('system:dark');
    spy.mockRestore();
  });
});
