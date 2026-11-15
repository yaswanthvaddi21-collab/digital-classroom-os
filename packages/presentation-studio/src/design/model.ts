/**
 * Pure design operations (Phase 7 Round 2b, DESIGN): themes, slide size, backgrounds, changing and resetting a
 * slide's layout, and editing the slide master and layouts (master view). Like editor/model.ts, every function
 * returns new content and never changes its input; untouched slides, layouts and elements keep their identity.
 *
 * How master and layout changes reach slides (the "follows unless changed" rule):
 * - A slide object that fills a placeholder has its own copy of the placeholder's position, size and text style.
 * - When a placeholder changes, every field of an object that still equals the placeholder's old value takes the new
 *   value; a field the user changed on the slide keeps the user's value. A master placeholder flows to the layouts'
 *   placeholders of the same id the same way, and from them to the slides; its text style also reaches the layouts'
 *   other placeholders of the same family (body or subtitle) that have no master placeholder of their own.
 * - Backgrounds and decorations are not copied: slides draw their layout's and master's (render/SlideView), so they
 *   follow at once.
 */
import { newId } from '../create';
import { reorderElements, type ZOrder } from '../editor/arrange';
import { THEMES } from '../themes';
import {
  emptyRichText,
  isEmptyRichText,
  SLIDE_SIZES,
  type Background,
  type Placeholder,
  type PlaceholderKind,
  type PresentationContent,
  type PresentationTheme,
  type Slide,
  type SlideElement,
  type SlideLayout,
  type SlideMaster,
  type SlideSizeId,
  type TableElement,
  type TextElement,
  type TextStyle,
  type ThemeFonts,
} from '../types';

type MakeId = () => string;

// ── Themes ────────────────────────────────────────────────────────────────────────────────────────

const sameRecord = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k]?.toLowerCase() === b[k]?.toLowerCase());

/** The built-in theme a theme's colours and fonts are exactly, or null. */
export function builtInThemeLike(theme: Pick<PresentationTheme, 'colors' | 'fonts'>): PresentationTheme | null {
  return THEMES.find((t) => sameRecord(t.colors, theme.colors) && t.fonts.heading === theme.fonts.heading && t.fonts.body === theme.fonts.body) ?? null;
}

function withTheme(content: PresentationContent, colors: PresentationTheme['colors'], fonts: ThemeFonts): PresentationContent {
  if (sameRecord(colors, content.theme.colors) && fonts.heading === content.theme.fonts.heading && fonts.body === content.theme.fonts.body) return content;
  const known = builtInThemeLike({ colors, fonts });
  const theme: PresentationTheme = known ? { ...known, colors: { ...known.colors }, fonts: { ...known.fonts } } : { id: 'custom', name: 'Custom', colors: { ...colors }, fonts: { ...fonts } };
  return { ...content, themeId: known ? known.id : 'custom', theme };
}

/** Uses a theme's colours and fonts. Everything that refers to theme colours and fonts changes with it. */
export const applyTheme = (content: PresentationContent, theme: PresentationTheme) => withTheme(content, theme.colors, theme.fonts);

/** Uses another theme's colours, keeping the fonts (the theme becomes 'custom' unless it then equals a built-in one). */
export const applyThemeColors = (content: PresentationContent, colors: PresentationTheme['colors']) => withTheme(content, colors, content.theme.fonts);

/** Uses other heading and body fonts, keeping the colours. */
export const applyThemeFonts = (content: PresentationContent, fonts: ThemeFonts) => withTheme(content, content.theme.colors, fonts);

// ── Slide size ────────────────────────────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };

/**
 * Where a box goes when the slide height changes from H1 to H2 (the width is 960 in both sizes):
 * - text (placeholders and text boxes) keeps its font size and scales its top and height, so text regions keep their
 *   share of the slide;
 * - a band along the top or bottom edge stays on that edge, and one that spans the whole height spans the new height;
 * - anything else keeps its size (shrunk only when it would not fit) and keeps its centre's share of the height.
 */
