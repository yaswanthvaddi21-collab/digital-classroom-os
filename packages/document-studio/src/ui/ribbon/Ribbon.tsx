import { cn } from '@dcos/ui';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { EditorMode } from '../../types';
import type { RibbonContext } from './context';
import { ModeToggle } from './parts';
import { visibleTabs } from './registry';
import { TableBar } from './TableBar';
import { ObjectBar } from '../insert/ObjectBar'; // G-INSERT

/**
 * Word-style ribbon: a row of tabs, the active tab's controls, and the mode switch and Export menu, which apply to
 * the whole document and so stay visible on every tab. Arrow keys move between tabs (WAI-ARIA tabs pattern).
 */
export function Ribbon({ ctx, tab, onModeChange, exportMenu }: { ctx: RibbonContext; tab: string; onModeChange: (m: EditorMode) => void; exportMenu: ReactNode }) {
  const tabs = visibleTabs(ctx);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.indexOf(active);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    ctx.showTab(target.id);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`#dcos-tab-${target.id}`)?.focus());
  };

  return (
    <div className="border-b border-border bg-surface">
      <div ref={list} role="tablist" aria-label="Toolbar" onKeyDown={onKeyDown} className="flex items-end gap-1 overflow-x-auto border-b border-border bg-surface-2/50 px-2 pt-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`dcos-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t === active}
            aria-controls="dcos-ribbon-panel"
            tabIndex={t === active ? 0 : -1}
            onClick={() => ctx.showTab(t.id)}
            className={cn(
              'shrink-0',
              t === active
                ? '-mb-px rounded-t-md border border-b-surface border-border bg-surface px-3 py-1 text-xs font-semibold text-fg'
                : 'rounded-t-md px-3 py-1 text-xs font-medium text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* On a phone the tab's controls get the full width and the mode switch and Export sit on a row below. */}
      <div className="flex flex-col sm:flex-row sm:items-center">
        <div
          id="dcos-ribbon-panel"
          role="tabpanel"
          aria-labelledby={`dcos-tab-${active.id}`}
          className="min-w-0 flex-1"
        >
          <div role="toolbar" aria-label={active.label} className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]">
            <active.Content {...ctx} />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-2 py-1.5 sm:border-l sm:border-t-0">
          <ModeToggle mode={ctx.mode} onModeChange={onModeChange} />
          {exportMenu}
        </div>
      </div>
      {active.id !== 'diagram' && <TableBar {...ctx} />}
      {/* G-INSERT: tools for the selected equation, shape, picture or text box; hosts the equation dialog. */}
      <ObjectBar {...ctx} />
      {/* @phase4:context-bars — further contextual tool bars go here. */}
    </div>
  );
}
