import { useToast } from '@dcos/ui';
import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import type { Node as PMNode, NodeType } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ALIGNMENTS, safeChoice, type Alignment } from './objectAttrs';
import { PreviewUrlCache } from './previewCache';

/** Shown when the editor a diagram dialog was opened from went away (the document was reloaded) before it closed. */
export const RELOADED_NOT_INSERTED = 'The document was reloaded while you were editing. Your diagram was not inserted.';
export const RELOADED_NOT_APPLIED = 'The document was reloaded while you were editing. Your changes to the diagram were not applied.';
/** Shown instead of opening the editor for a diagram whose data is missing (e.g. a malformed paste; audit WEB-3). */
export const DIAGRAM_DATA_MISSING = "This diagram's data is missing, so it can't be edited. You can remove it, or keep the picture as it is.";

/** Whether a diagram node still carries its editable data. */
export const hasDiagramSource = (attrs: { source?: unknown }) => !!attrs.source && typeof attrs.source === 'object';

/** What the app hands back after a diagram has been created or edited. */
export interface EmbeddedDiagram {
  /** The editable diagram itself (Diagram Studio content). Stored in the document. */
  source: unknown;
  /** Rendered PNG preview, stored separately in the attachments store. */
  previewId: string;
  /** Natural size of the rendered diagram in CSS pixels. */
  naturalWidth: number;
  naturalHeight: number;
  title: string;
  /**
   * Phase 6: a stored SVG drawing of the same diagram, when the host keeps one. An edit that does not return one
   * clears the old one, so a stale drawing is never shown or exported.
   */
  svgPreviewId?: string | null;
}

/**
 * A diagram drawn off screen from its editable data (see DiagramHost.renderPreview). Sizes are the diagram's natural
 * size in CSS pixels; the PNG is drawn at twice that (less for very large diagrams, as the editor does).
 */
export interface RenderedDiagramPreview {
  png: Blob;
  /** The same drawing as a standalone vector SVG document, when the renderer could make one. */
  svg?: string;
  width: number;
  height: number;
}

export interface DiagramStart {
  templateId?: string;
  /** Existing diagram content (from My Diagrams or a diagrams.net import). */
  source?: unknown;
  title?: string;
  /** Things an import could not bring in exactly, shown to the user while editing. */
  notes?: string[];
}

/**
 * Supplied by the app. Keeps Document Studio independent of Diagram Studio: the app owns the diagram editor,
 * dialogs and storage, the document only stores what it returns.
 */
export interface DiagramHost {
  templates: Array<{ id: string; name: string }>;
  /** Opens the diagram editor; resolves with the saved diagram, or null when cancelled. */
  edit(current: EmbeddedDiagram | null, start?: DiagramStart): Promise<EmbeddedDiagram | null>;
  pickFromLibrary(): Promise<DiagramStart | null>;
  importFile(): Promise<DiagramStart | null>;
  loadPreview(previewId: string): Promise<Blob | undefined>;
  /** diagrams.net file for a diagram's source. */
  toDrawio(source: unknown, title: string): Promise<string>;
  /**
   * Phase 6: draws a diagram's editable data off screen, with no visible editor, using Diagram Studio's vector
   * renderer (the same drawing the edit dialog stores as the preview). Resolves null when there is nothing to draw
   * (no data, or no visible shapes); rejects only when the browser cannot draw the picture. A diagram from a newer
   * version is drawn as far as this version can, read-only: `source` is never changed or written back. The caller
   * stores the result (for example with a new previewId); this method stores nothing.
   *
   * Optional, so hosts without a diagram renderer still work: callers then keep today's behaviour (a placeholder).
   */
  renderPreview?(source: unknown, title?: string): Promise<RenderedDiagramPreview | null>;
  /**
   * Phase 6 (NODE): stores a preview picture drawn by renderPreview and resolves with its attachment id (content
   * addressed, so the same picture gives the same id). Used to bring back a diagram's missing preview from its data.
   * Optional: without it a redrawn preview is shown but not stored.
   */
  storePreview?(image: Blob): Promise<string>;
  // @phase6:DIALOG — draft recovery for the edit dialog is the host's job (DiagramDialogs.tsx); add host methods here.
  /**
   * Phase 6 (Round 3): called once Document Studio has tried to put a diagram that edit() resolved with into the
   * document: `applied` false when it could not (the document was reloaded, the diagram removed meanwhile, or the
   * insert failed). The host keeps the dialog's edits until it hears they are in the document, so nothing saved in the
   * dialog is ever lost. Optional; called for every non-null result of edit().
   */
  settle?(diagram: EmbeddedDiagram, applied: boolean): void;
  // @phase6:CLIPBOARD — host methods for the clipboard (extensions/diagramClipboard.ts):
  /**
   * Phase 6: shapes copied in Diagram Studio (read from the paste's clipboard data by type) as a new diagram to embed:
   * its editable data and a stored preview (drawn with renderPreview). Resolves null when the data holds no shapes or
   * cannot be used; the host tells the user why (for example shapes from a newer version). Optional.
   */
  diagramFromShapes?(get: (type: string) => string): Promise<EmbeddedDiagram | null>;
}

