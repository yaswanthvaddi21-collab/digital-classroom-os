import { Menu } from '@dcos/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PresentationContent, SlideLayout } from '../types';

/** A small drawing of a layout: its placeholders as boxes (titles darker). */
export function LayoutThumb({ layout, size }: { layout: SlideLayout; size: PresentationContent['size'] }) {
  const w = 48;
  const h = (w * size.height) / size.width;
  const s = w / size.width;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0 rounded-sm border border-border bg-white">
      {layout.placeholders.map((p) => (
        <rect key={p.id} x={p.x * s} y={p.y * s} width={Math.max(1, p.w * s)} height={Math.max(1, p.h * s)} rx={0.8} fill={p.kind === 'title' ? '#9ca3af' : '#e5e7eb'} stroke="#9ca3af" strokeWidth={0.4} />
      ))}
    </svg>
  );
}

/**
 * The layout menu of "New slide": every layout of the presentation, drawn small, with its name. Built on the app's
 * Menu (keyboard pattern: arrows, Home, End, Escape back to the button).
 */
export function LayoutMenu({ content, onPick, trigger }: { content: PresentationContent; onPick: (layoutId: string) => void; trigger?: (p: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode }) {
  return (
    <Menu
      trigger={
        trigger ??
        ((p) => (
          <button
            type="button"
            {...p}
            aria-haspopup="menu"
            aria-label="New slide with layout"
            title="New slide with layout"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex h-8 items-center rounded-md px-1 text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDown size={14} />
          </button>
        ))
      }
      items={content.layouts.map((l) => ({ label: l.name, icon: <LayoutThumb layout={l} size={content.size} />, onSelect: () => onPick(l.id) }))}
    />
  );
}
