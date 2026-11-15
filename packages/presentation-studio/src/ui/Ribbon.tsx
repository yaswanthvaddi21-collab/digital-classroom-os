import { cn } from '@dcos/ui';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface RibbonTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * The presentation ribbon: a row of tabs (WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs) and the
 * active tab's controls. `leading` (undo and redo) and `trailing` (the Export menu, @phase7:SHOW the slide
 * show button) stay visible on every tab. Ids are unique per ribbon, so a second
 * ribbon on the page (a dialog) cannot clash with it.
 *
 * Tabs a group has not filled yet are not shown at all, so no tab is ever empty or holds a control that does nothing.
 */
export function Ribbon({ tabs, active, onTab, leading, trailing }: { tabs: RibbonTab[]; active: string; onTab: (id: string) => void; leading?: ReactNode; trailing?: ReactNode }) {
  const uid = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const list = useRef<HTMLDivElement>(null);
  const tabId = (id: string) => `${uid}-tab-${id}`;
  const panelId = `${uid}-panel`;

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.indexOf(current);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    onTab(target.id);
    requestAnimationFrame(() => document.getElementById(tabId(target.id))?.focus());
  };

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <div className="flex items-end gap-2 border-b border-border bg-surface-2/50 px-2 pt-1">
        {leading && <div className="flex shrink-0 items-center gap-0.5 pb-0.5">{leading}</div>}
        <div ref={list} role="tablist" aria-label="Presentation toolbar" onKeyDown={onKeyDown} className="flex min-w-0 items-end gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              role="tab"
              aria-selected={t === current}
              aria-controls={panelId}
              tabIndex={t === current ? 0 : -1}
              onClick={() => onTab(t.id)}
              className={cn(
                'shrink-0',
                t === current ? '-mb-px rounded-t-md border border-b-surface border-border bg-surface px-3 py-1 text-xs font-semibold text-fg' : 'rounded-t-md px-3 py-1 text-xs font-medium text-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {trailing && <div className="ml-auto flex shrink-0 items-center gap-1 pb-0.5">{trailing}</div>}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(current.id)}>
        <div role="toolbar" aria-label={current.label} className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]">
          {current.content}
        </div>
      </div>
    </div>
  );
}
