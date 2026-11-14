import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './components';

type ToastTone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

const isModal = (d: HTMLDialogElement) => {
  try {
    return d.matches(':modal');
  } catch {
    // Engines without :modal (jsdom). Every dialog in this app is opened with showModal().
    return d.open;
  }
};

/**
 * The open modal <dialog> drawn last (the top of the top layer), or null. While a modal dialog is open, everything
 * outside it is drawn below it and is inert (hidden from screen readers too), so toasts must be shown inside it.
 */
export function topModalDialog(): HTMLDialogElement | null {
  if (typeof document === 'undefined') return null;
  const open = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(isModal);
  return open.at(-1) ?? null;
}

/**
 * Follows the top modal dialog. Opening and closing (the `open` attribute) is always followed, which is cheap, so an
 * empty toast area already sits inside a dialog when a toast arrives (and is announced there). While `toasts` are
 * shown, dialogs removed from the page without being closed are followed too. `sync` checks again right now and says
 * whether the dialog changed (a dialog may have been removed while no toast was shown).
 */
function useTopModalDialog(toasts: boolean): { dialog: HTMLDialogElement | null; sync: () => boolean } {
  const [top, setTop] = useState<HTMLDialogElement | null>(null);
  const current = useRef<HTMLDialogElement | null>(null);
  const update = useCallback(() => {
    const next = topModalDialog();
    if (next === current.current) return false;
    current.current = next;
    setTop(next);
    return true;
  }, []);
  useEffect(() => {
    update();
    const observer = new MutationObserver(() => void update());
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'], childList: toasts });
    return () => observer.disconnect();
  }, [toasts, update]);
  // A dialog removed since the last update no longer counts.
  return { dialog: top?.isConnected && top.open ? top : null, sync: update };
}

/** How long a toast waits when the toast area first has to move (so screen readers know the area before the toast). */
const MOVE_FIRST_MS = 50;

/**
 * The app's toasts. While a modal dialog is open they are shown inside it (RG-8 / TD-24), so they are drawn above
 * it and announced; otherwise in the page's corner as before. Each toast is a status message, errors an alert.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { dialog, sync } = useTopModalDialog(toasts.length > 0);
  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = Date.now() + Math.random();
      const add = () => {
        setToasts((t) => [...t, { id, message, tone }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
      };
      // The empty toast area may still sit in a dialog that was removed without being closed (nothing watched for
      // that while no toast was shown): move it first, then add the toast, so it is announced where it is shown.
      if (sync()) setTimeout(add, MOVE_FIRST_MS);
      else add();
    },
    [sync],
  );
  const icons = { info: <Info size={16} />, success: <CheckCircle2 size={16} />, error: <AlertTriangle size={16} /> };
  const list = (
    <div aria-live="polite" data-dcos-toasts="" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg shadow-lg',
            'animate-[dcos-toast-in_160ms_ease-out]',
          )}
        >
          <span aria-hidden className={cn(t.tone === 'success' && 'text-success', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-accent')}>
            {icons[t.tone]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      {dialog ? createPortal(list, dialog) : list}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
