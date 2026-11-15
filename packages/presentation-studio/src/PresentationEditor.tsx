import { Button, cn, downloadBlob, safeFileName, useToast } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { FileJson, Plus, Redo2, ShieldAlert, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { newId } from './create';
import { alignElements, canReorder, distributeElements, reorderElements, type ZOrder } from './editor/arrange';
import { Canvas, type CanvasCommands } from './editor/Canvas';
import { copyElements, hasClipboardElements, onClipboardChange, readPasteEvent, rememberedElements, rememberElements, writeElementsToEvent } from './editor/clipboard';
import {
  addSlide,
  deleteElements,
  deleteSlides,
  duplicateSlides,
  inSlideOrder,
  insertElements,
  moveSlides,
  moveSlidesBy,
  nextLayoutId,
  nudgeElements,
  setGeometry,
  setLocked,
  setNotes,
  setSlidesHidden,
  updateElements,
} from './editor/model';
import { NotesPane } from './editor/NotesPane';
import { modKey, SlidesPanel, type SlideCommands } from './editor/SlidesPanel';
import { EDITOR_CSS } from './editor/textExtensions';
import { useEditorModel } from './editor/useEditorModel';
import { useDesign } from './design/useDesign';
import { Inspector } from './elements/Inspector';
import { applyToShapeText, fitResizedTables, useContentTools } from './elements/useContentTools';
import { fitScale } from './geometry';
import type { PresentationDiagramHost, PresentationImageHost } from './hosts';
import { textStyle } from './layouts';
import { RichText } from './render/RichText';
import { SlideView } from './render/SlideView';
import { preparePresentation, type PreparedPresentation } from './safety';
import { ExportMenu } from './export/ExportMenu';
import { useShowFeatures } from './show/useShowFeatures';
import { emptyRichText, isEmptyRichText, plainTextOf, richTextFromPlain, type PresentationContent, type RichTextDoc, type Slide, type SlideElement, type TextElement } from './types';
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ui/ContextMenu';
import type { RibbonContext } from './ui/context';
import { HomeTab } from './ui/HomeTab';
import { InsertTab } from './ui/InsertTab';
import { ToolButton } from './ui/parts';
import { Ribbon, type RibbonTab } from './ui/Ribbon';

export interface PresentationEditorProps {
  initialContent: unknown;
  title: string;
  /** Called with the full content after every change. Never called for content opened read-only (protected view). */
  onChange: (content: unknown) => void;
  /** Pictures, picture backgrounds and diagram previews (attachments). */
  imageHost?: PresentationImageHost;
  /** @phase7:CONTENT — diagrams on slides, through the app's diagram editor. */
  diagramHost?: PresentationDiagramHost;
  /**
   * SHOW: the address of the app's presenter window for a slide show session (opened with window.open). Without it,
   * the presenter view is shown inside the slide show.
   */
  presenterUrl?: (session: string) => string;
}

/** Short label of a slide for lists and screen readers: its number and the text of its title placeholder, if any. */
export function slideLabel(content: PresentationContent, slide: Slide, index: number): string {
  const title = slide.elements.find((e) => e.type === 'text' && e.placeholderId === 'title');
  const text = title?.type === 'text' ? plainTextOf(title.text).trim().split('\n')[0] : '';
  void content;
  return `Slide ${index + 1}${text ? `: ${text}` : ''}${slide.hidden ? ' (hidden in the slide show)' : ''}`;
}

/** Fits the slide into the element it is measured from, and follows its size. */
function useFitScale(size: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Before layout (or in tests without layout) show the slide at a readable size rather than nothing.
      const frame = r.width > 0 && r.height > 0 ? { width: r.width, height: r.height } : { width: size.width / 2, height: size.height / 2 };
      setScale(fitScale(size, frame, 2).scale);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  return { ref, scale };
}

function ProtectedBanner({ prepared, original, title }: { prepared: Extract<PreparedPresentation, { state: 'protected' }>; original: unknown; title: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Opened read-only to protect this presentation</div>
        <p className="mt-0.5 text-muted">
          {prepared.reason === 'newer' ? 'It was saved by a newer version of Classroom OS. Update the app on this device to edit it.' : 'It contains content this version cannot display exactly.'}{' '}
          Nothing has been changed or saved. What you see below may be simplified.
        </p>
        <p className="mt-1 break-words font-mono text-xs text-muted">{prepared.detail}</p>
      </div>
      <Button
        size="sm"
        icon={<FileJson size={14} />}
        onClick={() => downloadBlob(new Blob([JSON.stringify(original, null, 2)], { type: 'application/json' }), `${safeFileName(title)} (original data).json`)}
      >
        Download original data
      </Button>
    </div>
  );
}

/** The Tailwind `md` breakpoint, where the slide list turns from a strip along the top into a column. */
export const WIDE_LAYOUT_QUERY = '(min-width: 768px)';

/**
 * Where the object inspector sits beside the slide rather than folded below it. Below this width a 288 px panel beside
 * the slide would leave the slide smaller than the panel (a 800 px tablet gave a 272 px slide).
 */
export const INSPECTOR_BESIDE_QUERY = '(min-width: 1100px)';

/** Whether the wide layout applies now (the slide list is a column). Without matchMedia it assumes the wide layout. */
function useWideLayout(media: string = WIDE_LAYOUT_QUERY) {
  const query = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(media) : null);
  const [wide, setWide] = useState(() => query()?.matches ?? true);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [media]);
  return wide;
}