export function rescaleBox(b: Box, kind: 'text' | 'band' | 'object', H1: number, H2: number): Box & { factor: number } {
  const r = H2 / H1;
  const round = (v: number) => Math.round(v);
  if (kind === 'text') return { x: b.x, y: round(b.y * r), w: b.w, h: round(b.h * r), factor: 1 };
  if (kind === 'band') {
    const top = b.y <= 0;
    const bottom = b.y + b.h >= H1;
    if (top && bottom) return { x: b.x, y: 0, w: b.w, h: H2, factor: 1 };
    // A band taller than the new slide is shrunk like any other object below (it would stick out of the slide).
    if (top && b.h <= H2) return { ...b, y: 0, factor: 1 };
    if (bottom && b.h <= H2) return { ...b, y: H2 - b.h, factor: 1 };
  }
  const factor = Math.min(1, H2 / Math.max(b.h, 1));
  const w = b.w * factor;
  const h = b.h * factor;
  const inside = b.y >= 0 && b.y + b.h <= H1;
  let y = (b.y + b.h / 2) * r - h / 2;
  if (inside) y = Math.max(0, Math.min(H2 - h, y));
  return { x: round(b.x + (b.w - w) / 2), y: round(y), w: round(w), h: round(h), factor };
}

function rescaleElement(el: SlideElement, H1: number, H2: number): SlideElement {
  const kind = el.type === 'text' ? 'text' : el.type === 'shape' || el.type === 'image' ? 'band' : 'object';
  const b = rescaleBox(el, kind, H1, H2);
  if (b.x === el.x && b.y === el.y && b.w === el.w && b.h === el.h) return el;
  const moved = { ...el, x: b.x, y: b.y, w: b.w, h: b.h } as SlideElement;
  if (moved.type === 'table' && b.factor < 1) {
    const t = moved as TableElement;
    return { ...t, columns: t.columns.map((c) => Math.round(c * b.factor)), rows: t.rows.map((row) => ({ ...row, height: Math.round(row.height * b.factor) })) };
  }
  return moved;
}

function rescalePlaceholder(p: Placeholder, H1: number, H2: number): Placeholder {
  const b = rescaleBox(p, 'text', H1, H2);
  return b.y === p.y && b.h === p.h ? p : { ...p, y: b.y, h: b.h };
}

/** Changes the slide size (16:9 or 4:3): masters, layouts and every slide's objects are placed for the new size. */
export function setSlideSize(content: PresentationContent, sizeId: SlideSizeId): PresentationContent {
  const size = SLIDE_SIZES[sizeId];
  const H1 = content.size.height;
  const H2 = size.height;
  if (H1 === H2 && content.size.width === size.width) return content;
  const els = (list: SlideElement[]) => list.map((e) => rescaleElement(e, H1, H2));
  const phs = (list: Placeholder[]) => list.map((p) => rescalePlaceholder(p, H1, H2));
  return {
    ...content,
    size: { ...size },
    masters: content.masters.map((m) => ({ ...m, placeholders: phs(m.placeholders), decorations: els(m.decorations) })),
    layouts: content.layouts.map((l) => ({ ...l, placeholders: phs(l.placeholders), decorations: els(l.decorations) })),
    slides: content.slides.map((s) => ({ ...s, elements: els(s.elements) })),
  };
}

// ── Backgrounds ───────────────────────────────────────────────────────────────────────────────────

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Sets (or, with undefined, removes) the own background of the slides `ids`. Without one a slide shows its layout's. */
export function setSlidesBackground(content: PresentationContent, ids: Iterable<string>, background: Background | undefined): PresentationContent {
  const wanted = new Set(ids);
  let changed = false;
  const slides = content.slides.map((s) => {
    if (!wanted.has(s.id) || sameJson(s.background, background)) return s;
    changed = true;
    if (background) return { ...s, background: structuredClone(background) };
    const { background: _drop, ...rest } = s;
    void _drop;
    return rest as Slide;
  });
  return changed ? { ...content, slides } : content;
}

/**
 * "Apply to all": the background becomes the masters' background, layouts and slides stop overriding it, so every
 * slide (and every new slide) shows it.
 */
export function applyBackgroundToAll(content: PresentationContent, background: Background): PresentationContent {
  const next: PresentationContent = {
    ...content,
    masters: content.masters.map((m) => (sameJson(m.background, background) ? m : { ...m, background: structuredClone(background) })),
    layouts: content.layouts.map((l) => {
      if (l.background === undefined) return l;
      const { background: _drop, ...rest } = l;
      void _drop;
      return rest as SlideLayout;
    }),
  };
  return setSlidesBackground(next, content.slides.map((s) => s.id), undefined);
}

// ── Layouts on slides ─────────────────────────────────────────────────────────────────────────────

