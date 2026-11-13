import { diagramTemplates } from '@dcos/diagram-studio';
import { documentTemplates } from '@dcos/document-studio';
import type { ItemKind } from '@dcos/local-storage';
import { cn, Dialog, useToast } from '@dcos/ui';
import { FileText, GitFork } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifyStorageChanged, requestPersistentStorage, storage } from '../lib/storage';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  build: () => unknown;
}

export function templatesFor(kind: ItemKind): TemplateOption[] {
  return kind === 'document' ? documentTemplates : diagramTemplates;
}

export function useCreateItem() {
  const navigate = useNavigate();
  const toast = useToast();
  return async (kind: ItemKind, template: TemplateOption) => {
    try {
      const item = await storage.create(kind, {
        title: template.id === 'blank' ? `Untitled ${kind}` : template.name,
        content: template.build(),
        templateId: template.id,
      });
      notifyStorageChanged();
      void requestPersistentStorage();
      navigate(`/${kind}s/${item.id}`);
    } catch (err) {
      toast(`Could not create ${kind}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
}

export function NewItemDialog({ kind, open, onClose }: { kind: ItemKind; open: boolean; onClose: () => void }) {
  const create = useCreateItem();
  const [busy, setBusy] = useState(false);
  const Icon = kind === 'document' ? FileText : GitFork;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={kind === 'document' ? 'New document' : 'New diagram'}
      description="Start blank or from a template. Everything is saved on this device."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templatesFor(kind).map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await create(kind, t);
              setBusy(false);
              onClose();
            }}
            className={cn(
              'group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left transition',
              'hover:border-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent',
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon size={18} />
            </span>
            <span className="text-sm font-semibold">{t.name}</span>
            <span className="text-xs leading-relaxed text-muted">{t.description}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
