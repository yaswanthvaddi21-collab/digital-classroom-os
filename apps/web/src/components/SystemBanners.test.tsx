// @vitest-environment jsdom
/**
 * The "new version is ready" banner appears only on a page that a service worker controls (AE-P2). A first install
 * that another tab started is reported by vite-plugin-pwa as an update; an uncontrolled page already runs the newest
 * build, so it must not offer one (CI run 43780673925, Firefox, e2e/cross-tab.spec.ts).
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemBanners } from './SystemBanners';

const sw = vi.hoisted(() => ({ waiting: true }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [sw.waiting, () => {}], offlineReady: [false, () => {}], updateServiceWorker: () => Promise.resolve() }),
}));
vi.mock('../lib/storage', () => ({
  useStorageEvents: () => ({ versionChange: false, blocked: false, work: 'saved' }),
  flushAll: () => Promise.resolve('saved'),
}));

const UPDATE_TEXT = /A new version of Classroom OS is ready/;

function setController(controller: object | null | undefined) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: controller === undefined ? undefined : { controller },
  });
}

afterEach(() => {
  sw.waiting = true;
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('SystemBanners update notice', () => {
  it('shows "Update now" when a new service worker waits and this page runs an installed version', () => {
    setController({ scriptURL: 'sw.js' });
    render(<SystemBanners />);
    expect(screen.getByText(UPDATE_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update now' })).toBeTruthy();
  });

  it('shows nothing on a page no service worker controls (first install started by another tab)', () => {
    setController(null);
    render(<SystemBanners />);
    expect(screen.queryByText(UPDATE_TEXT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });

  it('shows nothing where service workers are unavailable', () => {
    setController(undefined);
    render(<SystemBanners />);
    expect(screen.queryByText(UPDATE_TEXT)).toBeNull();
  });

  it('shows nothing when no new service worker waits', () => {
    sw.waiting = false;
    setController({ scriptURL: 'sw.js' });
    render(<SystemBanners />);
    expect(screen.queryByText(UPDATE_TEXT)).toBeNull();
  });
});
