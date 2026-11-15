/**
 * Stand-in for vite-plugin-pwa's `virtual:pwa-register/react`, which exists only inside a Vite build with the PWA
 * plugin. Unit tests resolve the specifier here (vitest.config.ts) and replace it with `vi.mock` where they need a
 * service-worker state. This default says no update is waiting and the app is not offline-ready.
 */
import type { useRegisterSW as UseRegisterSW } from 'virtual:pwa-register/react';

export const useRegisterSW: typeof UseRegisterSW = () => ({
  needRefresh: [false, () => undefined],
  offlineReady: [false, () => undefined],
  updateServiceWorker: () => Promise.resolve(),
});
