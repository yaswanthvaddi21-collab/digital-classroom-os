import { Extension } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice, type DOMOutputSpec, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { diagramCaption, diagramRoomAt, diagramTextWidth, fitSize, type DiagramHost, type EmbeddedDiagram } from './diagramEmbed';

/**
 * Phase 6 (CLIPBOARD, ADR 0013): embedded diagrams and the clipboard.
 * - Shapes copied in Diagram Studio paste into a document as an embedded diagram (never as their JSON text).
 * - Copying a diagram gives other apps "[Diagram: title]" as text and the preview picture inside the HTML.
 * - After a pasted diagram the cursor moves past it, so a second Ctrl+V adds another copy instead of replacing it.
 * - Sizes read from pasted data are bounded; a pasted diagram is fitted to a narrower container (a table cell, a list
 *   item, a text box), measured as a share of the page so the stored size never depends on the window's width. A pasted
 *   diagram whose preview is no longer stored gets it drawn again by its view (DiagramView in diagramEmbed.tsx).
 * Nothing here changes what is stored for a diagram that is not pasted, so documents stay at their content schema.
 */

/** Diagram Studio's clipboard type, format and HTML carrier (diagram-studio canvasModel.ts; equal, see the integration test). */
export const SHAPES_CLIPBOARD_MIME = 'application/x-dcos-diagram';
export const SHAPES_CLIPBOARD_FORMAT = 'dcos-diagram-clipboard';
export const SHAPES_CLIPBOARD_HTML_ATTR = 'data-dcos-diagram-clipboard';
/** Clipboard data larger than this is not read as shapes (the same limit as a .dcosdiagram file). */
const MAX_CLIPBOARD_CHARS = 64 * 1024 * 1024;

/** Limits for sizes read from pasted data: natural size, display width and the natural aspect ratio. */
export const DIAGRAM_SIZE_LIMITS = { minNatural: 1, maxNatural: 20000, minWidth: 40, maxWidth: 4000, maxRatio: 50 } as const;
const DEFAULT_SIZE = { naturalWidth: 400, naturalHeight: 300, width: 400 };

/** The plain-text form of a diagram for other apps (and Tiptap's getText). */
export const diagramClipboardText = (attrs: Record<string, unknown>) => `[Diagram: ${(typeof attrs.title === 'string' && attrs.title.trim()) || 'Untitled'}]`;

const isShapesJson = (text: string | null | undefined): boolean => {
  if (!text || text.length > MAX_CLIPBOARD_CHARS || !text.includes(SHAPES_CLIPBOARD_FORMAT)) return false;
  try {
    const v = JSON.parse(text) as { format?: unknown; nodes?: unknown; edges?: unknown } | null;
    return !!v && v.format === SHAPES_CLIPBOARD_FORMAT && Array.isArray(v.nodes) && Array.isArray(v.edges);
  } catch {
    return false;
  }
};

