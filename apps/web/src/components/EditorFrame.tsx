import type { ItemVersionSummary } from '@dcos/local-storage';
import { Badge, Button, Dialog, IconButton, useToast } from '@dcos/ui';
import { AlertTriangle, ArrowLeft, Check, CloudOff, HardDrive, History, LifeBuoy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { relativeTime } from '../lib/format';
import {
  flushAll,
  notifyStorageChanged,
  storage,
  useOnline,
  useStorageEvents,
  type FlushOutcome,
  type KeptState,
  type SaveProblem,
  type SaveStatus,
} from '../lib/storage';
import { itemHref, type ModuleDef } from '../modules';
import { ThemeSwitcher } from './AppShell';
import { OpenTabs } from './OpenTabs';

function StatusIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  const online = useOnline();
  if (status === 'saving' || status === 'pending')
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted" title="Saving…">
        <Loader2 size={13} className="animate-spin" /> <span className="hidden sm:inline">Saving…</span>
      </span>
    );
  if (status === 'error')
    return (
      <Badge tone="danger">
        <AlertTriangle size={12} /> <span className="hidden sm:inline">Not saved — retrying.</span>
        <span className="sm:hidden">Not saved</span>
        <span className="sr-only">{error}</span>
      </Badge>
    );
  // Saving stopped: no retry is scheduled, so the text must not promise one.
  if (status === 'not-saved' || status === 'deleted')
    return (
      <span role="status" aria-label="Not saved" title={error ?? undefined}>
        <Badge tone="danger">
          <AlertTriangle size={12} /> Not saved
        </Badge>
      </span>
    );
  if (status === 'conflict') return <Badge tone="warning">Changed elsewhere</Badge>;
  if (status === 'reload-required') return <Badge tone="warning">Reload needed</Badge>;
  const label = online ? 'Saved on this device' : 'Offline · saved on this device';
  // Always visible, also on phones (audit: mobile users could not see whether their work was saved).
  return (
    <span role="status" aria-label={label} className="flex items-center gap-1.5 text-xs text-muted" title={label}>
      {online ? <Check size={13} className="text-success" /> : <CloudOff size={13} className="text-warning" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Saved</span>
    </span>
  );
}

interface EditorFrameProps {
  module: ModuleDef;
  id: string;
  title: string;
  status: SaveStatus;
  lastError: string | null;
  trashed: boolean;
  hasDraft: boolean;
  onRename: (title: string) => void;
  onTitleBlur: () => void;
  /** Saves pending edits; called before a version is restored so nothing typed is lost. */
  onBeforeRestore: () => Promise<void>;
  onRestored: () => void;
  hasConflict: boolean;
  onResolveConflict: (choice: 'save-copy' | 'load-latest') => Promise<{ id: string } | null>;
  onRecoverDraft: () => Promise<{ appliedTo: 'item' | 'copy'; id: string } | null>;
  onDiscardDraft: () => Promise<void>;
  /** Drafts from other sessions waiting to be recovered or discarded (one is offered at a time). */
  draftCount?: number;
  /** Why saving stopped, if it did. */
  problem?: SaveProblem | null;
  /** Whether unsaved edits were kept on this device as a draft. */
  kept?: KeptState | null;
  /** 'Try again' after saving stopped. */
  onRetry?: () => Promise<void>;
  /** The item was deleted elsewhere: save the edits as a new item. */
  onSaveAsNew?: () => Promise<{ id: string } | null>;
  children: ReactNode;
}

function Notice({ tone = 'warning', icon, children, actions }: { tone?: 'warning' | 'info'; icon: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div
      role="alert"
      className={
        tone === 'warning'
          ? 'flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm'
          : 'flex flex-wrap items-center gap-3 border-b border-accent/20 bg-accent-soft px-4 py-2.5 text-sm'
      }
    >
      <span className={tone === 'warning' ? 'text-warning' : 'text-accent'}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {actions}
    </div>
  );
}

const RELOAD_TEXT: Record<FlushOutcome, string> = {
  saved: 'Reload to keep editing. Your work is saved.',
  kept: 'Reload to keep editing. Edits that could not be saved yet are kept on this device and will be offered for recovery after the reload.',
  failed: 'Some recent edits could not be saved. Copy anything you need before reloading.',
};

/**
 * Covers the editor once another tab has upgraded the database: this page can no longer save, so it must not
 * look editable. If unsaved edits could not even be kept, the user can uncover the page to copy them.
 */
