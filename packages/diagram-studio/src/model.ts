/**
 * Schema-3 model fields (Phase 5): what each one may hold, and how a stored value is read. Every field is optional
 * and absent by default; a value that is not valid is ignored (left out on load), never a crash. See
 * docs/adr/0012-diagram-format-phase5.md.
 */
import { readFontFamily, readImage, readOpacity, readTextAlign, readVerticalAlign } from './shapeStyleFields';

/** A layer. Shapes name their layer by id; shapes without one are on the first layer. */
export interface DiagramLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

/** A point in flow coordinates (the canvas's own coordinates, independent of zoom and pan). */
export interface Point {
  x: number;
  y: number;
}

/**
 * Where a connector attaches to a shape, beyond the four side handles: `'perimeter'` (the nearest point of the
 * outline, re-picked as shapes move) or a fixed point given as fractions of the shape's box (0..1, like diagrams.net's
 * exitX/exitY).
 */
export type EdgePort = 'perimeter' | Point;

/** Most points a connector keeps; more are ignored. */
export const MAX_WAYPOINTS = 500;
/** Most custom properties a shape keeps. */
export const MAX_PROPERTIES = 200;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Rotation in degrees, normalised to (-360, 360). 0 (or anything unreadable) means none. */
export function readRotation(v: unknown): number | undefined {
  if (!finite(v)) return undefined;
  const r = v % 360;
  return r === 0 ? undefined : r;
}

/**
 * Links a shape may open. Web and mail addresses, and diagrams.net's own page links (`data:page/id,…`); anything else
 * (javascript:, other data: URLs, file:) is not a link this app will follow, so it is not kept.
 */
export function isSafeLink(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase();
  if (!scheme) return true; // relative or #anchor
  if (scheme === 'data') return /^data:page\/id,/i.test(s);
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto';
}

export function readLink(v: unknown): string | undefined {
  return typeof v === 'string' && isSafeLink(v) ? v : undefined;
}

export function readText(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Custom properties: string keys to string values. Other entries are left out. */
export function readProperties(v: unknown): Record<string, string> | undefined {
  if (!isObj(v)) return undefined;
  const entries = Object.entries(v)
    .filter(([k, val]) => k !== '' && typeof val === 'string')
    .slice(0, MAX_PROPERTIES) as Array<[string, string]>;
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function readPoint(v: unknown): Point | undefined {
  return isObj(v) && finite(v.x) && finite(v.y) ? { x: v.x, y: v.y } : undefined;
}

export function readWaypoints(v: unknown): Point[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const points = v
    .slice(0, MAX_WAYPOINTS)
    .map(readPoint)
    .filter((p): p is Point => !!p);
  return points.length ? points : undefined;
}

/** Where the label sits along a connector, 0 (source) to 1 (target). 0.5, the middle, is the default and not stored. */
export function readLabelPosition(v: unknown): number | undefined {
  return finite(v) && v >= 0 && v <= 1 && v !== 0.5 ? v : undefined;
}

export function readPort(v: unknown): EdgePort | undefined {
  if (v === 'perimeter') return v;
  const p = readPoint(v);
  return p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? p : undefined;
}

export function readLayers(v: unknown): DiagramLayer[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const layers: DiagramLayer[] = [];
  for (const l of v) {
    if (!isObj(l) || typeof l.id !== 'string' || !l.id || seen.has(l.id)) continue;
    seen.add(l.id);
    layers.push({ id: l.id, name: typeof l.name === 'string' ? l.name : '', visible: l.visible !== false, locked: l.locked === true });
  }
  return layers.length ? layers : undefined;
}

/** Field readers for schema-3 shape data. Unknown data fields (from a newer version) are kept as they are. */
export const SHAPE_DATA_READERS: Record<string, (v: unknown) => unknown> = {
  rotation: readRotation,
  link: readLink,
  tooltip: readText,
  properties: readProperties,
  opacity: readOpacity,
  fontFamily: readFontFamily,
  textAlign: readTextAlign,
  verticalAlign: readVerticalAlign,
  image: readImage,
  // @phase5:model — readers for new shape data fields.
};

/** Field readers for schema-3 connector data. */
export const CONNECTOR_DATA_READERS: Record<string, (v: unknown) => unknown> = {
  waypoints: readWaypoints,
  labelPosition: readLabelPosition,
  sourcePort: readPort,
  targetPort: readPort,
  // @phase5:model — readers for new connector data fields.
};

/**
 * Applies `readers` to the fields of `data` that have one: valid values are kept (normalised), others removed.
 * Returns the same object when nothing changes, so stored data that needs no reading keeps its exact form.
 */
export function readFields<T extends object>(data: T, readers: Record<string, (v: unknown) => unknown>): T {
  let out: Obj | null = null;
  for (const key of Object.keys(readers)) {
    if (!Object.hasOwn(data, key)) continue;
    const before = (data as Obj)[key];
    const after = readers[key](before);
    if (after === before) continue;
    out ??= { ...(data as Obj) };
    if (after === undefined) delete out[key];
    else out[key] = after;
  }
  return (out ?? data) as T;
}

/**
 * Valid parent links: the parent exists, is not the node itself, and following parents never loops (the link that
 * would close a loop is the one left out). Returns the valid parent of each node that has one.
 */
export function validParents(nodes: Array<{ id: string; parentId?: unknown }>): Map<string, string> {
  const ids = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  for (const n of nodes) if (typeof n.parentId === 'string' && n.parentId !== n.id && ids.has(n.parentId)) parent.set(n.id, n.parentId);
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let p = parent.get(n.id);
    while (p !== undefined) {
      if (seen.has(p)) {
        parent.delete(n.id);
        break;
      }
      seen.add(p);
      p = parent.get(p);
    }
  }
  return parent;
}

/**
 * React Flow needs every parent before its children. Keeps the stored order where it already holds (the usual case);
 * otherwise a parent stored after its child moves up to just before it (so it is also painted behind it).
 */
export function parentsFirst<N extends { id: string; parentId?: string }>(nodes: N[]): N[] {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  if (nodes.every((n, i) => !n.parentId || (index.get(n.parentId) ?? -1) < i)) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set<string>();
  const out: N[] = [];
  const place = (n: N) => {
    if (placed.has(n.id)) return;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) place(parent);
    placed.add(n.id);
    out.push(n);
  };
  nodes.forEach(place);
  return out;
}

