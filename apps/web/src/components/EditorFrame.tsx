import type { ItemVersionSummary } from '@dcos/local-storage';
import { Badge, Button, Dialog, IconButton, useToast } from '@dcos/ui';
import { AlertTriangle, ArrowLeft, Check, CloudOff, History, LifeBuoy, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { relativeTime } from '../lib/format';
import { notifyStorageChanged, storage, useOnline, type SaveStatus } from '../lib/storage';
import { itemHref, type ModuleDef } from '../modules';
import { ThemeSwitcher } from './AppShell';

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
  if (status === 'conflict') return <Badge tone="warning">Changed elsewhere</Badge>;
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

export function EditorFrame(props: EditorFrameProps) {
  const { module, id, title, status, lastError, trashed, hasDraft, hasConflict, children } = props;
  const [historyOpen, setHistoryOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const noun = module.label.toLowerCase();

  return (
    <div className="flex h-full flex-col bg-bg">
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
          Some changes from your last session were not saved.
        </Notice>
      )}

      {trashed && (
        <Notice
          icon={<Trash2 size={16} />}
          actions={
            <Button
              size="sm"
              onClick={async () => {
                await storage.restore(module.kind, id);
                notifyStorageChanged({ kind: module.kind, id });
                props.onRestored();
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

      {historyOpen && (
        <VersionHistory module={module} id={id} onClose={() => setHistoryOpen(false)} onBeforeRestore={props.onBeforeRestore} onRestored={props.onRestored} />
      )}
    </div>
  );
}

function VersionHistory({
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
  const toast = useToast();
  useEffect(() => {
    storage.listVersions(module.kind, id).then(setVersions);
  }, [module.kind, id]);
  const labels: Record<ItemVersionSummary['reason'], string> = { create: 'Created', manual: 'Saved version', auto: 'Autosave snapshot', restore: 'Before restore' };
  return (
    <Dialog open onClose={onClose} title="Version history" description="Snapshots are taken automatically every 10 minutes of editing and whenever you press Ctrl/⌘+S. The latest 50 are kept.">
      {!versions ? (
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
