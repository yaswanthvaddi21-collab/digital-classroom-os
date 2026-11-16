import { Button } from '@dcos/ui';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flushAll, useStorageEvents, type FlushOutcome } from '../lib/storage';

function Banner({ tone, children, action }: { tone: 'info' | 'warning'; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === 'warning'
          ? 'flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm'
          : 'flex flex-wrap items-center gap-3 border-b border-accent/20 bg-accent-soft px-4 py-2 text-sm'
      }
    >
      {tone === 'warning' ? <TriangleAlert size={16} className="text-warning" /> : <RefreshCw size={16} className="text-accent" />}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

const VERSION_CHANGE_TEXT: Record<FlushOutcome, string> = {
  saved: 'Classroom OS was updated in another tab. Your work is saved. Reload to keep editing.',
  kept: 'Classroom OS was updated in another tab. Some recent edits could not be saved yet. They are kept on this device and will be offered for recovery after you reload.',
  failed: 'Classroom OS was updated in another tab. Some recent edits could not be saved. Copy anything you need from the open page before reloading.',
};

/**
 * Whether a service worker controls this page, that is, whether it runs an installed version that an update could
 * replace. vite-plugin-pwa 2.0.0 (prompt mode, client/build/register.js:68-71) reports the very first install as an
 * update when another tab started it: open a second tab while the first one is still installing the service worker
 * and the second tab said "A new version of Classroom OS is ready" although nothing had changed (found by CI run
 * 43780673925, Firefox, e2e/cross-tab.spec.ts). Without clientsClaim a page that loaded uncontrolled stays so until it
 * reloads, and it is already running the newest build, so there is nothing to update to.
 */
export function isControlledPage(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
}

/**
 * App-wide notices. Updates never reload a page on their own: the user chooses when, and pending edits are
 * saved first (audit STOR-9 / CODE-10). If edits could be neither saved nor kept, the page does not reload
 * until the user confirms.
 */
export function SystemBanners() {
  const { versionChange, blocked, work } = useStorageEvents();
  const [reloading, setReloading] = useState(false);
  const [unsafe, setUnsafe] = useState<boolean | null>(null);
  const {
    needRefresh: [waiting],
    updateServiceWorker,
  } = useRegisterSW();
  const needRefresh = waiting && isControlledPage();

  const reload = async (applyUpdate: boolean, force = false) => {
    setReloading(true);
    const outcome = await flushAll();
    if (outcome === 'failed' && !force) {
      setUnsafe(applyUpdate);
      setReloading(false);
      return;
    }
    if (applyUpdate) await updateServiceWorker(true);
    else location.reload();
  };

  if (unsafe !== null)
    return (
      <Banner
        tone="warning"
        action={
          <>
            <Button size="sm" disabled={reloading} onClick={() => setUnsafe(null)}>
              Keep this page open
            </Button>
            <Button size="sm" variant="primary" disabled={reloading} onClick={() => void reload(unsafe, true)}>
              {unsafe ? 'Update anyway' : 'Reload anyway'}
            </Button>
          </>
        }
      >
        Some edits could not be saved, so the page was not reloaded. Copy anything you need first.
      </Banner>
    );

  return (
    <>
      {versionChange && (
        <Banner
          tone="warning"
          action={
            <Button size="sm" variant="primary" disabled={reloading} onClick={() => void reload(false)}>
              Reload
            </Button>
          }
        >
          {VERSION_CHANGE_TEXT[work]}
        </Banner>
      )}
      {blocked && !versionChange && (
        <Banner tone="warning">An update is waiting for other Classroom OS tabs to close. Close them to continue.</Banner>
      )}
      {needRefresh && !versionChange && (
        <Banner
          tone="info"
          action={
            <Button size="sm" variant="primary" disabled={reloading} onClick={() => void reload(true)}>
              Update now
            </Button>
          }
        >
          A new version of Classroom OS is ready. Open work is saved before it updates.
        </Banner>
      )}
    </>
  );
}
