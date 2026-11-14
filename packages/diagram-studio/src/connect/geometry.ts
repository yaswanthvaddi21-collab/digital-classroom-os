/**
 * Connector geometry (Phase 5, G-CONNECT): where a connector meets a shape, how it runs through bend points, and
 * where along it the label sits. Pure functions on flow (canvas) coordinates, so the canvas and a model-to-SVG export
 * draw the same lines, and tests need no canvas.
 *
 * - A connector end is attached by a side handle (`sourceHandle` 't' | 'r' | 'b' | 'l', schema 2), by a fixed point
 *   (`sourcePort` {x, y} as fractions of the shape's box, like diagrams.net's exitX/exitY with exitPerimeter=1: the
 *   point is projected onto the outline), or floating (`sourcePort: 'perimeter'`: the nearest point of the outline
 *   towards the other end, re-picked as the shapes move).
 * - Bend points (`waypoints`) are absolute canvas points from source to target.
 * - `labelPosition` is a fraction of the connector's length.
 */
import { Position } from '@xyflow/react';
import type { EdgePort, Point } from '../model';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A resolved connector end: the point it touches and the side it leaves through (for elbow routing). */
export interface ConnectorEnd extends Point {
  position: Position;
}

/** A shape's outline in its own box coordinates (0..w, 0..h). */
export type Outline = { kind: 'rect' } | { kind: 'ellipse' } | { kind: 'polygon'; points: Point[] };

const RECT: Outline = { kind: 'rect' };
const ELLIPSE: Outline = { kind: 'ellipse' };
const poly = (...pts: Array<[number, number]>): Outline => ({ kind: 'polygon', points: pts.map(([x, y]) => ({ x, y })) });

/**
 * Outlines that floating ends and fixed points follow, by shape kind. They match the renderers in shapes.tsx. Kinds
 * not listed use their box (a good fit for rectangles, notes, documents, packages, UML and ER boxes).
 */
export const SHAPE_OUTLINES: Record<string, (w: number, h: number) => Outline> = {
  ellipse: () => ELLIPSE,
  circle: () => ELLIPSE,
  diamond: (w, h) => poly([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]),
  triangle: (w, h) => poly([w / 2, 0], [w, h], [0, h]),
  hexagon: (w, h) => {
    const o = Math.min(w * 0.18, h / 2);
    return poly([o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]);
  },
  parallelogram: (w, h) => {
    const o = Math.min(w * 0.18, 32);
    return poly([o, 0], [w, 0], [w - o, h], [0, h]);
  },
  // @phase5:connect-outlines — outlines for new shape kinds (G-SHAPES); kinds left out use their box.
};

export const outlineOf = (kind: string, w: number, h: number): Outline => SHAPE_OUTLINES[kind]?.(w, h) ?? RECT;

