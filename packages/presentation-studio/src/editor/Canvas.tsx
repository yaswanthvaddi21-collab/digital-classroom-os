import type { Editor } from '@tiptap/core';
import { cn } from '@dcos/ui';
import { Lock } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { boxFromPoints, containsBox, fitScale, rotatePoint, rotatedBounds, unionBounds, type Box, type Point } from '../geometry';
import type { PresentationImageHost } from '../hosts';
import { ElementView, SlideView, textCss } from '../render/SlideView';
import { emptyRichText, isEmptyRichText, plainTextOf, type PresentationContent, type RichTextDoc, type Slide, type SlideElement, type TextElement } from '../types';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { guidesFor, snapMove, snapResize, spacingFor, type Guide, type SpacingHint } from './guides';
import { TextBoxEditor } from './TextBoxEditor';

/** Screen pixels within which objects snap to guides (converted to slide pixels at the current zoom). */
export const SNAP_PX = 6;
/** Screen pixels a press must move before it becomes a drag (so a click never moves anything). */
const DRAG_START_PX = 3;

type Geometry = { x: number; y: number; w: number; h: number; rotation: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface CanvasCommands {
  copy: () => void;
  cut: () => void;
  /** Writes the selection to a copy/cut event (system clipboard) and the in-app clipboard. */
  copyToEvent: (e: ClipboardEvent) => void;
  /** Pastes what a paste event holds; false when it held nothing the canvas takes. */
  pasteFromEvent: (e: ClipboardEvent) => boolean;
  /** Pastes the in-app clipboard. */
  paste: () => void;
  duplicate: () => void;
  remove: () => void;
  selectAll: () => void;
  nudge: (dx: number, dy: number) => void;
  bringForward: (toFront: boolean) => void;
  sendBackward: (toBack: boolean) => void;
  /** The object menu's items for the current selection. */
  menuItems: () => ContextMenuItem[];
}

export interface CanvasProps {
  content: PresentationContent;
  slide: Slide;
  slideNumber: number;
  selection: string[];
  editingId: string | null;
  imageHost?: PresentationImageHost;
  onSelect: (ids: string[]) => void;
  /** Sets new geometry for elements (one undo step). */
  onGeometry: (geometry: Map<string, Geometry>) => void;
  onStartEdit: (id: string, caretAt?: { x: number; y: number }) => void;
  onStopEdit: () => void;
  onText: (id: string, doc: RichTextDoc) => void;
  onNeedHeight: (id: string, height: number) => void;
  /**
   * 'Resize box to fit text' outside editing: the heights (slide px) that text boxes changed by the last change (their
   * text, style, width or height, or the theme) need. The editor makes them part of that change.
   */
  onFit: (heights: Map<string, number>) => void;
  onEditor: (editor: Editor | null) => void;
  caretAt: { x: number; y: number } | null;
  commands: CanvasCommands;
  onContextMenu: (x: number, y: number, items: ContextMenuItem[], returnFocus: HTMLElement | null) => void;
  /** Bumped by the editor to put the focus on the canvas (after editing ends, after a paste…). */
  focusRequest: number;
  /** DESIGN (master view): the objects listbox's name instead of "Objects on slide N". */
  label?: string;
  /** DESIGN (master view): whether an object has a rotate handle (placeholders cannot turn). Default: all. */
  canRotate?: (el: SlideElement) => boolean;
  /**
   * CONTENT (Round 2b): drawn above the objects, in slide pixels (a shape's text editor, a table's cells, the buttons
   * of empty picture/chart/table placeholders). Only its own children take the pointer.
   */
  contentLayer?: ReactNode;
  /** CONTENT: the object whose contents contentLayer edits (its hit area lets the pointer through to the editor). */
  contentEditId?: string | null;
  /** CONTENT: how an object is drawn while its contents are edited (its own text hidden under the editor). */
  drawElement?: (el: SlideElement) => SlideElement;
  /** CONTENT: double-click, Enter or a second tap on an object that is not a text box (`at` in slide px). */
  onOpenElement?: (el: SlideElement, at: Point, screen?: { x: number; y: number }) => void;
  /** CONTENT: files dropped on the slide (`at` in slide px). */
  onDropFiles?: (files: File[], at: Point) => void;
}

const TYPE_NAMES: Record<SlideElement['type'], string> = { text: 'Text box', image: 'Picture', shape: 'Shape', table: 'Table', chart: 'Chart', diagram: 'Diagram' };

/** The prompt of the layout placeholder a text element fills ("Click to add title"), if any. */
export function placeholderPrompt(content: PresentationContent, slide: Slide, el: SlideElement): string | undefined {
  if (!el.placeholderId) return undefined;
  const layout = content.layouts.find((l) => l.id === slide.layoutId);
  const master = content.masters.find((m) => m.id === layout?.masterId);
  return (layout?.placeholders.find((p) => p.id === el.placeholderId) ?? master?.placeholders.find((p) => p.id === el.placeholderId))?.prompt;
}

/** The accessible name of an object on the canvas. */
export function elementLabel(content: PresentationContent, slide: Slide, el: SlideElement): string {
  const locked = el.locked ? ', locked' : '';
  const excerpt = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
  if (el.type === 'text') {
    const text = plainTextOf(el.text).trim().replace(/\s+/g, ' ');
    const prompt = placeholderPrompt(content, slide, el);
    const kind = el.placeholderId ? `${el.placeholderId === 'title' ? 'Title' : el.placeholderId === 'subtitle' ? 'Subtitle' : 'Text'} placeholder` : 'Text box';
    return `${kind}: ${text ? excerpt(text) : prompt ? `empty (${prompt})` : 'empty'}${locked}`;
  }
  const detail = el.type === 'image' ? el.alt : el.type === 'chart' || el.type === 'diagram' ? el.title : el.type === 'shape' ? plainTextOf(el.text).trim() : '';
  return `${el.name ?? TYPE_NAMES[el.type]}${detail ? `: ${excerpt(detail)}` : ''}${locked}`;
}

const geometryOf = (e: SlideElement): Geometry => ({ x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation });
const visualBox = (e: { x: number; y: number; w: number; h: number; rotation: number }): Box => rotatedBounds(e, e.rotation);

/** The resize cursor for a handle on a box turned by `rotation` degrees. */
function handleCursor(h: Handle, rotation: number): string {
  const base = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }[h];
  const a = (((base + rotation) % 180) + 180) % 180;
  const step = Math.round(a / 45) % 4;
  return ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'][step];
}

