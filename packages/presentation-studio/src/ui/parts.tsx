/**
 * Small toolbar parts for the presentation ribbon. Document Studio has similar ones, but the package boundary keeps
 * presentation-studio from importing them (tests/integration/boundaries.test.ts).
 */
import { cn, useAnchoredDropdown } from '@dcos/ui';
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

/** A labelled cluster of related controls within a tab. */
export function Group({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex shrink-0 items-center gap-0.5 border-r border-border pr-1.5 last:border-r-0', className)}>
      {children}
    </div>
  );
}

export interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  label: string;
  /** Shown after the label in the tooltip, e.g. "Ctrl+B". */
  shortcut?: string;
  /** A toggle: its pressed state. */
  pressed?: boolean;
  /** Text shown beside the icon (the label stays the accessible name). */
  text?: string;
}

/**
 * An icon button for the ribbon. It keeps the keyboard focus where it was on mouse down, so formatting applies to the
 * text being edited without taking the focus out of it.
 */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton({ label, shortcut, pressed, text, className, children, onMouseDown, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown?.(e);
      }}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40',
        pressed && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      {children}
      {text && <span className="whitespace-nowrap">{text}</span>}
    </button>
  );
});

/** A ribbon popover: renders its trigger via a render prop and closes on an outside click or Escape. */
export function Popover({ trigger, children, align = 'start', label }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      ref.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const position = useAnchoredDropdown(open, setOpen, ref, align);
  return (
    <div ref={ref} className="relative shrink-0">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="dialog" aria-label={label} style={position} className="z-50 rounded-xl border border-border bg-surface p-2 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Colour swatches: an "automatic" choice, the theme's colours and a few standard ones. */
export function ColorSwatches({ theme, standard, onPick, automaticLabel }: { theme: Array<{ label: string; value: string; css: string }>; standard: string[]; onPick: (value: string | null) => void; automaticLabel: string }) {
  const swatch = (label: string, css: string, value: string) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(value)}
      className="h-6 w-6 rounded-md border border-black/15 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
      style={{ background: css }}
    />
  );
  return (
    <div className="flex w-56 flex-col gap-2 text-xs">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(null)} className="rounded-md px-2 py-1 text-left hover:bg-surface-2">
        {automaticLabel}
      </button>
      <div>
        <div className="mb-1 text-muted">Theme colours</div>
        <div className="grid grid-cols-8 gap-1">{theme.map((t) => swatch(t.label, t.css, t.value))}</div>
      </div>
      <div>
        <div className="mb-1 text-muted">Standard colours</div>
        <div className="grid grid-cols-8 gap-1">{standard.map((c) => swatch(`Colour ${c}`, c, c))}</div>
      </div>
    </div>
  );
}

export const STANDARD_COLORS = ['#000000', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#7f7f7f', '#d9d9d9', '#e36c09', '#4bacc6'];
