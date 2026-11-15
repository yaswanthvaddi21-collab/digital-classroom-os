import { cn } from '@dcos/ui';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  /** Draws a line above this item. */
  separator?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  label: string;
  /** Gets the focus back when the menu closes. */
  returnFocus?: HTMLElement | null;
}

/**
 * A menu at the pointer (right click, long press) or at the selection (Shift+F10, the Menu key). Keyboard pattern as
 * the app's Menu: the first item is focused, arrows/Home/End move, Escape closes and puts the focus back.
 */
export function ContextMenu({ menu, onClose }: { menu: ContextMenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  useLayoutEffect(() => {
    if (!menu) return setPos(null);
    const el = ref.current;
    const w = el?.offsetWidth ?? 200;
    const h = el?.offsetHeight ?? 200;
    setPos({ left: Math.max(8, Math.min(menu.x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - h - 8)) });
  }, [menu]);

  // Focus the first item once the menu is placed (a hidden element cannot take the focus).
  const placed = !!pos;
  useEffect(() => {
    if (menu && placed) items()[0]?.focus({ preventScroll: true });
  }, [menu, placed]);

  useEffect(() => {
    if (!menu) return;
    const close = (back: boolean) => {
      onClose();
      if (back) menu.returnFocus?.focus({ preventScroll: true });
    };
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const onMove = () => close(false);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('blur', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('blur', onMove);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === 'undefined') return null;
  const onKey = (e: ReactKeyboardEvent) => {
    const all = items();
    if (!all.length) return;
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => {
      e.preventDefault();
      all[(i + all.length) % all.length].focus({ preventScroll: true });
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? all.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
      menu.returnFocus?.focus({ preventScroll: true });
    }
  };
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      className="z-[60] min-w-52 rounded-xl border border-border bg-surface p-1 text-fg shadow-lg"
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          tabIndex={-1}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            menu.returnFocus?.focus({ preventScroll: true });
            item.onSelect();
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-40',
            item.danger ? 'text-danger' : 'text-fg',
            item.separator && 'mt-1 border-t border-border pt-2',
          )}
        >
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
          {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
