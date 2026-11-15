/**
 * Arrange commands for the selected elements of one slide: stacking order, align and distribute. Pure functions on
 * presentation content. Align and distribute use what is seen on the slide: the box around a rotated element.
 * Locked elements are never moved, but they still count as the reference an unlocked element is aligned to.
 */
import { rotatedBounds, unionBounds, type Box } from '../geometry';
import type { PresentationContent, SlideElement } from '../types';
import { updateSlide } from './model';

export type ZOrder = 'front' | 'forward' | 'backward' | 'back';
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

/**
 * Changes the stacking order of the elements `ids`. Elements are drawn in list order, so "front" means the end of the
 * list. forward/backward move each selected element past the next unselected one, keeping the selection's own order.
 */
export function reorderElements(content: PresentationContent, slideId: string, ids: Iterable<string>, how: ZOrder): PresentationContent {
  const sel = new Set(ids);
  return updateSlide(content, slideId, (s) => {
    const els = s.elements.slice();
    if (!els.some((e) => sel.has(e.id))) return s;
    let next: SlideElement[];
    if (how === 'front') next = [...els.filter((e) => !sel.has(e.id)), ...els.filter((e) => sel.has(e.id))];
    else if (how === 'back') next = [...els.filter((e) => sel.has(e.id)), ...els.filter((e) => !sel.has(e.id))];
    else if (how === 'forward') {
      next = els;
      for (let i = next.length - 2; i >= 0; i--) {
        if (sel.has(next[i].id) && !sel.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    } else {
      next = els;
      for (let i = 1; i < next.length; i++) {
        if (sel.has(next[i].id) && !sel.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
    return next.every((e, i) => e === s.elements[i]) ? s : { ...s, elements: next };
  });
}

/** Whether a reorder would change anything (to disable the commands that would not). */
export function canReorder(elements: SlideElement[], ids: Iterable<string>, how: ZOrder): boolean {
  const sel = new Set(ids);
  const flags = elements.map((e) => sel.has(e.id));
  if (!flags.some(Boolean)) return false;
  if (how === 'front' || how === 'forward') return flags.some((f, i) => f && flags.slice(i + 1).some((g) => !g));
  return flags.some((f, i) => f && flags.slice(0, i).some((g) => !g));
}

const visualBox = (e: SlideElement): Box => rotatedBounds(e, e.rotation);

/**
 * Aligns the elements `ids`. One element is aligned to the slide; several to the box around all of them (as
 * PowerPoint's "Align Selected Objects").
 */
export function alignElements(content: PresentationContent, slideId: string, ids: Iterable<string>, mode: AlignMode): PresentationContent {
  const sel = new Set(ids);
  return updateSlide(content, slideId, (s) => {
    const chosen = s.elements.filter((e) => sel.has(e.id));
    if (!chosen.length) return s;
    const ref: Box = chosen.length === 1 ? { x: 0, y: 0, w: content.size.width, h: content.size.height } : unionBounds(chosen.map(visualBox));
    let changed = false;
    const elements = s.elements.map((e) => {
      if (!sel.has(e.id) || e.locked) return e;
      const b = visualBox(e);
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = ref.x - b.x;
      else if (mode === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      else if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
      else if (mode === 'top') dy = ref.y - b.y;
      else if (mode === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      else dy = ref.y + ref.h - (b.y + b.h);
      dx = Math.round(dx);
      dy = Math.round(dy);
      if (!dx && !dy) return e;
      changed = true;
      return { ...e, x: e.x + dx, y: e.y + dy };
    });
    return changed ? { ...s, elements } : s;
  });
}

/**
 * Spaces three or more elements evenly between the outermost two (which stay put), so the gaps between their boxes
 * are equal. Fewer than three elements are left as they are.
 */
export function distributeElements(content: PresentationContent, slideId: string, ids: Iterable<string>, mode: DistributeMode): PresentationContent {
  const sel = new Set(ids);
  return updateSlide(content, slideId, (s) => {
    const chosen = s.elements.filter((e) => sel.has(e.id));
    if (chosen.length < 3) return s;
    const horizontal = mode === 'horizontal';
    const items = chosen.map((e) => ({ e, b: visualBox(e) })).sort((a, b) => (horizontal ? a.b.x - b.b.x || a.b.w - b.b.w : a.b.y - b.b.y || a.b.h - b.b.h));
    const start = horizontal ? items[0].b.x : items[0].b.y;
    const last = items[items.length - 1].b;
    const end = horizontal ? last.x + last.w : last.y + last.h;
    const total = items.reduce((sum, it) => sum + (horizontal ? it.b.w : it.b.h), 0);
    const gap = (end - start - total) / (items.length - 1);
    const moves = new Map<string, number>();
    let at = start;
    for (const it of items) {
      const pos = horizontal ? it.b.x : it.b.y;
      const delta = Math.round(at - pos);
      if (delta && !it.e.locked) moves.set(it.e.id, delta);
      at += (horizontal ? it.b.w : it.b.h) + gap;
    }
    if (!moves.size) return s;
    return { ...s, elements: s.elements.map((e) => (moves.has(e.id) ? { ...e, ...(horizontal ? { x: e.x + moves.get(e.id)! } : { y: e.y + moves.get(e.id)! }) } : e)) };
  });
}
