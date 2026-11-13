import type { ItemKind, ItemSummary } from '@dcos/local-storage';
import { Button, Card, cn, Dialog, EmptyState, Input, Menu, Select, useToast } from '@dcos/ui';
import { Clock, FileInput, FolderOpen, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chooseDrawioFile } from '../components/DiagramDialogs';
import { useMemo, useState, type ReactNode } from 'react';
import { ImportReportDialog, useImportDocument } from '../components/ImportDocument';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog } from '../components/NewItemDialog';
import { notifyStorageChanged, purgeItems, requestPersistentStorage, storage, useItems } from '../lib/storage';
import { itemHref, MODULE_LIST, MODULES } from '../modules';

export type ListView = { type: 'kind'; kind: ItemKind } | { type: 'files' } | { type: 'recent' } | { type: 'favorites' } | { type: 'trash' };

type Sort = 'updated' | 'title' | 'created';
const RECENT_LIMIT = 50;

/** One list screen for every view of stored items, so they all behave the same. */
export function ItemListPage({ view }: { view: ListView }) {
  const trash = view.type === 'trash';
  const { items: all, loading, error } = useItems(view.type === 'kind' ? view.kind : undefined, { trashed: trash });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [kindFilter, setKindFilter] = useState<ItemKind | 'all'>('all');
  const [creating, setCreating] = useState<ItemKind | null>(null);
  const [purging, setPurging] = useState<ItemSummary[] | null>(null);
  const toast = useToast();

  const items = useMemo(() => {
    let list = all;
    if (view.type === 'favorites') list = list.filter((i) => i.favorite);
    if (view.type === 'files' && kindFilter !== 'all') list = list.filter((i) => i.kind === kindFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.title.toLowerCase().includes(q));
    const sorted = [...list];
    if (view.type === 'recent') return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT);
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'created') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (trash) sorted.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  }, [all, view.type, kindFilter, query, sort, trash]);

  const copy = describe(view);
  const navigate = useNavigate();
  const importer = useImportDocument();

  /** Creates a new diagram from a diagrams.net / draw.io file, and says what (if anything) did not carry over. */
  const importDrawio = async () => {
    const file = await chooseDrawioFile();
    if (!file) return;
    try {
      const { fromDrawio } = await import('@dcos/diagram-studio');
      const { content, report } = fromDrawio(file.text);
      const item = await storage.create('diagram', { title: report.title === 'Imported diagram' ? file.name : report.title, content, templateId: null });
      notifyStorageChanged({ kind: 'diagram', id: item.id });
      void requestPersistentStorage();
      toast(
        report.notes.length ? `Imported ${report.nodes} shapes and ${report.edges} connectors. Note: ${report.notes.join(' ')}` : `Imported ${report.nodes} shapes and ${report.edges} connectors.`,
        report.notes.length ? 'info' : 'success',
      );
      navigate(itemHref('diagram', item.id));
    } catch (err) {
      toast(`Could not import “${file.name}”: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const purge = async () => {
    if (!purging) return;
    try {
      // All of them or none: a failure part-way leaves everything in the trash.
      await purgeItems(purging);
      toast(purging.length === 1 ? `“${purging[0].title}” was permanently deleted` : `${purging.length} items were permanently deleted`, 'success');
    } catch (err) {
      toast(`Nothing was deleted. ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    setPurging(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${copy.noun}`} className="pl-9" aria-label={`Search ${copy.noun}`} />
        </div>
        {view.type !== 'recent' && (
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="h-9">
            <option value="updated">{trash ? 'Recently deleted' : 'Last edited'}</option>
            <option value="created">Date created</option>
            <option value="title">Name</option>
          </Select>
        )}
        {view.type === 'kind' && view.kind === 'diagram' && (
          <Button icon={<FileInput size={16} />} onClick={() => void importDrawio()}>
            Import diagrams.net
          </Button>
        )}
        {view.type === 'kind' && view.kind === 'document' && (
          <Button icon={<FileInput size={16} />} disabled={importer.busy} title="Word (.docx) or OpenDocument (.odt) files" onClick={() => void importer.start()}>
            {importer.busy ? 'Importing…' : 'Import Word document'}
          </Button>
        )}
        {view.type === 'kind' && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(view.kind)}>
            New {MODULES[view.kind].label.toLowerCase()}
          </Button>
        )}
        {view.type === 'files' && (
          <Menu
            align="end"
            trigger={(p) => (
              <Button variant="primary" icon={<Plus size={16} />} {...p}>
                New
              </Button>
            )}
            items={MODULE_LIST.map((m) => ({ label: m.label, icon: <m.icon size={14} />, onSelect: () => setCreating(m.kind) }))}
          />
        )}
        {trash && all.length > 0 && (
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setPurging(all)}>
            Empty trash
          </Button>
        )}
      </div>

      {view.type === 'files' && (
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
          {(['all', ...MODULE_LIST.map((m) => m.kind)] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kindFilter === k}
              onClick={() => setKindFilter(k)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                kindFilter === k ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:text-fg',
              )}
            >
              {k === 'all' ? 'All' : MODULES[k].plural}
            </button>
          ))}
        </div>
      )}

      {copy.hint && items.length > 0 && <p className="text-sm text-muted">{copy.hint}</p>}

      <Card className="p-2">
        {error ? (
          <div role="alert" className="p-6 text-center text-sm text-danger">
            Your files could not be read from this device's storage: {error}
          </div>
        ) : loading ? (
          <div className="p-6 text-center text-sm text-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={copy.icon}
              title={query ? 'No matches' : copy.emptyTitle}
              description={query ? `Nothing matches “${query}”.` : copy.emptyText}
              action={
                view.type === 'kind' && !query ? (
                  <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(view.kind)}>
                    New {MODULES[view.kind].label.toLowerCase()}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          items.map((item) => <ItemRow key={item.id} item={item} showKind={view.type !== 'kind'} onPurgeRequest={(i) => setPurging([i])} />)
        )}
      </Card>

      {creating && <NewItemDialog kind={creating} open onClose={() => setCreating(null)} />}
      <ImportReportDialog outcome={importer.outcome} onOpen={importer.open} onClose={importer.dismiss} />
      <Dialog
        open={!!purging}
        onClose={() => setPurging(null)}
        size="sm"
        title={purging && purging.length > 1 ? `Delete ${purging.length} items forever?` : 'Delete forever?'}
        description={
          purging
            ? purging.length === 1
              ? `“${purging[0].title}” and all of its saved versions will be removed from this device. This cannot be undone.`
              : 'Everything in the trash, with all saved versions, will be removed from this device. This cannot be undone.'
            : undefined
        }
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

function describe(view: ListView): { noun: string; icon: ReactNode; emptyTitle: string; emptyText: string; hint?: string } {
  switch (view.type) {
    case 'kind': {
      const m = MODULES[view.kind];
      const Icon = m.icon;
      return { noun: m.plural.toLowerCase(), icon: <Icon size={20} />, emptyTitle: `No ${m.plural.toLowerCase()} yet`, emptyText: `Create a ${m.label.toLowerCase()} from a template or start blank.` };
    }
    case 'files':
      return { noun: 'all files', icon: <FolderOpen size={20} />, emptyTitle: 'No files yet', emptyText: 'Documents and diagrams you create appear here.' };
    case 'recent':
      return { noun: 'recent files', icon: <Clock size={20} />, emptyTitle: 'Nothing recent', emptyText: 'Files you edit appear here, newest first.', hint: `The ${RECENT_LIMIT} most recently edited files.` };
    case 'favorites':
      return { noun: 'favorites', icon: <Star size={20} />, emptyTitle: 'No favorites yet', emptyText: 'Star a file to keep it here.' };
    case 'trash':
      return {
        noun: 'trash',
        icon: <Trash2 size={20} />,
        emptyTitle: 'Trash is empty',
        emptyText: 'Deleted documents and diagrams will appear here.',
        hint: 'Items in the trash can be restored. Deleting forever removes the item and its version history.',
      };
  }
}
