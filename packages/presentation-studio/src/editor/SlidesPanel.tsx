import { cn, Menu } from '@dcos/ui';
import { EyeOff, MoreHorizontal, Plus } from 'lucide-react';
import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PresentationImageHost } from '../hosts';
import { SlideView } from '../render/SlideView';
import type { PresentationContent, Slide } from '../types';
import { LayoutMenu } from '../ui/LayoutPicker';
import type { ContextMenuItem } from '../ui/ContextMenu';

export interface SlideCommands {
  newSlide: (layoutId?: string) => void;
  duplicate: () => void;
  remove: () => void;
  setHidden: (hidden: boolean) => void;
  /** Moves the selected slides one place up or down. */
  moveBy: (delta: -1 | 1) => void;
  /** Moves the selected slides to the start or the end. */
  moveTo: (where: 'start' | 'end') => void;
  /** Moves `ids` to the drop position `to` (0 = before the first slide). */
  moveIds: (ids: string[], to: number) => void;
  /** DESIGN: opens the layout chooser for the selected slides. */
  changeLayout?: () => void;
  /** DESIGN: opens "Format background" for the selected slides. */
  formatBackground?: () => void;
  /** DESIGN: puts the selected slides' placeholders back where their layout has them. */
  resetSlides?: () => void;
  /** SHOW: plays the slide show from this slide. */
  playFrom?: (slideId: string) => void;
}

export interface SlidesPanelProps {
  content: PresentationContent;
  slideId: string | null;
  slideIds: string[];
  imageHost?: PresentationImageHost;
  wide: boolean;
  label: (slide: Slide, index: number) => string;
  onSelect: (slideId: string, slideIds: string[]) => void;
  commands: SlideCommands;
  /** The slide menu (right click, long press, Shift+F10) at a point. */
  onContextMenu: (x: number, y: number, items: ContextMenuItem[], returnFocus: HTMLElement | null) => void;
  /** Bumped by the editor to put the focus on the current slide (after a move, a delete…). */
  focusRequest: number;
}

/** One thumbnail, redrawn only when its slide or the presentation's look changes. */
const Thumb = memo(
  function Thumb({ content, slide, imageHost, width }: { content: PresentationContent; slide: Slide; imageHost?: PresentationImageHost; width: number }) {
    return <SlideView content={content} slide={slide} scale={width / content.size.width} imageHost={imageHost} />;
  },
  (a, b) => a.slide === b.slide && a.width === b.width && a.imageHost === b.imageHost && a.content.theme === b.content.theme && a.content.layouts === b.content.layouts && a.content.masters === b.content.masters && a.content.size === b.content.size,
);

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? '⌘' : 'Ctrl+');

