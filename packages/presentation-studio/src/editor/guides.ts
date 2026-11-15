/**
 * Smart alignment guides (Phase 7 Round 2a). Pure functions in slide pixels.
 *
 * While objects are moved, their box snaps to the slide's edges and centre lines and to the edges and centres of the
 * other objects on the slide, when it comes within `threshold` (the editor passes 6 screen pixels in slide pixels).
 * It also snaps to equal spacing: the same gap as two neighbours in the same row (or column) already have, or the
 * middle between two neighbours. The result says which guide lines and equal-gap hints to draw. Alt turns snapping
 * off (the editor simply does not call these).
 */
import type { Box } from '../geometry';

/** A guide line. axis 'x': a vertical line at x = pos from y = from to y = to; axis 'y': horizontal at y = pos. */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

/** Equal gaps: each segment runs along the axis from `from` to `to`, drawn at the cross position `at`. */
export interface SpacingHint {
  axis: 'x' | 'y';
  gap: number;
  segments: Array<{ from: number; to: number; at: number }>;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
  spacing: SpacingHint[];
}

export interface SlideSize {
  width: number;
  height: number;
}

const EPS = 0.5;

/** One axis of a box, so the same code works for x (left/width) and y (top/height). */
interface Span {
  start: number;
  size: number;
}
const span = (b: Box, axis: 'x' | 'y'): Span => (axis === 'x' ? { start: b.x, size: b.w } : { start: b.y, size: b.h });
const cross = (b: Box, axis: 'x' | 'y'): Span => span(b, axis === 'x' ? 'y' : 'x');
const end = (s: Span) => s.start + s.size;
const overlaps = (a: Span, b: Span) => a.start < end(b) && b.start < end(a);

/** Lines a box can snap to along an axis: the slide's edges and centre, and every other box's edges and centre. */
function targets(others: Box[], slide: SlideSize, axis: 'x' | 'y'): Array<{ pos: number; box: Box | null }> {
  const size = axis === 'x' ? slide.width : slide.height;
  const out: Array<{ pos: number; box: Box | null }> = [0, size / 2, size].map((pos) => ({ pos, box: null }));
  for (const b of others) {
    const s = span(b, axis);
    out.push({ pos: s.start, box: b }, { pos: s.start + s.size / 2, box: b }, { pos: end(s), box: b });
  }
  return out;
}

const features = (s: Span) => [s.start, s.start + s.size / 2, end(s)];

/** The neighbours in the moving box's row (axis x) or column (axis y). */
function neighbours(moving: Box, others: Box[], axis: 'x' | 'y') {
  const m = span(moving, axis);
  const mc = cross(moving, axis);
  const row = others.filter((o) => overlaps(cross(o, axis), mc));
  const centre = m.start + m.size / 2;
  const before = row.filter((o) => end(span(o, axis)) <= centre).sort((a, b) => end(span(b, axis)) - end(span(a, axis)));
  const after = row.filter((o) => span(o, axis).start >= centre).sort((a, b) => span(a, axis).start - span(b, axis).start);
  const L = before[0] ?? null;
  const R = after[0] ?? null;
  // The next box beyond L (or R) in the same row, not overlapping it along the axis.
  const LL = L ? row.filter((o) => o !== L && end(span(o, axis)) <= span(L, axis).start).sort((a, b) => end(span(b, axis)) - end(span(a, axis)))[0] ?? null : null;
  const RR = R ? row.filter((o) => o !== R && span(o, axis).start >= end(span(R, axis))).sort((a, b) => span(a, axis).start - span(b, axis).start)[0] ?? null : null;
  return { L, R, LL, RR };
}

/** Where the moving box's start could go for equal spacing, along one axis. */
function spacingStarts(moving: Box, others: Box[], axis: 'x' | 'y'): number[] {
  const m = span(moving, axis);
  const { L, R, LL, RR } = neighbours(moving, others, axis);
  const out: number[] = [];
  if (L && R) {
    const room = span(R, axis).start - end(span(L, axis));
    if (room > m.size) out.push(end(span(L, axis)) + (room - m.size) / 2);
  }
  if (L && LL) {
    const g = span(L, axis).start - end(span(LL, axis));
    if (g > 0) out.push(end(span(L, axis)) + g);
  }
  if (R && RR) {
    const g = span(RR, axis).start - end(span(R, axis));
    if (g > 0) out.push(span(R, axis).start - g - m.size);
  }
  return out;
}

/** The best offset (smallest move) along one axis within the threshold, or 0. */
function bestOffset(moving: Box, others: Box[], slide: SlideSize, axis: 'x' | 'y', threshold: number): number {
  const m = span(moving, axis);
  let best: number | null = null;
  const consider = (offset: number) => {
    if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best) - 1e-9)) best = offset;
  };
  for (const t of targets(others, slide, axis)) for (const f of features(m)) consider(t.pos - f);
  for (const start of spacingStarts(moving, others, axis)) consider(start - m.start);
  return best ?? 0;
}