export interface DiagramAttrs extends EmbeddedDiagram {
  /** Display size in the document (CSS pixels). Height always follows the natural aspect ratio. */
  width: number;
  height: number;
  /**
   * Phase 6 (schema 3 when set; null by default, so diagrams without them stay schema 2): alignment on the page,
   * a caption shown below, alternative text (the title is used when null) and a stored SVG preview attachment.
   */
  align: Alignment | null;
  caption: string | null;
  alt: string | null;
  svgPreviewId: string | null;
}

/** Phase 6 attributes of the diagram node, all null by default. */
export const DIAGRAM_PHASE6_ATTRS = ['align', 'caption', 'alt', 'svgPreviewId'] as const;
/** A diagram's alignment on the page ('center' when none is stored, as before alignment existed). */
export const diagramAlign = (attrs: Record<string, unknown> | undefined): Alignment => safeChoice(attrs?.align, ALIGNMENTS, 'center');
/** A diagram's caption text, or '' when it has none. */
export const diagramCaption = (attrs: Record<string, unknown> | undefined): string => (typeof attrs?.caption === 'string' ? attrs.caption.trim() : '');
/** The text that describes a diagram to screen readers and in exports: its alt text, else its title, else 'Diagram'. */
export const diagramAltText = (attrs: Record<string, unknown> | undefined): string =>
  (typeof attrs?.alt === 'string' && attrs.alt.trim()) || (typeof attrs?.title === 'string' && attrs.title.trim()) || 'Diagram';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramEmbed: {
      insertDiagram: (diagram: EmbeddedDiagram, maxWidth: number) => ReturnType;
    };
  }
}

/** Display size that keeps the aspect ratio and never exceeds the page's text width. */
export function fitSize(naturalWidth: number, naturalHeight: number, width: number, maxWidth: number) {
  const w = Math.max(80, Math.min(Math.round(width), Math.round(maxWidth)));
  return { width: w, height: Math.round((w * naturalHeight) / Math.max(1, naturalWidth)) };
}

/** Preview object URLs shared by every diagram on screen; failures are retried, unused URLs are revoked (LRU). */
export const previewUrls = new PreviewUrlCache();

/** Shown when a new diagram could not be placed in the document (nowhere it is allowed at the cursor). */
export const DIAGRAM_NOT_PLACED = 'The diagram could not be placed at the cursor. Your diagram was not inserted.';
/** Shown when the diagram an open edit dialog belongs to was removed before the dialog closed. */
export const DIAGRAM_GONE = 'The diagram was removed while you were editing it. Your changes were not applied.';
/** Hint for keyboard and screen-reader users (and the tooltip): how to open the diagram editor. */
export const DIAGRAM_EDIT_HINT = 'Press Enter or double-click (double-tap on a touch screen) to edit this diagram.';

const positiveOr = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

/**
 * Requests between the shared editor-opening helper (and the Enter/F2 shortcut) and the diagram views on screen:
 * which diagram is being edited, which one has no data to edit, and which one should open its editor.
 */
type DiagramViewEvent = { type: 'busy'; pos: number } | { type: 'idle' } | { type: 'missing-data'; pos: number } | { type: 'open'; pos: number };
const viewListeners = new WeakMap<Editor, Set<(e: DiagramViewEvent) => boolean>>();