/** The clipboard JSON carried inside Diagram Studio's text/html (written where custom clipboard types are not allowed). */
function carriedJson(html: string): string | null {
  if (!html || html.length > MAX_CLIPBOARD_CHARS || !html.includes(SHAPES_CLIPBOARD_HTML_ATTR) || typeof DOMParser === 'undefined') return null;
  try {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(`[${SHAPES_CLIPBOARD_HTML_ATTR}]`)?.getAttribute(SHAPES_CLIPBOARD_HTML_ATTR) ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether paste data holds shapes copied in Diagram Studio, in any of its forms: its own clipboard type, the JSON
 * carried in its HTML, or the JSON as plain text (what earlier versions wrote).
 */
export function holdsShapes(get: (type: string) => string): boolean {
  return isShapesJson(get(SHAPES_CLIPBOARD_MIME)) || isShapesJson(carriedJson(get('text/html'))) || isShapesJson(get('text/plain'));
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Sizes from pasted data, bounded: a natural size outside 1..20000 px or with an aspect ratio beyond 1:50 gives the
 * default size; the display width is kept within 40..4000 px and its height follows the natural aspect ratio. Returns
 * only the attributes that change (an empty object for sizes already in bounds).
 */
export function boundDiagramSize(attrs: Record<string, unknown>): Partial<Record<'naturalWidth' | 'naturalHeight' | 'width' | 'height', number>> {
  const L = DIAGRAM_SIZE_LIMITS;
  let nw = attrs.naturalWidth;
  let nh = attrs.naturalHeight;
  const naturalOk =
    finite(nw) && finite(nh) && nw >= L.minNatural && nw <= L.maxNatural && nh >= L.minNatural && nh <= L.maxNatural && nw / nh <= L.maxRatio && nh / nw <= L.maxRatio;
  if (!naturalOk) {
    nw = DEFAULT_SIZE.naturalWidth;
    nh = DEFAULT_SIZE.naturalHeight;
  }
  const w0 = finite(attrs.width) ? attrs.width : DEFAULT_SIZE.width;
  const width = Math.round(Math.min(L.maxWidth, Math.max(L.minWidth, w0)));
  const height = Math.max(1, Math.round((width * (nh as number)) / (nw as number)));
  const out: ReturnType<typeof boundDiagramSize> = {};
  if (!naturalOk) Object.assign(out, { naturalWidth: nw, naturalHeight: nh });
  if (width !== attrs.width) out.width = width;
  // The stored height is kept when it already matches the width (to the pixel); otherwise it follows the width.
  if (!finite(attrs.height) || Math.abs(attrs.height - height) > 1 || out.width !== undefined || !naturalOk) out.height = height;
  return out;
}

/** Applies `fn` to every node of a fragment, children first. */
function mapFragment(fragment: Fragment, fn: (node: PMNode) => PMNode): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((child) => out.push(fn(child.isLeaf ? child : child.copy(mapFragment(child.content, fn)))));
  return Fragment.fromArray(out);
}

/** A pasted slice with every diagram's sizes bounded (boundDiagramSize). */
export function boundPastedSlice(slice: Slice): Slice {
  let changed = false;
  const content = mapFragment(slice.content, (node) => {
    if (node.type.name !== 'diagram') return node;
    const fix = boundDiagramSize(node.attrs);
    if (!Object.keys(fix).length) return node;
    changed = true;
    return node.type.create({ ...node.attrs, ...fix }, null, node.marks);
  });
  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
}

// ── Preview pictures for other apps ────────────────────────────────────────────────────────────────────────────────

/** Previews larger than this are not put on the clipboard as a picture (the diagram itself still is). */
const MAX_CLIPBOARD_IMAGE_BYTES = 8 * 1024 * 1024;

/** Data URLs of recently selected diagrams' previews, so a copy (which must be synchronous) can include the picture. */
export class PreviewDataUrls {
  private readonly urls = new Map<string, string>();
  private readonly loading = new Set<string>();

  constructor(private readonly capacity = 12) {}

  get(id: string): string | undefined {
    return this.urls.get(id);
  }

  /** Loads a preview as a data URL in the background; failures are ignored (the copy then has no picture). */
  prefetch(id: string, load: (id: string) => Promise<Blob | undefined>): Promise<void> {
    if (this.urls.has(id) || this.loading.has(id)) return Promise.resolve();
    this.loading.add(id);
    return Promise.resolve()
      .then(() => load(id))
      .then((blob) => (blob && blob.size <= MAX_CLIPBOARD_IMAGE_BYTES && /^image\//.test(blob.type || 'image/png') ? blobToDataUrl(blob) : null))
      .then((url) => {
        if (!url || !url.startsWith('data:image/')) return;
        this.urls.delete(id);
        this.urls.set(id, url);
        while (this.urls.size > this.capacity) this.urls.delete(this.urls.keys().next().value!);
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(id));
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') return resolve(null);
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob.type ? blob : new Blob([blob], { type: 'image/png' }));
  });
}

/**
 * The clipboard's HTML serializer: the document's own, with each diagram's preview picture (and caption) inside its
 * figure so other apps paste a picture. This app still reads the diagram from `data-diagram` (the figure is a leaf, so
 * the picture inside is ignored), and the stored document and print output are unchanged (they use renderHTML).
 */
export function diagramClipboardSerializer(schema: Schema, images: PreviewDataUrls): DOMSerializer {
  const base = DOMSerializer.fromSchema(schema);
  const own = base.nodes.diagram;
  if (!own) return base;
  return new DOMSerializer(
    {
      ...base.nodes,
      diagram: (node: PMNode): DOMOutputSpec => {
        const spec = own(node);
        if (!Array.isArray(spec)) return spec;
        const a = node.attrs;
        const src = typeof a.previewId === 'string' ? images.get(a.previewId) : undefined;
        const caption = diagramCaption(a);
        const extra: DOMOutputSpec[] = [];
        if (src) extra.push(['img', { src, alt: (typeof a.alt === 'string' && a.alt) || a.title || 'Diagram', width: String(a.width), height: String(a.height) }]);
        if (caption) extra.push(['figcaption', caption]);
        return extra.length ? ([...spec, ...extra] as unknown as DOMOutputSpec) : spec;
      },
    },
    base.marks,
  );
}

// ── Selection after a pasted diagram ───────────────────────────────────────────────────────────────────────────────

/**
 * Puts the cursor right after the block that ends at `pos`: in the following paragraph, else a gap cursor, else a new
 * empty paragraph. A pasted diagram is then not left selected, so the next paste adds another copy.
 */
export function selectAfter(tr: Transaction, pos: number): Transaction {
  const $after = tr.doc.resolve(pos);
  const next = $after.nodeAfter;
  if (next?.isTextblock) return tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  // GapCursor.valid is public at run time but not in the type declarations.
  if ((GapCursor as unknown as { valid?: (p: typeof $after) => boolean }).valid?.($after)) return tr.setSelection(new GapCursor($after));
  const para = tr.doc.type.schema.nodes.paragraph;
  if (para && $after.parent.canReplaceWith($after.index(), $after.index(), para)) {
    tr.insert(pos, para.create());
    return tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  }
  return tr;
}

// ── Plugin ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Pending {
  id: number;
  from: number;
  to: number;
}
interface ClipState {
  /** Ranges of the latest paste or drop (numbered by `batch`, handled once by the view, as in RemoteImages). */
  pasted: Array<{ from: number; to: number }>;
  batch: number;
  /** Pastes of Diagram Studio shapes waiting for their diagram (mapped through every change since). */
  pending: Pending[];
}
type ClipMeta = { add?: Pending; remove?: number };

export const diagramClipboardKey = new PluginKey<ClipState>('dcosDiagramClipboard');

const isPasteLike = (tr: Transaction) => {
  const e = tr.getMeta('uiEvent');
  return e === 'paste' || e === 'drop';
};

function diagramsIn(doc: PMNode, from: number, to: number) {
  const found: Array<{ pos: number; node: PMNode }> = [];
  doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
    if (node.type.name === 'diagram') found.push({ pos, node });
  });
  return found;
}

