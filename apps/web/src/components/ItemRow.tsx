import type { ItemSummary } from '@dcos/local-storage';
import { IconButton, Menu, useToast } from '@dcos/ui';
import { Copy, MoreHorizontal, RotateCcw, Star, Trash2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBytes, relativeTime } from '../lib/format';
import { notifyStorageChanged, storage } from '../lib/storage';
import { itemHref, MODULES } from '../modules';

export function ItemRow({ item, showKind = false, onPurgeRequest }: { item: ItemSummary; showKind?: boolean; onPurgeRequest?: (item: ItemSummary) => void }) {
  const toast = useToast();
  const trashed = item.deletedAt !== null;
  const module = MODULES[item.kind];
  const Icon = module.icon;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      notifyStorageChanged({ kind: item.kind, id: item.id });
      toast(done, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // Starring is metadata: it does not count as an edit or disturb an open editor (audit CODE-6).
  const toggleFavorite = () => run(() => storage.setFavorite(item.kind, item.id, !item.favorite), item.favorite ? 'Removed from favorites' : 'Added to favorites');

  const name = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{item.title}</div>
        <div className="text-xs text-muted">
          {showKind && `${module.label} · `}
          {trashed ? `Deleted ${relativeTime(item.deletedAt!)}` : `Edited ${relativeTime(item.updatedAt)}`} · {formatBytes(item.sizeBytes)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="group flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-surface-2">
      {trashed ? (
        <div className="min-w-0 flex-1">{name}</div>
      ) : (
        <Link to={itemHref(item.kind, item.id)} className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
          {name}
        </Link>
      )}
      {!trashed && (
        <IconButton
          label={item.favorite ? 'Unfavorite' : 'Favorite'}
          onClick={toggleFavorite}
          className={item.favorite ? 'text-warning' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100'}
        >
          <Star size={15} fill={item.favorite ? 'currentColor' : 'none'} />
        </IconButton>
      )}
      <Menu
        align="end"
        trigger={(p) => (
          <IconButton label="More actions" {...p}>
            <MoreHorizontal size={16} />
          </IconButton>
        )}
        items={
          trashed
            ? [
                { label: 'Restore', icon: <RotateCcw size={14} />, onSelect: () => run(() => storage.restore(item.kind, item.id), 'Restored') },
                { label: 'Delete forever', icon: <XCircle size={14} />, danger: true, onSelect: () => onPurgeRequest?.(item) },
              ]
            : [
                { label: 'Duplicate', icon: <Copy size={14} />, onSelect: () => run(() => storage.duplicate(item.kind, item.id), 'Duplicated') },
                { label: 'Move to trash', icon: <Trash2 size={14} />, danger: true, onSelect: () => run(() => storage.trash(item.kind, item.id), 'Moved to trash') },
              ]
        }
      />
    </div>
  );
}