function onDiagramViewEvent(editor: Editor, listener: (e: DiagramViewEvent) => boolean) {
  let set = viewListeners.get(editor);
  if (!set) viewListeners.set(editor, (set = new Set()));
  set.add(listener);
  return () => void set.delete(listener);
}

/** Tells the diagram views; true when one of them took the request. */
function emitDiagramViewEvent(editor: Editor, event: DiagramViewEvent): boolean {
  let handled = false;
  for (const listener of [...(viewListeners.get(editor) ?? [])]) if (listener(event)) handled = true;
  return handled;
}

/** Editors with a diagram dialog open: one at a time, so a double-click, Enter and the ribbon never open two. */
const editingIn = new WeakSet<Editor>();
/** The page's text width per editor (set by the ribbon), so every edit path clamps a diagram's width the same way. */
const textWidths = new WeakMap<Editor, number>();

/** Records the page's text width in CSS pixels for `editor` (see openDiagramEditor). */
export function setDiagramTextWidth(editor: Editor, px: number) {
  if (Number.isFinite(px) && px > 0) textWidths.set(editor, px);
}
/** The page's text width recorded for `editor`, or Infinity when none is known. */
export const diagramTextWidth = (editor: Editor) => textWidths.get(editor) ?? Infinity;

/** Content width of an element in CSS pixels (its client width less padding), or 0 without layout. */
function contentWidth(el: Element | null | undefined): number {
  const w = (el as HTMLElement | null)?.clientWidth;
  if (!el || !w) return 0;
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const pad = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0;
  return Math.max(0, w - pad);
}

/**
 * The widest a diagram may be stored at `pos`, in CSS pixels of the page's text width (`textWidth`), or 0 when there is
 * no limit narrower than the page. At the top level of the document that is the page itself (0: nothing to fit). Inside
 * a container (a table cell, a list item, a text box) it is the container's share of the page, measured on screen as a
 * fraction of the editor's width and applied to `textWidth`, so the stored size does not depend on how wide the window
 * is (a phone stores the same size as a desktop). Without layout (tests, a hidden editor) it is 0.
 */
export function diagramRoomAt(view: { state: EditorState; nodeDOM(pos: number): globalThis.Node | null; dom: Element }, pos: number, textWidth: number): number {
  let $pos;
  try {
    $pos = view.state.doc.resolve(pos);
  } catch {
    return 0;
  }
  // The innermost block around `pos` that holds blocks (not a paragraph or heading): the container it sits in.
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).isTextblock) depth--;
  if (depth === 0) return 0;
  const el = view.nodeDOM($pos.before(depth));
  const inner = contentWidth(el?.nodeType === 1 ? (el as Element) : null);
  const page = contentWidth(view.dom);
  if (!inner || !page) return 0;
  const share = Math.min(1, inner / page);
  return Number.isFinite(textWidth) && textWidth > 0 ? Math.round(share * textWidth) : Math.round(inner);
}

/** Whether a diagram dialog opened from this editor is still open. */
export const isDiagramEditorOpen = (editor: Editor) => editingIn.has(editor);

export type OpenDiagramResult = 'saved' | 'cancelled' | 'missing-data' | 'unavailable';

/**
 * Opens the diagram editor for the diagram at `pos` and applies the result. Shared by double-click, double-tap,
 * Enter/F2 and the ribbon's Edit button, so they all have the same guards:
 * - nothing happens without a host, in a read-only or destroyed editor, or while another diagram dialog is open;
 * - a diagram without its data shows the "data is missing" alert on the diagram instead of an empty editor;
 * - an edit that comes back after the document was reloaded (RELOADED_NOT_APPLIED) or after the diagram was
 *   removed (DIAGRAM_GONE) is not applied: these throw, for the caller to show.
 * The saved diagram keeps the width the user chose (clamped to `maxWidth`, by default the page's text width) and
 * its height follows the new shape; alignment, caption and alt text are kept, the old SVG preview dropped. Either
 * way the diagram is selected again and the document focused, so keyboard users keep their place.
 */
