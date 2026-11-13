import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from './components';

type ToastTone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  const icons = { info: <Info size={16} />, success: <CheckCircle2 size={16} />, error: <AlertTriangle size={16} /> };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg shadow-lg',
              'animate-[dcos-toast-in_160ms_ease-out]',
            )}
          >
            <span className={cn(t.tone === 'success' && 'text-success', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-accent')}>{icons[t.tone]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
