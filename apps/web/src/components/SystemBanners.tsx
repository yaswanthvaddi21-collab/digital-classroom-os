import { Button } from '@dcos/ui';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flushAll, useStorageEvents } from '../lib/storage';

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

/**
 * App-wide notices. Updates never reload a page on their own: the user chooses when, and pending edits are
 * saved first (audit STOR-9 / CODE-10).
 */
export function SystemBanners() {
  const { versionChange, blocked } = useStorageEvents();
  const [reloading, setReloading] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const reload = async (applyUpdate: boolean) => {
    setReloading(true);
    await flushAll();
    if (applyUpdate) await updateServiceWorker(true);
    else location.reload();
  };

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
          Classroom OS was updated in another tab. Your work is saved — reload to keep editing.
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
          A new version of Classroom OS is ready. Your work is saved first.
        </Banner>
      )}
    </>
  );
}
