/** Geometry and rules for draw.io-style quick connect. Pure functions so they can be tested without a canvas. */

export type Direction = 'top' | 'right' | 'bottom' | 'left';
export const DIRECTIONS: Direction[] = ['top', 'right', 'bottom', 'left'];

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Connection points used when linking towards a direction: leave through that side, enter through the opposite one. */
export const HANDLES_FOR: Record<Direction, { source: string; target: string }> = {
  top: { source: 't', target: 'b' },
  right: { source: 'r', target: 'l' },
  bottom: { source: 'b', target: 't' },
  left: { source: 'l', target: 'r' },
};

/** Space between the source and a newly created shape. */
export const QUICK_GAP = 60;
const CLEARANCE = 16;

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: Box) =>
  a.x < b.x + b.width + CLEARANCE && b.x < a.x + a.width + CLEARANCE && a.y < b.y + b.height + CLEARANCE && b.y < a.y + a.height + CLEARANCE;

/**
 * Where a new shape goes when created from `source` towards `dir`: centred on the source along the other axis,
 * `gap` away, and pushed further out until it overlaps nothing.
 */
export function placeNew(source: Box, dir: Direction, size: { width: number; height: number }, others: Box[], gap = QUICK_GAP): { x: number; y: number } {
  const cx = source.x + source.width / 2;
  const cy = source.y + source.height / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'bottom' ? 1 : -1;
  const step = (horizontal ? size.width : size.height) + gap / 2;
  let distance = gap;
  for (let i = 0; i < 50; i++) {
    const pos = horizontal
      ? { x: sign > 0 ? source.x + source.width + distance : source.x - distance - size.width, y: cy - size.height / 2 }
      : { x: cx - size.width / 2, y: sign > 0 ? source.y + source.height + distance : source.y - distance - size.height };
    const rect = { ...pos, ...size };
    if (!others.some((o) => o.id !== source.id && overlaps(rect, o))) return { x: Math.round(pos.x), y: Math.round(pos.y) };
    distance += step;
  }
  return horizontal ? { x: source.x + sign * (source.width + gap), y: source.y } : { x: source.x, y: source.y + sign * (source.height + gap) };
}

export type ConnectCheck = { ok: true } | { ok: false; reason: 'self' | 'duplicate' | 'missing' };

/** A connector may join two different, existing shapes that are not already directly connected (either way). */
export function canConnect(edges: Array<{ source: string; target: string }>, nodeIds: Set<string>, source: string, target: string): ConnectCheck {
  if (source === target) return { ok: false, reason: 'self' };
  if (!nodeIds.has(source) || !nodeIds.has(target)) return { ok: false, reason: 'missing' };
  if (edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}

/** Connection points that face each other for two boxes. */
export function facingHandles(a: Box, b: Box): { sourceHandle: string; targetHandle: string } {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
  return { sourceHandle: HANDLES_FOR[dir].source, targetHandle: HANDLES_FOR[dir].target };
}

/** The point on a box's side where a connector towards `dir` leaves. */
export function anchorPoint(box: Box, dir: Direction): { x: number; y: number } {
  switch (dir) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
  }
}

export function directionFromKey(key: string): Direction | null {
  return ({ ArrowUp: 'top', ArrowRight: 'right', ArrowDown: 'bottom', ArrowLeft: 'left' } as const)[key as 'ArrowUp'] ?? null;
}
