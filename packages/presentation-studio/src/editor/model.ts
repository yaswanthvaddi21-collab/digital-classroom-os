/**
 * Pure operations on presentation content for the editor (Phase 7 Round 2a). Every function returns new content and
 * never changes its input: unchanged slides and elements keep their identity, so undo snapshots are cheap and
 * thumbnails of untouched slides are not redrawn.
 */
import { createSlide, newId } from '../create';
import { layoutIdFor } from '../layouts';
import type { PresentationContent, RichTextDoc, Slide, SlideElement } from '../types';

export type MakeId = () => string;

/** The index of a slide by id, or -1. */
export const slideIndex = (content: PresentationContent, id: string) => content.slides.findIndex((s) => s.id === id);

/** Slide ids in presentation order (the order of `ids` does not matter; unknown ids are dropped). */
export function inSlideOrder(content: PresentationContent, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return content.slides.filter((s) => wanted.has(s.id)).map((s) => s.id);
}

/**
 * The layout a new slide after `after` gets: a title slide is followed by "Title and content", any other slide by its
 * own layout (as in PowerPoint); with no slide to follow, "Title and content".
 */
export function nextLayoutId(content: PresentationContent, after: Slide | undefined): string {
  const fallback = content.layouts.find((l) => l.id === layoutIdFor('titleContent'))?.id ?? content.layouts[0]?.id ?? layoutIdFor('titleContent');
  if (!after) return fallback;
  const layout = content.layouts.find((l) => l.id === after.layoutId);
  if (!layout) return fallback;
  return layout.kind === 'title' ? fallback : layout.id;
}

/** Adds a new slide on `layoutId` at `index` (the end when left out). */
export function addSlide(content: PresentationContent, layoutId: string, index = content.slides.length, makeId: MakeId = newId): { content: PresentationContent; slideId: string } {
  const slide = createSlide(content, layoutId, makeId);
  const at = Math.max(0, Math.min(index, content.slides.length));
  return { content: { ...content, slides: [...content.slides.slice(0, at), slide, ...content.slides.slice(at)] }, slideId: slide.id };
}

/** A deep copy of an element with a new id. */
export function cloneElement(el: SlideElement, makeId: MakeId = newId): SlideElement {
  return { ...structuredClone(el), id: makeId() };
}

/** A deep copy of a slide with new ids for it and its elements (placeholder links are kept: same layout). */
export function cloneSlide(slide: Slide, makeId: MakeId = newId): Slide {
  const copy = structuredClone(slide);
  return { ...copy, id: makeId(), elements: copy.elements.map((e) => ({ ...e, id: makeId() })) };
}

/** Duplicates the slides `ids`; the copies go after the last of them, in order. Returns the copies' ids. */
export function duplicateSlides(content: PresentationContent, ids: Iterable<string>, makeId: MakeId = newId): { content: PresentationContent; slideIds: string[] } {
  const order = inSlideOrder(content, ids);
  if (!order.length) return { content, slideIds: [] };
  const copies = order.map((id) => cloneSlide(content.slides[slideIndex(content, id)], makeId));
  const after = slideIndex(content, order[order.length - 1]) + 1;
  return { content: { ...content, slides: [...content.slides.slice(0, after), ...copies, ...content.slides.slice(after)] }, slideIds: copies.map((s) => s.id) };
}

/** Removes the slides `ids`. */
export function deleteSlides(content: PresentationContent, ids: Iterable<string>): PresentationContent {
  const gone = new Set(ids);
  const slides = content.slides.filter((s) => !gone.has(s.id));
  return slides.length === content.slides.length ? content : { ...content, slides };
}

/**
 * Moves the slides `ids` (kept in their order) so they start at `to`, an index into the list *before* the move, as a
 * drop position between slides: 0 = before the first slide, slides.length = after the last.
 */
export function moveSlides(content: PresentationContent, ids: Iterable<string>, to: number): PresentationContent {
  const moving = new Set(ids);
  if (!moving.size) return content;
  const target = Math.max(0, Math.min(to, content.slides.length));
  const before = content.slides.slice(0, target).filter((s) => !moving.has(s.id));
  const after = content.slides.slice(target).filter((s) => !moving.has(s.id));
  const moved = content.slides.filter((s) => moving.has(s.id));
  const slides = [...before, ...moved, ...after];
  return slides.every((s, i) => s === content.slides[i]) ? content : { ...content, slides };
}

