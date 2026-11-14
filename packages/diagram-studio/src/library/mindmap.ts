/**
 * Mind map layouts (Arrange menu): radial (branches all around the central idea) and two-sided (branches to the left
 * and right of it, like a classic mind map). Pure functions on canvas positions; connectors in the map become curved
 * and attach on the sides that face each other.
 */

interface MapNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

interface MapEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
}

export type MindmapStyle = 'radial' | 'two-sided';

export interface MindmapOptions {
  /** Space between neighbouring branches. */
  gap?: number;
  /** Space between a topic and its sub-topics (two-sided) or between rings (radial). */
  levelGap?: number;
}

const sizeOf = (n: MapNode) => ({ w: n.width ?? 160, h: n.height ?? 70 });
const centreOf = (n: MapNode) => {
  const { w, h } = sizeOf(n);
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
};

/** The side of a box facing a point in direction (dx, dy). */
export function facingSide(dx: number, dy: number): 't' | 'r' | 'b' | 'l' {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l';
  return dy >= 0 ? 'b' : 't';
}

/**
 * The map around `rootId`: every shape reachable through connectors (in either direction), each with its children in
 * connector order. Each shape is reached once (the first way found), so cycles cannot loop.
 */
export function mapTree(rootId: string, edges: MapEdge[], ids: ReadonlySet<string>): Map<string, string[]> {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  for (const e of edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue;
    link(e.source, e.target);
    link(e.target, e.source);
  }
  const children = new Map<string, string[]>();
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const kids = (neighbours.get(id) ?? []).filter((k) => !seen.has(k));
    kids.forEach((k) => seen.add(k));
    children.set(id, kids);
    queue.push(...kids);
  }
  return children;
}

/**
 * The shape to arrange around: the selected shape; else, in the largest connected map, the shape the connectors lead
 * away from (no connector ends at it; the one reaching most shapes), or, when every shape has an incoming
 * connector, the shape in the middle of the map (the fewest steps to the farthest shape). Null when nothing is
 * connected.
 */
export function mindmapRoot(nodes: MapNode[], edges: MapEdge[], selectedId?: string): string | null {
  const ids = new Set(nodes.map((n) => n.id));
  if (selectedId && ids.has(selectedId)) return selectedId;
  const valid = edges.filter((e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target));
  const incoming = new Set(valid.map((e) => e.target));
  const out = new Map<string, string[]>();
  for (const e of valid) out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  const reach = (id: string) => {
    const seen = new Set([id]);
    const stack = [id];
    while (stack.length) for (const k of out.get(stack.pop()!) ?? []) if (!seen.has(k)) seen.add(k), stack.push(k);
    return seen.size;
  };
  const height = (id: string) => {
    let depth = 0;
    const tree = mapTree(id, valid, ids);
    const walk = (x: string, d: number): void => {
      depth = Math.max(depth, d);
      (tree.get(x) ?? []).forEach((k) => walk(k, d + 1));
    };
    walk(id, 0);
    return depth;
  };
  let best: string | null = null;
  let bestSize = 0;
  const done = new Set<string>();
  for (const n of nodes) {
    if (done.has(n.id) || !valid.some((e) => e.source === n.id || e.target === n.id)) continue;
    const members = [...mapTree(n.id, valid, ids).keys()];
    members.forEach((id) => done.add(id));
    const sources = members.filter((id) => !incoming.has(id));
    const centre = sources.length
      ? sources.reduce((a, b) => (reach(b) > reach(a) ? b : a))
      : members.reduce((a, b) => (height(b) < height(a) ? b : a));
    if (members.length > bestSize) {
      best = centre;
      bestSize = members.length;
    }
  }
  return best;
}

function leafCounts(rootId: string, children: Map<string, string[]>): Map<string, number> {
  const leaves = new Map<string, number>();
  const count = (id: string): number => {
    const kids = children.get(id) ?? [];
    const n = kids.length ? kids.reduce((s, k) => s + count(k), 0) : 1;
    leaves.set(id, n);
    return n;
  };
  count(rootId);
  return leaves;
}

/** Re-attaches each connector of the map on facing sides and makes it curved. */
function curveEdges<E extends MapEdge>(edges: E[], parentOf: Map<string, string>, centres: Map<string, { x: number; y: number }>): E[] {
  return edges.map((e) => {
    const childIsTarget = parentOf.get(e.target) === e.source;
    const childIsSource = parentOf.get(e.source) === e.target;
    if (!childIsTarget && !childIsSource) return e;
    const a = centres.get(e.source)!;
    const b = centres.get(e.target)!;
    return { ...e, type: 'default', sourceHandle: facingSide(b.x - a.x, b.y - a.y), targetHandle: facingSide(a.x - b.x, a.y - b.y) };
  });
}

/**
 * Arranges the map around `rootId`. The central shape stays where it is; shapes outside the map are not moved.
 * Returns new arrays; inputs are not changed.
 */
