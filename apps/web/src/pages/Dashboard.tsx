import type { ItemKind } from '@dcos/local-storage';
import { Button, Card, EmptyState } from '@dcos/ui';
import { FileText, GitFork, HardDrive, Network, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog, templatesFor, useCreateItem } from '../components/NewItemDialog';
import { useItems } from '../lib/storage';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard() {
  const docs = useItems('document');
  const diagrams = useItems('diagram');
  const [dialog, setDialog] = useState<ItemKind | null>(null);
  const create = useCreateItem();

  const recent = useMemo(
    () => [...docs.items, ...diagrams.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [docs.items, diagrams.items],
  );
  const favorites = recent.filter((i) => i.favorite);
  const loading = docs.loading || diagrams.loading;

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
            const template = templatesFor(q.kind).find((t) => t.id === q.template)!;
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
            <h3 id="recent" className="px-3 pb-1 pt-2 text-sm font-semibold">
              Recent work
            </h3>
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
          <Card className="p-2">
            <h3 className="px-3 pb-1 pt-2 text-sm font-semibold">Favorites</h3>
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
                {docs.items.length} document{docs.items.length === 1 ? '' : 's'} and {diagrams.items.length} diagram
                {diagrams.items.length === 1 ? '' : 's'}. Export a backup from Settings to keep a copy elsewhere.
              </p>
            </div>
          </Card>
        </aside>
      </div>

      {dialog && <NewItemDialog kind={dialog} open onClose={() => setDialog(null)} />}
    </div>
  );
}