/** The slide menu's items (also the "Slide actions" button's). */
export function slideMenuItems(content: PresentationContent, slideIds: string[], commands: SlideCommands): ContextMenuItem[] {
  const indices = slideIds.map((id) => content.slides.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  const allHidden = indices.length > 0 && indices.every((i) => content.slides[i].hidden);
  const many = indices.length > 1;
  const none = indices.length === 0;
  return [
    { label: 'New slide', onSelect: () => commands.newSlide() },
    { label: many ? 'Duplicate slides' : 'Duplicate slide', onSelect: commands.duplicate, disabled: none, hint: `${modKey()}D` },
    { label: many ? 'Delete slides' : 'Delete slide', onSelect: commands.remove, disabled: none, danger: true, hint: 'Del' },
    { label: allHidden ? (many ? 'Show slides' : 'Show slide') : many ? 'Hide slides' : 'Hide slide', onSelect: () => commands.setHidden(!allHidden), disabled: none, separator: true },
    { label: 'Move up', onSelect: () => commands.moveBy(-1), disabled: none || first === 0, hint: 'Alt+↑', separator: true },
    { label: 'Move down', onSelect: () => commands.moveBy(1), disabled: none || last === content.slides.length - 1, hint: 'Alt+↓' },
    { label: 'Move to start', onSelect: () => commands.moveTo('start'), disabled: none || (first === 0 && last === indices.length - 1) },
    { label: 'Move to end', onSelect: () => commands.moveTo('end'), disabled: none || (last === content.slides.length - 1 && first === content.slides.length - indices.length) },
    ...(commands.changeLayout ? [{ label: 'Layout…', onSelect: commands.changeLayout, disabled: none, separator: true }] : []),
    ...(commands.formatBackground ? [{ label: 'Format background…', onSelect: commands.formatBackground, disabled: none }] : []),
    ...(commands.resetSlides ? [{ label: many ? 'Reset slides' : 'Reset slide', onSelect: commands.resetSlides, disabled: none }] : []),
    // SHOW: the first selected slide (a hidden one too: a show started from it begins at the next shown slide).
    ...(commands.playFrom ? [{ label: 'Play from this slide', onSelect: () => commands.playFrom!(content.slides[first].id), disabled: none || content.slides.every((s) => s.hidden), separator: true }] : []),
  ];
}

/**
 * The slides panel: every slide as a thumbnail in a multi-select listbox (a strip along the top on phones, a column
 * on wider screens).
 * - Click selects; Shift+click selects a range; Ctrl/⌘+click adds or removes one slide.
 * - Arrows, Home and End move; Shift with them extends the selection; Ctrl/⌘+A selects all.
 * - Alt+↑/↓ (Alt+←/→ in the strip) moves the selected slides; Delete removes them; Ctrl/⌘+D duplicates them.
 * - Dragging with a mouse or pen reorders; the slide menu (right click, long press, Shift+F10) does everything too.
 */
export function SlidesPanel({ content, slideId, slideIds, imageHost, wide, label, onSelect, commands, onContextMenu, focusRequest }: SlidesPanelProps) {
  const slides = content.slides;
  const index = Math.max(0, slides.findIndex((s) => s.id === slideId));
  const options = useRef<Map<string, HTMLButtonElement>>(new Map());
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(slideId);
  /** The current slide this panel's own last selection made (its anchor is set by the panel). */
  const ownChoice = useRef<string | null>(slideId);
  const [drop, setDrop] = useState<number | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; active: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (focusRequest && slideId) options.current.get(slideId)?.focus({ preventScroll: false });
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the current slide in view.
  useEffect(() => {
    if (slideId) options.current.get(slideId)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [slideId]);

  // The Shift range starts from the current slide when something else made it current (New slide, duplicate, delete,
  // a drag, undo…); after the panel's own clicks and arrow keys, from where they set it.
  useEffect(() => {
    if (ownChoice.current !== slideId) anchor.current = slideId;
    ownChoice.current = null;
  }, [slideId]);

  const select = (id: string, ids: string[]) => {
    ownChoice.current = id;
    onSelect(id, ids);
  };

  const range = (from: string, to: string) => {
    // An anchor that was deleted since: the range starts from the current slide.
    const a = slides.some((s) => s.id === from) ? slides.findIndex((s) => s.id === from) : slides.findIndex((s) => s.id === slideId);
    const b = slides.findIndex((s) => s.id === to);
    if (a < 0 || b < 0) return [to];
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return slides.slice(lo, hi + 1).map((s) => s.id);
  };

  const choose = (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.shiftKey && anchor.current) select(id, range(anchor.current, id));
    else if (e.metaKey || e.ctrlKey) {
      const has = slideIds.includes(id);
      const next = has ? slideIds.filter((x) => x !== id) : [...slideIds, id];
      if (!next.length) return;
      anchor.current = id;
      select(has ? (id === slideId ? next[next.length - 1] : slideId!) : id, next);
    } else {
      anchor.current = id;
      select(id, [id]);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const back = wide ? 'ArrowUp' : 'ArrowLeft';
    const fwd = wide ? 'ArrowDown' : 'ArrowRight';
    if (e.altKey && (e.key === back || e.key === fwd || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      commands.moveBy(e.key === back || e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commands.remove();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      commands.duplicate();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (slideId) select(slideId, slides.map((s) => s.id));
      return;
    }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const el = slideId ? options.current.get(slideId) : null;
      const r = el?.getBoundingClientRect();
      onContextMenu(r ? r.left + r.width / 2 : 40, r ? r.top + r.height / 2 : 40, slideMenuItems(content, slideIds, commands), el ?? null);
      return;
    }
    const last = slides.length - 1;
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null || last < 0) return;
    e.preventDefault();
    const target = slides[Math.max(0, Math.min(last, to))];
    if (e.shiftKey) {
      if (!anchor.current) anchor.current = slideId;
      select(target.id, range(anchor.current ?? target.id, target.id));
    } else {
      anchor.current = target.id;
      select(target.id, [target.id]);
    }
    requestAnimationFrame(() => options.current.get(target.id)?.focus());
  };

  // Drag to reorder (mouse and pen; touch scrolls the list and uses the slide menu instead).
  const dropIndexAt = (x: number, y: number) => {
    let i = 0;
    for (const s of slides) {
      const r = options.current.get(s.id)?.getBoundingClientRect();
      if (!r) continue;
      if (wide ? y > r.top + r.height / 2 : x > r.left + r.width / 2) i++;
    }
    return i;
  };
  const onPointerDown = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType === 'touch' || e.shiftKey || e.metaKey || e.ctrlKey) return;
    drag.current = { id, x: e.clientX, y: e.clientY, active: false, pointerId: e.pointerId };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.active = true;
      setDrop(dropIndexAt(e.clientX, e.clientY));
      // Scroll the list when the pointer is near its ends.
      const r = list.current?.getBoundingClientRect();
      if (r && list.current) {
        const edge = 32;
        if (wide) list.current.scrollTop += e.clientY < r.top + edge ? -12 : e.clientY > r.bottom - edge ? 12 : 0;
        else list.current.scrollLeft += e.clientX < r.left + edge ? -12 : e.clientX > r.right - edge ? 12 : 0;
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.active) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const to = dropIndexAt(e.clientX, e.clientY);
      setDrop(null);
      const ids = slideIds.includes(d.id) ? slideIds : [d.id];
      commands.moveIds(ids, to);
    };
    const cancel = () => {
      drag.current = null;
      setDrop(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  });

  const onOptionContextMenu = (e: ReactMouseEvent, id: string) => {
    e.preventDefault();
    let ids = slideIds;
    if (!slideIds.includes(id)) {
      ids = [id];
      anchor.current = id;
      select(id, ids);
    }
    onContextMenu(e.clientX, e.clientY, slideMenuItems(content, ids, commands), options.current.get(id) ?? null);
  };

  const indicator = (i: number) => drop === i && <div aria-hidden className={cn('shrink-0 rounded-full bg-accent', wide ? 'mx-1 h-0.5' : 'my-1 w-0.5 self-stretch')} />;

  return (
    <div className="flex shrink-0 border-b border-border bg-surface md:w-56 md:flex-col md:border-b-0 md:border-r">
      <div className="flex shrink-0 items-center gap-0.5 border-border p-1.5 max-md:flex-col max-md:border-r md:border-b">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => commands.newSlide()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            title="New slide"
          >
            <Plus size={15} />
            <span className="max-md:sr-only">New slide</span>
          </button>
          <LayoutMenu content={content} onPick={(id) => commands.newSlide(id)} />
        </div>
        <Menu
          align="start"
          trigger={(p) => (
            <button type="button" {...p} aria-haspopup="menu" aria-label="Slide actions" title="Slide actions" className="inline-flex h-8 items-center rounded-md px-1.5 text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent md:ml-auto">
              <MoreHorizontal size={16} />
            </button>
          )}
          items={slideMenuItems(content, slideIds, commands).map((i) => ({ label: i.label, onSelect: i.onSelect, disabled: i.disabled, danger: i.danger, hint: i.hint }))}
        />
      </div>
      <div
        ref={list}
        role="listbox"
        aria-label="Slides"
        aria-multiselectable="true"
        aria-orientation={wide ? 'vertical' : 'horizontal'}
        onKeyDown={onKey}
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:overflow-x-hidden"
      >
        {slides.length === 0 && <p className="p-2 text-xs text-muted">No slides yet.</p>}
        {slides.map((s, i) => (
          <div key={s.id} role="presentation" className={cn('flex shrink-0', wide ? 'flex-col' : 'flex-row')}>
            {indicator(i)}
            <button
              ref={(el) => {
                if (el) options.current.set(s.id, el);
                else options.current.delete(s.id);
              }}
              type="button"
              role="option"
              aria-selected={slideIds.includes(s.id)}
              aria-current={s.id === slideId ? 'true' : undefined}
              aria-label={label(s, i)}
              tabIndex={s.id === slideId ? 0 : -1}
              onPointerDown={(e) => onPointerDown(e, s.id)}
              onClick={(e) => {
                if (suppressClick.current) return;
                choose(s.id, e);
              }}
              onContextMenu={(e) => onOptionContextMenu(e, s.id)}
              className={cn(
                'flex shrink-0 select-none items-start gap-2 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent',
                s.id === slideId ? 'bg-accent-soft' : slideIds.includes(s.id) ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="flex w-5 shrink-0 flex-col items-end gap-1 pt-0.5 text-xs tabular-nums text-muted">
                {i + 1}
                {s.hidden && <EyeOff size={12} aria-hidden />}
              </span>
              <span className={cn('overflow-hidden rounded border shadow-xs', slideIds.includes(s.id) ? 'border-accent' : 'border-border', s.hidden && 'opacity-50')}>
                <Thumb content={content} slide={s} imageHost={imageHost} width={wide ? 168 : 112} />
              </span>
            </button>
            {i === slides.length - 1 && indicator(slides.length)}
          </div>
        ))}
      </div>
    </div>
  );
}
