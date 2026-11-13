import { cn } from '@dcos/ui';
import type { ReactNode } from 'react';
import type { EditorMode } from '../../types';

/** A labelled cluster of related controls within a tab. */
export function Group({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={cn('flex shrink-0 items-center gap-0.5', className)}>
      {children}
    </div>
  );
}

/** Simple / Advanced switch; shown beside every tab because it applies to the whole document. */
export function ModeToggle({ mode, onModeChange }: { mode: EditorMode; onModeChange: (m: EditorMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Editor mode" className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-medium">
      {(['simple', 'advanced'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onModeChange(m)}
          className={cn('rounded-md px-2.5 py-1 capitalize', mode === m ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg')}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