export async function openDiagramEditor(editor: Editor, pos: number, host: DiagramHost | null | undefined, maxWidth = diagramTextWidth(editor)): Promise<OpenDiagramResult> {
  if (!host || editor.isDestroyed || !editor.isEditable || editingIn.has(editor)) return 'unavailable';
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'diagram') return 'unavailable';
  const attrs = node.attrs as DiagramAttrs;
  if (!hasDiagramSource(attrs)) {
    emitDiagramViewEvent(editor, { type: 'missing-data', pos });
    return 'missing-data';
  }
  editingIn.add(editor);
  // Follow the diagram through any change made while the dialog is open (e.g. its missing preview being stored).
  let at = pos;
  const track = ({ transaction }: { transaction: Transaction }) => {
    if (at < 0 || !transaction.docChanged) return;
    const r = transaction.mapping.mapResult(at, 1);
    const now = transaction.doc.nodeAt(r.pos);
    // A diagram replaced by a copy of itself (an attribute change) is the same diagram; anything else is gone.
    at = !r.deletedAfter || (now?.type.name === 'diagram' && now.attrs.source === attrs.source) ? r.pos : -1;
  };
  editor.on('transaction', track);
  emitDiagramViewEvent(editor, { type: 'busy', pos });
  try {
    const next = await host.edit({ source: attrs.source, previewId: attrs.previewId, naturalWidth: attrs.naturalWidth, naturalHeight: attrs.naturalHeight, title: attrs.title });
    // Stop following before our own change below (which replaces the diagram with its edited version).
    editor.off('transaction', track);
    // Not applied: the host keeps the edits it saved for recovery (DiagramHost.settle).
    if (editor.isDestroyed) {
      if (next) {
        host.settle?.(next, false);
        throw new Error(RELOADED_NOT_APPLIED);
      }
      return 'cancelled';
    }
    const current = at >= 0 ? editor.state.doc.nodeAt(at) : null;
    if (!current || current.type.name !== 'diagram') {
      if (next) {
        host.settle?.(next, false);
        throw new Error(DIAGRAM_GONE);
      }
      return 'cancelled';
    }
    const tr = editor.state.tr;
    // An SVG preview of the old drawing is dropped unless the edit returns a new one.
    if (next) tr.setNodeMarkup(at, undefined, { ...current.attrs, svgPreviewId: null, ...next, ...fitSize(next.naturalWidth, next.naturalHeight, positiveOr(current.attrs.width, next.naturalWidth), maxWidth) });
    tr.setSelection(NodeSelection.create(tr.doc, at));
    editor.view.dispatch(tr);
    if (next) host.settle?.(next, true);
    refocus(editor, at);
    return next ? 'saved' : 'cancelled';
  } finally {
    editor.off('transaction', track);
    editingIn.delete(editor);
    emitDiagramViewEvent(editor, { type: 'idle' });
  }
}

/**
 * Focuses the document with the diagram at `pos` selected, now and again once the closing dialog has left the page
 * (a modal blocks focus until then, and WebKit places a text caret when focus comes back). Only while nothing else
 * has happened in the document meanwhile, so it never undoes a click or key of the user's.
 */
function refocus(editor: Editor, pos: number) {
  const doc = editor.state.doc;
  const selection = editor.state.selection;
  const go = () => {
    if (editor.isDestroyed) return;
    const { state } = editor;
    const moved = state.doc !== doc || !(state.selection.eq(selection) || state.selection.empty);
    if (moved) return;
    if (!editor.view.hasFocus()) editor.view.focus();
    if (!(editor.state.selection instanceof NodeSelection && editor.state.selection.from === pos) && editor.state.doc.nodeAt(pos)?.type.name === 'diagram') {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    }
  };
  go();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
  setTimeout(go, 80);
}

/** Two taps within this time (ms) and distance (px) open the editor on touch screens (WebKit has no dblclick there). */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 16;
/** A drag shorter than this (px) is a tap on the handle, not a resize. */
const RESIZE_MIN_PX = 3;

