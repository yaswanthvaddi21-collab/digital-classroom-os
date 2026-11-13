import { Button, Dialog, useToast } from '@dcos/ui';
import { FileWarning } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifyStorageChanged, requestPersistentStorage, storage } from '../lib/storage';
import { itemHref } from '../modules';

/** Word and OpenDocument files (kept in step with IMPORT_ACCEPT in document-studio, which loads with the editor). */
const ACCEPT = '.docx,.odt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text';
const MAX_BYTES = 50 * 1024 * 1024;

/** Asks the user for one file. Resolves null when they cancel. */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** What an import could not bring in, shown before the new document is opened. */
export interface ImportOutcome {
  id: string;
  title: string;
  notes: string[];
}

/**
 * Imports a Word (.docx) or OpenDocument (.odt) file as a NEW document (never into an existing one). With nothing
 * to report, the new document opens straight away; otherwise `outcome` holds the report to show first.
 */
export function useImportDocument() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const importFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        if (file.size > MAX_BYTES) throw new Error('The file is larger than 50 MB');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { importDocumentFile, importSummary } = await import('@dcos/document-studio');
        const result = await importDocumentFile(file.name, bytes);
        const item = await storage.create('document', { title: result.title, content: result.content, templateId: null });
        notifyStorageChanged({ kind: 'document', id: item.id });
        void requestPersistentStorage();
        const { message, notes } = importSummary(result.title, result.report);
        if (notes.length) setOutcome({ id: item.id, title: result.title, notes });
        else {
          toast(message, 'success');
          navigate(itemHref('document', item.id));
        }
      } catch (err) {
        toast(`Could not import “${file.name}”: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [navigate, toast],
  );

  const start = useCallback(async () => {
    const file = await chooseFile(ACCEPT);
    if (file) await importFile(file);
  }, [importFile]);

  const open = useCallback(() => {
    if (!outcome) return;
    setOutcome(null);
    navigate(itemHref('document', outcome.id));
  }, [navigate, outcome]);

  return { start, importFile, busy, outcome, open, dismiss: () => setOutcome(null) };
}

/** The import report: what was not brought in, with the way to the new document. */
export function ImportReportBody({ outcome }: { outcome: ImportOutcome }) {
  return (
    <div role="status" className="flex flex-col gap-3 text-sm">
      <p>
        “{outcome.title}” was imported as a new document. Some parts of the file could not be brought in exactly:
      </p>
      <ul className="flex flex-col gap-1.5">
        {outcome.notes.map((n) => (
          <li key={n} className="flex items-start gap-2">
            <FileWarning size={15} className="mt-0.5 shrink-0 text-warning" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted">The original file is unchanged.</p>
    </div>
  );
}

/** The report as its own dialog (for the Documents list). */
export function ImportReportDialog({ outcome, onOpen, onClose }: { outcome: ImportOutcome | null; onOpen: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={!!outcome}
      onClose={onClose}
      title="Imported with notes"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onOpen}>
            Open document
          </Button>
        </>
      }
    >
      {outcome && <ImportReportBody outcome={outcome} />}
    </Dialog>
  );
}
