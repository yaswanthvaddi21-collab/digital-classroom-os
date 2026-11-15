import type { UpgradeRecovery, UpgradeStatus } from '@dcos/local-storage';
import { Button, Card, downloadBlob } from '@dcos/ui';
import { Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { protectExistingData, upgradeRecovery, useStorageEvents, useUpgradeStatus } from '../lib/storage';

const stamp = () => new Date().toISOString().slice(0, 10);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface GateProps {
  children: ReactNode;
  /** Injected in tests; the app uses the storage adapter's own recovery actions. */
  recovery?: UpgradeRecovery | null;
  download?: (blob: Blob, fileName: string) => void;
  /** Injected in tests; the app reloads the page. */
  reload?: () => void;
}

/**
 * Shows the app only once its data is safe to use. While the safety copy before a database update is being
 * made it says so, and if that copy cannot be made it shows the recovery screen instead of the app (audit STOR-R5).
 */
export function UpgradeGate({ children, recovery = upgradeRecovery, download = downloadBlob, reload = () => window.location.reload() }: GateProps) {
  const status = useUpgradeStatus(recovery);
  // Once the recovery screen is up it stays up (with what the user already did) while "Try again" or the
  // update runs, until the database is open or fails for another reason.
  const [held, setHeld] = useState<NeedsBackup | null>(null);
  if (status.state === 'needs-backup' && held !== status) setHeld(status);
  if ((status.state === 'ready' || status.state === 'failed') && held) setHeld(null);
  if (held && recovery) return <UpgradeRecoveryScreen status={held} recovery={recovery} download={download} />;
  if (status.state === 'checking') return null;
  // Phase 7 (ADR 0014): the data on this device was made by a newer version. Say so, instead of an app that looks empty.
  if (status.state === 'failed' && status.newerData) return <NewerDataScreen reload={reload} />;
  if (status.state === 'copying')
    return (
      <Screen>
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Keeping a copy of your data before updating. Please keep this page open.
        </p>
      </Screen>
    );
  return <>{children}</>;
}

/**
 * Shown when IndexedDB refuses to open the database because a newer version of the app has upgraded it.
 * This screen replaces the whole app, so SystemBanners and its "Update now" are not shown. A plain reload keeps
 * serving this build while a newer service worker waits, so when one is waiting the screen offers to switch to it
 * (the same `updateServiceWorker(true)` as "Update now"; nothing is being edited here, so there is nothing to save first).
 */
export function NewerDataScreen({ reload }: { reload: () => void }) {
  const {
    needRefresh: [updateWaiting],
    updateServiceWorker,
  } = useRegisterSW();
  const [updating, setUpdating] = useState(false);
  return (
    <Screen>
      <Card className="flex w-full max-w-xl flex-col gap-4 p-6" role="alertdialog" aria-modal="true" aria-labelledby="newer-data-title" aria-describedby="newer-data-text">
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-warning" />
          <div className="flex flex-col gap-2">
            <h1 id="newer-data-title" className="text-lg font-semibold">
              Your data was saved by a newer version of Classroom OS
            </h1>
            <div id="newer-data-text" className="flex flex-col gap-2 text-sm text-muted">
              <p>This version of the app cannot open it, so it has not read, changed or removed anything. Your work is still on this device.</p>
              {updateWaiting ? (
                <p>The newest version is already on this device. Choose Update now to switch to it.</p>
              ) : (
                <p>
                  Reload to get the newest version. If this screen comes back, close every Classroom OS tab and window, then open Classroom OS
                  again.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {updateWaiting ? (
            <Button
              variant="primary"
              icon={<RefreshCw size={15} />}
              disabled={updating}
              onClick={() => {
                setUpdating(true);
                void updateServiceWorker(true).catch(() => setUpdating(false));
              }}
            >
              {updating ? 'Updating…' : 'Update now'}
            </Button>
          ) : (
            <Button variant="primary" icon={<RefreshCw size={15} />} onClick={reload}>
              Reload
            </Button>
          )}
        </div>
      </Card>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <main className="flex min-h-full items-start justify-center overflow-y-auto bg-bg px-4 py-10 sm:py-16">{children}</main>;
}

type NeedsBackup = Extract<UpgradeStatus, { state: 'needs-backup' }>;

export function UpgradeRecoveryScreen({
  status,
  recovery,
  download,
}: {
  status: NeedsBackup;
  recovery: UpgradeRecovery;
  download: (blob: Blob, fileName: string) => void;
}) {
  const [busy, setBusy] = useState<'download' | 'retry' | 'continue' | null>(null);
  const [saved, setSaved] = useState<{ fileName: string; items: number; versions: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const { blocked } = useStorageEvents();

  const downloadBackup = async () => {
    setBusy('download');
    setProblem(null);
    try {
      const backup = await recovery.exportWithoutUpgrade();
      const fileName = `classroom-os-backup-before-update-${stamp()}.json`;
      download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), fileName);
      setSaved({ fileName, items: backup.items.length, versions: backup.versions.length });
    } catch (err) {
      setProblem(`The backup file could not be made. Nothing was changed. ${messageOf(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const run = async (kind: 'retry' | 'continue') => {
    setBusy(kind);
    setProblem(null);
    try {
      await (kind === 'retry' ? recovery.retryUpgrade() : recovery.upgradeWithoutSafetyCopy());
      void protectExistingData();
    } catch (err) {
      if (kind === 'retry') setAttempts((a) => a + 1);
      setProblem(kind === 'retry' ? `It still did not work. ${messageOf(err)}` : messageOf(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card className="flex w-full max-w-xl flex-col gap-5 p-6" role="alertdialog" aria-modal="true" aria-labelledby="upgrade-recovery-title" aria-describedby="upgrade-recovery-text">
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-warning" />
          <div className="flex flex-col gap-2">
            <h1 id="upgrade-recovery-title" className="text-lg font-semibold">
              {status.step === 'copy' ? 'This update needs a safety copy of your data first' : 'This update could not finish'}
            </h1>
            <div id="upgrade-recovery-text" className="flex flex-col gap-2 text-sm text-muted">
              {status.step === 'copy' ? (
                <p>
                  This version of Classroom OS stores your work in a new way. Before it changes anything, it keeps a full copy of your current data on this device.{' '}
                  {status.reason === 'quota'
                    ? "There isn't enough free space on this device for that copy, so the update has not started."
                    : 'That copy could not be made, so the update has not started. A full device is a common cause.'}
                </p>
              ) : (
                <p>
                  This version of Classroom OS stores your work in a new way, and changing over did not work
                  {status.reason === 'quota' ? " because there isn't enough free space on this device" : ' (a full device is a common cause)'}. The change was undone completely.
                </p>
              )}
              <p className="font-medium text-fg">Your documents, diagrams and presentations are safe and unchanged.</p>
              {status.reason !== 'quota' && <p className="break-words font-mono text-xs">{status.message}</p>}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold">Download a backup of everything</h2>
          <p className="text-sm text-muted">
            Saves every document, diagram, presentation and version into one file. You can restore it in Settings, Backup, in this or any later version of Classroom OS{status.fromVersion === 1 ? ', and in version 0.1.0' : ''}.
          </p>
          <div>
            <Button variant="primary" icon={<Download size={15} />} disabled={busy !== null} onClick={() => void downloadBackup()}>
              {busy === 'download' ? 'Preparing the backup…' : 'Download a backup of everything'}
            </Button>
          </div>
          {saved && (
            <p role="status" className="text-sm">
              Backup file made: {saved.items} {saved.items === 1 ? 'item' : 'items'} and {saved.versions} {saved.versions === 1 ? 'version' : 'versions'}, saved as{' '}
              <span className="font-mono text-xs">{saved.fileName}</span>. Check that it is in your downloads folder.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold">Free some space, then try again</h2>
          <p className="text-sm text-muted">
            Delete files you no longer need from this device, or clear the stored data of other websites in your browser settings. Then try again.
          </p>
          <div>
            <Button icon={<RefreshCw size={15} />} disabled={busy !== null} onClick={() => void run('retry')}>
              {busy === 'retry' ? 'Trying again…' : 'Try again'}
            </Button>
          </div>
        </section>

        {saved && (
          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">Or update without the copy on this device</h2>
            <p className="text-sm text-muted">
              The backup file you downloaded then takes the place of the copy. Keep it until you have checked that your work opens normally.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have the backup file saved
            </label>
            <div>
              <Button disabled={busy !== null || !confirmed} onClick={() => void run('continue')}>
                {busy === 'continue' ? 'Updating…' : 'Update without the on-device copy'}
              </Button>
            </div>
          </section>
        )}

        {blocked && (busy === 'retry' || busy === 'continue') && (
          <p role="status" className="text-sm">
            Classroom OS is also open in another tab or window. Close it there so the update can finish.
          </p>
        )}

        {problem && (
          <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            {problem}
            {attempts > 0 && !saved && ' You can download a backup of everything in the meantime.'}
          </p>
        )}
      </Card>
    </Screen>
  );
}
