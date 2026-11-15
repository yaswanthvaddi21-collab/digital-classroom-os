import type { DiagramEditorApi } from '@dcos/diagram-studio';
import type { DiagramHost, DiagramStart, EmbeddedDiagram } from '@dcos/document-studio';
import type { ItemSummary } from '@dcos/local-storage';
import { Button, Dialog, Input, useToast } from '@dcos/ui';
import { AlertTriangle, GitFork, Info, LifeBuoy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { relativeTime } from '../lib/format';
import { diagramFromShapes } from './diagramClipboardHost'; // Phase 6 CLIPBOARD
import {
  deleteDiagramDialogDraft,
  holdDiagramDialogSession,
  keepDiagramDialogDraftLocally,
  listDiagramDialogDrafts,
  newDiagramDialogSession,
  saveDiagramDialogDraft,
  storage,
  type DiagramDialogBase,
  type DiagramDialogDraft,
  type DiagramDialogOwnerKind,
} from '../lib/storage';
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
  /** Phase 6: reopening edits kept from an earlier dialog (see listDiagramDialogDrafts). */
  recovered?: DiagramDialogDraft;
  resolve: (result: EmbeddedDiagram | null) => void;
}

/**
 * Phase 7 (ADR 0014): the item a diagram dialog belongs to. Its unsaved edits are kept as drafts of that item and the
 * dialog's words name where the diagram goes. Documents keep exactly their Phase 6 behaviour and words.
 */
export interface DiagramDialogOwner {
  kind: 'document' | 'presentation';
  id: string;
}

const WORDS = {
  document: {
    discardNew: 'Discard this new diagram? It has not been added to your document.',
    hintNew: 'This diagram will be placed in your document.',
    hintEdit: 'Changes appear in your document when you save.',
    insert: 'Insert into document',
    where: 'document',
    kept: 'Your diagram changes were kept. Choose “Recover diagram edits” to put them into the document.',
    library: 'A copy is placed in the document; the original diagram stays unchanged.',
    focus: '.ProseMirror[contenteditable="true"]',
  },
  presentation: {
    discardNew: 'Discard this new diagram? It has not been added to your presentation.',
    hintNew: 'This diagram will be placed on your slide.',
    hintEdit: 'Changes appear on your slide when you save.',
    insert: 'Insert on slide',
    where: 'presentation',
    kept: 'Your diagram changes were kept. Choose “Recover diagram edits” to put them into the presentation.',
    library: 'A copy is placed on the slide; the original diagram stays unchanged.',
    focus: '[data-presentation-editor] [role="listbox"][aria-label^="Objects on slide"]',
  },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];
const ownerKindOf = (owner: DiagramDialogOwner | undefined): DiagramDialogOwnerKind | undefined => (owner?.kind === 'presentation' ? 'presentation' : undefined);
// Documents call the storage helpers exactly as in Phase 6 (no owner argument).
const dropKeptDraft = (id: string, session: string, kind?: DiagramDialogOwnerKind) => (kind ? deleteDiagramDialogDraft(id, session, kind) : deleteDiagramDialogDraft(id, session));
const listKeptDrafts = (id: string, kind?: DiagramDialogOwnerKind) => (kind ? listDiagramDialogDrafts(id, kind) : listDiagramDialogDrafts(id));

/** How long the dialog waits after the last change before keeping its edits as a draft. */
export const DIALOG_DRAFT_DELAY_MS = 1000;

const baseOf = (d: EmbeddedDiagram): DiagramDialogBase => ({
  source: d.source,
  previewId: d.previewId ?? null,
  naturalWidth: d.naturalWidth,
  naturalHeight: d.naturalHeight,
  title: d.title,
});

/**
 * The app's side of embedded diagrams: owns the diagram editor dialog, the library picker and storage, and
 * gives Document Studio a small interface to them. Render `dialogs` once inside the page.
 *
 * With `docId` (the document being edited), unsaved edits in the dialog are kept as drafts of that document, and
 * `recover` reopens such a draft; it resolves with the saved diagram, which the caller puts into the document.
 */