function DiagramView({ node, selected, updateAttributes, editor, extension, getPos }: ReactNodeViewProps) {
  const host = (extension.options as { host: DiagramHost | null }).host;
  const toast = useToast();
  const attrs = node.attrs as DiagramAttrs;
  // The preview URL with the previewId it belongs to: right after the id changes, the old id's result (say "missing")
  // must not count for the new one.
  const [loaded, setLoaded] = useState<{ id: unknown; url: string | null | undefined }>({ id: undefined, url: undefined });
  const url = loaded.id === attrs.previewId ? loaded.url : undefined;
  const [reload, setReload] = useState(0);
  // A preview redrawn from the diagram's data that could not be stored (read-only document): shown only.
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [redraw, setRedraw] = useState<'idle' | 'working' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [missingData, setMissingData] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const editable = editor.isEditable;

  useEffect(() => {
    let live = true;
    const id = attrs.previewId;
    setLoaded({ id, url: undefined });
    if (!host || !id) {
      setLoaded({ id, url: null });
      return;
    }
    previewUrls.acquire(id, (i) => host.loadPreview(i)).then((u) => live && setLoaded({ id, url: u }));
    return () => {
      live = false;
      previewUrls.release(id);
    };
  }, [host, attrs.previewId, reload]);

  // A missing preview (deleted, never stored, or lost with a paste) is drawn again from the diagram's data and
  // stored, without an undo step: the document then shows and exports it as if it had never gone. A read-only
  // document is never changed: there the redrawn picture is only shown. A newer diagram is drawn read-only by the
  // host and its data is never rewritten.
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (url !== null || !host?.renderPreview || !hasDiagramSource(attrs) || editor.isDestroyed) return;
    const key = String(attrs.previewId ?? '');
    if (tried.current === key) return;
    tried.current = key;
    let live = true;
    let done = false;
    let shown: string | null = null;
    setRedraw('working');
    const { source, previewId } = attrs;
    void (async () => {
      const r = await host.renderPreview!(source, attrs.title || undefined);
      if (!r) throw new Error('nothing to draw');
      if (!live || editor.isDestroyed) return;
      if (editor.isEditable && host.storePreview) {
        const id = await host.storePreview(r.png);
        if (!live || editor.isDestroyed) return;
        const pos = getPos();
        const current = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
        // Only the diagram this was drawn for, unchanged since (it may have been edited or removed meanwhile).
        if (typeof pos === 'number' && current?.type.name === 'diagram' && current.attrs.source === source && current.attrs.previewId === previewId) {
          if (id === previewId) setReload((n) => n + 1);
          else editor.view.dispatch(withRedrawnPreview(editor.state, pos, current, id, r.width, r.height));
          done = true;
          setRedraw('idle');
          return;
        }
      }
      shown = URL.createObjectURL(r.png);
      setLocalUrl(shown);
      done = true;
      setRedraw('idle');
    })().catch(() => {
      done = true;
      if (live) setRedraw('failed');
    });
    return () => {
      live = false;
      // Interrupted before it finished (e.g. React re-running effects): let the next run try again.
      if (!done && tried.current === key) tried.current = null;
      if (shown) URL.revokeObjectURL(shown);
      setLocalUrl(null);
    };
  }, [url, host, attrs.previewId, attrs.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };

  const edit = async () => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    try {
      await openDiagramEditor(editor, pos, host);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  const latest = useRef({ edit, getPos });
  latest.current = { edit, getPos };

  // Busy state, the missing-data alert and Enter/F2 reach this view through the shared helper's events.
  useEffect(
    () =>
      onDiagramViewEvent(editor, (event) => {
        if (event.type === 'idle') {
          setBusy(false);
          return false;
        }
        if (event.pos !== latest.current.getPos()) return false;
        if (event.type === 'busy') setBusy(true);
        else if (event.type === 'missing-data') setMissingData(true);
        else void latest.current.edit();
        return true;
      }),
    [editor],
  );

  // Touch: two taps open the editor (WebKit on phones and tablets sends no dblclick). Handled on `click`, the last
  // event of a tap, so nothing of the second tap lands in the dialog that opens.
  const pointerType = useRef('mouse');
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const touchOpenedAt = useRef(0);
  const onTap = (e: ReactMouseEvent) => {
    if (pointerType.current !== 'touch' || !editable) return;
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_PX) {
      lastTap.current = null;
      touchOpenedAt.current = now;
      void edit();
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  // Resizing: starts from the width on screen (which may be narrower than the stored width), follows the pointer
  // even outside the handle (pointer capture), and is abandoned without a change when the browser cancels the
  // pointer (pointercancel, lost capture) or the drag is shorter than a few pixels.
  const startResize = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const nw = positiveOr(attrs.naturalWidth, 400);
    const nh = positiveOr(attrs.naturalHeight, 300);
    const onScreen = box.current?.getBoundingClientRect().width;
    const startW = onScreen && onScreen > 0 ? onScreen : positiveOr(attrs.width, nw);
    const maxW = box.current?.parentElement?.clientWidth || 2000;
    const sizeAt = (x: number) => fitSize(nw, nh, startW + x - startX, maxW);
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Not supported (or the pointer is already gone): the window listeners below still follow it.
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) setDragWidth(sizeAt(ev.clientX).width);
    };
    const finish = (commit: boolean) => (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      handle.removeEventListener('lostpointercapture', cancel);
      setDragWidth(null);
      if (commit && Math.abs(ev.clientX - startX) >= RESIZE_MIN_PX) updateAttributes(sizeAt(ev.clientX));
    };
    const up = finish(true);
    const cancel = finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    handle.addEventListener('lostpointercapture', cancel);
  };

  // @phase6:NODE — sized by width + aspect-ratio (the height follows the width shown, so a narrower page, column,
  // table cell, phone or print never letterboxes the picture); alignment and caption shown as on pictures.
  const nw = positiveOr(attrs.naturalWidth, 400);
  const nh = positiveOr(attrs.naturalHeight, 300);
  const width = dragWidth ?? positiveOr(attrs.width, nw);
  const height = Math.round((width * nh) / nw);
  const alt = diagramAltText(node.attrs);
  const caption = diagramCaption(node.attrs);
  const shownUrl = url || localUrl;
  const canRedraw = hasDiagramSource(attrs) && editable;
  const state = shownUrl ? 'ready' : url === undefined ? 'loading' : redraw === 'working' ? 'redrawing' : 'unavailable';
  return (
    <NodeViewWrapper as="figure" className={`dcos-diagram${selected ? ' is-selected' : ''}`} data-type="diagram" data-align={diagramAlign(node.attrs)} data-drag-handle="">
      <div
        ref={box}
        className="dcos-diagram-box"
        style={{ width, aspectRatio: `${nw} / ${nh}` }}
        // Select the diagram as a whole on click, so the Diagram tab's tools apply to it reliably.
        onMouseDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dcos-diagram-handle')) return;
          const pos = getPos();
          if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
        }}
        onPointerDown={(e) => (pointerType.current = e.pointerType || 'mouse')}
        onClick={onTap}
        onDoubleClick={() => {
          // The browser's own double-tap gesture after ours has opened the editor already.
          if (Date.now() - touchOpenedAt.current < 800) return;
          void edit();
        }}
        title={editable ? DIAGRAM_EDIT_HINT : alt}>
        {shownUrl ? (
          <img src={shownUrl} alt={alt} width={width} height={height} draggable={false} aria-describedby={editable ? hintId : undefined} />
        ) : (
          <div
            className="dcos-diagram-missing"
            // The plain name, for code that needs it without the state (e.g. print's placeholder text).
            data-title={alt}
            role="img"
            aria-label={`${alt} — ${state === 'loading' ? 'loading' : state === 'redrawing' ? 'redrawing the preview' : 'preview unavailable'}`}
            aria-describedby={editable ? hintId : undefined}>
            {state === 'loading'
              ? 'Loading diagram…'
              : state === 'redrawing'
                ? `Redrawing “${attrs.title || 'Untitled'}” from its data…`
                : `Diagram “${attrs.title || 'Untitled'}” — preview unavailable.${canRedraw ? ' Double-click or press Enter to open and re-render it.' : ''}`}
          </div>
        )}
        {editable && (
          <span id={hintId} className="dcos-diagram-hint dcos-sr-only">
            {DIAGRAM_EDIT_HINT}
          </span>
        )}
        {missingData && (
          <div className="dcos-diagram-alert" role="alert" contentEditable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <p>{DIAGRAM_DATA_MISSING}</p>
            <div>
              <button type="button" className="is-danger" onClick={remove}>
                Remove diagram
              </button>
              <button type="button" onClick={() => setMissingData(false)}>
                Keep
              </button>
            </div>
          </div>
        )}
        {selected && editable && <span className="dcos-diagram-handle" onPointerDown={startResize} onClick={(e) => e.stopPropagation()} aria-hidden />}
        {busy && (
          <div className="dcos-diagram-busy" role="status">
            Editing…
          </div>
        )}
      </div>
      {caption && <figcaption className="dcos-figcaption">{caption}</figcaption>}
    </NodeViewWrapper>
  );
}