export function layoutMindmap<N extends MapNode, E extends MapEdge>(nodes: N[], edges: E[], rootId: string, style: MindmapStyle, { gap = 24, levelGap = 70 }: MindmapOptions = {}): { nodes: N[]; edges: E[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root) return { nodes, edges };
  const children = mapTree(rootId, edges, new Set(byId.keys()));
  if ((children.get(rootId) ?? []).length === 0) return { nodes, edges };
  const parentOf = new Map<string, string>();
  for (const [p, kids] of children) for (const k of kids) parentOf.set(k, p);
  const centres = new Map<string, { x: number; y: number }>();
  const rootCentre = centreOf(root);
  centres.set(rootId, rootCentre);

  if (style === 'radial') radial(rootId, children, byId, rootCentre, centres, gap, levelGap);
  else twoSided(rootId, children, byId, rootCentre, centres, gap, levelGap);

  const outNodes = nodes.map((n) => {
    const c = centres.get(n.id);
    if (!c || n.id === rootId) return n;
    const { w, h } = sizeOf(n);
    return { ...n, position: { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) } };
  });
  const placedCentres = new Map(outNodes.filter((n) => centres.has(n.id)).map((n) => [n.id, centreOf(n)]));
  return { nodes: outNodes, edges: curveEdges(edges, parentOf, placedCentres) };
}

function radial(rootId: string, children: Map<string, string[]>, byId: Map<string, MapNode>, centre: { x: number; y: number }, centres: Map<string, { x: number; y: number }>, gap: number, levelGap: number) {
  const leaves = leafCounts(rootId, children);
  const total = leaves.get(rootId)!;
  const diag = (id: string) => {
    const { w, h } = sizeOf(byId.get(id)!);
    return Math.hypot(w, h);
  };
  const depth = new Map<string, number>([[rootId, 0]]);
  for (const [p, kids] of children) for (const k of kids) depth.set(k, (depth.get(p) ?? 0) + 1);
  const biggest = Math.max(...[...depth.keys()].filter((id) => id !== rootId).map(diag));
  // Rings far enough apart that shapes on neighbouring rings never touch (`biggest` is the largest diagonal).
  const ring = biggest + levelGap * 0.6;
  // Two shapes on one ring are at least one leaf's sector apart: chord 2r·sin(π/total) must clear `biggest + gap`.
  const first = Math.max(diag(rootId) / 2 + biggest / 2 + levelGap, total > 1 ? (biggest + gap) / (2 * Math.sin(Math.PI / total)) : 0);
  const radius = (d: number) => first + (d - 1) * ring;
  const place = (id: string, from: number, to: number) => {
    const d = depth.get(id)!;
    if (d > 0) {
      const a = (from + to) / 2;
      centres.set(id, { x: centre.x + radius(d) * Math.cos(a), y: centre.y + radius(d) * Math.sin(a) });
    }
    let start = from;
    for (const k of children.get(id) ?? []) {
      const span = ((to - from) * leaves.get(k)!) / leaves.get(id)!;
      place(k, start, start + span);
      start += span;
    }
  };
  // Start at the top and go clockwise, so the first branch sits up and to the right.
  place(rootId, -Math.PI / 2, (3 * Math.PI) / 2);
}

function twoSided(rootId: string, children: Map<string, string[]>, byId: Map<string, MapNode>, centre: { x: number; y: number }, centres: Map<string, { x: number; y: number }>, gap: number, levelGap: number) {
  const leaves = leafCounts(rootId, children);
  const branches = children.get(rootId) ?? [];
  // The first branches go right until about half the leaves are there; the rest go left (diagrams.net does the same).
  const half = leaves.get(rootId)! / 2;
  const right: string[] = [];
  const left: string[] = [];
  let acc = 0;
  for (const b of branches) {
    if (right.length === 0 || acc + leaves.get(b)! / 2 <= half) {
      right.push(b);
      acc += leaves.get(b)!;
    } else left.push(b);
  }
  if (!left.length && right.length > 1) left.push(right.pop()!);

  const depth = new Map<string, number>([[rootId, 0]]);
  for (const [p, kids] of children) for (const k of kids) depth.set(k, (depth.get(p) ?? 0) + 1);
  /** Height of a subtree's band. */
  const band = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = children.get(id) ?? [];
    const own = sizeOf(byId.get(id)!).h;
    const sum = kids.reduce((s, k, i) => s + measure(k) + (i ? gap : 0), 0);
    const b = Math.max(own, sum);
    band.set(id, b);
    return b;
  };
  const rootW = sizeOf(byId.get(rootId)!).w;

  const side = (ids: string[], dir: 1 | -1) => {
    if (!ids.length) return;
    ids.forEach(measure);
    // Widest shape at each depth on this side, so each level forms a column.
    const widest = new Map<number, number>();
    const collect = (id: string) => {
      const d = depth.get(id)!;
      widest.set(d, Math.max(widest.get(d) ?? 0, sizeOf(byId.get(id)!).w));
      (children.get(id) ?? []).forEach(collect);
    };
    ids.forEach(collect);
    const columnCentre = new Map<number, number>();
    let edge = rootW / 2 + levelGap;
    for (let d = 1; widest.has(d); d++) {
      columnCentre.set(d, edge + widest.get(d)! / 2);
      edge += widest.get(d)! + levelGap;
    }
    const placeBand = (id: string, top: number) => {
      const d = depth.get(id)!;
      centres.set(id, { x: centre.x + dir * columnCentre.get(d)!, y: top + band.get(id)! / 2 });
      const kids = children.get(id) ?? [];
      const sum = kids.reduce((s, k, i) => s + band.get(k)! + (i ? gap : 0), 0);
      let y = top + (band.get(id)! - sum) / 2;
      for (const k of kids) {
        placeBand(k, y);
        y += band.get(k)! + gap;
      }
    };
    const total = ids.reduce((s, k, i) => s + band.get(k)! + (i ? gap * 2 : 0), 0);
    let y = centre.y - total / 2;
    for (const id of ids) {
      placeBand(id, y);
      y += band.get(id)! + gap * 2;
    }
  };
  side(right, 1);
  side(left, -1);
}