/** What the coordinate-frame helpers need of a node. */
interface Framed {
  id: string;
  position: Point;
  parentId?: string;
}

/**
 * A node's position on the canvas. A node inside a group stores its position relative to the group (React Flow
 * parent nodes), so the positions of the groups it sits in are added. A missing parent or a loop stops the walk.
 */
export function canvasPosition(n: Framed, byId: ReadonlyMap<string, Framed>): Point {
  const p = { ...n.position };
  const seen = new Set<string>([n.id]);
  for (let parent = n.parentId ? byId.get(n.parentId) : undefined; parent && !seen.has(parent.id); parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
    seen.add(parent.id);
    p.x += parent.position.x;
    p.y += parent.position.y;
  }
  return p;
}

/** The position to store for a canvas point `p` on a node that sits in group `parentId` (or on the canvas). */
export function toFrame(p: Point, parentId: string | undefined, byId: ReadonlyMap<string, Framed>): Point {
  const parent = parentId ? byId.get(parentId) : undefined;
  if (!parent) return { ...p };
  const origin = canvasPosition(parent, byId);
  return { x: p.x - origin.x, y: p.y - origin.y };
}

/**
 * Runs `change` on the nodes with canvas positions, then stores each moved node's new position back in its own
 * frame. Nodes `change` did not move keep their stored position, so a shape in a group that moved moves with it.
 * For position-only changes such as align and auto-layout, which compare and set positions across groups. Pure.
 */
export function inCanvasFrame<N extends Framed>(nodes: N[], change: (canvas: N[]) => N[]): N[] {
  if (!nodes.some((n) => n.parentId)) return change(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const before = new Map(nodes.map((n) => [n.id, canvasPosition(n, byId)]));
  const changed = change(nodes.map((n) => ({ ...n, position: before.get(n.id)! })));
  const after = new Map(changed.map((n) => [n.id, n]));
  const moved = (id: string) => {
    const a = after.get(id)?.position;
    const b = before.get(id);
    return !!a && !!b && (a.x !== b.x || a.y !== b.y);
  };
  const memo = new Map<string, Point>();
  /** Where a node ends up on the canvas: where `change` put it, or where its (possibly moved) group carries it. */
  const finalCanvas = (id: string, seen: Set<string>): Point => {
    const known = memo.get(id);
    if (known) return known;
    const orig = byId.get(id)!;
    const parent = orig.parentId && byId.has(orig.parentId) && !seen.has(orig.parentId) ? orig.parentId : undefined;
    let p: Point;
    if (moved(id)) p = after.get(id)!.position;
    else if (parent) {
      const o = finalCanvas(parent, new Set(seen).add(id));
      p = { x: o.x + orig.position.x, y: o.y + orig.position.y };
    } else p = orig.position;
    memo.set(id, p);
    return p;
  };
  return changed.map((n) => {
    const orig = byId.get(n.id);
    if (!orig) return n;
    if (!moved(n.id)) return { ...n, position: orig.position };
    const parent = orig.parentId && byId.has(orig.parentId) ? orig.parentId : undefined;
    const target = after.get(n.id)!.position;
    const origin = parent ? finalCanvas(parent, new Set([n.id])) : { x: 0, y: 0 };
    return { ...n, position: { x: target.x - origin.x, y: target.y - origin.y } };
  });
}