/**
 * Presentation Studio. Editable content opens in the editor (EditablePresentation). Content the build cannot
 * represent exactly opens read-only in a protected view (ReadOnlyPresentation); the stored original is never changed.
 *
 * @phase7:DESIGN — Design tab: themes, slide size, backgrounds, master view, change layout.
 * SHOW (show/**): the Transitions, Animations and Slide Show tabs, the slide show, the presenter view and the previews.
 * Exports (Phase 7 EXPORT): the Export menu (export/ExportMenu.tsx) in the ribbon's trailing slot.
 */
export function PresentationEditor(props: PresentationEditorProps) {
  // Read once, like the other editors: later saves of this session come from the editor itself.
  const [prepared] = useState(() => preparePresentation(props.initialContent));
  if (prepared.state === 'protected') return <ReadOnlyPresentation prepared={prepared} original={props.initialContent} title={props.title} imageHost={props.imageHost} />;
  return <EditablePresentation initial={prepared.content} onChange={props.onChange} imageHost={props.imageHost} diagramHost={props.diagramHost} title={props.title} presenterUrl={props.presenterUrl} />;
}

/** The protected view: the slide list, the selected slide and its notes, read-only, with the reason and the original data. */
function ReadOnlyPresentation({ prepared, original, title, imageHost }: { prepared: Extract<PreparedPresentation, { state: 'protected' }>; original: unknown; title: string; imageHost?: PresentationImageHost }) {
  const content = prepared.display;
  const slides = content.slides;
  const [current, setCurrent] = useState(0);
  const index = Math.min(current, Math.max(0, slides.length - 1));
  const slide = slides[index];
  const stage = useFitScale(content.size);
  const wide = useWideLayout();
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const focusAfterMove = useRef(false);

  useEffect(() => {
    if (!focusAfterMove.current) return;
    focusAfterMove.current = false;
    options.current[index]?.focus();
  }, [index]);

  const onListKey = (e: KeyboardEvent) => {
    const last = slides.length - 1;
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    focusAfterMove.current = true;
    setCurrent(Math.max(0, Math.min(last, to)));
  };

  const thumbScale = 168 / content.size.width;
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ProtectedBanner prepared={prepared} original={original} title={title} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          role="listbox"
          aria-label="Slides"
          aria-orientation={wide ? 'vertical' : 'horizontal'}
          onKeyDown={onListKey}
          className="flex shrink-0 gap-3 overflow-x-auto border-b border-border bg-surface p-3 md:w-52 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r"
        >
          {slides.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                options.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={i === index}
              aria-label={slideLabel(content, s, i)}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setCurrent(i)}
              className={cn('flex shrink-0 items-start gap-2 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent', i === index ? 'bg-accent-soft' : 'hover:bg-surface-2')}
            >
              <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted">{i + 1}</span>
              <span className={cn('overflow-hidden rounded border shadow-xs', i === index ? 'border-accent' : 'border-border', s.hidden && 'opacity-50')}>
                <SlideView content={content} slide={s} scale={thumbScale} imageHost={imageHost} />
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={stage.ref} className="relative min-h-[200px] flex-1 overflow-hidden bg-surface-2 p-0">
            {slide && stage.scale > 0 ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="shadow-md">
                  <SlideView content={content} slide={slide} scale={Math.max(0.05, stage.scale * 0.94)} imageHost={imageHost} label={slideLabel(content, slide, index)} />
                </div>
              </div>
            ) : (
              !slide && <p className="p-6 text-sm text-muted">This presentation has no slides.</p>
            )}
          </div>
          {slide && (
            <section aria-label="Speaker notes" className="max-h-40 shrink-0 overflow-y-auto border-t border-border bg-surface px-4 py-3 text-sm">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Speaker notes</h2>
              {isEmptyRichText(slide.notes) ? <p className="text-muted">No notes for this slide.</p> : <RichText doc={slide.notes} theme={{ ...content.theme, colors: { ...content.theme.colors, hyperlink: 'inherit' } }} />}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select, [contenteditable="true"]') !== null);

/** The paste offset that puts copies where no object of the same kind and size already sits (PowerPoint's cascade). */
function pasteOffset(slide: Slide, elements: SlideElement[]): number {
  const taken = (offset: number) => elements.some((p) => slide.elements.some((e) => e.type === p.type && e.x === Math.round(p.x + offset) && e.y === Math.round(p.y + offset) && e.w === p.w && e.h === p.h));
  let offset = 0;
  while (taken(offset) && offset < 16 * 50) offset += 16;
  return offset;
}

/**
 * The editor (Phase 7 Round 2a): the ribbon, the slides panel, the slide canvas and the speaker notes, with one undo
 * history for everything. Every change is reported through onChange.
 */
function EditablePresentation({
  initial,
  onChange,
  imageHost,
  diagramHost,
  title = '',
  presenterUrl,
}: {
  initial: PresentationContent;
  onChange: (content: unknown) => void;
  imageHost?: PresentationImageHost;
  diagramHost?: PresentationDiagramHost;
  title?: string;
  presenterUrl?: (session: string) => string;
}) {
  const model = useEditorModel(initial, onChange);
  const { content, selection } = model.state;
  const wide = useWideLayout();
  const inspectorBeside = useWideLayout(INSPECTOR_BESIDE_QUERY);
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const slideIndexNow = content.slides.findIndex((s) => s.id === selection.slideId);
  const slide = slideIndexNow >= 0 ? content.slides[slideIndexNow] : null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [caretAt, setCaretAt] = useState<{ x: number; y: number } | null>(null);
  const [liveEditor, setLiveEditor] = useState<Editor | null>(null);
  const session = useRef(0);
  const [tab, setTab] = useState('home');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [canvasFocus, setCanvasFocus] = useState(0);
  const [slidesFocus, setSlidesFocus] = useState(0);
  const [canPaste, setCanPaste] = useState(hasClipboardElements);
  useEffect(() => onClipboardChange(() => setCanPaste(hasClipboardElements())), []);

  const selected = useMemo(() => (slide ? slide.elements.filter((e) => selection.elementIds.includes(e.id)) : []), [slide, selection.elementIds]);
  const editing = editingId && slide ? (slide.elements.find((e) => e.id === editingId && e.type === 'text') as TextElement | undefined) ?? null : null;

  // Editing ends when its text box goes (undo, another slide, deleted).
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  const latest = () => model.latest();
  const currentSlide = () => {
    const s = latest();
    return s.content.slides.find((x) => x.id === s.selection.slideId) ?? null;
  };

  const stopEdit = useCallback(() => {
    setEditingId(null);
    setCaretAt(null);
    // A session whose typing was all undone inside the text box leaves no undo step that does nothing.
    model.endGroup({ dropIfUnchanged: true });
    setCanvasFocus((n) => n + 1);
  }, [model]);

  const startEdit = (id: string, at?: { x: number; y: number }) => {
    session.current += 1;
    model.select({ elementIds: [id] });
    setCaretAt(at ?? null);
    setEditingId(id);
  };

  // ── Slides ──────────────────────────────────────────────────────────────────────────────────────

  const selectSlides = (slideId: string, slideIds: string[]) => {
    if (editingId) stopEdit();
    model.select({ slideId, slideIds, elementIds: [] });
  };

  // DESIGN (Round 2b): the Design tab, the slide menu's layout and background items, and master view.
  const design = useDesign({
    model,
    imageHost,
    wide,
    beforeChange: () => {
      if (editingId) stopEdit();
    },
    undo: () => undoRef.current.undo(),
    redo: () => undoRef.current.redo(),
  });

  // CONTENT (Round 2b): pictures, shapes, tables, charts and diagrams: insert, edit in place, inspector, object menu
  // items, pasted and dropped pictures (elements/useContentTools.tsx).
  const contentTools = useContentTools({
    model,
    imageHost,
    diagramHost,
    onEditor: setLiveEditor,
    focusCanvas: () => setCanvasFocus((n) => n + 1),
    stopTextEdit: () => {
      if (editingId) stopEdit();
    },
    root,
  });

  const slideCommands: SlideCommands = {
    ...design.slideCommands,
    newSlide: (layoutId) => {
      if (editingId) stopEdit();
      const s = latest();
      const at = s.content.slides.findIndex((x) => x.id === s.selection.slideId);
      const after = at >= 0 ? s.content.slides[at] : s.content.slides[s.content.slides.length - 1];
      const r = addSlide(s.content, layoutId ?? nextLayoutId(s.content, after), at >= 0 ? at + 1 : s.content.slides.length);
      model.apply(() => r.content, { select: { slideId: r.slideId, slideIds: [r.slideId], elementIds: [] } });
      setSlidesFocus((n) => n + 1);
    },
    duplicate: () => {
      if (editingId) stopEdit();
      const s = latest();
      const r = duplicateSlides(s.content, s.selection.slideIds);
      if (!r.slideIds.length) return;
      model.apply(() => r.content, { select: { slideId: r.slideIds[r.slideIds.length - 1], slideIds: r.slideIds, elementIds: [] } });
      setSlidesFocus((n) => n + 1);
    },
    remove: () => {
      if (editingId) stopEdit();
      const s = latest();
      const ids = inSlideOrder(s.content, s.selection.slideIds);
      if (!ids.length) return;
      const first = s.content.slides.findIndex((x) => x.id === ids[0]);
      const next = deleteSlides(s.content, ids);
      const stay = next.slides[Math.min(first, next.slides.length - 1)];
      model.apply(() => next, { select: { slideId: stay?.id ?? null, slideIds: stay ? [stay.id] : [], elementIds: [] } });
      const numbers = ids.map((id) => s.content.slides.findIndex((x) => x.id === id) + 1);
      toast(`Deleted ${numbers.length === 1 ? `slide ${numbers[0]}` : `${numbers.length} slides`}. Undo with ${modKey()}Z.`, 'info');
      setSlidesFocus((n) => n + 1);
    },
    setHidden: (hidden) => {
      const s = latest();
      model.apply((c) => setSlidesHidden(c, s.selection.slideIds, hidden));
    },
    moveBy: (delta) => {
      const s = latest();
      model.apply((c) => moveSlidesBy(c, s.selection.slideIds, delta));
      setSlidesFocus((n) => n + 1);
    },
    moveTo: (where) => {
      const s = latest();
      model.apply((c) => moveSlides(c, s.selection.slideIds, where === 'start' ? 0 : c.slides.length));
      setSlidesFocus((n) => n + 1);
    },
    moveIds: (ids, to) => {
      // Dragging a slide that was not selected selects it alone and makes it the current one.
      const cur = latest().selection.slideId;
      const slideId = cur && ids.includes(cur) ? cur : ids[0];
      model.apply((c) => moveSlides(c, ids, to), { select: { slideId, slideIds: ids, elementIds: slideId === cur ? latest().selection.elementIds : [] } });
      setSlidesFocus((n) => n + 1);
    },
    // SHOW: "Play from this slide" in the slide menu.
    playFrom: (id) => {
      if (editingId) stopEdit();
      show.playFrom(id);
    },
  };

  // ── Objects ─────────────────────────────────────────────────────────────────────────────────────

  const selectedNow = () => {
    const s = currentSlide();
    const ids = latest().selection.elementIds;
    return s ? s.elements.filter((e) => ids.includes(e.id)) : [];
  };

  const pasteElements = (elements: SlideElement[]) => {
    const s = currentSlide();
    if (!s || !elements.length) return;
    if (editingId) stopEdit();
    const r = insertElements(latest().content, s.id, elements, pasteOffset(s, elements));
    model.apply(() => r.content, { select: { elementIds: r.ids } });
    setCanvasFocus((n) => n + 1);
  };

  const insertText = (doc: RichTextDoc, startEditing: boolean) => {
    const s = currentSlide();
    if (!s) return;
    const { width: W, height: H } = latest().content.size;
    const lines = Math.max(1, plainTextOf(doc).split('\n').length);
    const w = Math.round(W / 2);
    const h = Math.min(Math.round(H * 0.8), Math.round(lines * 20 * 1.15 * (96 / 72) + 12));
    const el: TextElement = { id: newId(), type: 'text', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0, text: doc, style: textStyle({ autofit: 'resize' }) };
    model.apply((c) => updateElementsAppend(c, s.id, el), { select: { elementIds: [el.id] } });
    if (startEditing) startEdit(el.id);
    else setCanvasFocus((n) => n + 1);
  };

  const remove = () => {
    const s = currentSlide();
    const ids = latest().selection.elementIds;
    if (!s || !ids.length) return;
    if (editingId) stopEdit();
    model.apply((c) => deleteElements(c, s.id, ids), { select: { elementIds: [] } });
  };

  const reorder = (how: ZOrder) => {
    const s = currentSlide();
    if (s) model.apply((c) => reorderElements(c, s.id, latest().selection.elementIds, how));
  };

  const menuItems = (): ContextMenuItem[] => {
    const sel = selectedNow();
    const s = currentSlide();
    const none = !sel.length;
    const mod = modKey();
    const ids = sel.map((e) => e.id);
    const allLocked = !none && sel.every((e) => e.locked);
    return [
      // Menu and ribbon copies also reach the system clipboard, which Ctrl/⌘+V pastes from.
      { label: 'Cut', hint: `${mod}X`, disabled: none, onSelect: () => (copyElements(sel), remove()) },
      { label: 'Copy', hint: `${mod}C`, disabled: none, onSelect: () => copyElements(sel) },
      { label: 'Paste', hint: `${mod}V`, disabled: !hasClipboardElements(), onSelect: () => pasteElements(rememberedElements()) },
      { label: 'Duplicate', hint: `${mod}D`, disabled: none, onSelect: () => pasteElements(sel.map((e) => ({ ...e, x: e.x + 16, y: e.y + 16 }))) },
      { label: 'Delete', hint: 'Del', disabled: none, danger: true, onSelect: remove },
      { label: 'Bring to front', disabled: !s || !canReorder(s.elements, ids, 'front'), onSelect: () => reorder('front'), separator: true },
      { label: 'Bring forward', disabled: !s || !canReorder(s.elements, ids, 'forward'), onSelect: () => reorder('forward') },
      { label: 'Send backward', disabled: !s || !canReorder(s.elements, ids, 'backward'), onSelect: () => reorder('backward') },
      { label: 'Send to back', disabled: !s || !canReorder(s.elements, ids, 'back'), onSelect: () => reorder('back') },
      { label: allLocked ? 'Unlock' : 'Lock', disabled: none, onSelect: () => s && model.apply((c) => setLocked(c, s.id, ids, !allLocked)), separator: true },
      { label: 'Select all', hint: `${mod}A`, disabled: !s?.elements.length, onSelect: () => s && model.select({ elementIds: s.elements.map((e) => e.id) }) },
      // CONTENT: per-object items (Replace picture…, Edit chart data…, Edit diagram…, Edit cells, Edit text).
      ...contentTools.menuItems(sel),
    ];
  };

  /** Copy and Cut from the ribbon: the in-app and the system clipboard (a menu click sends no copy event). */
  const copyFromButton = () => {
    const sel = selectedNow();
    if (sel.length) copyElements(sel);
  };
  const cutFromButton = () => {
    const sel = selectedNow();
    if (!sel.length) return;
    copyElements(sel);
    remove();
  };

  const canvasCommands: CanvasCommands = {
    // Ctrl/⌘+C and X: the copy or cut event that follows the key fills the system clipboard.
    copy: () => {
      const sel = selectedNow();
      if (sel.length) rememberElements(sel);
    },
    cut: () => {
      const sel = selectedNow();
      if (!sel.length) return;
      rememberElements(sel);
      remove();
    },
    copyToEvent: (e) => {
      const sel = selectedNow();
      if (sel.length) writeElementsToEvent(e, sel);
    },
    pasteFromEvent: (e) => {
      const got = readPasteEvent(e);
      if (got?.kind === 'elements') {
        pasteElements(got.elements);
        return true;
      }
      // CONTENT: pictures in the clipboard (a copied image, a screenshot) become pictures on the slide.
      if (contentTools.pastePictures(e)) return true;
      if (!got) return false;
      insertText(richTextFromPlain(got.text.replace(/\r\n?/g, '\n')), false);
      return true;
    },
    paste: () => pasteElements(rememberedElements()),
    duplicate: () => pasteElements(selectedNow().map((e) => ({ ...e, x: e.x + 16, y: e.y + 16 }))),
    remove,
    selectAll: () => {
      const s = currentSlide();
      if (s) model.select({ elementIds: s.elements.map((e) => e.id) });
    },
    nudge: (dx, dy) => {
      const s = currentSlide();
      const ids = latest().selection.elementIds;
      if (s) model.apply((c) => nudgeElements(c, s.id, ids, dx, dy), { group: `nudge:${s.id}:${ids.join(',')}` });
    },
    bringForward: (toFront) => reorder(toFront ? 'front' : 'forward'),
    sendBackward: (toBack) => reorder(toBack ? 'back' : 'backward'),
    menuItems,
  };

  // ── Undo and redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y) ───────────────────────────────────────────

  // The Undo button (and Ctrl/⌘+Z outside a text editor) always uses the one history: while a text box is edited, it
  // ends the edit and undoes the whole typing session, so Redo brings that typing back. (Ctrl/⌘+Z typed inside the
  // text box is the text editor's own, finer undo.)
  const undo = () => {
    if (editingId) stopEdit();
    contentTools.stop();
    model.undo();
  };
  const redo = () => {
    if (liveEditor?.can().redo()) {
      liveEditor.commands.redo();
      return;
    }
    if (editingId) stopEdit();
    contentTools.stop();
    model.redo();
  };
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      // Text fields and the text editors keep their own undo while they have the focus.
      if (isEditable(e.target)) return;
      const t = e.target as Node | null;
      if (!(t === document.body || (t && root.current?.contains(t)))) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) undoRef.current.redo();
      else undoRef.current.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Ribbon ──────────────────────────────────────────────────────────────────────────────────────

  // CONTENT: while a shape's text is edited, the ribbon formats it like a text box (contentTools.textTarget).
  const textTargets = editing ? [editing] : contentTools.textTarget ? [contentTools.textTarget] : (selected.filter((e) => e.type === 'text') as TextElement[]);
  const ribbon: RibbonContext = {
    content,
    slide,
    selected,
    textTargets,
    editor: liveEditor,
    canPaste,
    paste: canvasCommands.paste,
    copy: copyFromButton,
    cut: cutFromButton,
    duplicate: canvasCommands.duplicate,
    remove,
    newSlide: slideCommands.newSlide,
    insertTextBox: () => insertText(emptyRichText(), true),
    formatBoxes: (change) => {
      if (!slide) return;
      const ids = textTargets.map((t) => t.id);
      model.apply((c) => updateElements(c, slide.id, ids, (e) => (e.type === 'text' ? change(e) : applyToShapeText(e, change))));
    },
    reorder,
    canReorder: (how) => !!slide && canReorder(slide.elements, selection.elementIds, how),
    align: (mode) => slide && model.apply((c) => alignElements(c, slide.id, selection.elementIds, mode)),
    distribute: (mode) => slide && model.apply((c) => distributeElements(c, slide.id, selection.elementIds, mode)),
    rotateBy: (deg) => slide && model.apply((c) => updateElements(c, slide.id, selection.elementIds, (e) => (e.locked ? e : { ...e, rotation: (((e.rotation + deg) % 360) + 360) % 360 }))),
    setLocked: (locked) => slide && model.apply((c) => setLocked(c, slide.id, selection.elementIds, locked)),
    contentTools,
  };
  // SHOW: the slide show, presenter view, transitions, animations and their tabs (show/useShowFeatures.tsx).
  const show = useShowFeatures({
    content,
    slideId: selection.slideId,
    slideIds: selection.slideIds,
    elementIds: selection.elementIds,
    title,
    imageHost,
    presenterUrl,
    apply: (change, group) => model.apply(change, group ? { group } : {}),
    selectSlide: (id) => model.select({ slideId: id, slideIds: [id], elementIds: [] }),
    setHidden: slideCommands.setHidden,
    root,
    stageAnchor: () => root.current?.querySelector('[data-canvas] [data-stage]') ?? null,
  });
  const tabs: RibbonTab[] = [
    { id: 'home', label: 'Home', content: <HomeTab {...ribbon} /> },
    { id: 'insert', label: 'Insert', content: <InsertTab {...ribbon} /> },
    design.tab, // DESIGN: themes, slide size, backgrounds, layout, master view (design/useDesign.tsx)
    ...show.tabs, // SHOW: Transitions, Animations and Slide Show (show/useShowFeatures.tsx)
  ];
  const mod = modKey();

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg" data-presentation-editor="">
      <style>{EDITOR_CSS}</style>
      {/* DESIGN: master view replaces the ribbon and the slides while it is open. */}
      {design.masterView ?? (
        <>
      <Ribbon
        tabs={tabs}
        active={tab}
        onTab={setTab}
        // Phase 7 EXPORT: the Export menu (PowerPoint, PDF, PDF with notes), beside SHOW's "Slide show" button.
        trailing={
          <>
            {show.trailing}
            <ExportMenu getContent={() => model.latest().content} title={title} imageHost={imageHost} diagramHost={diagramHost} />
          </>
        }
        leading={
          <>
            <ToolButton label="Undo" shortcut={`${mod}Z`} onClick={undo} disabled={!model.canUndo}>
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton label="Redo" shortcut={mod === '⌘' ? '⌘⇧Z' : 'Ctrl+Y'} onClick={redo} disabled={!model.canRedo && !liveEditor?.can().redo()}>
              <Redo2 size={16} />
            </ToolButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SlidesPanel
          content={content}
          slideId={selection.slideId}
          slideIds={selection.slideIds}
          imageHost={imageHost}
          wide={wide}
          label={(s, i) => slideLabel(content, s, i)}
          onSelect={selectSlides}
          commands={slideCommands}
          onContextMenu={(x, y, items, returnFocus) => setMenu({ x, y, items, label: 'Slide', returnFocus })}
          focusRequest={slidesFocus}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={`flex min-h-0 min-w-0 flex-1 ${inspectorBeside ? 'flex-row' : 'flex-col'}`}>
          {slide ? (
            <Canvas
              content={content}
              slide={slide}
              slideNumber={slideIndexNow + 1}
              selection={selection.elementIds}
              editingId={editing?.id ?? contentTools.edit?.id ?? null}
              imageHost={imageHost}
              onSelect={(ids) => model.select({ elementIds: ids })}
              // CONTENT: a resized table's columns and rows follow its new box.
              onGeometry={(g) => model.apply((c) => fitResizedTables(setGeometry(c, slide.id, g), slide.id, g.keys()))}
              onStartEdit={startEdit}
              onStopEdit={() => {
                contentTools.stop();
                stopEdit();
              }}
              contentLayer={contentTools.layer}
              contentEditId={contentTools.edit?.id ?? null}
              drawElement={contentTools.draw}
              onOpenElement={contentTools.open}
              onDropFiles={contentTools.dropFiles}
              onText={(id, doc) => model.apply((c) => updateElements(c, slide.id, [id], (e) => (e.type === 'text' ? { ...e, text: doc } : e)), { group: `text:${id}:${session.current}` })}
              onNeedHeight={(id, h) =>
                model.apply((c) => updateElements(c, slide.id, [id], (e) => (e.type === 'text' && e.style.autofit === 'resize' && Math.abs(e.h - h) > 1 ? { ...e, h: Math.round(h) } : e)), { group: `text:${id}:${session.current}` })
              }
              onFit={(heights) =>
                model.apply((c) => updateElements(c, slide.id, [...heights.keys()], (e) => (e.type === 'text' && e.style.autofit === 'resize' && heights.has(e.id) ? { ...e, h: heights.get(e.id)! } : e)), { amend: true })
              }
              onEditor={setLiveEditor}
              caretAt={caretAt}
              commands={canvasCommands}
              onContextMenu={(x, y, items, returnFocus) => setMenu({ x, y, items, label: 'Object', returnFocus })}
              focusRequest={canvasFocus}
            />
          ) : (
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 bg-[var(--dc-canvas)] p-6 text-center text-sm text-muted">
              <p>This presentation has no slides.</p>
              <Button size="sm" icon={<Plus size={14} />} onClick={() => slideCommands.newSlide()}>
                Add a slide
              </Button>
            </div>
          )}
          {/* CONTENT: the inspector of the selected object, beside the canvas on wide screens, below it on phones. */}
          {slide && <Inspector tools={contentTools} selected={selected} wide={inspectorBeside} />}
          </div>
          {/* @phase7:DESIGN — the master view replaces the canvas while it is open. */}
          {slide && (
            <NotesPane
              slideId={slide.id}
              slideNumber={slideIndexNow + 1}
              notes={slide.notes}
              compact={!wide}
              onChange={(id, doc) => model.apply((c) => setNotes(c, id, doc), { group: `notes:${id}` })}
              onFocusChange={(focused) => !focused && model.endGroup()}
            />
          )}
        </div>
      </div>
        </>
      )}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      {contentTools.dialogs}
      {design.overlay}
      {show.overlays}
    </div>
  );
}

/** Adds one element on top of a slide. */
function updateElementsAppend(content: PresentationContent, slideId: string, el: SlideElement): PresentationContent {
  return { ...content, slides: content.slides.map((s) => (s.id === slideId ? { ...s, elements: [...s.elements, el] } : s)) };
}
