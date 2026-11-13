import type { ItemKind } from '@dcos/local-storage';
import { Button, Card, EmptyState } from '@dcos/ui';
import { FileText, GitFork, HardDrive, Network, Plus, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog, useCreateItem } from '../components/NewItemDialog';
import { relativeTime } from '../lib/format';
import { usePreferences } from '../lib/preferences';
import { requestPersistentStorage, useDataSafety, useItems } from '../lib/storage';
import { MODULES } from '../modules';

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
          <p className="text-muted">{safety.lastBackupAt ? `Last backup ${relativeTime(safety.lastBackupAt)}.` : 'You have not made a backup yet.'} A backup file is the only copy that survives if this browser's data is cleared.</p>
        )}
        {ok && <p className="text-muted">Persistent storage is on{safety.lastBackupAt ? ` and your last backup was ${relativeTime(safety.lastBackupAt)}` : ''}.</p>}
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

export function Dashboard() {
  const { items: recent, loading } = useItems();
  const [dialog, setDialog] = useState<ItemKind | null>(null);
  const create = useCreateItem();
  const favorites = useMemo(() => recent.filter((i) => i.favorite), [recent]);
  const counts = useMemo(() => ({ document: recent.filter((i) => i.kind === 'document').length, diagram: recent.filter((i) => i.kind === 'diagram').length }), [recent]);

  const quick = [
    { kind: 'document' as const, template: 'assignment', label: 'Assignment', icon: <FileText size={18} /> },
    { kind: 'document' as const, template: 'lab-report', label: 'Lab report', icon: <FileText size={18} /> },
    { kind: 'diagram' as const, template: 'flowchart', label: 'Flowchart', icon: <GitFork size={18} /> },
    { kind: 'diagram' as const, template: 'tree', label: 'Tree diagram', icon: <Network size={18} /> },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{greeting()}</h2>
          <p className="mt-1 text-sm text-muted">Write, draw and organise your academic work — even without internet.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDialog('document')}>
            New document
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => setDialog('diagram')}>
            New diagram
          </Button>
        </div>
      </section>

      <section aria-labelledby="quick-start" className="flex flex-col gap-3">
        <h3 id="quick-start" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-accent" /> Quick start
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quick.map((q) => {
            const template = MODULES[q.kind].templates.find((t) => t.id === q.template)!;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => create(q.kind, template)}
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
            {!loading && recent.length === 0 ? (
              <div className="p-2">
                <EmptyState
                  icon={<FileText size={20} />}
                  title="Nothing here yet"
                  description="Create your first document or diagram. It stays on this device and works offline."
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
          <Card className="flex gap-3 p-4">
            <HardDrive size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="text-sm">
              <div className="font-medium">Stored on this device</div>
              <p className="mt-1 text-muted">
                {counts.document} document{counts.document === 1 ? '' : 's'} and {counts.diagram} diagram{counts.diagram === 1 ? '' : 's'}.
              </p>
            </div>
          </Card>
        </aside>
      </div>

      {dialog && <NewItemDialog kind={dialog} open onClose={() => setDialog(null)} />}
    </div>
  );
}