function ReloadRequired({ onUncover }: { onUncover: () => void }) {
  const { work } = useStorageEvents();
  const [reloading, setReloading] = useState(false);
  const reload = async () => {
    setReloading(true);
    const outcome = await flushAll();
    // Newly unkeepable edits: stay, so the text above can tell the user before anything is lost.
    if (outcome === 'failed' && work !== 'failed') return setReloading(false);
    location.reload();
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-labelledby="reload-required-title" aria-describedby="reload-required-text" className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <h2 id="reload-required-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <RefreshCw size={16} className="text-warning" /> This app was updated in another tab
        </h2>
        <p id="reload-required-text" className="mt-2 text-sm text-muted">
          {RELOAD_TEXT[work]}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {work === 'failed' && (
            <Button size="sm" onClick={onUncover}>
              Show my work to copy it
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={reloading} onClick={() => void reload()}>
            {work === 'failed' ? 'Reload anyway' : 'Reload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The persistent notice shown while saving has stopped. */
function SaveProblemNotice({ problem, kept, noun, onRetry, onSaveAsNew }: { problem: SaveProblem; kept: KeptState | null; noun: string; onRetry?: () => Promise<void>; onSaveAsNew?: () => Promise<void> }) {
  const notKept = kept === 'not-kept';
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const act = (fn?: () => Promise<void>) => async () => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const retry = (
    <Button size="sm" variant="primary" disabled={busy} onClick={act(onRetry)}>
      Try again
    </Button>
  );
  if (problem === 'quota')
    return (
      <Notice
        icon={<HardDrive size={16} />}
        actions={
          <>
            {retry}
            {notKept ? (
              // The edits exist only on this page: leaving it would lose them, so Settings opens in a new tab.
              <Button size="sm" onClick={() => window.open('#/settings/storage', '_blank', 'noopener')}>
                Free up space (new tab)
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate('/settings/storage')}>
                Free up space
              </Button>
            )}
          </>
        }
      >
        This device is out of storage space, so your latest edits were not saved.{' '}
        {notKept
          ? 'They could not be kept as a draft either. Copy anything you need somewhere safe before closing this page.'
          : 'They are kept as a draft on this device for now. Free up space, then try again.'}
      </Notice>
    );
  if (problem === 'deleted')
    return (
      <Notice
        icon={<Trash2 size={16} />}
        actions={
          <Button size="sm" variant="primary" disabled={busy} onClick={act(onSaveAsNew)}>
            Save as a new {noun}
          </Button>
        }
      >
        This {noun} was deleted in another window. Your edits are still here.{' '}
        {notKept ? `They could not be kept as a draft, so save them as a new ${noun} before closing this page.` : `Save them as a new ${noun} to keep them.`}
      </Notice>
    );
  return (
    <Notice icon={<AlertTriangle size={16} />} actions={retry}>
      Not saved.{' '}
      {notKept
        ? 'Your latest edits could not be kept as a draft either. Copy anything you need somewhere safe before closing this page.'
        : `Your latest edits are kept as a draft on this device and will be offered again when you next open this ${noun}.`}
    </Notice>
  );
}

export function EditorFrame(props: EditorFrameProps) {
  const { module, id, title, status, lastError, trashed, hasDraft, hasConflict, children } = props;
  const { problem = null, kept = null, draftCount = hasDraft ? 1 : 0 } = props;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [uncovered, setUncovered] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const noun = module.label.toLowerCase();
  const reloadRequired = status === 'reload-required';
  const covered = reloadRequired && !uncovered;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      {reloadRequired && uncovered && (
        <Notice
          icon={<RefreshCw size={16} />}
          actions={
            <Button size="sm" variant="primary" onClick={() => location.reload()}>
              Reload
            </Button>
          }
        >
          This app was updated in another tab. Edits on this page are no longer saved. Copy what you need, then reload.
        </Notice>
      )}
      <div className="flex min-h-0 flex-1 flex-col" inert={covered || undefined}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3">
          <Link
            to={`/${module.route}`}
            aria-label={`Back to ${module.plural.toLowerCase()}`}
            title={`Back to ${module.plural.toLowerCase()}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft size={17} />
          </Link>
          <input
            aria-label={`${module.label} title`}
            value={title}
            onChange={(e) => props.onRename(e.target.value)}
            onBlur={props.onTitleBlur}
            className="min-w-0 max-w-md flex-1 truncate rounded-md bg-transparent px-2 py-1 text-[15px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
          />
          <div className="ml-auto flex items-center gap-2">
            <StatusIndicator status={status} error={lastError} />
            <IconButton label="Version history" onClick={() => setHistoryOpen(true)}>
              <History size={16} />
            </IconButton>
            <div className="hidden md:block">
              <ThemeSwitcher />
            </div>
          </div>
        </header>
        <OpenTabs kind={module.kind} id={id} title={title} />

        {hasConflict && (
          <Notice
            icon={<AlertTriangle size={16} />}
            actions={
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const copy = await props.onResolveConflict('save-copy');
                    if (copy) navigate(itemHref(module.kind, copy.id));
                  }}
                >
                  Keep my edits as a copy
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await props.onResolveConflict('load-latest');
                    props.onRestored();
                  }}
                >
                  Discard mine, load latest
                </Button>
              </>
            }
          >
            This {noun} was changed in another window. Your edits are kept safely and have not been written over it.
          </Notice>
        )}

        {problem && !reloadRequired && (
          <SaveProblemNotice
            problem={problem}
            kept={kept}
            noun={noun}
            onRetry={props.onRetry}
            onSaveAsNew={
              props.onSaveAsNew &&
              (async () => {
                try {
                  const copy = await props.onSaveAsNew!();
                  if (!copy) return;
                  toast(`Saved as a new ${noun}`, 'success');
                  navigate(itemHref(module.kind, copy.id));
                } catch (err) {
                  toast(`Could not save it as a new ${noun}. ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
              })
            }
          />
        )}

        {!problem && kept === 'not-kept' && !reloadRequired && (
          <Notice icon={<AlertTriangle size={16} />}>
            Your latest edits could not be kept on this device. Copy anything you need somewhere safe before closing this page.
          </Notice>
        )}

        {hasDraft && !hasConflict && (
          <Notice
            tone="info"
            icon={<LifeBuoy size={16} />}
            actions={
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const result = await props.onRecoverDraft();
                    if (!result) return;
                    if (result.appliedTo === 'copy') {
                      toast(`Your unsaved changes were saved as a separate ${noun}`, 'success');
                      navigate(itemHref(module.kind, result.id));
                    } else {
                      toast('Unsaved changes recovered', 'success');
                      props.onRestored();
                    }
                  }}
                >
                  Recover them
                </Button>
                <Button size="sm" onClick={() => void props.onDiscardDraft()}>
                  Discard
                </Button>
              </>
            }
          >
            {draftCount > 1
              ? `Changes from ${draftCount} earlier sessions were not saved. Showing the newest first.`
              : 'Some changes from your last session were not saved.'}
          </Notice>
        )}

        {trashed && problem !== 'deleted' && (
          <Notice
            icon={<Trash2 size={16} />}
            actions={
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await storage.restore(module.kind, id);
                    notifyStorageChanged({ kind: module.kind, id });
                    props.onRestored();
                  } catch (err) {
                    toast(`Could not restore it. ${err instanceof Error ? err.message : String(err)}`, 'error');
                  }
                }}
              >
                Restore
              </Button>
            }
          >
            This {noun} is in the trash. Edits are saved, but it stays in the trash until you restore it.
          </Notice>
        )}

        <div className="min-h-0 flex-1">{children}</div>
      </div>

      {covered && <ReloadRequired onUncover={() => setUncovered(true)} />}

      {historyOpen && !reloadRequired && (
        <VersionHistory module={module} id={id} onClose={() => setHistoryOpen(false)} onBeforeRestore={props.onBeforeRestore} onRestored={props.onRestored} />
      )}
    </div>
  );
}

