export type LayoutDirection = 'TB' | 'LR';

interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

interface LayoutEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface LayoutOptions {
  /** Gap between siblings. */
  siblingGap?: number;
  /** Gap between levels. */
  levelGap?: number;
}

/**
 * Tidy tree layout: each subtree gets a band wide enough for its children, and parents sit centred
 * above (TB) or beside (LR) them. Nodes with no connections are left where they are. Cycles are broken
 * at the first revisit. Returns new arrays; inputs are not mutated.
 */
export function layoutTree<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  direction: LayoutDirection = 'TB',
  { siblingGap = 40, levelGap = 80 }: LayoutOptions = {},
): { nodes: N[]; edges: E[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target || hasParent.has(e.target)) continue;
    hasParent.add(e.target);
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }

  const tb = direction === 'TB';
  const size = (id: string) => {
    const n = byId.get(id)!;
    const w = n.width ?? 160;
    const h = n.height ?? 70;
    return tb ? { cross: w, main: h } : { cross: h, main: w };
  };

  // Roots: nodes in a parent/child relation with no parent, in their current visual order.
  const connected = new Set([...children.keys(), ...hasParent]);
  const roots = nodes
    .filter((n) => connected.has(n.id) && !hasParent.has(n.id))
    .sort((a, b) => (tb ? a.position.x - b.position.x : a.position.y - b.position.y))
    .map((n) => n.id);

  const visited = new Set<string>();
  const kids = (id: string) => (children.get(id) ?? []).filter((c) => !visited.has(c));

  // Pass 1: depth of every node and the largest main-axis size per depth.
  const depthOf = new Map<string, number>();
  const levelSize: number[] = [];
  const walkDepth = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    depthOf.set(id, depth);
    levelSize[depth] = Math.max(levelSize[depth] ?? 0, size(id).main);
    for (const c of children.get(id) ?? []) walkDepth(c, depth + 1);
  };
  roots.forEach((r) => walkDepth(r, 0));
  const levelOffset: number[] = [];
  levelSize.forEach((_, i) => (levelOffset[i] = i === 0 ? 0 : levelOffset[i - 1] + levelSize[i - 1] + levelGap));

  // Pass 2: subtree extents along the cross axis.
  visited.clear();
  const extent = new Map<string, number>();
  const tree = new Map<string, string[]>();
  const measure = (id: string): number => {
    visited.add(id);
    const cs = kids(id);
    cs.forEach((c) => visited.add(c));
    tree.set(id, cs);
    const childTotal = cs.reduce((sum, c, i) => sum + measure(c) + (i ? siblingGap : 0), 0);
    const e = Math.max(size(id).cross, childTotal);
    extent.set(id, e);
    return e;
  };
  roots.forEach((r) => !visited.has(r) && measure(r));

  // Pass 3: positions, anchored at the first root's current position so the diagram doesn't jump.
  const anchor = roots.length ? byId.get(roots[0])!.position : { x: 0, y: 0 };
  const placed = new Map<string, { x: number; y: number }>();
  const place = (id: string, start: number) => {
    const s = size(id);
    const cross = start + (extent.get(id)! - s.cross) / 2;
    const main = levelOffset[depthOf.get(id) ?? 0] + (levelSize[depthOf.get(id) ?? 0] - s.main) / 2;
    placed.set(id, tb ? { x: anchor.x + cross, y: anchor.y + main } : { x: anchor.x + main, y: anchor.y + cross });
    const cs = tree.get(id) ?? [];
    const childTotal = cs.reduce((sum, c, i) => sum + extent.get(c)! + (i ? siblingGap : 0), 0);
    let cursor = start + (extent.get(id)! - childTotal) / 2;
    for (const c of cs) {
      place(c, cursor);
      cursor += extent.get(c)! + siblingGap;
    }
  };
  let cursor = 0;
  for (const r of roots) {
    if (!extent.has(r)) continue;
    place(r, cursor);
    cursor += extent.get(r)! + siblingGap * 2;
  }
  // Centre the first root on its old position rather than its band's left edge.
  const firstRoot = roots[0];
  const shift = firstRoot ? { dx: anchor.x - placed.get(firstRoot)!.x, dy: anchor.y - placed.get(firstRoot)!.y } : { dx: 0, dy: 0 };

  const out = nodes.map((n) => {
    const p = placed.get(n.id);
    return p ? { ...n, position: { x: Math.round(p.x + shift.dx), y: Math.round(p.y + shift.dy) } } : n;
  });
  const [srcHandle, tgtHandle] = tb ? ['b', 't'] : ['r', 'l'];
  const outEdges = edges.map((e) => (placed.has(e.source) && placed.has(e.target) ? { ...e, sourceHandle: srcHandle, targetHandle: tgtHandle } : e));
  return { nodes: out, edges: outEdges };
}
