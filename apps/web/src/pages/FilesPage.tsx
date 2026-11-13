import type { ItemKind, ItemSummary } from '@dcos/local-storage';
import { Button, Card, Dialog, EmptyState, Input, Select, useToast } from '@dcos/ui';
import { FileText, GitFork, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog } from '../components/NewItemDialog';
import { notifyStorageChanged, storage, useItems } from '../lib/storage';

type Sort = 'updated' | 'title' | 'created';

export function FilesPage({ kind, trash = false }: { kind: ItemKind; trash?: boolean }) {
  const docs = useItems('document', { trashed: trash });
  const diagrams = useItems('diagram', { trashed: trash });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [creating, setCreating] = useState(false);
  const [purging, setPurging] = useState<ItemSummary | null>(null);
  const toast = useToast();

  const source = trash ? [...docs.items, ...diagrams.items] : kind === 'document' ? docs.items : diagrams.items;
  const loading = trash ? docs.loading || diagrams.loading : kind === 'document' ? docs.loading : diagrams.loading;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? source.filter((i) => i.title.toLowerCase().includes(q)) : source;
    const sorted = [...filtered];
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'created') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else sorted.sort((a, b) => (trash ? b.deletedAt!.localeCompare(a.deletedAt!) : b.updatedAt.localeCompare(a.updatedAt)));
    return sorted;
  }, [source, query, sort, trash]);

  const noun = trash ? 'items' : kind === 'document' ? 'documents' : 'diagrams';
  const Icon = trash ? Trash2 : kind === 'document' ? FileText : GitFork;

  const purge = async () => {
    if (!purging) return;
    try {
      await storage.purge(purging.kind, purging.id);
      notifyStorageChanged();
      toast(`“${purging.title}” was permanently deleted`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setPurging(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${noun}`} className="pl-9" aria-label={`Search ${noun}`} />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="h-9">
          <option value="updated">{trash ? 'Recently deleted' : 'Last edited'}</option>
          <option value="created">Date created</option>
          <option value="title">Name</option>
        </Select>
        {!trash && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            New {kind}
          </Button>
        )}
      </div>

      {trash && items.length > 0 && <p className="text-sm text-muted">Items in the trash can be restored. Deleting forever removes the item and its version history.</p>}

      <Card className="p-2">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<Icon size={20} />}
              title={query ? 'No matches' : trash ? 'Trash is empty' : `No ${noun} yet`}
              description={query ? `Nothing matches “${query}”.` : trash ? 'Deleted documents and diagrams will appear here.' : `Create a ${kind} from a template or start blank.`}
              action={
                !trash && !query ? (
                  <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
                    New {kind}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          items.map((item) => <ItemRow key={item.id} item={item} onPurgeRequest={setPurging} />)
        )}
      </Card>

      {creating && <NewItemDialog kind={kind} open onClose={() => setCreating(false)} />}
      <Dialog
        open={!!purging}
        onClose={() => setPurging(null)}
        size="sm"
        title="Delete forever?"
        description={purging ? `“${purging.title}” and all of its saved versions will be removed from this device. This cannot be undone.` : undefined}
        footer={
          <>
            <Button onClick={() => setPurging(null)}>Cancel</Button>
            <Button variant="danger" onClick={purge}>
              Delete forever
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Tip: export a backup from Settings first if you might need it later.</p>
      </Dialog>
    </div>
  );
}
