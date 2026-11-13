import { cn } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { currentBlock, formatOf, INDENT_LIMIT_PT, isListParagraph } from '../../../extensions/paragraphFormat';
import { paperSize, type PageSettings } from '../../../types';
import { cmText, cmToPt, PT_PER_CM, PX_PER_MM, PX_PER_PT, snapPt } from './units';

/** Smallest text width the ruler leaves between indents (1 cm) and between page margins (20 mm, as page setup requires). */
const MIN_TEXT_PT = PT_PER_CM;
const MIN_TEXT_MM = 20;
const MAX_MARGIN_MM = 80;

interface Geometry {
  paperLeft: number;
  paperWidth: number;
  textLeft: number;
  textRight: number;
  /** Left and right edges of the current paragraph's container (its own indents removed), or null. */
  blockLeft: number | null;
  blockRight: number | null;
}

type MarkerId = 'firstLine' | 'hanging' | 'left' | 'right' | 'marginLeft' | 'marginRight';

const round1 = (n: number) => Math.round(n * 10) / 10;
/** A computed CSS length in pixels (0 when the browser gives none). */
const px = (v: string) => parseFloat(v) || 0;

/**
 * Horizontal ruler above the page (Advanced mode). Shows the page margins (grey) and the current paragraph's
 * indents: first line (top triangle), hanging (bottom triangle), left (the box under it, moves both) and right.
 * Every marker can be dragged (snapping to 0.25 cm; hold Alt for free movement) or moved with the keyboard:
 * each is a slider (Left/Right move the marker 0.25 cm that way, Up/Down change the value, Page Up/Down by 1 cm,
 * Home/End to the limits; Shift for larger steps). The Paragraph dialog offers the same numerically.
 */