/** Follows the size of the canvas frame. */
function useFrameSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

/** Listens to the window until the pointer is released (pointer capture is not needed and works with touch). */
function track(pointerId: number, onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent, cancelled: boolean) => void) {
  const move = (e: PointerEvent) => e.pointerId === pointerId && onMove(e);
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onUp(e, e.type === 'pointercancel');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/**
 * The slide being edited: the stage fitted to the window, with selection (click, Shift/Ctrl/⌘+click, marquee), move,
 * resize (Shift keeps the proportions, Ctrl/⌘ resizes from the centre), rotate (Shift: 15° steps), smart guides
 * (Alt turns snapping off) and text editing (double-click, Enter or F2; a second tap on touch screens).
 *
 * For assistive technology the objects are options of a multi-select listbox ("Objects on slide N"): Tab and
 * Shift+Tab move through them (and out of the slide after the last), the arrow keys nudge (Shift: 10 px).
 */
export function Canvas(props: CanvasProps) {
  const { content, slide, selection, editingId, imageHost } = props;
  const { width: W, height: H } = content.size;
  const uid = useId().replace(/:/g, '');
  const frame = useFrameSize();
  const stage = useRef<HTMLDivElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Map<string, Geometry> | null>(null);
  const [guides, setGuides] = useState<{ guides: Guide[]; spacing: SpacingHint[] } | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [angle, setAngle] = useState<number | null>(null);
  const pasteFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pad = frame.size.w < 500 ? 8 : 24;
  // Without layout (tests) the slide is drawn at half size.
  const scale = frame.size.w > 0 && frame.size.h > 0 ? fitScale({ width: W, height: H }, { width: Math.max(1, frame.size.w - 2 * pad), height: Math.max(1, frame.size.h - 2 * pad) }, 3).scale : 0.5;
  const left = Math.max(pad, (frame.size.w - W * scale) / 2);
  const top = Math.max(pad, (frame.size.h - H * scale) / 2);

  const elements = useMemo(() => slide.elements.map((e) => (preview?.has(e.id) ? ({ ...e, ...preview.get(e.id)! } as SlideElement) : e)), [slide.elements, preview]);

  // 'Resize box to fit text' when a box changes outside editing (a font size from the ribbon, the autofit choice, a
  // narrower box…): the drawn text is measured and the box made as tall as it. Only boxes that changed since the last
  // drawing are fitted, so opening a slide never changes it. While a box is edited, TextBoxEditor does this.
  const objectsLayer = useRef<HTMLDivElement>(null);
  const fitSeen = useRef<{ slideId: string; theme: unknown; editingId: string | null; boxes: Map<string, TextElement> } | null>(null);
  const onFitRef = useRef(props.onFit);
  onFitRef.current = props.onFit;
  useLayoutEffect(() => {
    if (preview) return; // During a drag the drawing is the preview; the fit follows the drop.
    const prev = fitSeen.current;
    const boxes = new Map(slide.elements.filter((e): e is TextElement => e.type === 'text').map((e) => [e.id, e]));
    fitSeen.current = { slideId: slide.id, theme: content.theme, editingId, boxes };
    const layer = objectsLayer.current;
    if (!prev || prev.slideId !== slide.id || !layer) return;
    const nodes = new Map(Array.from(layer.querySelectorAll<HTMLElement>('[data-element]')).map((n) => [n.getAttribute('data-element'), n]));
    const heights = new Map<string, number>();
    for (const el of boxes.values()) {
      if (el.style.autofit !== 'resize' || el.id === editingId || isEmptyRichText(el.text)) continue;
      const before = prev.boxes.get(el.id);
      const changed = !before || prev.theme !== content.theme || prev.editingId === el.id || before.text !== el.text || before.style !== el.style || before.w !== el.w || before.h !== el.h;
      if (!changed) continue;
      const node = nodes.get(el.id);
      const inner = node?.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
      if (!node || !inner || !(inner.scrollHeight > 0)) continue; // No layout (tests without one): leave it.
      const [t, , b] = el.style.padding;
      const border = Math.max(0, node.offsetHeight - node.clientHeight);
      const needed = Math.ceil(inner.scrollHeight + t + b + border);
      if (Math.abs(needed - el.h) > 1) heights.set(el.id, needed);
    }
    if (heights.size) onFitRef.current(heights);
  }, [slide, content.theme, editingId, preview]);
  const background = useMemo<Slide>(() => ({ ...slide, elements: [] }), [slide]);
  const selected = elements.filter((e) => selection.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;

  useEffect(() => {
    if (props.focusRequest) listbox.current?.focus({ preventScroll: true });
  }, [props.focusRequest]);
  useEffect(() => () => void (pasteFallback.current && clearTimeout(pasteFallback.current)), []);

  const toSlide = (clientX: number, clientY: number): Point => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };
  const threshold = SNAP_PX / scale;
  const othersThan = (ids: Set<string>) => slide.elements.filter((e) => !ids.has(e.id)).map(visualBox);

  // ── Gestures ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Moves the objects `ids` with the pointer. A press that does not move: on the only selected text box (touch) starts
   * editing it; on one object of several selected (`collapseTo`) selects just that object, as PowerPoint does.
   */
  const startMove = (e: ReactPointerEvent, ids: string[], wasOnlySelection: string | null, collapseTo: string | null = null) => {
    const movable = slide.elements.filter((x) => ids.includes(x.id) && !x.locked);
    const start = toSlide(e.clientX, e.clientY);
    const origin = { x: e.clientX, y: e.clientY };
    const orig = new Map(movable.map((x) => [x.id, geometryOf(x)]));
    const bounds = unionBounds(movable.map(visualBox));
    const others = othersThan(new Set(movable.map((x) => x.id)));
    let moved = false;
    let last: Map<string, Geometry> | null = null;
    track(
      e.pointerId,
      (ev) => {
        if (!movable.length) return;
        if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < DRAG_START_PX) return;
        moved = true;
        const p = toSlide(ev.clientX, ev.clientY);
        let dx = p.x - start.x;
        let dy = p.y - start.y;
        // Shift keeps the move horizontal or vertical.
        const axis = ev.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
        if (axis === 'x') dy = 0;
        if (axis === 'y') dx = 0;
        let found: { guides: Guide[]; spacing: SpacingHint[] } | null = null;
        if (!ev.altKey) {
          const snap = snapMove({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, others, content.size, threshold);
          if (axis !== 'y') dx += snap.dx;
          if (axis !== 'x') dy += snap.dy;
          const final = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
          found = axis ? { guides: guidesFor(final, others, content.size), spacing: spacingFor(final, others) } : { guides: snap.guides, spacing: snap.spacing };
        }
        last = new Map([...orig].map(([id, g]) => [id, { ...g, x: g.x + dx, y: g.y + dy }]));
        setPreview(last);
        setGuides(found);
      },
      (_ev, cancelled) => {
        setPreview(null);
        setGuides(null);
        if (moved && last && !cancelled) props.onGeometry(last);
        if (!moved && !cancelled && collapseTo) props.onSelect([collapseTo]);
        // A second tap on the only selected text box starts editing it (touch screens have no double-click).
        if (!moved && !cancelled && _ev.pointerType === 'touch' && wasOnlySelection) {
          const el = slide.elements.find((x) => x.id === wasOnlySelection);
          if (el?.type === 'text') props.onStartEdit(el.id, { x: _ev.clientX, y: _ev.clientY });
          // CONTENT: a shape's text or a table's cells (pictures, charts and diagrams open only on purpose).
          else if (el && (el.type === 'shape' || el.type === 'table')) props.onOpenElement?.(el, toSlide(_ev.clientX, _ev.clientY), { x: _ev.clientX, y: _ev.clientY });
        }
      },
    );
  };

  const startResize = (e: ReactPointerEvent, el: SlideElement, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    const orig = geometryOf(el);
    const c = { x: orig.x + orig.w / 2, y: orig.y + orig.h / 2 };
    const start = rotatePoint(toSlide(e.clientX, e.clientY), c, -orig.rotation);
    const others = othersThan(new Set([el.id]));
    let last: Map<string, Geometry> | null = null;
    track(
      e.pointerId,
      (ev) => {
        const p = rotatePoint(toSlide(ev.clientX, ev.clientY), c, -orig.rotation);
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const centred = ev.ctrlKey || ev.metaKey;
        const hasW = handle.includes('w');
        const hasE = handle.includes('e');
        const hasN = handle.includes('n');
        const hasS = handle.includes('s');
        let l = orig.x;
        let r = orig.x + orig.w;
        let t = orig.y;
        let b = orig.y + orig.h;
        if (hasW) {
          l += dx;
          if (centred) r -= dx;
        }
        if (hasE) {
          r += dx;
          if (centred) l -= dx;
        }
        if (hasN) {
          t += dy;
          if (centred) b -= dy;
        }
        if (hasS) {
          b += dy;
          if (centred) t -= dy;
        }
        const MIN = 4;
        // A box never turns inside out: it stops at the minimum size on the side being dragged.
        if ((hasW || hasE) && r - l < MIN) {
          if (centred) {
            const m = (l + r) / 2;
            l = m - MIN / 2;
            r = m + MIN / 2;
          } else if (hasW) l = r - MIN;
          else r = l + MIN;
        }
        if ((hasN || hasS) && b - t < MIN) {
          if (centred) {
            const m = (t + b) / 2;
            t = m - MIN / 2;
            b = m + MIN / 2;
          } else if (hasN) t = b - MIN;
          else b = t + MIN;
        }
        const corner = handle.length === 2;
        const keepAspect = ev.shiftKey && corner && orig.w > 0 && orig.h > 0;
        let box: Box = { x: l, y: t, w: r - l, h: b - t };
        let found: Guide[] = [];
        if (keepAspect) {
          const ratio = orig.w / orig.h;
          let w = box.w;
          let h = box.h;
          if (w / ratio >= h) h = w / ratio;
          else w = h * ratio;
          const ax = centred ? (l + r) / 2 : hasW ? r : l;
          const ay = centred ? (t + b) / 2 : hasN ? b : t;
          box = { x: centred ? ax - w / 2 : hasW ? ax - w : ax, y: centred ? ay - h / 2 : hasN ? ay - h : ay, w, h };
        } else if (!ev.altKey && !orig.rotation && !centred) {
          const snapped = snapResize(box, { left: hasW, right: hasE, top: hasN, bottom: hasS }, others, content.size, threshold, MIN);
          box = snapped.box;
          found = snapped.guides;
        }
        // Back from the box's own (unturned) frame to the slide: the new centre turns with the box.
        const centre = rotatePoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, c, orig.rotation);
        last = new Map([[el.id, { x: centre.x - box.w / 2, y: centre.y - box.h / 2, w: box.w, h: box.h, rotation: orig.rotation }]]);
        setPreview(last);
        setGuides(found.length ? { guides: found, spacing: [] } : null);
      },
      (_ev, cancelled) => {
        setPreview(null);
        setGuides(null);
        if (last && !cancelled) props.onGeometry(last);
      },
    );
  };

  const startRotate = (e: ReactPointerEvent, el: SlideElement) => {
    e.stopPropagation();
    e.preventDefault();
    const orig = geometryOf(el);
    const c = { x: orig.x + orig.w / 2, y: orig.y + orig.h / 2 };
    const p0 = toSlide(e.clientX, e.clientY);
    const a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
    let last: Map<string, Geometry> | null = null;
    track(
      e.pointerId,
      (ev) => {
        const p = toSlide(ev.clientX, ev.clientY);
        let deg = orig.rotation + ((Math.atan2(p.y - c.y, p.x - c.x) - a0) * 180) / Math.PI;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else if (!ev.altKey) {
          const near = Math.round(deg / 90) * 90;
          if (Math.abs(deg - near) < 3) deg = near;
        }
        deg = ((Math.round(deg) % 360) + 360) % 360;
        last = new Map([[el.id, { ...orig, rotation: deg }]]);
        setPreview(last);
        setAngle(deg);
      },
      (_ev, cancelled) => {
        setPreview(null);
        setAngle(null);
        if (last && !cancelled) props.onGeometry(last);
      },
    );
  };

  const startMarquee = (e: ReactPointerEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? selection : [];
    if (!additive && selection.length) props.onSelect([]);
    const start = toSlide(e.clientX, e.clientY);
    const origin = { x: e.clientX, y: e.clientY };
    let active = false;
    track(
      e.pointerId,
      (ev) => {
        if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < DRAG_START_PX) return;
        active = true;
        const box = boxFromPoints(start, toSlide(ev.clientX, ev.clientY));
        setMarquee(box);
        const inside = slide.elements.filter((x) => containsBox(box, visualBox(x))).map((x) => x.id);
        props.onSelect([...base, ...inside.filter((id) => !base.includes(id))]);
      },
      () => setMarquee(null),
    );
  };

  // ── Pointer handlers ────────────────────────────────────────────────────────────────────────────

  const onElementPointerDown = (e: ReactPointerEvent, el: SlideElement) => {
    if (e.button === 2) {
      if (!selection.includes(el.id)) props.onSelect([el.id]);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    listbox.current?.focus({ preventScroll: true });
    if (editingId) props.onStopEdit();
    const wasOnly = selection.length === 1 && selection[0] === el.id ? el.id : null;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const has = selection.includes(el.id);
      const next = has ? selection.filter((id) => id !== el.id) : [...selection, el.id];
      props.onSelect(next);
      if (has) return;
      startMove(e, next, null);
      return;
    }
    const ids = selection.includes(el.id) ? selection : [el.id];
    if (ids !== selection) props.onSelect(ids);
    startMove(e, ids, wasOnly, ids.length > 1 ? el.id : null);
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    listbox.current?.focus({ preventScroll: true });
    if (editingId) props.onStopEdit();
    startMarquee(e);
  };

  const openMenu = (x: number, y: number) => props.onContextMenu(x, y, props.commands.menuItems(), listbox.current);
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────────

  const onKeyDown = (e: KeyboardEvent) => {
    if (editingId) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const lower = key.toLowerCase();
    const has = selection.length > 0;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[key] && has && !mod && !e.altKey) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      props.commands.nudge(arrows[key][0] * step, arrows[key][1] * step);
    } else if ((key === 'Delete' || key === 'Backspace') && has) {
      e.preventDefault();
      props.commands.remove();
    } else if ((key === 'Enter' || key === 'F2') && single?.type === 'text') {
      e.preventDefault();
      props.onStartEdit(single.id);
    } else if ((key === 'Enter' || key === 'F2') && single && props.onOpenElement) {
      // CONTENT: Enter opens a shape's text, a table's cells, a chart's data or a diagram's editor.
      e.preventDefault();
      props.onOpenElement(single, { x: single.x + 1, y: single.y + 1 });
    } else if (key === 'Escape' && has) {
      e.preventDefault();
      props.onSelect([]);
    } else if (key === 'Tab' && !mod && !e.altKey && slide.elements.length) {
      const order = slide.elements.map((x) => x.id);
      const at = has ? order.indexOf(selection[selection.length - 1]) : e.shiftKey ? order.length : -1;
      const next = at + (e.shiftKey ? -1 : 1);
      if (next < 0 || next >= order.length) return; // Leave the slide: Tab is never trapped here.
      e.preventDefault();
      props.onSelect([order[next]]);
    } else if (mod && lower === 'a') {
      e.preventDefault();
      props.commands.selectAll();
    } else if (mod && lower === 'd') {
      e.preventDefault();
      if (has) props.commands.duplicate();
    } else if (mod && lower === 'c' && has) {
      // The copy event that follows also fills the system clipboard; the in-app clipboard is filled now in case the
      // browser sends none.
      props.commands.copy();
    } else if (mod && lower === 'x' && has) {
      props.commands.copy();
      // The cut event (if any) writes the system clipboard first; then the objects go.
      setTimeout(() => props.commands.remove(), 0);
    } else if (mod && lower === 'v') {
      // The paste event that follows carries the system clipboard; without one, paste the in-app clipboard.
      if (pasteFallback.current) clearTimeout(pasteFallback.current);
      pasteFallback.current = setTimeout(() => {
        pasteFallback.current = null;
        props.commands.paste();
      }, 50);
    } else if (mod && (key === ']' || key === '}')) {
      e.preventDefault();
      props.commands.bringForward(e.shiftKey);
    } else if (mod && (key === '[' || key === '{')) {
      e.preventDefault();
      props.commands.sendBackward(e.shiftKey);
    } else if ((e.shiftKey && key === 'F10') || key === 'ContextMenu') {
      e.preventDefault();
      const r = (single ? listbox.current?.querySelector(`[id="${uid}-${single.id}"]`) : stage.current)?.getBoundingClientRect();
      openMenu(r ? r.left + r.width / 2 : 40, r ? r.top + r.height / 2 : 40);
    }
  };

  const onCopy = (e: ReactClipboardEvent) => {
    if (editingId || !selection.length) return;
    props.commands.copyToEvent(e.nativeEvent);
  };
  const onCut = (e: ReactClipboardEvent) => {
    if (editingId || !selection.length) return;
    // The Ctrl+X key already copied and scheduled the removal; a cut from a menu only arrives here.
    props.commands.copyToEvent(e.nativeEvent);
  };
  const onPaste = (e: ReactClipboardEvent) => {
    if (editingId) return;
    if (pasteFallback.current) {
      clearTimeout(pasteFallback.current);
      pasteFallback.current = null;
    }
    if (props.commands.pasteFromEvent(e.nativeEvent)) e.preventDefault();
  };

  // ── Drawing ─────────────────────────────────────────────────────────────────────────────────────

  const slideBox: CSSProperties = { position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' };
  const active = selection.length ? selection[selection.length - 1] : null;
  const editing = editingId ? elements.find((x) => x.id === editingId && x.type === 'text') as TextElement | undefined : undefined;
  const handleSize = 10;

  return (
    <div
      ref={frame.ref}
      className="relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden bg-[var(--dc-canvas)]"
      onPointerDown={onBackgroundPointerDown}
      onContextMenu={onContextMenu}
      // CONTENT: picture files dragged from the computer and dropped on the slide.
      onDragOver={(e) => {
        if (!props.onDropFiles || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (!props.onDropFiles || !e.dataTransfer.files.length) return;
        e.preventDefault();
        props.onDropFiles(Array.from(e.dataTransfer.files), toSlide(e.clientX, e.clientY));
      }}
      data-canvas=""
    >
      <div ref={stage} className="absolute shadow-md" style={{ left, top, width: W * scale, height: H * scale }} data-stage="">
        <SlideView content={content} slide={background} scale={scale} imageHost={imageHost} />
        {/* The objects, drawn as in the slide show; the one being edited is a live text editor. */}
        <div ref={objectsLayer} style={{ ...slideBox, pointerEvents: 'none' }} aria-hidden={!editing}>
          {elements.map((el) => {
            if (editing && el.id === editing.id) {
              return (
                <div key={el.id}>
                  <ElementView el={{ ...editing, text: emptyRichText() }} theme={content.theme} imageHost={imageHost} />
                  <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, pointerEvents: 'auto' }}>
                    <TextBoxEditor
                      el={editing}
                      theme={content.theme}
                      prompt={placeholderPrompt(content, slide, el)}
                      caretAt={props.caretAt}
                      onText={(doc) => props.onText(el.id, doc)}
                      onNeedHeight={(h) => props.onNeedHeight(el.id, h)}
                      onEditor={props.onEditor}
                      onExit={props.onStopEdit}
                    />
                  </div>
                </div>
              );
            }
            // CONTENT: empty picture, chart and table placeholders are drawn in contentLayer, with the button that fills them.
            const prompt = el.type === 'text' && isEmptyRichText(el.text) ? placeholderPrompt(content, slide, el) : undefined;
            return (
              <div key={el.id}>
                <ElementView el={props.drawElement && props.contentEditId === el.id ? props.drawElement(el) : el} theme={content.theme} imageHost={imageHost} />
                {prompt && el.type === 'text' && (
                  // Placeholder prompts are shown here only: never in thumbnails, the slide show or exports.
                  <div data-prompt="" style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, outline: '1px dashed #9ca3af', outlineOffset: -1 }}>
                    <div style={{ ...textCss(el.style, content.theme), width: '100%', height: '100%', boxSizing: 'border-box', color: '#8a8f98' }}>{prompt}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Hit areas: one option per object, turned with it. */}
        <div
          ref={listbox}
          role="listbox"
          aria-multiselectable="true"
          aria-label={props.label ?? `Objects on slide ${props.slideNumber}`}
          aria-activedescendant={active ? `${uid}-${active}` : undefined}
          aria-describedby={`${uid}-help`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          style={{ ...slideBox, pointerEvents: 'none' }}
          className="outline-none [&:focus-visible]:outline-2 [&:focus-visible]:outline-accent"
        >
          {elements.map((el) => {
            const hit = visualBox(el).h < 8 || visualBox(el).w < 8 ? 6 : 0;
            return (
              <div
                key={el.id}
                id={`${uid}-${el.id}`}
                role="option"
                aria-selected={selection.includes(el.id)}
                aria-label={elementLabel(content, slide, el)}
                data-element-hit={el.id}
                onPointerDown={(e) => onElementPointerDown(e, el)}
                onDoubleClick={(e) => {
                  if (el.type === 'text') props.onStartEdit(el.id, { x: e.clientX, y: e.clientY });
                  // CONTENT: a shape's text, a table's cells, a chart's data, a diagram in the app's diagram editor.
                  else props.onOpenElement?.(el, toSlide(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
                }}
                style={{
                  position: 'absolute',
                  left: el.x - hit,
                  top: el.y - hit,
                  width: el.w + 2 * hit,
                  height: el.h + 2 * hit,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  pointerEvents: editing?.id === el.id || props.contentEditId === el.id ? 'none' : 'auto',
                  cursor: el.locked ? 'default' : 'move',
                }}
              />
            );
          })}
        </div>
        {/* CONTENT: editors of a shape's text or a table's cells, and the buttons of empty placeholders. */}
        {props.contentLayer && (
          <div style={{ ...slideBox, pointerEvents: 'none' }} data-content-layer="">
            {props.contentLayer}
          </div>
        )}
        <p id={`${uid}-help`} className="sr-only">
          Tab and Shift+Tab move through the objects. Arrow keys move the selected objects, with Shift by 10 pixels. Enter edits text, Escape clears the selection, Delete removes the selection.
        </p>
        {/* Selection frames, handles and guides, in screen pixels so they keep their size at any zoom. */}
        <div className="pointer-events-none absolute inset-0" style={{ overflow: 'visible' }}>
          {selected.map((el) => (
            <div
              key={el.id}
              data-selection-frame={el.id}
              className={cn('absolute border-[1.5px]', el.locked ? 'border-dashed border-muted' : 'border-accent')}
              style={{ left: el.x * scale - 1, top: el.y * scale - 1, width: el.w * scale + 2, height: el.h * scale + 2, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
            >
              {el.locked && (
                <span className="absolute -right-2.5 -top-2.5 rounded-full border border-border bg-surface p-0.5 text-muted" title="Locked">
                  <Lock size={10} aria-hidden />
                </span>
              )}
              {single && single.id === el.id && !el.locked && !editingId && (
                <>
                  {HANDLES.map((h) => {
                    const x = h.includes('w') ? 0 : h.includes('e') ? 100 : 50;
                    const y = h.includes('n') ? 0 : h.includes('s') ? 100 : 50;
                    return (
                      <div
                        key={h}
                        data-handle={h}
                        aria-hidden
                        onPointerDown={(e) => startResize(e, el, h)}
                        className="pointer-events-auto absolute flex items-center justify-center"
                        style={{ left: `${x}%`, top: `${y}%`, width: 24, height: 24, marginLeft: -12, marginTop: -12, cursor: handleCursor(h, el.rotation), touchAction: 'none' }}
                      >
                        <span className="block rounded-sm border border-accent bg-white" style={{ width: handleSize, height: handleSize }} />
                      </div>
                    );
                  })}
                  {(props.canRotate?.(el) ?? true) && (
                    <>
                      <span aria-hidden className="absolute left-1/2 block w-px bg-accent" style={{ top: -22, height: 22 }} />
                      <div
                        data-handle="rotate"
                        aria-hidden
                        onPointerDown={(e) => startRotate(e, el)}
                        className="pointer-events-auto absolute left-1/2 flex items-center justify-center"
                        style={{ top: -36, width: 24, height: 24, marginLeft: -12, marginTop: -6, cursor: 'grab', touchAction: 'none' }}
                      >
                        <span className="block rounded-full border border-accent bg-white" style={{ width: 12, height: 12 }} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {angle !== null && single && (
            <div className="absolute rounded bg-fg px-1.5 py-0.5 text-[11px] font-medium text-bg" style={{ left: (single.x + single.w / 2) * scale + 16, top: single.y * scale - 40 }}>
              {angle}°
            </div>
          )}
          <svg width={W * scale} height={H * scale} className="absolute left-0 top-0 overflow-visible" aria-hidden>
            {guides?.guides.map((g, i) =>
              g.axis === 'x' ? (
                <line key={`g${i}`} data-guide="x" x1={g.pos * scale} x2={g.pos * scale} y1={g.from * scale} y2={g.to * scale} stroke="#e11d74" strokeWidth={1} strokeDasharray={g.from === 0 && g.to === H ? '4 3' : undefined} />
              ) : (
                <line key={`g${i}`} data-guide="y" x1={g.from * scale} x2={g.to * scale} y1={g.pos * scale} y2={g.pos * scale} stroke="#e11d74" strokeWidth={1} strokeDasharray={g.from === 0 && g.to === W ? '4 3' : undefined} />
              ),
            )}
            {guides?.spacing.map((s, i) =>
              s.segments.map((seg, j) => {
                const a = seg.from * scale;
                const b = seg.to * scale;
                const at = seg.at * scale;
                return s.axis === 'x' ? (
                  <g key={`s${i}-${j}`} data-spacing="x" stroke="#e11d74" strokeWidth={1}>
                    <line x1={a} x2={b} y1={at} y2={at} />
                    <line x1={a} x2={a} y1={at - 4} y2={at + 4} />
                    <line x1={b} x2={b} y1={at - 4} y2={at + 4} />
                  </g>
                ) : (
                  <g key={`s${i}-${j}`} data-spacing="y" stroke="#e11d74" strokeWidth={1}>
                    <line y1={a} y2={b} x1={at} x2={at} />
                    <line y1={a} y2={a} x1={at - 4} x2={at + 4} />
                    <line y1={b} y2={b} x1={at - 4} x2={at + 4} />
                  </g>
                );
              }),
            )}
            {marquee && <rect data-marquee="" x={marquee.x * scale} y={marquee.y * scale} width={marquee.w * scale} height={marquee.h * scale} fill="rgba(79,70,229,0.08)" stroke="#4f46e5" strokeDasharray="4 3" />}
          </svg>
        </div>
      </div>
    </div>
  );
}
