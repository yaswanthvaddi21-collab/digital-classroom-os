import type { ItemKind, ItemVersionSummary } from '@dcos/local-storage';
import { Badge, Button, Dialog, IconButton, useToast } from '@dcos/ui';
import { AlertTriangle, ArrowLeft, Check, CloudOff, History, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { relativeTime } from '../lib/format';
import { storage, useOnline, type SaveStatus } from '../lib/storage';
import { ThemeSwitcher } from './AppShell';

function StatusIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  const online = useOnline();
  if (status === 'saving' || status === 'pending')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={13} className="animate-spin" /> Saving…
      </span>
    );
  if (status === 'error')
    return (
      <Badge tone="danger">
        <AlertTriangle size={12} /> Not saved — {error ?? 'retrying on next edit'}
      </Badge>
    );
  if (status === 'conflict') return <Badge tone="warning">Changed elsewhere</Badge>;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title="Saved to this device">
      {online ? <Check size={13} className="text-success" /> : <CloudOff size={13} className="text-warning" />}
      {online ? 'Saved on this device' : 'Offline · saved on this device'}
    </span>
  );
}

interface EditorFrameProps {
  kind: ItemKind;
  id: string;
  title: string;
  status: SaveStatus;
  lastError: string | null;
  onRename: (title: string) => void;
  onRestored: () => void;
  hasConflict: boolean;
  onResolveConflict: (choice: 'save-copy' | 'load-latest') => Promise<{ id: string } | null>;
  children: ReactNode;
}

export function EditorFrame({ kind, id, title, status, lastError, onRename, onRestored, hasConflict, onResolveConflict, children }: EditorFrameProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const navigate = useNavigate();
  const back = kind === 'document' ? '/documents' : '/diagrams';

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3">
        <Link to={back} aria-label={`Back to ${kind}s`} title={`Back to ${kind}s`} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
          <ArrowLeft size={17} />
        </Link>
        <input
          aria-label={`${kind} title`}
          value={title}
          onChange={(e) => onRename(e.target.value)}
          className="min-w-0 max-w-md flex-1 truncate rounded-md bg-transparent px-2 py-1 text-[15px] font-semibold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <StatusIndicator status={status} error={lastError} />
          </div>
          <IconButton label="Version history" onClick={() => setHistoryOpen(true)}>
            <History size={16} />
          </IconButton>
          <div className="hidden md:block">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {hasConflict && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm">
          <AlertTriangle size={16} className="text-warning" />
          <span className="flex-1">
            This {kind} was changed in another window. Your latest edits have not been written over it.
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const copy = await onResolveConflict('save-copy');
              if (copy) navigate(`/${kind}s/${copy.id}`);
            }}
          >
            Keep my edits as a copy
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await onResolveConflict('load-latest');
              onRestored();
            }}
          >
            Discard mine, load latest
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1">{children}</div>

      {historyOpen && <VersionHistory kind={kind} id={id} onClose={() => setHistoryOpen(false)} onRestored={onRestored} />}
    </div>
  );
}

function VersionHistory({ kind, id, onClose, onRestored }: { kind: ItemKind; id: string; onClose: () => void; onRestored: () => void }) {
  const [versions, setVersions] = useState<ItemVersionSummary[] | null>(null);
  const toast = useToast();
  useEffect(() => {
    storage.listVersions(kind, id).then(setVersions);
  }, [kind, id]);
  const labels: Record<ItemVersionSummary['reason'], string> = { create: 'Created', manual: 'Saved version', auto: 'Autosave snapshot', restore: 'Before restore' };
  return (
    <Dialog open onClose={onClose} title="Version history" description="Snapshots are taken automatically every 10 minutes of editing and whenever you press Ctrl/⌘+S.">
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
                    await storage.restoreVersion(kind, id, v.id);
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

export function MissingItem({ kind }: { kind: ItemKind }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold">This {kind} isn't on this device</h2>
      <p className="max-w-sm text-sm text-muted">It may have been permanently deleted, or it was created on another device.</p>
      <Link to={kind === 'document' ? '/documents' : '/diagrams'} className="text-sm font-medium text-accent hover:underline">
        Go to {kind}s
      </Link>
    </div>
  );
}