export const layoutOf = (content: PresentationContent, slide: Pick<Slide, 'layoutId'>) => content.layouts.find((l) => l.id === slide.layoutId);
const masterOfLayout = (content: PresentationContent, layout: SlideLayout | undefined) => (layout ? content.masters.find((m) => m.id === layout.masterId) : undefined);

/** The placeholder an object of a slide on `layout` fills: the layout's, else its master's. */
export function placeholderFor(content: PresentationContent, layout: SlideLayout | undefined, placeholderId: string | undefined): Placeholder | undefined {
  if (!placeholderId || !layout) return undefined;
  return layout.placeholders.find((p) => p.id === placeholderId) ?? masterOfLayout(content, layout)?.placeholders.find((p) => p.id === placeholderId);
}

const TEXT_KINDS: readonly PlaceholderKind[] = ['title', 'subtitle', 'body'];
const GEOMETRY = ['x', 'y', 'w', 'h'] as const;

/** Which placeholders an object can fill: text boxes fill text placeholders, pictures picture ones, and so on. */
function fits(el: SlideElement, kind: PlaceholderKind): boolean {
  if (el.type === 'text') return TEXT_KINDS.includes(kind) || kind === 'footer' || kind === 'date' || kind === 'slideNumber';
  if (el.type === 'image') return kind === 'picture';
  if (el.type === 'chart') return kind === 'chart';
  if (el.type === 'table') return kind === 'table';
  return false;
}
const family = (kind: PlaceholderKind | undefined) => (kind === 'subtitle' || kind === 'body' ? 'text' : kind);

/** A text style that follows `after` in every field where it equals `before` (the rest is the user's). */
function followStyle(style: TextStyle, before: TextStyle | undefined, after: TextStyle, reset: boolean): TextStyle {
  if (reset || !before) return sameJson(style, after) ? style : structuredClone(after);
  let out = style;
  for (const key of Object.keys(after) as Array<keyof TextStyle>) {
    if (sameJson(style[key], before[key]) && !sameJson(style[key], after[key])) out = { ...out, [key]: structuredClone(after[key]) };
  }
  return out;
}

/** An object that fills `after` (it filled `before`, or nothing): geometry and text style follow unless changed. */
function follow<T extends SlideElement>(el: T, before: Placeholder | undefined, after: Placeholder, reset: boolean): T {
  let out: T = el;
  for (const k of GEOMETRY) {
    const own = el[k];
    if ((reset || !before || own === before[k]) && own !== after[k]) out = { ...out, [k]: after[k] };
  }
  if ((reset || !before) && out.rotation) out = { ...out, rotation: 0 };
  if (out.type === 'text') {
    const style = followStyle(out.style, before?.style, after.style, reset);
    if (style !== out.style) out = { ...out, style } as T;
  }
  if (out.placeholderId !== after.id) out = { ...out, placeholderId: after.id };
  return out;
}

function placeholderElement(p: Placeholder, makeId: MakeId): TextElement {
  return { id: makeId(), type: 'text', x: p.x, y: p.y, w: p.w, h: p.h, rotation: 0, placeholderId: p.id, text: emptyRichText(), style: structuredClone(p.style) };
}

function relayout(content: PresentationContent, slide: Slide, layout: SlideLayout, reset: boolean, makeId: MakeId): Slide {
  const old = layoutOf(content, slide);
  const oldPh = (el: SlideElement) => placeholderFor(content, old, el.placeholderId);
  const linked = slide.elements.filter((e) => e.placeholderId);
  const assigned = new Map<string, Placeholder>();
  const taken = new Set<string>();
  const pick = (p: Placeholder, test: (e: SlideElement) => boolean) => linked.find((e) => !taken.has(e.id) && fits(e, p.kind) && test(e));
  // Each pass runs over every placeholder before the next, looser one starts: an exact id match is never taken by an
  // earlier placeholder's looser match (Two content → Comparison keeps "left" in "left", not in "leftHeading").
  const passes: Array<(p: Placeholder) => (e: SlideElement) => boolean> = [
    (p) => (e) => e.placeholderId === p.id && (oldPh(e)?.kind ?? p.kind) === p.kind,
    (p) => (e) => oldPh(e)?.kind === p.kind,
    (p) => (e) => family(oldPh(e)?.kind) === family(p.kind),
  ];
  const free = new Set(layout.placeholders);
  for (const pass of passes) {
    for (const p of layout.placeholders) {
      if (!free.has(p)) continue;
      const match = pick(p, pass(p));
      if (!match) continue;
      taken.add(match.id);
      free.delete(p);
      assigned.set(match.id, p);
    }
  }
  const elements: SlideElement[] = [];
  let changed = false;
  for (const e of slide.elements) {
    if (!e.placeholderId) {
      elements.push(e);
      continue;
    }
    const p = assigned.get(e.id);
    if (p) {
      const next = follow(e, reset && old === layout ? undefined : oldPh(e), p, reset);
      if (next !== e) changed = true;
      elements.push(next);
    } else if (e.type === 'text' && isEmptyRichText(e.text)) {
      changed = true; // an empty placeholder the new layout does not have: nothing is lost
    } else {
      // Content the new layout has no place for stays on the slide where it is, as an ordinary object.
      const { placeholderId: _drop, ...rest } = e;
      void _drop;
      elements.push(rest as SlideElement);
      changed = true;
    }
  }
  const filled = new Set(assigned.values());
  const added = layout.placeholders.filter((p) => !filled.has(p) && TEXT_KINDS.includes(p.kind)).map((p) => placeholderElement(p, makeId));
  if (added.length) changed = true;
  if (!changed && slide.layoutId === layout.id) return slide;
  return { ...slide, layoutId: layout.id, elements: [...added, ...elements] };
}