export function Ruler({ editor, page, onPageChange }: { editor: Editor; page: PageSettings; onPageChange: (page: PageSettings) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const block = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const b = currentBlock(e.state);
      return b ? { pos: b.pos, inList: isListParagraph(e.state, b.pos), ...formatOf(b.node.attrs) } : null;
    },
  });

  const measure = useCallback(() => {
    if (!bar.current || editor.isDestroyed) return;
    let dom: HTMLElement;
    try {
      dom = editor.view.dom;
    } catch {
      return;
    }
    const paper = dom.closest<HTMLElement>('.dcos-paper');
    if (!paper) return;
    const origin = bar.current.getBoundingClientRect().left;
    const pr = paper.getBoundingClientRect();
    const ps = getComputedStyle(paper);
    const next: Geometry = {
      paperLeft: pr.left - origin,
      paperWidth: pr.width,
      textLeft: pr.left - origin + px(ps.paddingLeft),
      textRight: pr.right - origin - px(ps.paddingRight),
      blockLeft: null,
      blockRight: null,
    };
    if (block) {
      const el = editor.view.nodeDOM(block.pos);
      if (el instanceof HTMLElement) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        next.blockLeft = r.left - origin - px(s.marginLeft);
        next.blockRight = r.right - origin + px(s.marginRight);
      }
    }
    setGeo((g) => (g && JSON.stringify(g) === JSON.stringify(next) ? g : next));
  }, [editor, block]);

  useLayoutEffect(measure, [measure, page]);
  useEffect(() => {
    // Measured once per frame after anything that can move the page or the paragraph (edits, mounting, resizing).
    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    onChange();
    editor.on('update', onChange);
    editor.on('mount', onChange);
    window.addEventListener('resize', onChange);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : undefined;
    if (bar.current) observer?.observe(bar.current);
    try {
      const paper = editor.view.dom.closest('.dcos-paper');
      if (paper) observer?.observe(paper);
    } catch {
      // The view is not mounted yet; 'mount' measures again.
    }
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', onChange);
      editor.off('mount', onChange);
      window.removeEventListener('resize', onChange);
      observer?.disconnect();
    };
  }, [editor, measure]);

  const paper = paperSize(page);
  const m = page.margins;
  const hasBlock = !!block && geo?.blockLeft != null && geo.blockRight != null;
  const L = block?.indentLeft ?? 0;
  const R = block?.indentRight ?? 0;
  const F = block?.indentFirstLine ?? 0;
  const widthPt = hasBlock ? (geo!.blockRight! - geo!.blockLeft!) / PX_PER_PT : 0;

  /** Limits of each marker, in points (indents) or millimetres (margins). */
  const limits: Record<MarkerId, [number, number]> = {
    firstLine: [0, Math.max(0, widthPt - R - MIN_TEXT_PT)],
    hanging: [0, Math.max(0, widthPt - R - MIN_TEXT_PT)],
    left: [0, Math.min(INDENT_LIMIT_PT, Math.max(0, widthPt - R - MIN_TEXT_PT))],
    right: [0, Math.min(INDENT_LIMIT_PT, Math.max(0, widthPt - Math.max(L, L + F) - MIN_TEXT_PT))],
    marginLeft: [0, Math.min(MAX_MARGIN_MM, paper.width - m.right - MIN_TEXT_MM)],
    marginRight: [0, Math.min(MAX_MARGIN_MM, paper.width - m.left - MIN_TEXT_MM)],
  };
  const clamp = (id: MarkerId, v: number) => Math.min(limits[id][1], Math.max(limits[id][0], v));

  /** Current value of a marker: indents in points from the container's left (right: from its right), margins in mm. */
  const valueOf = (id: MarkerId) =>
    ({ firstLine: L + F, hanging: L, left: L, right: R, marginLeft: m.left, marginRight: m.right })[id];

  /** b − a in points, worked out in centimetres to 0.01 cm, so 1.25 cm − 1 cm is exactly 0.25 cm (7.09 pt). */
  const diffPt = (b: number, a: number) => cmToPt(Math.round(((b - a) / PT_PER_CM) * 100) / 100);
  const setValue = (id: MarkerId, raw: number) => {
    const v = clamp(id, raw);
    const chain = () => editor.chain();
    switch (id) {
      case 'firstLine':
        chain().setParagraphIndent({ indentFirstLine: diffPt(v, L) || null }).run();
        break;
      case 'hanging':
        // Word's hanging marker moves the left indent and keeps the first line where it is.
        chain().setParagraphIndent({ indentLeft: v || null, indentFirstLine: diffPt(L + F, v) || null }).run();
        break;
      case 'left':
        chain().setParagraphIndent({ indentLeft: v || null }).run();
        break;
      case 'right':
        chain().setParagraphIndent({ indentRight: v || null }).run();
        break;
      case 'marginLeft':
        onPageChange({ ...page, margins: { ...m, left: round1(v) } });
        break;
      case 'marginRight':
        onPageChange({ ...page, margins: { ...m, right: round1(v) } });
        break;
    }
  };

  const isMargin = (id: MarkerId) => id === 'marginLeft' || id === 'marginRight';
  const step = (id: MarkerId, big: boolean) => (isMargin(id) ? (big ? 10 : 1) : (big ? 1 : 0.25) * PT_PER_CM);
  const snap = (id: MarkerId, v: number) => (isMargin(id) ? round1(v) : snapPt(v));

  const onKeyDown = (id: MarkerId) => (e: KeyboardEvent) => {
    const cur = valueOf(id);
    // The right indent and right margin grow leftwards on the ruler; Left/Right move the marker the way they point.
    const dir = id === 'right' || id === 'marginRight' ? -1 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = cur + dir * step(id, e.shiftKey);
    else if (e.key === 'ArrowLeft') next = cur - dir * step(id, e.shiftKey);
    // Up and Page Up always increase the value (a larger indent or margin), Down and Page Down decrease it.
    else if (e.key === 'ArrowUp') next = cur + step(id, e.shiftKey);
    else if (e.key === 'ArrowDown') next = cur - step(id, e.shiftKey);
    else if (e.key === 'PageUp') next = cur + step(id, true);
    else if (e.key === 'PageDown') next = cur - step(id, true);
    else if (e.key === 'Home') next = limits[id][0];
    else if (e.key === 'End') next = limits[id][1];
    if (next === null) return;
    e.preventDefault();
    setValue(id, e.key === 'Home' || e.key === 'End' ? next : snap(id, next));
  };

  const drag = useRef<{ id: MarkerId; x: number; start: number } | null>(null);
  const onPointerDown = (id: MarkerId) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id, x: e.clientX, start: valueOf(id) };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const delta = isMargin(d.id) ? dx / PX_PER_MM : dx / PX_PER_PT;
    const raw = d.start + (d.id === 'right' || d.id === 'marginRight' ? -delta : delta);
    const v = e.altKey ? Math.round(raw * 100) / 100 : snap(d.id, raw);
    if (Math.abs(v - valueOf(d.id)) > 0.004) setValue(d.id, v);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const marker = (id: MarkerId, label: string, x: number, className: string, text: string) => (
    <div
      key={id}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={isMargin(id) ? limits[id][0] : Math.round((limits[id][0] / PT_PER_CM) * 100) / 100}
      aria-valuemax={isMargin(id) ? round1(limits[id][1]) : Math.round((limits[id][1] / PT_PER_CM) * 100) / 100}
      aria-valuenow={isMargin(id) ? valueOf(id) : Math.round((valueOf(id) / PT_PER_CM) * 100) / 100}
      aria-valuetext={text}
      title={`${label}: ${text}`}
      data-marker={id}
      onKeyDown={onKeyDown(id)}
      onPointerDown={onPointerDown(id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ left: x }}
      className={cn('dcos-ruler-marker absolute -translate-x-1/2 cursor-ew-resize touch-none rounded-sm focus-visible:outline-2 focus-visible:outline-accent', className)}
    >
      <span className="dcos-ruler-shape" aria-hidden />
    </div>
  );

  const ticks: Array<{ x: number; major: boolean; label?: string }> = [];
  if (geo) {
    const pxPerCm = PT_PER_CM * PX_PER_PT;
    const from = Math.ceil((geo.paperLeft - geo.textLeft) / (pxPerCm / 4));
    const to = Math.floor((geo.paperLeft + geo.paperWidth - geo.textLeft) / (pxPerCm / 4));
    for (let i = from; i <= to; i++) {
      const x = geo.textLeft + (i * pxPerCm) / 4;
      if (i % 4 === 0) ticks.push({ x, major: true, label: i === 0 ? undefined : String(Math.abs(i / 4)) });
      else ticks.push({ x, major: false });
    }
  }

  return (
    <div className="dcos-ruler hidden shrink-0 border-b border-border bg-surface-2/60 sm:block" aria-label="Ruler" role="group">
      <style>{rulerCss}</style>
      <div ref={bar} className="relative h-7 overflow-hidden">
        {geo && (
          <>
            <div className="absolute top-1.5 h-4 bg-[#d9d9de]" style={{ left: geo.paperLeft, width: geo.paperWidth }} aria-hidden />
            <div className="absolute top-1.5 h-4 bg-white" style={{ left: geo.textLeft, width: Math.max(0, geo.textRight - geo.textLeft) }} aria-hidden />
            <div aria-hidden>
              {ticks.map((t) => (
                <span key={t.x} className={cn('absolute w-px bg-[#8a8a96]', t.major ? 'top-[11px] h-1.5' : 'top-[13px] h-0.5')} style={{ left: t.x }}>
                  {t.label && <span className="absolute -top-[3px] left-0 -translate-x-1/2 text-[8px] leading-none text-[#5b5b66]">{t.label}</span>}
                </span>
              ))}
            </div>
            {marker('marginLeft', 'Left page margin', geo.textLeft, 'dcos-ruler-margin', `${m.left} mm`)}
            {marker('marginRight', 'Right page margin', geo.textRight, 'dcos-ruler-margin', `${m.right} mm`)}
            {hasBlock && (
              <>
                {/* In a list the bullet or number already hangs: only the left and right indents apply. */}
                {!block!.inList && marker('firstLine', 'First line indent', geo.blockLeft! + (L + F) * PX_PER_PT, 'dcos-ruler-first', cmText(L + F))}
                {!block!.inList && marker('hanging', 'Hanging indent', geo.blockLeft! + L * PX_PER_PT, 'dcos-ruler-hanging', cmText(L))}
                {marker('left', 'Left indent', geo.blockLeft! + L * PX_PER_PT, 'dcos-ruler-left', cmText(L))}
                {marker('right', 'Right indent', geo.blockRight! - R * PX_PER_PT, 'dcos-ruler-right', cmText(R))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Marker shapes: Word-style triangles (CSS borders) and the left-indent box. Light colours: the ruler sits on paper. */
const rulerCss = `
.dcos-ruler-marker { width: 13px; z-index: 1; display: flex; justify-content: center; }
.dcos-ruler-shape { display: block; width: 11px; height: 100%; background: #6b6b76; }
.dcos-ruler-marker:hover .dcos-ruler-shape, .dcos-ruler-marker:focus-visible .dcos-ruler-shape { background: #4f46e5; }
.dcos-ruler-margin { top: 6px; height: 16px; width: 9px; }
.dcos-ruler-margin .dcos-ruler-shape { width: 2px; background: transparent; }
.dcos-ruler-margin:hover .dcos-ruler-shape, .dcos-ruler-margin:focus-visible .dcos-ruler-shape { background: #6366f1; }
.dcos-ruler-first { top: 0; height: 7px; }
.dcos-ruler-first .dcos-ruler-shape { clip-path: polygon(0 0, 100% 0, 50% 100%); }
.dcos-ruler-hanging, .dcos-ruler-right { top: 14px; height: 7px; }
.dcos-ruler-hanging .dcos-ruler-shape, .dcos-ruler-right .dcos-ruler-shape { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.dcos-ruler-left { top: 21px; height: 6px; }
`;
