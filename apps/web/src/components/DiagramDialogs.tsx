import type { DiagramEditorApi } from '@dcos/diagram-studio';
import type { DiagramHost, DiagramStart, EmbeddedDiagram } from '@dcos/document-studio';
import type { ItemSummary } from '@dcos/local-storage';
import { Button, Dialog, Input, useToast } from '@dcos/ui';
import { GitFork, Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { relativeTime } from '../lib/format';
import { storage } from '../lib/storage';
import { MODULES } from '../modules';

const loadDiagramStudio = () => import('@dcos/diagram-studio');

/** Reads a diagrams.net file chosen by the user. Must be called from a click so the file picker may open. */
export function chooseDrawioFile(): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.drawio,.xml,.dio,application/xml,text/xml';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { text: await file.text(), name: file.name.replace(/\.(drawio|xml|dio)$/i, '') } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

interface EditRequest {
  current: EmbeddedDiagram | null;
  start?: DiagramStart;
  resolve: (result: EmbeddedDiagram | null) => void;
}

/**
 * The app's side of embedded diagrams: owns the diagram editor dialog, the library picker and storage, and
 * gives Document Studio a small interface to them. Render `dialogs` once inside the page.
 */
export function useDiagramHost(): { host: DiagramHost; dialogs: React.ReactNode } {
  const toast = useToast();
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const [picking, setPicking] = useState<((r: DiagramStart | null) => void) | null>(null);

  const host = useMemo<DiagramHost>(
    () => ({
      templates: MODULES.diagram.templates.map((t) => ({ id: t.id, name: t.name })),
      edit: (current, start) => new Promise((resolve) => setEditing({ current, start, resolve })),
      pickFromLibrary: () => new Promise((resolve) => setPicking(() => resolve)),
      importFile: async () => {
        const file = await chooseDrawioFile();
        if (!file) return null;
        const { fromDrawio } = await loadDiagramStudio();
        try {
          const { content, report } = fromDrawio(file.text);
          return { source: content, title: report.title === 'Imported diagram' ? file.name : report.title, notes: report.notes };
        } catch (err) {
          toast(`Could not import “${file.name}”: ${err instanceof Error ? err.message : String(err)}`, 'error');
          return null;
        }
      },
      loadPreview: async (id) => {
        const a = await storage.getAttachment(id);
        return a ? new Blob([a.data], { type: a.mimeType }) : undefined;
      },
      toDrawio: async (source, title) => {
        const { toDrawio, deserializeDiagram, serializeDiagram } = await loadDiagramStudio();
        const s = deserializeDiagram(source);
        return toDrawio(serializeDiagram(s.nodes, s.edges, s.viewport, s.settings), title);
      },
    }),
    [toast],
  );

  const dialogs = (
    <>
      {editing && (
        <DiagramEditDialog
          request={editing}
          onDone={(result) => {
            editing.resolve(result);
            setEditing(null);
          }}
        />
      )}
      {picking && (
        <LibraryPicker
          onDone={(result) => {
            picking(result);
            setPicking(null);
          }}
        />
      )}
    </>
  );
  return { host, dialogs };
}

type Studio = Awaited<ReturnType<typeof loadDiagramStudio>>;

function DiagramEditDialog({ request, onDone }: { request: EditRequest; onDone: (r: EmbeddedDiagram | null) => void }) {
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const api = useRef<DiagramEditorApi>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [title, setTitle] = useState(request.current?.title ?? request.start?.title ?? 'Diagram');
  const [dirty, setDirty] = useState(!request.current);
  const [saving, setSaving] = useState(false);
  const isNew = !request.current;

  const initial = useMemo(() => {
    if (!studio) return null;
    if (request.current) return request.current.source;
    if (request.start?.source) return request.start.source;
    const t = studio.diagramTemplates.find((x) => x.id === request.start?.templateId);
    return t ? t.build() : studio.createEmptyDiagram();
  }, [studio, request]);

  useEffect(() => {
    loadDiagramStudio().then(setStudio, (err) => {
      toast(`The diagram editor could not be loaded: ${err instanceof Error ? err.message : String(err)}`, 'error');
      onDone(null);
    });
    ref.current?.showModal();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(() => {
    if (dirty && !isNew && !confirm('Discard your changes to this diagram?')) return false;
    onDone(null);
    return true;
  }, [dirty, isNew, onDone]);

  const save = async () => {
    const editor = api.current;
    if (!editor) return;
    const content = editor.getContent();
    if (!content.nodes.length) {
      toast('Add at least one shape before saving the diagram.', 'error');
      return;
    }
    setSaving(true);
    try {
      // The diagram data and its rendered preview are stored separately: data in the document, PNG as an attachment.
      const png = await editor.renderPng(2);
      const attachment = await storage.putAttachment(png.blob, 'image/png');
      onDone({ source: content, previewId: attachment.id, naturalWidth: png.width, naturalHeight: png.height, title: title.trim() || 'Diagram' });
    } catch (err) {
      toast(`The diagram could not be saved: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setSaving(false);
    }
  };

  const Editor = studio?.DiagramEditor as ComponentType<{ initialContent: unknown; title: string; onChange: () => void; apiRef: React.Ref<DiagramEditorApi> }> | undefined;
  return (
    <dialog
      ref={ref}
      aria-label={isNew ? 'New diagram' : 'Edit diagram'}
      className="m-auto h-[94vh] w-[96vw] max-w-none overflow-hidden rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <GitFork size={16} className="text-accent" />
          <Input aria-label="Diagram title" value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="h-8 max-w-xs" />
          <span className="hidden text-xs text-muted md:inline">{isNew ? 'This diagram will be placed in your document.' : 'Changes appear in your document when you save.'}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={saving || !studio} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              {isNew ? 'Insert into document' : 'Save changes'}
            </Button>
          </div>
        </header>
        {!!request.start?.notes?.length && (
          <div role="status" className="flex gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs">
            <Info size={14} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <div className="font-semibold">Imported from diagrams.net with these differences:</div>
              <ul className="list-disc pl-4">
                {request.start.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {Editor && initial ? (
            <Editor initialContent={initial} title={title} onChange={() => setDirty(true)} apiRef={api} />
          ) : (
            <div className="p-6 text-sm text-muted">Opening the diagram editor…</div>
          )}
        </div>
      </div>
    </dialog>
  );
}

function LibraryPicker({ onDone }: { onDone: (r: DiagramStart | null) => void }) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  useEffect(() => {
    storage.list('diagram').then(setItems);
  }, []);
  return (
    <Dialog open onClose={() => onDone(null)} title="Insert from my diagrams" description="A copy is placed in the document; the original diagram stays unchanged.">
      {!items ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">You have no diagrams yet. Use “New diagram” instead.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-2"
                onClick={async () => {
                  const full = await storage.get('diagram', d.id);
                  onDone(full ? { source: full.content, title: full.title } : null);
                }}
              >
                <GitFork size={16} className="text-muted" />
                <span className="flex-1 text-sm font-medium">{d.title}</span>
                <span className="text-xs text-muted">{relativeTime(d.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
