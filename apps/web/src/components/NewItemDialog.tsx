import type { ItemKind } from '@dcos/local-storage';
import { Button, cn, Dialog, useToast } from '@dcos/ui';
import { FileInput } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPreference } from '../lib/preferences';
import { notifyStorageChanged, requestPersistentStorage, storage } from '../lib/storage';
import { itemHref, MODULES, type TemplateOption } from '../modules';
import { ImportReportBody, useImportDocument } from './ImportDocument';

export function useCreateItem() {
  const navigate = useNavigate();
  const toast = useToast();
  return async (kind: ItemKind, template: TemplateOption) => {
    try {
      let content = template.build();
      // The blank document starts in the user's preferred editing mode (Settings → General).
      if (kind === 'document' && template.id === 'blank' && content && typeof content === 'object') {
        content = { ...content, mode: getPreference('newDocumentMode') };
      }
      const item = await storage.create(kind, {
        title: template.id === 'blank' ? `Untitled ${MODULES[kind].label.toLowerCase()}` : template.name,
        content,
        templateId: template.id,
      });
      notifyStorageChanged({ kind, id: item.id });
      void requestPersistentStorage();
      navigate(itemHref(kind, item.id));
    } catch (err) {
      toast(`Could not create ${kind}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
}

export function NewItemDialog({ kind, open, onClose }: { kind: ItemKind; open: boolean; onClose: () => void }) {
  const create = useCreateItem();
  const importer = useImportDocument();
  const [busy, setBusy] = useState(false);
  const module = MODULES[kind];
  const Icon = module.icon;
  // After an import with notes, the dialog shows the report, then opens the new document.
  if (importer.outcome) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Imported with notes"
        footer={
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={importer.open}>
              Open document
            </Button>
          </>
        }
      >
        <ImportReportBody outcome={importer.outcome} />
      </Dialog>
    );
  }
  const card = cn(
    'group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left transition',
    'hover:border-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent',
  );
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`New ${module.label.toLowerCase()}`} description="Start blank or from a template. Everything is saved on this device.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {module.templates.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy || importer.busy}
            onClick={async () => {
              setBusy(true);
              await create(kind, t);
              setBusy(false);
              onClose();
            }}
            className={card}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon size={18} />
            </span>
            <span className="text-sm font-semibold">{t.name}</span>
            <span className="text-xs leading-relaxed text-muted">{t.description}</span>
          </button>
        ))}
        {kind === 'document' && (
          <button type="button" disabled={busy || importer.busy} onClick={() => void importer.start()} className={card}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileInput size={18} />
            </span>
            <span className="text-sm font-semibold">{importer.busy ? 'Importing…' : 'Import a file'}</span>
            <span className="text-xs leading-relaxed text-muted">A Word (.docx) or OpenDocument (.odt) file, as a new document. The file itself is not changed.</span>
          </button>
        )}
      </div>
    </Dialog>
  );
}