/** Stores a redrawn preview on the diagram at `pos`: no undo step, the selection kept, the shown width kept. */
function withRedrawnPreview(state: EditorState, pos: number, node: PMNode, previewId: string, width: number, height: number): Transaction {
  const a = node.attrs;
  const sameShape = Math.abs(positiveOr(a.naturalWidth, 0) - width) <= 1 && Math.abs(positiveOr(a.naturalHeight, 0) - height) <= 1;
  const shape = sameShape ? {} : { naturalWidth: width, naturalHeight: height, height: Math.round((positiveOr(a.width, width) * height) / Math.max(1, width)) };
  const tr = state.tr.setNodeMarkup(pos, undefined, { ...a, previewId, ...shape }).setMeta('addToHistory', false);
  if (state.selection instanceof NodeSelection && state.selection.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
  return tr;
}

/** Where a new diagram goes for an empty or text selection: never inside a word (see insertDiagram). */
function insertionPoint(state: EditorState, type: NodeType): number | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection) return sel.to;
  const $at = sel.$to;
  if ($at.parent.isTextblock && $at.parent.content.size > 0) {
    const depth = $at.depth;
    // At the start of a paragraph the diagram goes before it; anywhere else, after it (no word is ever split).
    const candidates = $at.parentOffset === 0 && sel.empty ? [$at.before(depth), $at.after(depth)] : [$at.after(depth)];
    for (const pos of candidates) {
      const $pos = state.doc.resolve(pos);
      if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), type)) return pos;
    }
  }
  return sel.empty ? null : sel.to;
}