/** The guide lines that touch a box's edges or centre (or only `only` of its lines), merged per position. */
export function guidesFor(box: Box, others: Box[], slide: SlideSize, only?: { x?: number[]; y?: number[] }): Guide[] {
  const out: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const lines = only ? only[axis] ?? [] : features(span(box, axis));
    const c = cross(box, axis);
    const full = axis === 'x' ? slide.height : slide.width;
    const byPos = new Map<number, Guide>();
    for (const t of targets(others, slide, axis)) {
      const hit = lines.find((f) => Math.abs(f - t.pos) < EPS);
      if (hit === undefined) continue;
      const from = t.box ? Math.min(c.start, cross(t.box, axis).start) : 0;
      const to = t.box ? Math.max(end(c), end(cross(t.box, axis))) : full;
      const key = Math.round(t.pos * 2) / 2;
      const g = byPos.get(key);
      if (g) {
        g.from = Math.min(g.from, from);
        g.to = Math.max(g.to, to);
      } else byPos.set(key, { axis, pos: t.pos, from, to });
    }
    out.push(...byPos.values());
  }
  return out;
}

const midOverlap = (a: Box, b: Box, axis: 'x' | 'y') => {
  const ca = cross(a, axis);
  const cb = cross(b, axis);
  const lo = Math.max(ca.start, cb.start);
  const hi = Math.min(end(ca), end(cb));
  return hi >= lo ? (lo + hi) / 2 : (ca.start + end(ca) + cb.start + end(cb)) / 4;
};

/** The equal-gap hints a box takes part in (with its row and column neighbours). */
export function spacingFor(box: Box, others: Box[]): SpacingHint[] {
  const out: SpacingHint[] = [];
  for (const axis of ['x', 'y'] as const) {
    const { L, R, LL, RR } = neighbours(box, others, axis);
    const seg = (a: Box, b: Box) => ({ from: end(span(a, axis)), to: span(b, axis).start, at: midOverlap(a, b, axis) });
    const gap = (a: Box, b: Box) => span(b, axis).start - end(span(a, axis));
    const segs: Array<{ from: number; to: number; at: number }> = [];
    let g = 0;
    if (L && R && gap(L, box) > 0 && Math.abs(gap(L, box) - gap(box, R)) < EPS) {
      g = gap(L, box);
      segs.push(seg(L, box), seg(box, R));
    }
    if (L && LL && gap(L, box) > 0 && Math.abs(gap(LL, L) - gap(L, box)) < EPS) {
      g = gap(L, box);
      segs.push(seg(LL, L), seg(L, box));
    }
    if (R && RR && gap(box, R) > 0 && Math.abs(gap(R, RR) - gap(box, R)) < EPS) {
      g = gap(box, R);
      segs.push(seg(box, R), seg(R, RR));
    }
    // One hint per axis; a segment found twice is drawn once.
    const unique = segs.filter((s, i) => segs.findIndex((t) => Math.abs(t.from - s.from) < EPS && Math.abs(t.to - s.to) < EPS) === i);
    if (unique.length) out.push({ axis, gap: g, segments: unique });
  }
  return out;
}

/**
 * Snaps a moving box (the box around everything being moved) to the slide and to `others`. Returns the offset to add
 * to the move, and the guides and equal-gap hints for where it lands.
 */
export function snapMove(moving: Box, others: Box[], slide: SlideSize, threshold: number): SnapResult {
  const dx = bestOffset(moving, others, slide, 'x', threshold);
  const dy = bestOffset(moving, others, slide, 'y', threshold);
  const final = { ...moving, x: moving.x + dx, y: moving.y + dy };
  return { dx, dy, guides: guidesFor(final, others, slide), spacing: spacingFor(final, others) };
}

export interface ResizeEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/**
 * Snaps the moving edges of a box being resized (not rotated) to the slide and to `others`. Each moving edge snaps
 * on its own to the nearest line within the threshold. A box never snaps to less than `min` px.
 */
export function snapResize(box: Box, edges: ResizeEdges, others: Box[], slide: SlideSize, threshold: number, min = 1): { box: Box; guides: Guide[] } {
  const near = (value: number, axis: 'x' | 'y') => {
    let best: number | null = null;
    for (const t of targets(others, slide, axis)) {
      const d = t.pos - value;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best ?? 0;
  };
  let { x, y, w, h } = box;
  if (edges.left) {
    const d = near(x, 'x');
    if (w - d >= min) {
      x += d;
      w -= d;
    }
  } else if (edges.right) {
    const d = near(x + w, 'x');
    if (w + d >= min) w += d;
  }
  if (edges.top) {
    const d = near(y, 'y');
    if (h - d >= min) {
      y += d;
      h -= d;
    }
  } else if (edges.bottom) {
    const d = near(y + h, 'y');
    if (h + d >= min) h += d;
  }
  const final = { x, y, w, h };
  const only = {
    x: [...(edges.left ? [x] : []), ...(edges.right ? [x + w] : [])],
    y: [...(edges.top ? [y] : []), ...(edges.bottom ? [y + h] : [])],
  };
  return { box: final, guides: guidesFor(final, others, slide, only) };
}