/** Moves the slides `ids` one place up (-1) or down (+1) as a block; at the start or end nothing moves. */
export function moveSlidesBy(content: PresentationContent, ids: Iterable<string>, delta: -1 | 1): PresentationContent {
  const order = inSlideOrder(content, ids);
  if (!order.length) return content;
  const first = slideIndex(content, order[0]);
  const last = slideIndex(content, order[order.length - 1]);
  if (delta < 0) return first === 0 ? content : moveSlides(content, order, first - 1);
  return last === content.slides.length - 1 ? content : moveSlides(content, order, last + 2);
}

/** Changes one slide. */
export function updateSlide(content: PresentationContent, slideId: string, change: (s: Slide) => Slide): PresentationContent {
  const i = slideIndex(content, slideId);
  if (i < 0) return content;
  const next = change(content.slides[i]);
  if (next === content.slides[i]) return content;
  const slides = content.slides.slice();
  slides[i] = next;
  return { ...content, slides };
}

/** Hides (or shows) the slides `ids` in the slide show. */
export function setSlidesHidden(content: PresentationContent, ids: Iterable<string>, hidden: boolean): PresentationContent {
  let out = content;
  for (const id of ids)
    out = updateSlide(out, id, (s) => {
      if (!!s.hidden === hidden) return s;
      if (hidden) return { ...s, hidden: true };
      const { hidden: _drop, ...rest } = s;
      void _drop;
      return rest;
    });
  return out;
}

export function setNotes(content: PresentationContent, slideId: string, notes: RichTextDoc): PresentationContent {
  return updateSlide(content, slideId, (s) => (s.notes === notes ? s : { ...s, notes }));
}

/** Changes the elements `ids` of a slide; `change` returning the same element changes nothing. */
export function updateElements(content: PresentationContent, slideId: string, ids: Iterable<string>, change: (el: SlideElement) => SlideElement): PresentationContent {
  const wanted = new Set(ids);
  return updateSlide(content, slideId, (s) => {
    let changed = false;
    const elements = s.elements.map((e) => {
      if (!wanted.has(e.id)) return e;
      const next = change(e);
      if (next !== e) changed = true;
      return next;
    });
    return changed ? { ...s, elements } : s;
  });
}

/** Sets new geometry (and only geometry) on elements, by id. Values are rounded to whole pixels and degrees. */
export function setGeometry(content: PresentationContent, slideId: string, geometry: Map<string, { x: number; y: number; w: number; h: number; rotation?: number }>): PresentationContent {
  return updateElements(content, slideId, geometry.keys(), (e) => {
    const g = geometry.get(e.id)!;
    const next = { x: Math.round(g.x), y: Math.round(g.y), w: Math.max(0, Math.round(g.w)), h: Math.max(0, Math.round(g.h)), rotation: g.rotation === undefined ? e.rotation : Math.round(g.rotation) % 360 };
    return next.x === e.x && next.y === e.y && next.w === e.w && next.h === e.h && next.rotation === e.rotation ? e : { ...e, ...next };
  });
}

/** Moves the unlocked elements `ids` by dx, dy. */
export function nudgeElements(content: PresentationContent, slideId: string, ids: Iterable<string>, dx: number, dy: number): PresentationContent {
  return updateElements(content, slideId, ids, (e) => (e.locked || (!dx && !dy) ? e : { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) }));
}

export function deleteElements(content: PresentationContent, slideId: string, ids: Iterable<string>): PresentationContent {
  const gone = new Set(ids);
  return updateSlide(content, slideId, (s) => {
    const elements = s.elements.filter((e) => !gone.has(e.id));
    return elements.length === s.elements.length ? s : { ...s, elements };
  });
}

/**
 * Adds copies of `elements` on top of a slide, each with a new id and moved by `offset` px. Copies do not fill a
 * placeholder (only one element fills a placeholder). Returns the new ids.
 */
export function insertElements(content: PresentationContent, slideId: string, elements: SlideElement[], offset = 0, makeId: MakeId = newId): { content: PresentationContent; ids: string[] } {
  const copies = elements.map((el) => {
    const c = cloneElement(el, makeId);
    delete c.placeholderId;
    return { ...c, x: Math.round(c.x + offset), y: Math.round(c.y + offset) } as SlideElement;
  });
  if (!copies.length) return { content, ids: [] };
  return { content: updateSlide(content, slideId, (s) => ({ ...s, elements: [...s.elements, ...copies] })), ids: copies.map((c) => c.id) };
}

/** Locks (or unlocks) elements: a locked element cannot be moved, resized or rotated. */
export function setLocked(content: PresentationContent, slideId: string, ids: Iterable<string>, locked: boolean): PresentationContent {
  return updateElements(content, slideId, ids, (e) => {
    if (!!e.locked === locked) return e;
    if (locked) return { ...e, locked: true };
    const { locked: _drop, ...rest } = e;
    void _drop;
    return rest as SlideElement;
  });
}
