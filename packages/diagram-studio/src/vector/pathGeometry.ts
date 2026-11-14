/**
 * Geometry of SVG path data (the connector paths React Flow's path functions return), for the vector exports: the
 * bounds of a connector, the point a fraction along it (label positions), and the direction at each end (to draw
 * end markers as plain shapes in the PDF). Curves are flattened into short straight pieces, which is plenty for
 * bounds, label placement and marker angles.
 */
import type { Point } from '../model';

const CURVE_STEPS = 16;
/** Sample points along a curve; the extra ones next to each end make the end directions (marker angles) exact. */
const CURVE_TS = [0.001, ...Array.from({ length: CURVE_STEPS - 1 }, (_, k) => (k + 1) / CURVE_STEPS), 0.999, 1];

/** Flattens path data into polylines (one per subpath). Supports M L H V Q T C S A Z, absolute and relative. */
export function flattenPath(d: string): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Point[][] = [];
  let current: Point[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let start = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;
  let lastCmd = '';
  const num = () => parseFloat(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  const push = (p: Point) => current.push(p);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (v: number) => (rel ? x + v : v);
    const ay = (v: number) => (rel ? y + v : v);
    if (C === 'Z') {
      push({ ...start });
      x = start.x;
      y = start.y;
      lastCtrl = null;
      lastCmd = 'Z';
      cmd = '';
      continue;
    }
    if (!hasNum()) {
      cmd = '';
      continue;
    }
    switch (C) {
      case 'M': {
        const nx = ax(num());
        const ny = ay(num());
        if (current.length) out.push(current);
        current = [{ x: nx, y: ny }];
        x = nx;
        y = ny;
        start = { x, y };
        // Further pairs after M are lines.
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        x = ax(num());
        y = ay(num());
        push({ x, y });
        lastCtrl = null;
        break;
      case 'H':
        x = rel ? x + num() : num();
        push({ x, y });
        lastCtrl = null;
        break;
      case 'V':
        y = rel ? y + num() : num();
        push({ x, y });
        lastCtrl = null;
        break;
      case 'Q':
      case 'T': {
        const c: Point =
          C === 'Q' ? { x: ax(num()), y: ay(num()) } : lastCtrl && /[QT]/.test(lastCmd) ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
        const e = { x: ax(num()), y: ay(num()) };
        for (const t of CURVE_TS) {
          const u = 1 - t;
          push({ x: u * u * x + 2 * u * t * c.x + t * t * e.x, y: u * u * y + 2 * u * t * c.y + t * t * e.y });
        }
        lastCtrl = c;
        x = e.x;
        y = e.y;
        break;
      }
      case 'C':
      case 'S': {
        const c1: Point =
          C === 'C' ? { x: ax(num()), y: ay(num()) } : lastCtrl && /[CS]/.test(lastCmd) ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y };
        const c2 = { x: ax(num()), y: ay(num()) };
        const e = { x: ax(num()), y: ay(num()) };
        for (const t of CURVE_TS) {
          const u = 1 - t;
          push({
            x: u * u * u * x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
            y: u * u * u * y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
          });
        }
        lastCtrl = c2;
        x = e.x;
        y = e.y;
        break;
      }
      case 'A': {
        // rx ry rotation large-arc sweep x y — approximated by its chord (connectors do not use arcs).
        num();
        num();
        num();
        num();
        num();
        x = ax(num());
        y = ay(num());
        push({ x, y });
        lastCtrl = null;
        break;
      }
      default:
        i++;
    }
    lastCmd = C;
  }
  if (current.length) out.push(current);
  return out;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function pathLength(d: string): number {
  let len = 0;
  for (const poly of flattenPath(d)) for (let k = 1; k < poly.length; k++) len += dist(poly[k - 1], poly[k]);
  return len;
}

/** The point `t` (0..1) of the way along the path, by length. */
export function pointAlong(d: string, t: number): Point | null {
  const polys = flattenPath(d);
  const total = polys.reduce((s, p) => s + p.slice(1).reduce((a, q, k) => a + dist(p[k], q), 0), 0);
  if (!polys.length) return null;
  if (total === 0) return { ...polys[0][0] };
  let remaining = Math.min(1, Math.max(0, t)) * total;
  for (const poly of polys)
    for (let k = 1; k < poly.length; k++) {
      const seg = dist(poly[k - 1], poly[k]);
      if (remaining <= seg && seg > 0) {
        const f = remaining / seg;
        return { x: poly[k - 1].x + (poly[k].x - poly[k - 1].x) * f, y: poly[k - 1].y + (poly[k].y - poly[k - 1].y) * f };
      }
      remaining -= seg;
    }
  const last = polys[polys.length - 1];
  return { ...last[last.length - 1] };
}

export function pathBounds(d: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const poly of flattenPath(d))
    for (const p of poly) {
      if (!b) b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      else {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x);
        b.maxY = Math.max(b.maxY, p.y);
      }
    }
  return b;
}

/**
 * Each end of the path and the direction the path travels there, in degrees (0 = right, 90 = down): at the start,
 * the direction leaving it; at the end, the direction arriving. Zero-length pieces are skipped.
 */
export function pathEnds(d: string): { start: Point; startAngle: number; end: Point; endAngle: number } | null {
  const polys = flattenPath(d).filter((p) => p.length > 0);
  if (!polys.length) return null;
  const first = polys[0];
  const last = polys[polys.length - 1];
  const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const s = first[0];
  const sNext = first.find((p) => dist(s, p) > 1e-6) ?? s;
  const e = last[last.length - 1];
  const ePrev = [...last].reverse().find((p) => dist(e, p) > 1e-6) ?? e;
  return { start: s, startAngle: angle(s, sNext), end: e, endAngle: angle(ePrev, e) };
}
