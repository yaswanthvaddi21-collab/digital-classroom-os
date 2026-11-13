import { Button, cn } from '@dcos/ui';
import { ChevronDown, Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover } from './Popover';

export interface ExportItem {
  label: string;
  icon: ReactNode;
  /** A line under the label explaining what happens (e.g. that the print dialog is used). */
  description?: string;
  hint?: string;
  onSelect: () => void;
}

/** The Export menu. Like the app's Menu, with a short description under items that need one. */
export function ExportMenu({ items }: { items: ExportItem[] }) {
  return (
    <Popover
      align="end"
      className="p-1"
      trigger={({ toggle, open }) => (
        <Button size="sm" variant="primary" icon={<Download size={14} />} aria-label="Export" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <span className="hidden sm:inline">Export</span> <ChevronDown size={13} />
        </Button>
      )}
    >
      {(close) => (
        <div role="menu" aria-label="Export" className="w-72 max-w-[calc(100vw-24px)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2 focus-visible:bg-surface-2')}
            >
              <span className="mt-0.5 text-muted">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {item.description && <span className="mt-0.5 block text-xs leading-snug text-muted">{item.description}</span>}
              </span>
              {item.hint && <span className="mt-0.5 text-xs text-muted">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
