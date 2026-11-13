import type { ItemKind } from '@dcos/local-storage';
import { cn } from '@dcos/ui';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { closeTab, forgetTabs, neighbourTab, openTab, useOpenTabs, type OpenTab } from '../lib/openTabs';
import { useItems } from '../lib/storage';
import { itemHref, MODULES } from '../modules';

/** Ctrl+Alt+→ / ← (Control+Option on a Mac): the next or previous open item. */
export function isTabShortcut(e: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'key'>): 1 | -1 | 0 {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey) return 0;
  return e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
}

/**
 * The open items (documents and diagrams) as tabs in the editor header: switch with a click or Ctrl+Alt+→/←, close
 * with ×. Remembered on this device. Shown once two or more items are open.
 */
export function OpenTabs({ kind, id, title }: { kind: ItemKind; id: string; title: string }) {
  const tabs = useOpenTabs();
  const { items, loading, error } = useItems();
  const navigate = useNavigate();
  const current: OpenTab = { kind, id };
  const currentRef = useRef(current);
  currentRef.current = current;
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => openTab({ kind, id }), [kind, id]);

  // Items deleted forever (or moved to the trash) since they were opened are closed; the current one always stays.
  useEffect(() => {
    if (loading || error) return;
    forgetTabs((t) => (t.kind === kind && t.id === id) || items.some((i) => i.kind === t.kind && i.id === t.id));
  }, [items, loading, error, kind, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = isTabShortcut(e);
      if (!step) return;
      const next = neighbourTab(currentRef.current, step);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      navigate(itemHref(next.kind, next.id));
    };
    // Capture: editors (the diagram canvas) handle arrow keys themselves.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [navigate]);

  const nameOf = (t: OpenTab) => {
    if (t.kind === kind && t.id === id) return title.trim() || 'Untitled';
    const item = items.find((i) => i.kind === t.kind && i.id === t.id);
    return item ? item.title.trim() || 'Untitled' : loading ? '…' : 'Untitled';
  };
  // The current tab is kept in view when it changes and whenever the names change the strip's width (they load
  // after the strip first shows, and titles are edited).
  const names = tabs.map(nameOf).join('\n');
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [id, names]);

  if (tabs.length < 2) return null;

  const close = (t: OpenTab) => {
    const instead = closeTab(t);
    if (t.kind !== kind || t.id !== id) return;
    navigate(instead ? itemHref(instead.kind, instead.id) : `/${MODULES[kind].route}`);
  };

  return (
    <nav aria-label="Open items" className="flex h-9 min-w-0 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-surface-2 px-2">
      {tabs.map((t) => {
        const active = t.kind === kind && t.id === id;
        const name = nameOf(t);
        const Icon = MODULES[t.kind].icon;
        return (
          <div
            key={`${t.kind}:${t.id}`}
            className={cn(
              'flex max-w-[13rem] shrink-0 items-center rounded-t-md border border-b-0 text-xs',
              active ? 'border-border bg-surface font-medium text-fg' : 'border-transparent text-muted hover:bg-surface hover:text-fg',
            )}
          >
            <Link
              ref={active ? activeRef : undefined}
              to={itemHref(t.kind, t.id)}
              aria-current={active ? 'page' : undefined}
              title={`${name} (${MODULES[t.kind].label.toLowerCase()})`}
              className="flex min-w-0 items-center gap-1.5 rounded py-1.5 pl-2.5 pr-1 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon size={13} className="shrink-0" aria-hidden />
              <span className="truncate">{name}</span>
            </Link>
            <button
              type="button"
              aria-label={`Close ${name}`}
              title="Close"
              onClick={() => close(t)}
              className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
