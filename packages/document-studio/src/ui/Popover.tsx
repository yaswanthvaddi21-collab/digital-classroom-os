import { cn, useAnchoredDropdown } from '@dcos/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Toolbar popover. Renders its trigger via a render prop and closes on outside click or Esc. */
export function Popover({
  trigger,
  children,
  align = 'start',
  className,
  openOn,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  /** A window event name that opens the popover (used for keyboard shortcuts). */
  openOn?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!openOn) return;
    const show = () => setOpen(true);
    window.addEventListener(openOn, show);
    return () => window.removeEventListener(openOn, show);
  }, [openOn]);
  // Viewport-positioned so the scrolling toolbar row cannot clip it.
  const position = useAnchoredDropdown(open, setOpen, ref, align);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div style={position} className={cn('z-50 rounded-xl border border-border bg-surface p-2 shadow-lg', className)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const TEXT_COLORS = ['#1a1a1f', '#5b5b66', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#0e7490', '#1d4ed8', '#6d28d9', '#be185d'];
export const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8', '#fed7aa', '#e5e7eb'];

export function Swatches({ colors, onPick, onClear, clearLabel }: { colors: string[]; onPick: (c: string) => void; onClear: () => void; clearLabel: string }) {
  return (
    <div className="flex w-48 flex-col gap-2">
      <div className="grid grid-cols-5 gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            title={c}
            onClick={() => onPick(c)}
            className="h-7 w-7 rounded-md border border-black/10 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
            style={{ background: c }}
          />
        ))}
      </div>
      <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-left text-xs text-muted hover:bg-surface-2">
        {clearLabel}
      </button>
    </div>
  );
}
