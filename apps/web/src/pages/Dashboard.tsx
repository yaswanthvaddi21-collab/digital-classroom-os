import type { ItemKind } from '@dcos/local-storage';
import { Button, Card, EmptyState } from '@dcos/ui';
import { AlertTriangle, FileText, GitFork, HardDrive, Network, Plus, Presentation, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog, useCreateItem } from '../components/NewItemDialog';
import { relativeTime } from '../lib/format';
import { usePreferences } from '../lib/preferences';
import { requestPersistentStorage, useDataSafety, useItems } from '../lib/storage';
import { MODULE_LIST, MODULES } from '../modules';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Tells the user plainly whether their work is protected: browsers can clear site data, and a backup file is
 * the only copy that survives that (audit H-1 / incident S-1).
 */
function DataSafetyCard({ itemCount }: { itemCount: number }) {
  const safety = useDataSafety();
  const { backupReminderDays } = usePreferences();
  if (!safety.persist) return null;
  const persisted = safety.persist === 'persisted';
  const backupAgeDays = safety.lastBackupAt ? (Date.now() - Date.parse(safety.lastBackupAt)) / 86_400_000 : Infinity;
  const backupDue = itemCount > 0 && backupAgeDays >= backupReminderDays;
  const ok = persisted && !backupDue;

  return (
    <Card className={ok ? 'flex gap-3 p-4' : 'flex gap-3 border-warning/40 bg-warning/5 p-4'}>
      {ok ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" /> : <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" />}
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        <div className="font-medium">{ok ? 'Your work is protected on this device' : 'Protect your work'}</div>
        {!persisted && itemCount > 0 && (
          <p className="text-muted">This browser may clear its saved data when the device runs low on space.</p>
        )}
        {backupDue && (
          <p className="text-muted">{safety.lastBackupAt ? `Last backup exported ${relativeTime(safety.lastBackupAt)}.` : 'You have not exported a backup yet.'} A backup file is the only copy that survives if this browser's data is cleared.</p>
        )}
        {ok && <p className="text-muted">Persistent storage is on{safety.lastBackupAt ? ` and your last backup was exported ${relativeTime(safety.lastBackupAt)}` : ''}.</p>}
        <div className="flex flex-wrap gap-2">
          {!persisted && safety.persist !== 'unsupported' && itemCount > 0 && (
            <Button size="sm" icon={<HardDrive size={14} />} onClick={async () => (await requestPersistentStorage(), safety.refresh())}>
              Keep data on this device
            </Button>
          )}
          {backupDue && (
            <Link to="/settings/backup" className="inline-flex h-8 items-center rounded-lg bg-accent px-2.5 text-[13px] font-medium text-accent-fg hover:bg-accent-hover">
              Back up now
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

/** “3 documents, 1 diagram and 2 presentations”, over every module. */
export function storedSentence(counts: Partial<Record<ItemKind, number>>): string {
  const parts = MODULE_LIST.map((m) => {
    const n = counts[m.kind] ?? 0;
    return `${n} ${(n === 1 ? m.label : m.plural).toLowerCase()}`;
  });
  return `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.`;
}

/** Quick start entries: each label is unique (tests click them by name) and names a template that exists. */
export const QUICK_START: ReadonlyArray<{ kind: ItemKind; template: string; label: string; icon: ReactNode }> = [
  { kind: 'document', template: 'assignment', label: 'Assignment', icon: <FileText size={18} /> },
  { kind: 'document', template: 'lab-report', label: 'Lab report', icon: <FileText size={18} /> },
  { kind: 'diagram', template: 'flowchart', label: 'Flowchart', icon: <GitFork size={18} /> },
  { kind: 'diagram', template: 'tree', label: 'Tree diagram', icon: <Network size={18} /> },
  // Phase 7 (DESIGN): the Lecture template, and the blank presentation that the e2e specs and upgrade test start from.
  { kind: 'presentation', template: 'lecture', label: 'Lecture slides', icon: <Presentation size={18} /> },
  { kind: 'presentation', template: 'blank', label: 'Blank presentation', icon: <Presentation size={18} /> },
];

export function Dashboard() {
  const { items: recent, loading, error } = useItems();
  const [dialog, setDialog] = useState<ItemKind | null>(null);
  const create = useCreateItem();
  const favorites = useMemo(() => recent.filter((i) => i.favorite), [recent]);
  const counts = useMemo(() => Object.fromEntries(MODULE_LIST.map((m) => [m.kind, recent.filter((i) => i.kind === m.kind).length])) as Record<ItemKind, number>, [recent]);
  // A template a quick start entry names may be missing in a build; the entry is then left out, never a dead button.
  const quick = QUICK_START.flatMap((q) => {
    const template = MODULES[q.kind].templates.find((t) => t.id === q.template);
    return template ? [{ ...q, template }] : [];
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{greeting()}</h2>
          <p className="mt-1 text-sm text-muted">Write, draw, present and organise your academic work — even without internet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODULE_LIST.map((m, i) => (
            <Button key={m.kind} variant={i === 0 ? 'primary' : undefined} icon={<Plus size={16} />} onClick={() => setDialog(m.kind)}>
              New {m.label.toLowerCase()}
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="quick-start" className="flex flex-col gap-3">
        <h3 id="quick-start" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-accent" /> Quick start
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {quick.map((q) => {
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => create(q.kind, q.template)}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left shadow-xs transition hover:border-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{q.icon}</span>
                <span className="text-sm font-medium">{q.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent" className="lg:col-span-2">
          <Card className="p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <h3 id="recent" className="text-sm font-semibold">
                Recent work
              </h3>
              {recent.length > 8 && (
                <Link to="/recent" className="text-xs font-medium text-accent hover:underline">
                  View all
                </Link>
              )}
            </div>
            {error ? (
              // Never an empty dashboard when the files could not be read: that would look like lost work.
              <div role="alert" className="m-2 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
                <div>
                  <div className="font-medium">Your files could not be read</div>
                  <p className="mt-0.5 text-muted">Nothing has been changed or removed. {error}</p>
                </div>
              </div>
            ) : !loading && recent.length === 0 ? (
              <div className="p-2">
                <EmptyState
                  icon={<FileText size={20} />}
                  title="Nothing here yet"
                  description="Create your first document, diagram or presentation. It stays on this device and works offline."
                  action={
                    <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDialog('document')}>
                      New document
                    </Button>
                  }
                />
              </div>
            ) : (
              recent.slice(0, 8).map((item) => <ItemRow key={item.id} item={item} />)
            )}
          </Card>
        </section>

        <aside className="flex flex-col gap-6">
          <DataSafetyCard itemCount={recent.length} />
          <Card className="p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <h3 className="text-sm font-semibold">Favorites</h3>
              {favorites.length > 6 && (
                <Link to="/favorites" className="text-xs font-medium text-accent hover:underline">
                  View all
                </Link>
              )}
            </div>
            {favorites.length === 0 ? (
              <p className="px-3 pb-3 text-sm text-muted">Star a file to pin it here.</p>
            ) : (
              favorites.slice(0, 6).map((item) => <ItemRow key={item.id} item={item} />)
            )}
          </Card>
          {!error && (
            <Card className="flex gap-3 p-4">
              <HardDrive size={18} className="mt-0.5 shrink-0 text-accent" />
              <div className="text-sm">
                <div className="font-medium">Stored on this device</div>
                <p className="mt-1 text-muted">{storedSentence(counts)}</p>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {dialog && <NewItemDialog kind={dialog} open onClose={() => setDialog(null)} />}
    </div>
  );
}