export const centreOf = (b: Rect): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/** Smallest t > 0 at which the ray c + t·d meets the polygon (canvas coordinates), or null. */
function rayPolygon(c: Point, d: Point, pts: Point[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const e = { x: b.x - a.x, y: b.y - a.y };
    const denom = cross(d, e);
    if (Math.abs(denom) < 1e-12) continue;
    const ac = { x: a.x - c.x, y: a.y - c.y };
    const t = cross(ac, e) / denom;
    const u = cross(ac, d) / denom;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Where the ray from the shape's centre towards `toward` leaves its outline. A point at the centre itself gives the
 * top of the outline.
 */
export function outlinePoint(kind: string, box: Rect, toward: Point): Point {
  const c = centreOf(box);
  const hw = box.width / 2;
  const hh = box.height / 2;
  if (hw <= 0 || hh <= 0) return c;
  let dx = toward.x - c.x;
  let dy = toward.y - c.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    dx = 0;
    dy = -1;
  }
  const outline = outlineOf(kind, box.width, box.height);
  let t: number | null = null;
  if (outline.kind === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (outline.kind === 'polygon') t = rayPolygon(c, { x: dx, y: dy }, outline.points.map((p) => ({ x: box.x + p.x, y: box.y + p.y })));
  if (t === null) t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * The side of `box` a point on (or near) its outline belongs to, for routing elbow lines. A corner, which belongs to
 * two sides, takes the one facing `toward`.
 */
export function sideOf(p: Point, box: Rect, toward?: Point): Position {
  const c = centreOf(box);
  const nx = box.width ? (p.x - c.x) / (box.width / 2) : 0;
  const ny = box.height ? (p.y - c.y) / (box.height / 2) : 0;
  const horizontal = (x: number) => (x >= 0 ? Position.Right : Position.Left);
  const vertical = (y: number) => (y >= 0 ? Position.Bottom : Position.Top);
  if (Math.abs(Math.abs(nx) - Math.abs(ny)) > 1e-6) return Math.abs(nx) > Math.abs(ny) ? horizontal(nx) : vertical(ny);
  if (toward) {
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    if (Math.abs(dx) >= Math.abs(dy) && Math.sign(dx) === Math.sign(nx || dx)) return horizontal(dx);
    if (Math.sign(dy) === Math.sign(ny || dy)) return vertical(dy);
  }
  return Math.abs(nx) >= Math.abs(ny) ? horizontal(nx) : vertical(ny);
}

/** The point a fixed port (fractions of the box) attaches to: projected from the centre onto the outline. */
export function portPoint(kind: string, box: Rect, port: Point): Point {
  if (Math.abs(port.x - 0.5) < 1e-9 && Math.abs(port.y - 0.5) < 1e-9) return centreOf(box);
  return outlinePoint(kind, box, { x: box.x + port.x * box.width, y: box.y + port.y * box.height });
}

/**
 * The eight fixed connection points offered on every shape, clockwise from the top. The four side middles are the
 * shape's own side handles (stored as `sourceHandle`, so a diagram that uses only them stays schema 2); the corners are
 * stored as a port.
 */
export interface PortDef {
  id: string;
  /** For labels: "Attach the start to the {name}". */
  name: string;
  point: Point;
  /** The side handle this point is, if it is one. */
  handle?: 't' | 'r' | 'b' | 'l';
}

export const PORTS: PortDef[] = [
  { id: 'top', name: 'top', point: { x: 0.5, y: 0 }, handle: 't' },
  { id: 'top-right', name: 'top-right corner', point: { x: 1, y: 0 } },
  { id: 'right', name: 'right side', point: { x: 1, y: 0.5 }, handle: 'r' },
  { id: 'bottom-right', name: 'bottom-right corner', point: { x: 1, y: 1 } },
  { id: 'bottom', name: 'bottom', point: { x: 0.5, y: 1 }, handle: 'b' },
  { id: 'bottom-left', name: 'bottom-left corner', point: { x: 0, y: 1 } },
  { id: 'left', name: 'left side', point: { x: 0, y: 0.5 }, handle: 'l' },
  { id: 'top-left', name: 'top-left corner', point: { x: 0, y: 0 } },
];

const HANDLE_FRACTION: Record<string, Point> = { t: { x: 0.5, y: 0 }, r: { x: 1, y: 0.5 }, b: { x: 0.5, y: 1 }, l: { x: 0, y: 0.5 } };
const HANDLE_SIDE: Record<string, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
/** React Flow draws a connector to the outer edge of the 10 px handle dot, half of it outside the shape. */
export const HANDLE_OUTSET = 5;

/**
 * Where React Flow attaches a connector to a side handle: the middle of that side, `HANDLE_OUTSET` outside the box.
 * For drawing without a canvas (a model-to-SVG export); the live editor uses the measured handle.
 */
export function handleEnd(box: Rect, handle: string | null | undefined): ConnectorEnd {
  const id = handle && HANDLE_FRACTION[handle] ? handle : 't';
  const f = HANDLE_FRACTION[id];
  const position = HANDLE_SIDE[id];
  const out = { x: id === 'r' ? HANDLE_OUTSET : id === 'l' ? -HANDLE_OUTSET : 0, y: id === 'b' ? HANDLE_OUTSET : id === 't' ? -HANDLE_OUTSET : 0 };
  return { x: box.x + f.x * box.width + out.x, y: box.y + f.y * box.height + out.y, position };
}

/** What `resolveEnds` needs to know about one end of a connector. */
export interface EndInput {
  box: Rect;
  kind: string;
  /** Where the side handle puts this end (React Flow's measured handle, or `handleEnd`). */
  handle: ConnectorEnd;
  port?: EdgePort;
}

/**
 * The two ends of a connector. Fixed ends (handle or fixed point) are placed first; a floating end then takes the point
 * of its outline facing the nearest bend point, or else the other end (its point if fixed, its centre if floating too).
 */
export function resolveEnds(source: EndInput, target: EndInput, waypoints?: Point[]): { source: ConnectorEnd; target: ConnectorEnd } {
  const fixed = (end: EndInput, other: EndInput): ConnectorEnd | null => {
    if (end.port === 'perimeter') return null;
    if (end.port) {
      const p = portPoint(end.kind, end.box, end.port);
      return { ...p, position: sideOf(p, end.box, centreOf(other.box)) };
    }
    return end.handle;
  };
  let s = fixed(source, target);
  let t = fixed(target, source);
  const first = waypoints?.[0];
  const last = waypoints?.[waypoints.length - 1];
  if (!s) {
    const ref = first ?? t ?? centreOf(target.box);
    const p = outlinePoint(source.kind, source.box, ref);
    s = { ...p, position: sideOf(p, source.box, ref) };
  }
  if (!t) {
    const ref = last ?? (source.port === 'perimeter' && !first ? centreOf(source.box) : s);
    const p = outlinePoint(target.kind, target.box, ref);
    t = { ...p, position: sideOf(p, target.box, ref) };
  }
  return { source: s, target: t };
}

// ── Routes through bend points ────────────────────────────────────────────────

type Axis = 'h' | 'v';
const DIR: Record<Position, Point> = { [Position.Top]: { x: 0, y: -1 }, [Position.Right]: { x: 1, y: 0 }, [Position.Bottom]: { x: 0, y: 1 }, [Position.Left]: { x: -1, y: 0 } };
const axisOf = (p: Position): Axis => (p === Position.Left || p === Position.Right ? 'h' : 'v');
const other = (a: Axis): Axis => (a === 'h' ? 'v' : 'h');
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Distance an elbow line runs straight out of a shape before it may turn (React Flow's smoothstep offset). */
export const STUB = 20;
/** Corner radius of elbow (smoothstep) lines, as React Flow draws them. */
export const CORNER_RADIUS = 5;

/** Right-angled points from p to q, leaving along `start`; arriving along `end` when given. Returns the points after p. */
function orthogonalLeg(p: Point, q: Point, start: Axis, end: Axis | null): { points: Point[]; last: Axis } {
  if (Math.abs(p.x - q.x) < 1e-6) return { points: [q], last: 'v' };
  if (Math.abs(p.y - q.y) < 1e-6) return { points: [q], last: 'h' };
  if (end === null || end !== start) return { points: [start === 'h' ? { x: q.x, y: p.y } : { x: p.x, y: q.y }, q], last: other(start) };
  if (start === 'h') {
    const mx = (p.x + q.x) / 2;
    return { points: [{ x: mx, y: p.y }, { x: mx, y: q.y }, q], last: 'h' };
  }
  const my = (p.y + q.y) / 2;
  return { points: [{ x: p.x, y: my }, { x: q.x, y: my }, q], last: 'v' };
}

/** Removes repeated points and middle points of straight runs. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length && same(out[out.length - 1], p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - p.x) < 1e-6) || (Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - p.y) < 1e-6)) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * The right-angled route from s through every bend point to t, split into legs (one per stretch between two
 * consecutive control points: s, the bend points, t). Every turn is 90°: a stretch between points that are not lined
 * up gets one corner, or two when it must both leave and arrive along the same axis. The line leaves s and enters t
 * straight out of the shape (`STUB`) when the next point lies ahead; otherwise it turns at once.
 */
export function orthogonalRoute(s: ConnectorEnd, t: ConnectorEnd, waypoints: Point[]): Point[][] {
  const sd = DIR[s.position];
  const td = DIR[t.position];
  const s1 = { x: s.x + sd.x * STUB, y: s.y + sd.y * STUB };
  const t1 = { x: t.x + td.x * STUB, y: t.y + td.y * STUB };
  const controls = [...waypoints, t1];
  const legs: Point[][] = [];
  let at = s1;
  let prev: Axis = axisOf(s.position);
  controls.forEach((q, i) => {
    let start: Axis;
    if (i === 0) {
      const ahead = (q.x - s1.x) * sd.x + (q.y - s1.y) * sd.y >= 0;
      start = ahead ? axisOf(s.position) : other(axisOf(s.position));
    } else start = other(prev);
    let end: Axis | null = null;
    if (i === controls.length - 1) {
      const ahead = (at.x - t1.x) * td.x + (at.y - t1.y) * td.y >= 0;
      end = ahead ? axisOf(t.position) : other(axisOf(t.position));
    }
    const leg = orthogonalLeg(at, q, start, end);
    legs.push(leg.points);
    prev = leg.last;
    at = q;
  });
  // The stubs belong to the first and last legs; the last leg ends at t itself.
  return legs.map((leg, i) => {
    const head = i === 0 ? [s, s1] : [waypoints[i - 1]];
    const body = i === legs.length - 1 ? [...leg, t] : leg;
    return simplify([...head, ...body]);
  });
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const pt = (p: Point) => `${fmt(p.x)},${fmt(p.y)}`;

/** One list of points from legs that share their end and start points. */
export function joinLegs(legs: Point[][]): Point[] {
  return simplify(legs.flat());
}

export function polylinePath(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join(' ');
}

/** A polyline with rounded corners (quadratic, like React Flow's smoothstep). */
export function roundedPath(points: Point[], radius = CORNER_RADIUS): string {
  if (points.length < 3) return polylinePath(points);
  let d = `M${pt(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const r = Math.min(radius, dist(a, b) / 2, dist(b, c) / 2);
    const inDir = { x: (b.x - a.x) / (dist(a, b) || 1), y: (b.y - a.y) / (dist(a, b) || 1) };
    const outDir = { x: (c.x - b.x) / (dist(b, c) || 1), y: (c.y - b.y) / (dist(b, c) || 1) };
    d += ` L${pt({ x: b.x - inDir.x * r, y: b.y - inDir.y * r })} Q${pt(b)} ${pt({ x: b.x + outDir.x * r, y: b.y + outDir.y * r })}`;
  }
  return `${d} L${pt(points[points.length - 1])}`;
}

/**
 * A smooth curve through s, every bend point and t (Catmull-Rom as cubic Béziers). It leaves s and enters t along
 * their sides, as React Flow's curved line does. Returns the path and each stretch's cubic.
 */
export function curvedRoute(s: ConnectorEnd, t: ConnectorEnd, waypoints: Point[]): { path: string; legs: Point[][] } {
  const pts: Point[] = [s, ...waypoints, t];
  let d = `M${pt(s)}`;
  const legs: Point[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const len = dist(p1, p2);
    const c1 = p0 ? { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 } : { x: p1.x + DIR[s.position].x * (len / 3), y: p1.y + DIR[s.position].y * (len / 3) };
    const c2 = p3 ? { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 } : { x: p2.x + DIR[t.position].x * (len / 3), y: p2.y + DIR[t.position].y * (len / 3) };
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
    legs.push(sampleCubic(p1, c1, c2, p2, 16));
  }
  return { path: d, legs };
}

/** The route of a connector through its bend points, by line type. Unknown (newer) line types are drawn straight. */
export function routeThrough(type: string, s: ConnectorEnd, t: ConnectorEnd, waypoints: Point[]): { path: string; legs: Point[][] } {
  if (type === 'step' || type === 'smoothstep') {
    const legs = orthogonalRoute(s, t, waypoints);
    const all = joinLegs(legs);
    return { path: type === 'step' ? polylinePath(all) : roundedPath(all), legs };
  }
  if (type === 'default') return curvedRoute(s, t, waypoints);
  const pts = [s, ...waypoints, t].map((p) => ({ x: p.x, y: p.y }));
  return { path: polylinePath(pts), legs: pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]) };
}

// ── Paths as polylines: label positions and nearest points ───────────────────

function sampleQuad(a: Point, c: Point, b: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

function sampleCubic(a: Point, c1: Point, c2: Point, b: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

/**
 * A path's `d` (the M, L, H, V, Q, C and Z commands React Flow and this module write, absolute or relative) as a
 * polyline, curves sampled. Anything else ends the reading.
 */
export function samplePath(d: string): Point[] {
  const tokens = d.match(/[MLHVQCZmlhvqcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Point[] = [];
  let i = 0;
  let cur: Point = { x: 0, y: 0 };
  let start: Point = cur;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case 'M':
        if (!isNum()) return out;
        cur = at(num(), num());
        start = cur;
        out.push(cur);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        if (!isNum()) return out;
        cur = at(num(), num());
        out.push(cur);
        break;
      case 'H':
        if (!isNum()) return out;
        cur = { x: rel ? cur.x + num() : num(), y: cur.y };
        out.push(cur);
        break;
      case 'V':
        if (!isNum()) return out;
        cur = { x: cur.x, y: rel ? cur.y + num() : num() };
        out.push(cur);
        break;
      case 'Q': {
        if (!isNum()) return out;
        const c = at(num(), num());
        const b = at(num(), num());
        out.push(...sampleQuad(cur, c, b, 8).slice(1));
        cur = b;
        break;
      }
      case 'C': {
        if (!isNum()) return out;
        const c1 = at(num(), num());
        const c2 = at(num(), num());
        const b = at(num(), num());
        out.push(...sampleCubic(cur, c1, c2, b, 24).slice(1));
        cur = b;
        break;
      }
      case 'Z':
        cur = start;
        out.push(cur);
        if (isNum()) return out;
        break;
      default:
        return out;
    }
  }
  return out;
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** The point a fraction `t` (0..1) of the way along a polyline. */
export function pointAlong(points: Point[], t: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  const total = polylineLength(points);
  if (total === 0) return { ...points[0] };
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (left <= seg || i === points.length - 1) {
      const f = seg ? Math.min(1, left / seg) : 0;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
    }
    left -= seg;
  }
  return { ...points[points.length - 1] };
}

/** The point of a polyline nearest `p`: where it is, how far along (0..1) and how far from `p`. */
export function nearestAlong(points: Point[], p: Point): { t: number; point: Point; distance: number } {
  const total = polylineLength(points);
  if (points.length < 2 || total === 0) return { t: 0, point: points[0] ? { ...points[0] } : { ...p }, distance: points[0] ? dist(points[0], p) : 0 };
  let best = { t: 0, point: points[0], distance: Infinity };
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = dist(a, b);
    const f = seg ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (seg * seg))) : 0;
    const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const dd = dist(q, p);
    if (dd < best.distance) best = { t: (walked + seg * f) / total, point: q, distance: dd };
    walked += seg;
  }
  return best;
}

/** A label position to store: rounded to 0.001, with the middle (the default) stored as absent. */
export function storedLabelPosition(t: number): number | undefined {
  const r = Math.round(Math.min(1, Math.max(0, t)) * 1000) / 1000;
  return r === 0.5 ? undefined : r;
}

/**
 * Where each stretch's "add a bend" handle goes: the middle of that stretch, or a quarter along it when the middle
 * is taken by the label.
 */
export function insertHandles(legs: Point[][], label: Point | null): Point[] {
  return legs.map((leg) => {
    const mid = pointAlong(leg, 0.5);
    return label && dist(mid, label) < 18 ? pointAlong(leg, 0.25) : mid;
  });
}

/** Rounds a bend point to the grid when snapping is on. */
export const snapPoint = (p: Point, grid: number | null): Point => (grid ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid } : { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

// ── A connector drawn without a canvas ───────────────────────────────────────

/** The geometry React Flow's own path functions need (see EDGE_PATHS in edges.tsx). */
export interface PathGeometry {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}

export type PathFn = (g: PathGeometry) => [path: string, labelX: number, labelY: number];

export interface ConnectorGeometryInput {
  type: string;
  source: EndInput;
  target: EndInput;
  waypoints?: Point[];
  labelPosition?: number;
  /** The line type's path when there are no bend points (EDGE_PATHS). */
  pathFn: PathFn;
}

export interface ConnectorGeometry {
  path: string;
  labelX: number;
  labelY: number;
  source: ConnectorEnd;
  target: ConnectorEnd;
  /** The drawn line as a polyline (curves sampled), for the label and nearest-point lookups. */
  points: Point[];
  /** One polyline per stretch between control points (source, bend points, target). */
  legs: Point[][];
}

/**
 * The complete geometry of one connector: its ends, its path through any bend points, and its label point. Without
 * bend points the line type's own path is used, so a connector without schema-3 fields looks exactly as before.
 */
export function connectorGeometry({ type, source, target, waypoints, labelPosition, pathFn }: ConnectorGeometryInput): ConnectorGeometry {
  const ports = source.port !== undefined || target.port !== undefined;
  const ends = ports || waypoints?.length ? resolveEnds(source, target, waypoints) : { source: source.handle, target: target.handle };
  if (waypoints?.length) {
    const { path, legs } = routeThrough(type, ends.source, ends.target, waypoints);
    const points = joinLegs(legs);
    const label = pointAlong(points, labelPosition ?? 0.5);
    return { path, labelX: label.x, labelY: label.y, source: ends.source, target: ends.target, points, legs };
  }
  const [path, lx, ly] = pathFn({
    sourceX: ends.source.x,
    sourceY: ends.source.y,
    targetX: ends.target.x,
    targetY: ends.target.y,
    sourcePosition: ends.source.position,
    targetPosition: ends.target.position,
  });
  const points = samplePath(path);
  const label = labelPosition === undefined ? { x: lx, y: ly } : pointAlong(points, labelPosition);
  return { path, labelX: label.x, labelY: label.y, source: ends.source, target: ends.target, points, legs: [points] };
}