/**
 * Clipboard form of a diagram. Copy, cut and paste go through HTML, so every attribute travels as JSON in
 * `data-diagram`; the stored document keeps its attributes in the ProseMirror JSON as before.
 */
function toCopy(attrs: Record<string, unknown>): string | undefined {
  const { source, previewId, naturalWidth, naturalHeight, width, height, title } = attrs;
  // Phase 6 attributes travel only when set, so the clipboard form of every other diagram is exactly as before.
  const extra = Object.fromEntries(DIAGRAM_PHASE6_ATTRS.filter((k) => attrs[k] !== null && attrs[k] !== undefined).map((k) => [k, attrs[k]]));
  try {
    return JSON.stringify({ source, previewId, naturalWidth, naturalHeight, width, height, title, ...extra });
  } catch {
    return undefined;
  }
}

const pasted = new WeakMap<HTMLElement, Record<string, unknown>>();
/** Reads `data-diagram` once per element. Missing or malformed data gives the defaults, never an error. */
function copied(el: HTMLElement): Record<string, unknown> {
  let data = pasted.get(el);
  if (!data) {
    try {
      const v: unknown = JSON.parse(el.getAttribute('data-diagram') ?? '');
      data = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    pasted.set(el, data);
  }
  return data;
}
const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const text = (v: unknown) => (typeof v === 'string' ? v : null);
/** A Phase 6 attribute from the copied JSON, else from its own data-* attribute; anything unusable gives null. */
const copiedText = (el: HTMLElement, key: string, dataAttr: string) => text(copied(el)[key]) || el.getAttribute(dataAttr) || null;
const copiedAlign = (el: HTMLElement): Alignment | null => {
  const v = copiedText(el, 'align', 'data-align');
  return v && (ALIGNMENTS as readonly string[]).includes(v) ? (v as Alignment) : null;
};

/**
 * An editable diagram inside a document. The diagram's own data lives in `source`; the image shown and exported
 * is a separate PNG attachment (`previewId`) re-rendered whenever the diagram is edited.
 */
export const DiagramEmbed = Node.create<{ host: DiagramHost | null }>({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { host: null };
  },

  addAttributes() {
    // Not rendered as plain HTML attributes: copy and paste carry them all in `data-diagram` instead (see renderHTML).
    return {
      source: { default: null, rendered: false, parseHTML: (el) => copied(el).source ?? null },
      previewId: { default: null, rendered: false, parseHTML: (el) => text(copied(el).previewId) || null },
      naturalWidth: { default: 400, rendered: false, parseHTML: (el) => positive(copied(el).naturalWidth) },
      naturalHeight: { default: 300, rendered: false, parseHTML: (el) => positive(copied(el).naturalHeight) },
      width: { default: 400, rendered: false, parseHTML: (el) => positive(copied(el).width) },
      height: { default: 300, rendered: false, parseHTML: (el) => positive(copied(el).height) },
      title: { default: '', rendered: false, parseHTML: (el) => text(copied(el).title) },
      // Phase 6 (ADR 0013): null by default, so existing diagrams are unchanged and stay content schema 2.
      align: { default: null, rendered: false, parseHTML: copiedAlign },
      caption: { default: null, rendered: false, parseHTML: (el) => copiedText(el, 'caption', 'data-caption') },
      alt: { default: null, rendered: false, parseHTML: (el) => copiedText(el, 'alt', 'data-alt') },
      svgPreviewId: { default: null, rendered: false, parseHTML: (el) => copiedText(el, 'svgPreviewId', 'data-svg-preview-id') },
      // @phase6:NODE — new diagram attributes: null default (keeps schema 2), toCopy, parseHTML, renderHTML, and the
      // ODT_HANDLED_ATTRS list (export/odt/paragraph.ts); compat.test.ts checks they stay out of V020_VOCABULARY.
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="diagram"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const a = node.attrs;
    // Phase 6 attributes are written as data-* only when set, so the HTML of every other diagram is unchanged.
    const phase6 = {
      ...(a.align ? { 'data-align': String(a.align) } : {}),
      ...(a.caption ? { 'data-caption': String(a.caption) } : {}),
      ...(a.alt ? { 'data-alt': String(a.alt) } : {}),
      ...(a.svgPreviewId ? { 'data-svg-preview-id': String(a.svgPreviewId) } : {}),
    };
    // @phase6:CLIPBOARD — renderText ('[Diagram: title]') and the preview <img> for other apps go in a clipboard
    // serializer, not here: this HTML is also what the editor parses back.
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram', 'aria-label': a.alt || a.title || 'Diagram', 'data-diagram': toCopy(a), ...phase6 })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },

  // Phase 6 (NODE): Enter or F2 on a selected diagram opens its editor (instead of adding an empty paragraph), the
  // same way as a double-click: through the diagram's view, so the busy state, the missing-data alert and error
  // messages are the same. Nothing happens in a read-only document.
  addKeyboardShortcuts() {
    const open = () => {
      const { editor } = this;
      const sel = editor.state.selection;
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name || !editor.isEditable || !this.options.host) return false;
      if (!emitDiagramViewEvent(editor, { type: 'open', pos: sel.from })) void openDiagramEditor(editor, sel.from, this.options.host).catch(() => undefined);
      return true;
    };
    return { Enter: open, F2: open };
  },

  // @phase6:CLIPBOARD — addProseMirrorPlugins: paste of Diagram Studio shapes, selection after a pasted diagram,
  // re-creating a missing preview after paste (or register extensions/diagramClipboard.ts in extensions/index.ts).

  addCommands() {
    return {
      insertDiagram:
        (diagram, maxWidth) =>
        ({ state, commands }) => {
          const content = { type: this.name, attrs: { ...diagram, ...fitSize(diagram.naturalWidth, diagram.naturalHeight, diagram.naturalWidth, maxWidth) } };
          // Never replace what is selected (such as a diagram the user clicked): place the new one after it. Never
          // split a paragraph either (a caret in the middle of a word would cut it in two): the diagram goes after
          // the paragraph, or before it when the caret is at its start (Phase 6, NODE).
          const at = insertionPoint(state, this.type);
          return at === null ? commands.insertContent(content) : commands.insertContentAt(at, content);
        },
    };
  },
});
