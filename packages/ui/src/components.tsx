import { clsx, type ClassValue } from 'clsx';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2 shadow-xs',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        buttonVariants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Square toolbar button. `label` is required: it is the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-fg transition-colors',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none',
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted',
        'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent',
        className,
      )}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-fg focus:outline-none focus:ring-2 focus:ring-accent/40',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-xs', className)} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/12 text-danger',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Separator({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <div role="separator" className={cn(vertical ? 'mx-1 h-5 w-px' : 'my-1 h-px w-full', 'bg-border shrink-0', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/** Modal built on the native <dialog> element: focus trapping, Esc and top-layer stacking come for free. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  // Named by its title (and described by its description), so assistive technology announces what opened (Round 3).
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]', widths[size])}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * Places a dropdown under its trigger using viewport coordinates, so scrolling toolbars (overflow: auto) cannot
 * clip it. When something scrolls, the dropdown follows its trigger (a phone's ribbon may scroll as a menu opens),
 * and closes once the trigger has left the screen; a window resize closes it.
 *
 * Given the dropdown element (`dropdown`), it also keeps the dropdown on screen (Phase 7 Round 3, menu-height): it is
 * capped to the room below the trigger and scrolls inside itself, or, when it does not fit below and there is more
 * room above, it opens above the trigger instead. A dropdown that fits below looks exactly as before.
 */
export function useAnchoredDropdown(
  open: boolean,
  setOpen: (open: boolean) => void,
  anchor: React.RefObject<HTMLElement | null>,
  align: 'start' | 'end',
  dropdown?: React.RefObject<HTMLElement | null>,
) {
  // Fixed and hidden from the first render: an in-flow dropdown would stretch the anchor we are about to measure.
  const hidden: React.CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };
  const [style, setStyle] = useState<React.CSSProperties>(hidden);
  const GAP = 4;
  const MARGIN = 8;
  const vertical = (r: DOMRect): React.CSSProperties => {
    const el = dropdown?.current;
    if (!el) return { top: r.bottom + GAP };
    // Its full height, whatever cap it has now (scrollHeight ignores max-height; the rest is its border).
    const natural = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    if (natural <= below || below >= above) return { top: r.bottom + GAP, maxHeight: Math.max(below, 80), overflowY: 'auto' };
    return { top: r.top - GAP - Math.min(natural, above), maxHeight: above, overflowY: 'auto' };
  };
  const place = (r: DOMRect): React.CSSProperties =>
    align === 'end'
      ? { position: 'fixed', ...vertical(r), right: Math.max(8, window.innerWidth - r.right) }
      : { position: 'fixed', ...vertical(r), left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) };
  const same = (a: React.CSSProperties, b: React.CSSProperties) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof React.CSSProperties>;
    return [...keys].every((k) => a[k] === b[k]);
  };
  useLayoutEffect(() => {
    if (!open) setStyle(hidden);
    if (!open || !anchor.current) return;
    setStyle(place(anchor.current.getBoundingClientRect()));
  }, [open, anchor, align]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onResize = () => setOpen(false);
    const onScroll = (e: Event) => {
      const a = anchor.current;
      if (!a || !a.isConnected) return setOpen(false);
      // A scroll that cannot have moved the trigger (inside the dropdown itself, say) changes nothing.
      if ((e.target as Node)?.contains?.(a) === false) return;
      const r = a.getBoundingClientRect();
      const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      if (!onScreen) return setOpen(false);
      setStyle((s) => {
        const next = place(r);
        return same(s, next) ? s : next;
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, setOpen, anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  return style;
}

/** Small dropdown menu. Closes on outside click, Esc, or selection. */
export function Menu({ trigger, items, align = 'start' }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // TD-25 (Phase 6 Round 3): the keyboard menu pattern. Opening focuses the first item; the arrow keys, Home and End
  // move between items; Escape closes the menu and puts focus back on the button that opened it.
  const enabled = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  const triggerEl = () => ref.current?.querySelector<HTMLElement>('[aria-expanded]') ?? null;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Closing the menu consumes Escape, so an enclosing modal <dialog> stays open.
      e.preventDefault();
      const back = list.current?.contains(document.activeElement) ? triggerEl() : null;
      setOpen(false);
      back?.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const position = useAnchoredDropdown(open, setOpen, ref, align, list);
  // A long menu scrolls inside itself (see useAnchoredDropdown), so the item that takes focus is scrolled into view
  // within the menu only: preventScroll keeps the page and the ribbon still, which would otherwise close the menu.
  const focusItem = (el: HTMLButtonElement | undefined) => {
    const box = list.current;
    if (!el || !box) return;
    el.focus({ preventScroll: true });
    const pad = 4; // the menu's own padding (p-1), so the first and last items keep their margin
    if (el.offsetTop - pad < box.scrollTop) box.scrollTop = Math.max(0, el.offsetTop - pad);
    else if (el.offsetTop + el.offsetHeight + pad > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight + pad - box.clientHeight;
  };
  // Focus goes to the first item once the menu is placed: browsers ignore focus() on an element that is still
  // visibility: hidden (the dropdown's first, unplaced render), which left keyboard users on the trigger (Round 3).
  const placed = open && position.visibility !== 'hidden';
  useEffect(() => {
    if (placed) focusItem(enabled()[0]);
  }, [placed]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const all = enabled();
    if (!all.length) return;
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => {
      e.preventDefault();
      focusItem(all[(i + all.length) % all.length]);
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? all.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div ref={list} role="menu" style={position} onKeyDown={onMenuKey} className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-40',
                item.danger ? 'text-danger' : 'text-fg',
              )}
            >
              {item.icon && <span className="text-muted">{item.icon}</span>}
              <span className="flex-1 whitespace-nowrap">{item.label}</span>
              {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
