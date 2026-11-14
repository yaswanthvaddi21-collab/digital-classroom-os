import { cn, useToast } from '@dcos/ui';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
type FsDocument = Document & { webkitFullscreenElement?: Element | null };

const inFullscreen = () => typeof document !== 'undefined' && !!((document as FsDocument).fullscreenElement ?? (document as FsDocument).webkitFullscreenElement);

/**
 * The editor's toast. In full screen only the editor is drawn, and the app's toasts (outside it) cannot be seen, so
 * each message is also shown inside the editor while it is full screen (@phase5:canvas): export notes, errors, the
 * cut and ungroup notes. Outside full screen this is the app's toast unchanged. Render `overlay` inside the element
 * that goes full screen.
 */
export function useEditorToast(): { toast: (message: string, tone?: Tone) => void; overlay: ReactNode } {
  const appToast = useToast();
  const [items, setItems] = useState<Array<{ id: number; message: string; tone: Tone }>>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);
  const toast = useCallback(
    (message: string, tone: Tone = 'info') => {
      appToast(message, tone);
      if (!inFullscreen()) return;
      const id = Date.now() + Math.random();
      setItems((t) => [...t, { id, message, tone }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setItems((t) => t.filter((x) => x.id !== id));
      }, tone === 'error' ? 7000 : 3500);
      timers.current.add(timer);
    },
    [appToast],
  );
  const icons = { info: <Info size={16} />, success: <CheckCircle2 size={16} />, error: <AlertTriangle size={16} /> };
  const overlay = items.length ? (
    <div aria-live="polite" className="dcos-fullscreen-toasts pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg shadow-lg">
          <span className={cn(t.tone === 'success' && 'text-success', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-accent')}>{icons[t.tone]}</span>
          {t.message}
        </div>
      ))}
    </div>
  ) : null;
  return { toast, overlay };
}
