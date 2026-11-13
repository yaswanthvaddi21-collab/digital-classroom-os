import { clsx, type ClassValue } from 'clsx';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
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
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]', widths[size])}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
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

/** Small dropdown menu. Closes on outside click, Esc, or selection. */
export function Menu({ trigger, items, align = 'start' }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
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
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-40',
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