export function VersionHistory({
  module,
  id,
  onClose,
  onBeforeRestore,
  onRestored,
}: {
  module: ModuleDef;
  id: string;
  onClose: () => void;
  onBeforeRestore: () => Promise<void>;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<ItemVersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    let current = true;
    storage.listVersions(module.kind, id).then(
      (list) => current && setVersions(list),
      (err) => current && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      current = false;
    };
  }, [module.kind, id]);
  const labels: Record<ItemVersionSummary['reason'], string> = { create: 'Created', manual: 'Saved version', auto: 'Autosave snapshot', restore: 'Before restore' };
  return (
    <Dialog open onClose={onClose} title="Version history" description="Snapshots are taken automatically every 10 minutes of editing and whenever you press Ctrl/⌘+S. The latest 50 are kept.">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          Version history could not be loaded. {error}
        </p>
      ) : !versions ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{labels[v.reason]}</div>
                <div className="text-xs text-muted">
                  {new Date(v.createdAt).toLocaleString()} · {relativeTime(v.createdAt)} · “{v.title}”
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await onBeforeRestore();
                    await storage.restoreVersion(module.kind, id, v.id);
                    notifyStorageChanged({ kind: module.kind, id });
                    toast('Version restored. The previous state was kept in history.', 'success');
                    onClose();
                    onRestored();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : String(err), 'error');
                  }
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function MissingItem({ module, error }: { module: ModuleDef; error?: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold">{error ? `This ${module.label.toLowerCase()} could not be opened` : `This ${module.label.toLowerCase()} isn't on this device`}</h2>
      <p className="max-w-sm text-sm text-muted">
        {error ?? 'It may have been permanently deleted, or it was created on another device.'}
      </p>
      <Link to={`/${module.route}`} className="text-sm font-medium text-accent hover:underline">
        Go to {module.plural.toLowerCase()}
      </Link>
    </div>
  );
}