export interface DiagramClipboardOptions {
  host: DiagramHost | null;
}

/** Copy, cut and paste of embedded diagrams beyond the HTML round trip of DiagramEmbed (see the file comment). */
export const DiagramClipboard = Extension.create<DiagramClipboardOptions>({
  name: 'diagramClipboard',

  addOptions() {
    return { host: null };
  },

  // "[Diagram: title]" as the diagram's text: used for text/plain on copy (Tiptap's clipboard text serializer) and by
  // editor.getText(). ProseMirror's own textBetween (word count, search) is unchanged: it has no leafText.
  extendNodeSchema(extension) {
    return extension.name === 'diagram' ? { toText: ({ node }: { node: PMNode }) => diagramClipboardText(node.attrs) } : {};
  },

  addProseMirrorPlugins() {
    const host = this.options.host;
    const images = new PreviewDataUrls();
    const editor = this.editor;
    const clipboardSerializer = diagramClipboardSerializer(this.editor.schema, images);
    let nextId = 0;

    /** Inserts the diagram made from pasted shapes where the paste happened (mapped through changes since). */
    const place = (view: EditorView, id: number, diagram: EmbeddedDiagram | null) => {
      if (view.isDestroyed) return;
      const entry = diagramClipboardKey.getState(view.state)?.pending.find((p) => p.id === id);
      const tr = view.state.tr.setMeta(diagramClipboardKey, { remove: id } satisfies ClipMeta);
      const type = view.state.schema.nodes.diagram;
      if (!entry || !diagram || !type || !view.editable) {
        view.dispatch(tr.setMeta('addToHistory', false));
        return;
      }
      // As the ribbon's Insert: the page's text width, or a container's share of it (never the window's width).
      const textWidth = diagramTextWidth(editor);
      const room = diagramRoomAt(view, entry.from, textWidth) || (Number.isFinite(textWidth) ? textWidth : DIAGRAM_SIZE_LIMITS.maxWidth);
      const attrs = { ...diagram, ...fitSize(diagram.naturalWidth, diagram.naturalHeight, diagram.naturalWidth, room) };
      const node = type.create({ ...attrs, ...boundDiagramSize(attrs) });
      tr.replaceRangeWith(entry.from, entry.to, node);
      // Where the node landed (replaceRangeWith may have split a paragraph around it), then the cursor goes after it.
      let after = -1;
      tr.doc.descendants((n, pos) => {
        if (after < 0 && n === node) after = pos + n.nodeSize;
        return after < 0;
      });
      if (after >= 0) selectAfter(tr, after);
      view.dispatch(tr.setMeta('uiEvent', 'paste').scrollIntoView());
    };

    /**
     * Fits pasted diagrams to a narrower container (a table cell, a list item, a text box). At the top level nothing is
     * changed: the page is the container, and CSS fits the picture to a narrower window without touching what is
     * stored. A preview that is no longer stored is drawn again by the diagram's view, not here (one place does it).
     */
    const afterPaste = (view: EditorView, ranges: ClipState['pasted']) => {
      const found = ranges.flatMap((r) => diagramsIn(view.state.doc, r.from, r.to));
      if (!found.length) return;
      const textWidth = diagramTextWidth(editor);
      const fit = view.state.tr;
      for (const { pos, node } of found) {
        const room = diagramRoomAt(view, pos, textWidth);
        if (room >= DIAGRAM_SIZE_LIMITS.minWidth && node.attrs.width > room) {
          fit.setNodeMarkup(pos, undefined, { ...node.attrs, ...fitSize(node.attrs.naturalWidth, node.attrs.naturalHeight, room, room) });
        }
      }
      // Part of the paste, not a separate step to undo.
      if (fit.docChanged) view.dispatch(fit.setMeta('addToHistory', false));
    };

    return [
      new Plugin<ClipState>({
        key: diagramClipboardKey,
        state: {
          init: (): ClipState => ({ pasted: [], batch: 0, pending: [] }),
          apply(tr, value): ClipState {
            const meta = tr.getMeta(diagramClipboardKey) as ClipMeta | undefined;
            let pending = value.pending;
            if (tr.docChanged && pending.length) {
              pending = pending.map((p) => {
                const from = tr.mapping.map(p.from, p.from === p.to ? -1 : 1);
                return { id: p.id, from, to: Math.max(from, tr.mapping.map(p.to, -1)) };
              });
            }
            if (meta?.add) pending = [...pending, meta.add];
            if (meta?.remove !== undefined) pending = pending.filter((p) => p.id !== meta.remove);
            if (!tr.docChanged) return pending === value.pending ? value : { ...value, pending };
            if (!isPasteLike(tr)) {
              // Changes appended to a paste (a trailing paragraph) come before the view handles it: keep its ranges in step.
              const pasted = value.pasted.map((r) => ({ from: tr.mapping.map(r.from, -1), to: tr.mapping.map(r.to, 1) }));
              return { ...value, pasted, pending };
            }
            const pasted: ClipState['pasted'] = [];
            tr.mapping.maps.forEach((map, i) =>
              map.forEach((_a, _b, start, end) => {
                const rest = tr.mapping.slice(i + 1);
                pasted.push({ from: rest.map(start, -1), to: rest.map(end, 1) });
              }),
            );
            return { pasted, batch: value.batch + 1, pending };
          },
        },
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data || !view.editable) return false;
            // Read now: clipboard data is only available while the event is handled.
            const snapshot = new Map<string, string>();
            const get = (type: string) => {
              if (!snapshot.has(type)) {
                let v = '';
                try {
                  v = data.getData(type) ?? '';
                } catch {
                  v = '';
                }
                snapshot.set(type, v);
              }
              return snapshot.get(type)!;
            };
            if (!holdsShapes(get)) return false;
            [SHAPES_CLIPBOARD_MIME, 'text/html', 'text/plain'].forEach(get);
            if (!host?.diagramFromShapes) {
              // No diagram support here: paste the readable text Diagram Studio also wrote, never the JSON.
              return isShapesJson(get('text/plain'));
            }
            const id = ++nextId;
            const { from, to } = view.state.selection;
            view.dispatch(view.state.tr.setMeta(diagramClipboardKey, { add: { id, from, to } } satisfies ClipMeta).setMeta('addToHistory', false));
            host.diagramFromShapes((t) => snapshot.get(t) ?? '').then(
              (d) => place(view, id, d),
              () => place(view, id, null),
            );
            return true;
          },
          transformPasted: (slice) => boundPastedSlice(slice),
          // Only the HTML of a copy (what other apps read) gains the picture; this app reads data-diagram as before.
          clipboardSerializer,
        },
        appendTransaction(trs, _old, state) {
          // A pasted diagram is left selected by ProseMirror; a second Ctrl+V would then replace it. Move past it.
          if (!trs.some((tr) => tr.docChanged && tr.getMeta('uiEvent') === 'paste')) return null;
          const sel = state.selection;
          if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'diagram') return null;
          const tr = selectAfter(state.tr, sel.to);
          return tr.selectionSet || tr.docChanged ? tr : null;
        },
        view: (initial) => {
          let handled = 0;
          // Only selections the user makes are read ahead, not the one the document opens with: on opening, the
          // diagram's own view loads its preview, and a second load at the same moment is wasted (Round 3: it also
          // took the place of the view's load, so a failed load showed no "preview unavailable").
          let lastSelection: EditorState['selection'] | null = initial.state.selection;
          return {
            update(view) {
              const st = diagramClipboardKey.getState(view.state);
              if (st && st.batch !== handled) {
                handled = st.batch;
                const ranges = st.pasted;
                // After the paste has been drawn (node views are in the DOM, so containers can be measured).
                queueMicrotask(() => !view.isDestroyed && afterPaste(view, ranges));
              }
              // Selected diagrams' previews are read ahead, so a copy can put the picture on the clipboard.
              const sel = view.state.selection;
              if (host && sel !== lastSelection) {
                lastSelection = sel;
                if (!sel.empty) {
                  for (const { node } of diagramsIn(view.state.doc, sel.from, sel.to).slice(0, 12)) {
                    if (typeof node.attrs.previewId === 'string' && node.attrs.previewId) void images.prefetch(node.attrs.previewId, (i) => host.loadPreview(i));
                  }
                }
              }
            },
          };
        },
      }),
    ];
  },
});