/**
 * Gives the slides `ids` another layout. Objects that fill a placeholder move to the new layout's matching
 * placeholder (same id, else same kind, else title ↔ title and subtitle/body ↔ body) and take its position and style
 * where they had not been changed. Text the new layout has no place for stays on the slide as an ordinary text box;
 * only empty placeholders are dropped. The new layout's other text placeholders are added empty.
 */
export function changeLayout(content: PresentationContent, ids: Iterable<string>, layoutId: string, makeId: MakeId = newId): PresentationContent {
  const layout = content.layouts.find((l) => l.id === layoutId);
  if (!layout) return content;
  const wanted = new Set(ids);
  let changed = false;
  const slides = content.slides.map((s) => {
    if (!wanted.has(s.id) || s.layoutId === layoutId) return s;
    const next = relayout(content, s, layout, false, makeId);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...content, slides } : content;
}

/**
 * "Reset slide": the slides' placeholder objects go back to their layout's position, size and text style (their text
 * is kept), and placeholders missing from the slide are added empty. Objects that fill no placeholder are untouched.
 */
export function resetSlides(content: PresentationContent, ids: Iterable<string>, makeId: MakeId = newId): PresentationContent {
  const wanted = new Set(ids);
  let changed = false;
  const slides = content.slides.map((s) => {
    const layout = layoutOf(content, s);
    if (!wanted.has(s.id) || !layout) return s;
    const next = relayout(content, s, layout, true, makeId);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...content, slides } : content;
}

// ── Master view: the slide master and its layouts ─────────────────────────────────────────────────

export type MasterTarget = { kind: 'master'; id: string } | { kind: 'layout'; id: string };
type Target = SlideMaster | SlideLayout;

export function targetOf(content: PresentationContent, target: MasterTarget): Target | undefined {
  return target.kind === 'master' ? content.masters.find((m) => m.id === target.id) : content.layouts.find((l) => l.id === target.id);
}

function updateTarget(content: PresentationContent, target: MasterTarget, change: (t: Target) => Target): PresentationContent {
  if (target.kind === 'master') {
    const i = content.masters.findIndex((m) => m.id === target.id);
    if (i < 0) return content;
    const next = change(content.masters[i]) as SlideMaster;
    if (next === content.masters[i]) return content;
    const masters = content.masters.slice();
    masters[i] = next;
    return { ...content, masters };
  }
  const i = content.layouts.findIndex((l) => l.id === target.id);
  if (i < 0) return content;
  const next = change(content.layouts[i]) as SlideLayout;
  if (next === content.layouts[i]) return content;
  const layouts = content.layouts.slice();
  layouts[i] = next;
  return { ...content, layouts };
}

/** A placeholder that follows `after` wherever it still equals `before`. */
function followPlaceholder(p: Placeholder, before: Placeholder, after: Placeholder): Placeholder {
  let out = p;
  for (const k of GEOMETRY) if (p[k] === before[k] && p[k] !== after[k]) out = { ...out, [k]: after[k] };
  if (p.prompt === before.prompt && p.prompt !== after.prompt) out = { ...out, prompt: after.prompt };
  const style = followStyle(p.style, before.style, after.style, false);
  return style === p.style ? out : { ...out, style };
}

/** Slides on `layoutIds` whose object fills `phId` follow the placeholder's change from `before` to `after`. */
function flowToSlides(content: PresentationContent, layoutIds: Set<string>, phId: string, before: Placeholder, after: Placeholder): PresentationContent {
  let changed = false;
  const slides = content.slides.map((s) => {
    if (!layoutIds.has(s.layoutId)) return s;
    let touched = false;
    const elements = s.elements.map((e) => {
      if (e.placeholderId !== phId) return e;
      const next = follow(e, before, after, false);
      if (next !== e) touched = true;
      return next;
    });
    if (!touched) return s;
    changed = true;
    return { ...s, elements };
  });
  return changed ? { ...content, slides } : content;
}

/**
 * Changes a placeholder of the master or of a layout, and lets the change flow on: from the master to its layouts'
 * placeholders of the same id, and from a layout to the slides that use it (see the rule at the top of this file).
 */
export function updatePlaceholder(content: PresentationContent, target: MasterTarget, phId: string, change: (p: Placeholder) => Placeholder): PresentationContent {
  const t = targetOf(content, target);
  const before = t?.placeholders.find((p) => p.id === phId);
  if (!t || !before) return content;
  const after = change(before);
  if (after === before || sameJson(after, before)) return content;
  let next = updateTarget(content, target, (x) => ({ ...x, placeholders: x.placeholders.map((p) => (p.id === phId ? after : p)) }));
  if (target.kind === 'layout') return flowToSlides(next, new Set([target.id]), phId, before, after);
  // From the master: each layout's own copy of the placeholder, then that layout's slides. A layout's other
  // placeholders of the same family that have no master placeholder of their own (Two content's "left" and "right",
  // Comparison's four, the caption…) follow the master placeholder's text style the same way, as PowerPoint's master
  // body text style reaches every content placeholder; their position and size stay their layout's.
  const masterIds = new Set(t.placeholders.map((p) => p.id));
  const direct = new Set<string>();
  for (const layout of next.layouts.filter((l) => l.masterId === target.id)) {
    if (!layout.placeholders.some((p) => p.id === phId)) direct.add(layout.id); // the layout uses the master's placeholder itself
    for (const lp of layout.placeholders) {
      let lpAfter: Placeholder;
      if (lp.id === phId) lpAfter = followPlaceholder(lp, before, after);
      else if (!masterIds.has(lp.id) && family(lp.kind) === family(before.kind)) {
        const style = followStyle(lp.style, before.style, after.style, false);
        lpAfter = style === lp.style ? lp : { ...lp, style };
      } else continue;
      if (lpAfter === lp) continue;
      next = updateTarget(next, { kind: 'layout', id: layout.id }, (x) => ({ ...x, placeholders: x.placeholders.map((p) => (p.id === lp.id ? lpAfter : p)) }));
      next = flowToSlides(next, new Set([layout.id]), lp.id, lp, lpAfter);
    }
  }
  return direct.size ? flowToSlides(next, direct, phId, before, after) : next;
}

/** A new text placeholder on a layout (its id is unique in the layout and its master). */
export function addPlaceholder(content: PresentationContent, layoutId: string): { content: PresentationContent; id: string | null } {
  const layout = content.layouts.find((l) => l.id === layoutId);
  if (!layout) return { content, id: null };
  const master = masterOfLayout(content, layout);
  const used = new Set([...layout.placeholders, ...(master?.placeholders ?? [])].map((p) => p.id));
  let n = 1;
  while (used.has(`text-${n}`)) n++;
  const id = `text-${n}`;
  const { width: W, height: H } = content.size;
  const body = layout.placeholders.find((p) => p.kind === 'body') ?? master?.placeholders.find((p) => p.kind === 'body');
  const w = Math.round(W * 0.4);
  const h = Math.round(H * 0.2);
  const p: Placeholder = {
    id,
    kind: 'body',
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    w,
    h,
    prompt: 'Click to add text',
    style: structuredClone(body?.style ?? { font: 'body', fontSize: 20, color: { theme: 'dark1' }, bold: false, italic: false, align: 'left', verticalAlign: 'top', autofit: 'shrink', lineSpacing: 1.15, padding: [6, 10, 6, 10] }),
  };
  return { content: updateTarget(content, { kind: 'layout', id: layoutId }, (x) => ({ ...x, placeholders: [...x.placeholders, p] })), id };
}

/**
 * Removes placeholders and decorations from the master or a layout. Slides keep what was typed into a removed
 * layout placeholder (as an ordinary object); only empty placeholder objects go with it.
 */
export function removeFromTarget(content: PresentationContent, target: MasterTarget, ids: { placeholders: string[]; decorations: string[] }): PresentationContent {
  const phs = new Set(ids.placeholders);
  const decs = new Set(ids.decorations);
  const t = targetOf(content, target);
  if (!t) return content;
  const removed = t.placeholders.filter((p) => phs.has(p.id));
  let next = updateTarget(content, target, (x) => {
    const placeholders = x.placeholders.filter((p) => !phs.has(p.id));
    const decorations = x.decorations.filter((d) => !decs.has(d.id));
    return placeholders.length === x.placeholders.length && decorations.length === x.decorations.length ? x : { ...x, placeholders, decorations };
  });
  if (target.kind !== 'layout' || !removed.length) return next;
  const gone = new Set(removed.map((p) => p.id));
  next = {
    ...next,
    slides: next.slides.map((s) => {
      if (s.layoutId !== target.id || !s.elements.some((e) => e.placeholderId && gone.has(e.placeholderId))) return s;
      const elements = s.elements.flatMap((e) => {
        if (!e.placeholderId || !gone.has(e.placeholderId)) return [e];
        if (e.type === 'text' && isEmptyRichText(e.text)) return [];
        const { placeholderId: _drop, ...rest } = e;
        void _drop;
        return [rest as SlideElement];
      });
      return { ...s, elements };
    }),
  };
  return next;
}

/** Adds decorations (drawn behind every slide of the master or layout); they never fill a placeholder. */
export function addDecorations(content: PresentationContent, target: MasterTarget, elements: SlideElement[]): PresentationContent {
  if (!elements.length) return content;
  const clean = elements.map((e) => {
    const { placeholderId: _drop, ...rest } = e;
    void _drop;
    return rest as SlideElement;
  });
  return updateTarget(content, target, (x) => ({ ...x, decorations: [...x.decorations, ...clean] }));
}

/** Changes decorations by id; `change` returning the same object changes nothing. */
export function updateDecorations(content: PresentationContent, target: MasterTarget, ids: Iterable<string>, change: (el: SlideElement) => SlideElement): PresentationContent {
  const wanted = new Set(ids);
  return updateTarget(content, target, (x) => {
    let changed = false;
    const decorations = x.decorations.map((d) => {
      if (!wanted.has(d.id)) return d;
      const next = change(d);
      if (next !== d) changed = true;
      return next;
    });
    return changed ? { ...x, decorations } : x;
  });
}

/** Front/back order of decorations (placeholders are always drawn in front of them). */
export function reorderDecorations(content: PresentationContent, target: MasterTarget, ids: string[], how: ZOrder): PresentationContent {
  const t = targetOf(content, target);
  if (!t) return content;
  // arrange.reorderElements works on a slide; a stand-in slide carries the decorations through it.
  const probe: PresentationContent = { ...content, slides: [{ id: '__decorations', layoutId: '', elements: t.decorations, notes: emptyRichText() }] };
  const reordered = reorderElements(probe, '__decorations', ids, how).slides[0].elements;
  if (reordered === t.decorations) return content;
  return updateTarget(content, target, (x) => ({ ...x, decorations: reordered }));
}

/** The master's background, or a layout's own background (undefined: the layout shows its master's). */
export function setTargetBackground(content: PresentationContent, target: MasterTarget, background: Background | undefined): PresentationContent {
  return updateTarget(content, target, (x) => {
    if (sameJson(x.background, background)) return x;
    if (background) return { ...x, background: structuredClone(background) };
    if (target.kind === 'master') return x; // a master always has a background
    const { background: _drop, ...rest } = x as SlideLayout;
    void _drop;
    return rest as SlideLayout;
  });
}

/** Whether a layout's slides show the master's decorations ("Hide master graphics" when false). */
export function setShowMasterDecorations(content: PresentationContent, layoutId: string, show: boolean): PresentationContent {
  return updateTarget(content, { kind: 'layout', id: layoutId }, (x) => ((x as SlideLayout).showMasterDecorations === show ? x : { ...x, showMasterDecorations: show }));
}

/** The slides that use a layout. */
export const slidesUsing = (content: PresentationContent, layoutId: string) => content.slides.filter((s) => s.layoutId === layoutId);