// Phase 7 (ADR 0014): or with `owner` { kind: 'presentation', id }, the drafts are filed under that presentation (as a
// plain record, not a document) and the dialog speaks of slides. `docId` keeps today's document behaviour exactly.
export function useDiagramHost(options: { docId?: string; owner?: DiagramDialogOwner } = {}): {
  host: DiagramHost;
  dialogs: React.ReactNode;
  active: boolean;
  recover: (draft: DiagramDialogDraft) => Promise<EmbeddedDiagram | null>;
} {
  const owner: DiagramDialogOwner | undefined = options.owner ?? (options.docId ? { kind: 'document', id: options.docId } : undefined);
  const words = WORDS[owner?.kind ?? 'document'];
  const toast = useToast();
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const [picking, setPicking] = useState<((r: DiagramStart | null) => void) | null>(null);
  // Saved dialogs whose edits are kept as a draft until Document Studio says they are in the document (settle).
  const unsettled = useRef(new WeakMap<EmbeddedDiagram, (applied: boolean) => void>());

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
        const { drawioExportNotes, toDrawio, deserializeDiagram, serializeDiagram } = await loadDiagramStudio();
        const s = deserializeDiagram(source);
        const content = serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
        const xml = toDrawio(content, title);
        // What the .drawio file cannot hold is said, never left out silently (the editor's export does the same).
        const notes = drawioExportNotes(content);
        if (notes.length) toast(`Exported for diagrams.net. ${notes.join(' ')}`, 'info');
        return xml;
      },
      // Phase 6 (ADR 0013): the diagram drawn off screen by Diagram Studio's vector renderer, with no editor shown.
      // Stores nothing and never changes `source` (a newer diagram is drawn read-only).
      renderPreview: async (source, title) => {
        const { renderDiagramPreview } = await loadDiagramStudio();
        const r = await renderDiagramPreview(source, { title });
        return r && { png: r.png, svg: r.svg, width: r.width, height: r.height };
      },
      // Phase 6 (NODE): a preview redrawn from the diagram's data (a missing one) is stored like any other preview.
      storePreview: async (image) => (await storage.putAttachment(image, image.type || 'image/png')).id,
      // Phase 6 (CLIPBOARD): shapes copied in Diagram Studio pasted into the document become an embedded diagram.
      diagramFromShapes: (get) => diagramFromShapes(get, { loadStudio: loadDiagramStudio, putAttachment: async (png) => (await storage.putAttachment(png, 'image/png')).id, toast }),
      // Round 3: the saved dialog's draft is removed only once its diagram is in the document. When it could not be
      // put there (the document was reloaded, or the diagram removed, while the dialog was open), it stays offered.
      settle: (diagram, applied) => {
        const done = unsettled.current.get(diagram);
        unsettled.current.delete(diagram);
        done?.(applied);
      },
    }),
    [toast],
  );

  const recover = useCallback(
    (draft: DiagramDialogDraft) =>
      new Promise<EmbeddedDiagram | null>((resolve) =>
        setEditing({
          current: draft.base && { ...draft.base, previewId: draft.base.previewId ?? '' },
          recovered: draft,
          resolve,
        }),
      ),
    [],
  );

  const dialogs = (
    <>
      {editing && (
        <DiagramEditDialog
          request={editing}
          owner={owner}
          onDone={(result, settle) => {
            if (result && settle) unsettled.current.set(result, settle);
            editing.resolve(result);
            setEditing(null);
          }}
        />
      )}
      {picking && (
        <LibraryPicker
          description={words.library}
          onDone={(result) => {
            picking(result);
            setPicking(null);
          }}
        />
      )}
    </>
  );
  // While a dialog is open, the page must keep the editor it will write into (see EditorPage).
  return { host, dialogs, active: !!editing || !!picking, recover };
}

type Studio = Awaited<ReturnType<typeof loadDiagramStudio>>;

/** Told to every recovery offer on the page when kept dialog edits were added or removed in this tab. */
const DRAFTS_CHANGED = 'dcos-diagram-dialog-drafts-changed';
const announceDiagramDraftsChanged = () => window.dispatchEvent(new Event(DRAFTS_CHANGED));

/**
 * Puts focus back in the document once it is on the page (it may be remounting), unless the user has put it somewhere
 * else meanwhile. For when the element a dialog was opened from no longer exists.
 */
export function focusDocumentSoon(selector: string = WORDS.document.focus, tries = 30) {
  const step = (left: number, focused: HTMLElement | null) => {
    const active = document.activeElement;
    // Somewhere the user put it (not the page itself, nor inside the dialog that is closing).
    if (active && active !== document.body && active.isConnected && !active.closest('dialog:not([open])')) return;
    // Focus that was put back and then lost again: the editor was remounted under it (a presentation is re-opened with
    // the recovered diagram), so look again for the new one.
    const doc = document.querySelector<HTMLElement>(selector);
    if (doc && doc !== focused) doc.focus({ preventScroll: true });
    if (left > 0) setTimeout(() => step(left - 1, doc ?? null), 50);
  };
  setTimeout(() => step(tries, null), 0);
}

/** Whether the main pointer is a finger: focusing a text field then brings up the soft keyboard. */
const coarsePointer = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const isTextField = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function DiagramEditDialog({
  request,
  owner,
  onDone,
}: {
  request: EditRequest;
  owner?: DiagramDialogOwner;
  /** `settle`, when given, is told whether the saved diagram got into the document (see DiagramHost.settle). */
  onDone: (r: EmbeddedDiagram | null, settle?: (applied: boolean) => void) => void;
}) {
  const toast = useToast();
  const docId = owner?.id;
  const ownerKind = ownerKindOf(owner);
  const words: Words = WORDS[owner?.kind ?? 'document'];
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const api = useRef<DiagramEditorApi>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const recovered = request.recovered;
  const [title, setTitle] = useState(recovered?.title ?? request.current?.title ?? request.start?.title ?? 'Diagram');
  // Changed from what the dialog opened with: a new diagram fresh from its template or import is not yet a change.
  // Recovered edits are changes until they are saved.
  const [dirty, setDirty] = useState(!!recovered);
  const [saving, setSaving] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  // Shown inside the dialog: toasts outside a modal dialog can be hidden behind it (RG-8).
  const [error, setError] = useState<string | null>(null);
  const isNew = !request.current;
  const finished = useRef(false);
  // A finger as the main pointer: the dialog's body, not the title field, takes focus on open (see below).
  const [touch] = useState(coarsePointer);
  // Where focus goes back to when the dialog closes: the document, the diagram or the button that opened it.
  const [opener] = useState(() => (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null));

  // ── Drafts of unsaved edits (Phase 6): kept while dirty, offered again by the document if the page goes away. ──
  const [session] = useState(() => recovered?.session ?? newDiagramDialogSession());
  const base = useMemo(() => recovered?.base ?? (request.current ? baseOf(request.current) : null), [recovered, request]);
  const latest = useRef({ title, dirty });
  latest.current = { title, dirty };
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  const snapshot = useCallback((): Omit<DiagramDialogDraft, 'savedAt'> | null => {
    const editor = api.current;
    if (!docId || !editor || editor.isReadOnly()) return null;
    return { docId, ...(ownerKind ? { ownerKind } : {}), session, base, source: editor.getContent(), title: latest.current.title };
  }, [docId, ownerKind, session, base]);
  const writeDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    if (finished.current || !latest.current.dirty) return;
    const d = snapshot();
    if (!d) return;
    draftWrite.current = draftWrite.current.then(() => saveDiagramDialogDraft(d)).catch(() => undefined);
  }, [snapshot]);
  const keepLocally = useCallback(() => {
    if (finished.current || !latest.current.dirty) return;
    const d = snapshot();
    if (d) keepDiagramDialogDraftLocally(d);
  }, [snapshot]);
  const changed = useCallback(() => {
    setDirty(true);
    latest.current.dirty = true;
    setError(null);
    if (!docId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(writeDraft, DIALOG_DRAFT_DELAY_MS);
  }, [docId, writeDraft]);
  const dropDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    if (!docId) return;
    // After a write still in flight, so it cannot bring the draft back.
    await draftWrite.current;
    await dropKeptDraft(docId, session, ownerKind).catch(() => undefined);
  }, [docId, ownerKind, session]);

  // Other tabs do not offer this draft while the dialog is open.
  useEffect(() => (docId ? holdDiagramDialogSession(session) : undefined), [docId, session]);

  // Leaving the page while dirty: warn, and keep the edits synchronously (the database write may not finish).
  useEffect(() => {
    if (!docId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finished.current || !latest.current.dirty) return;
      keepLocally();
      e.preventDefault();
      e.returnValue = '';
    };
    const onPageHide = () => {
      keepLocally();
      writeDraft();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onPageHide();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [docId, keepLocally, writeDraft]);

  // Unmounted without Save or Cancel (the page or the document editor went away): keep the edits now. A layout
  // cleanup runs before the diagram editor below lets go of its API, so the latest content is still readable.
  useLayoutEffect(
    () => () => {
      if (finished.current || !latest.current.dirty) return;
      keepLocally();
      writeDraft();
    },
    [keepLocally, writeDraft],
  );

  const finish = useCallback(
    (r: EmbeddedDiagram | null, settle?: (applied: boolean) => void) => {
      finished.current = true;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      // Closing (not only removing) the dialog lets the browser hand focus back; do it ourselves where it does not.
      if (ref.current?.open) ref.current.close();
      onDone(r, settle);
      const active = document.activeElement;
      const lost = !active || active === document.body || !!ref.current?.contains(active);
      // (Safari does not focus a clicked button, so the page itself may have been the "opener".)
      const back = opener && opener !== document.body && opener.isConnected ? opener : null;
      if (back && back !== active && lost) back.focus({ preventScroll: true });
      // Recovered edits: the offer's button is gone and the editor is remounted with them, so focus goes to the
      // document once it is back. (Document Studio puts focus back itself after its own edits and inserts.)
      else if (!back && lost && recovered) focusDocumentSoon(words.focus);
    },
    [onDone, opener, recovered, words],
  );
  const apiRef = useCallback((a: DiagramEditorApi | null) => {
    api.current = a;
    setReadOnly(!!a?.isReadOnly());
  }, []);

  const initial = useMemo(() => {
    if (!studio) return null;
    if (recovered) return recovered.source;
    if (request.current) return request.current.source;
    if (request.start?.source) return request.start.source;
    const t = studio.diagramTemplates.find((x) => x.id === request.start?.templateId);
    return t ? t.build() : studio.createEmptyDiagram();
  }, [studio, request, recovered]);

  useEffect(() => {
    loadDiagramStudio().then(setStudio, (err) => {
      toast(`The diagram editor could not be loaded: ${messageOf(err)}`, 'error');
      finish(null);
    });
    // On phones, focusing the title field would bring up the soft keyboard over the canvas: focus the dialog's body.
    if (touch) body.current?.setAttribute('autofocus', '');
    ref.current?.showModal();
    if (touch && isTextField(document.activeElement)) body.current?.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(() => {
    const question = isNew ? words.discardNew : 'Discard your changes to this diagram?';
    if (dirty && !confirm(question)) return false;
    void dropDraft();
    finish(null);
    return true;
  }, [dirty, isNew, finish, dropDraft, words]);

  const save = async () => {
    const editor = api.current;
    // Saving a diagram from a newer version would rewrite it in this version's older format.
    if (!editor || editor.isReadOnly()) return;
    const content = editor.getContent();
    if (!content.nodes.length) {
      setError('Add at least one shape before saving the diagram.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The diagram data and its rendered preview are stored separately: data in the document, PNG as an attachment.
      const png = await editor.renderPng(2);
      const attachment = await storage.putAttachment(png.blob, 'image/png');
      const result = { source: content, previewId: attachment.id, naturalWidth: png.width, naturalHeight: png.height, title: title.trim() || 'Diagram' };
      let settle: ((applied: boolean) => void) | undefined;
      if (docId && (recovered || latest.current.dirty)) {
        // The draft holds exactly what was saved here until the diagram is in the document. Recovered edits: the
        // page puts them there and removes the draft once that worked. Other edits: Document Studio says whether it
        // could put them there (host.settle); if not (the document was reloaded, or the diagram removed, while the
        // dialog was open), they stay offered by "Recover diagram edits" instead of being lost (Round 3).
        if (draftTimer.current) clearTimeout(draftTimer.current);
        await draftWrite.current;
        await saveDiagramDialogDraft({ docId, ...(ownerKind ? { ownerKind } : {}), session, base, source: content, title: result.title }).catch(() => undefined);
        if (!recovered) {
          settle = (applied) => {
            if (applied) {
              void dropKeptDraft(docId, session, ownerKind).catch(() => undefined);
              return;
            }
            announceDiagramDraftsChanged();
            toast(words.kept, 'info');
          };
        }
      } else {
        await dropDraft();
      }
      finish(result, settle);
    } catch (err) {
      setError(`The diagram could not be saved: ${messageOf(err)}`);
      setSaving(false);
    }
  };

  const Editor = studio?.DiagramEditor as ComponentType<{ initialContent: unknown; title: string; onChange: () => void; apiRef: React.Ref<DiagramEditorApi> }> | undefined;
  const hint = readOnly
    ? "This diagram was made with a newer version of Classroom OS and can't be changed here."
    : isNew
      ? words.hintNew
      : words.hintEdit;
  return (
    <dialog
      ref={ref}
      aria-label={isNew ? 'New diagram' : 'Edit diagram'}
      className="m-auto h-[94vh] w-[96vw] max-w-none overflow-hidden rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      // Browsers may close the dialog anyway (a repeated Escape cannot always be cancelled). Unless the user agreed
      // to discard, bring it back so the diagram stays open and editable.
      onClose={() => {
        if (!finished.current && ref.current?.isConnected && !ref.current.open) ref.current.showModal();
      }}
    >
      <div ref={body} tabIndex={touch ? -1 : undefined} className="flex h-full flex-col outline-none">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <GitFork size={16} className="text-accent" />
          <Input aria-label="Diagram title" value={title} disabled={readOnly} onChange={(e) => (setTitle(e.target.value), changed())} className="h-8 max-w-xs" />
          <span role={readOnly ? 'status' : undefined} className={readOnly ? 'text-xs text-warning' : 'hidden text-xs text-muted md:inline'}>
            {hint}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={saving || !studio || readOnly} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              {isNew ? words.insert : 'Save changes'}
            </Button>
          </div>
        </header>
        {error && (
          <div role="alert" className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {recovered && (
          <div role="status" className="flex items-center gap-2 border-b border-accent/20 bg-accent-soft px-4 py-2 text-xs">
            <LifeBuoy size={14} className="shrink-0 text-accent" />
            <span>
              Recovered unsaved changes{recovered.savedAt ? ` from ${relativeTime(recovered.savedAt)}` : ''}. {isNew ? 'Insert the diagram' : 'Save them'} to put them in your{' '}
              {words.where}.
            </span>
          </div>
        )}
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
            <Editor initialContent={initial} title={title} onChange={changed} apiRef={apiRef} />
          ) : (
            <div className="p-6 text-sm text-muted">Opening the diagram editor…</div>
          )}
        </div>
      </div>
    </dialog>
  );
}

function LibraryPicker({ onDone, description }: { onDone: (r: DiagramStart | null) => void; description: string }) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  useEffect(() => {
    storage.list('diagram').then(setItems);
  }, []);
  return (
    <Dialog open onClose={() => onDone(null)} title="Insert from my diagrams" description={description}>
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

/**
 * Offers diagram-dialog edits that were kept but never saved (the page was reloaded or closed, or the document
 * editor went away while the dialog was open). "Recover diagram edits" reopens the dialog with them; once saved,
 * they replace the diagram the dialog was opened on, or are added at the end when that diagram is gone. Nothing is
 * removed until it is in the document or the user discards it. Hidden while `busy` (a diagram dialog is open).
 */
export function RecoverDiagramEdits({
  docId,
  ownerKind,
  busy,
  recover,
  apply,
}: {
  docId: string;
  /** Phase 7: 'presentation' for a presentation's kept dialog edits (left out for documents). */
  ownerKind?: DiagramDialogOwnerKind;
  busy: boolean;
  recover: (draft: DiagramDialogDraft) => Promise<EmbeddedDiagram | null>;
  /** Changes the stored document and shows the result (useEditableItem's applyChange). */
  apply: (change: (content: unknown) => unknown) => Promise<unknown>;
}) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<DiagramDialogDraft[]>([]);
  const [working, setWorking] = useState(false);
  // "Later": hidden until the document is opened again (or more edits are kept in this tab).
  const [later, setLater] = useState(false);
  const refresh = useCallback(() => listKeptDrafts(docId, ownerKind).then(setDrafts, () => setDrafts([])), [docId, ownerKind]);
  const where = ownerKind === 'presentation' ? 'presentation' : 'document';
  useEffect(() => {
    void refresh();
    // Edits kept just now in this tab (a saved dialog whose diagram could not be put into the document).
    const onChanged = () => {
      setLater(false);
      void refresh();
    };
    window.addEventListener(DRAFTS_CHANGED, onChanged);
    return () => window.removeEventListener(DRAFTS_CHANGED, onChanged);
  }, [refresh]);

  const listed = drafts[0];
  if (!listed || busy || later) return null;

  const onRecover = async () => {
    setWorking(true);
    try {
      // Read it again: another tab may have recovered or discarded it (or kept newer edits) since it was listed.
      const draft = (await listKeptDrafts(docId, ownerKind).catch(() => [] as DiagramDialogDraft[])).find((d) => d.session === listed.session);
      if (!draft) {
        toast('These diagram edits were already recovered or discarded, in another tab or window.', 'info');
        return;
      }
      const result = await recover(draft);
      // Cancelled: the dialog removed the draft if the user agreed to discard it, else it is still offered.
      if (!result) return;
      let placed: 'replaced' | 'appended' = 'replaced';
      if (ownerKind === 'presentation') {
        // Phase 7: over the diagram it was opened on, or (when that is gone) on the last slide.
        const { applyRecoveredPresentationDiagram } = await import('@dcos/presentation-studio');
        await apply((content) => {
          const r = applyRecoveredPresentationDiagram(content, draft.base, result);
          placed = r.placed;
          return r.content;
        });
      } else {
        const { applyRecoveredDiagram } = await import('../lib/diagramRecovery');
        await apply((content) => {
          const r = applyRecoveredDiagram(content, draft.base, result);
          placed = r.placed;
          return r.content;
        });
      }
      await dropKeptDraft(docId, draft.session, ownerKind).catch(() => undefined);
      toast(
        ownerKind === 'presentation'
          ? placed === 'replaced'
            ? 'Recovered diagram edits saved in the presentation.'
            : draft.base
              ? 'The diagram you were editing is no longer in the presentation, so the recovered diagram was added to the last slide.'
              : 'The recovered diagram was added to the last slide.'
          : placed === 'replaced'
            ? 'Recovered diagram edits saved in the document.'
            : draft.base
              ? 'The diagram you were editing is no longer in the document, so the recovered diagram was added at the end.'
              : 'The recovered diagram was added at the end of the document.',
        'success',
      );
    } catch (err) {
      toast(`The recovered diagram could not be put into the ${where}. ${messageOf(err)} Your diagram edits are still kept.`, 'error');
    } finally {
      setWorking(false);
      await refresh();
    }
  };

  const onDiscard = async () => {
    if (!confirm('Discard these unsaved diagram changes? This cannot be undone.')) return;
    await dropKeptDraft(docId, listed.session, ownerKind).catch((err) => toast(`Could not discard them. ${messageOf(err)}`, 'error'));
    await refresh();
  };

  return (
    <div
      role="status"
      aria-label="Unsaved diagram edits"
      // On a phone the text takes the full width and the buttons go below it (not a narrow column beside them).
      className="fixed inset-x-3 bottom-3 z-50 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent/30 bg-surface px-3 py-2.5 text-sm shadow-lg sm:inset-x-auto sm:left-4 sm:max-w-md sm:px-4 sm:py-3"
    >
      <span className="flex min-w-[min(100%,16rem)] flex-1 items-start gap-2">
        <LifeBuoy size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Unsaved changes to the diagram “{listed.title || 'Diagram'}”{listed.savedAt ? ` from ${relativeTime(listed.savedAt)}` : ''} were kept.
          {drafts.length > 1 ? ` ${drafts.length - 1} more after this one.` : ''}
        </span>
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="primary" disabled={working} onClick={() => void onRecover()}>
          Recover diagram edits
        </Button>
        <Button size="sm" disabled={working} onClick={() => void onDiscard()}>
          Discard
        </Button>
        <Button size="sm" variant="ghost" disabled={working} onClick={() => setLater(true)} title={`Hide this until the ${where} is opened again; the edits stay kept`}>
          Later
        </Button>
      </div>
    </div>
  );
}
