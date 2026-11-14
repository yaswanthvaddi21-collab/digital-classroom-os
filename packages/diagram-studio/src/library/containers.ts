import { canvasPosition, parentsFirst, toFrame } from '../model';
import type { ShapeNode } from '../types';
import { CONTAINER_KINDS, POOL_BAND } from './kinds';

/*
 * Containers (BPMN pools and lanes, UML system boundaries) hold the shapes dropped into them: a shape whose centre
 * lands inside one becomes its child (React Flow parent node, `parentId`), so it moves with the container; dragged
 * out, it leaves. Pure functions; the editor calls them after a drag or a drop (library/editorActions.ts).
 */

export const isContainer = (n: { data: { shape: string } }) => CONTAINER_KINDS.has(n.data.shape);

/** Whether a container of kind `container` may hold a shape of kind `child`: pools never nest, lanes go in pools. */
export function canContain(container: string, child: string): boolean {
  if (!CONTAINER_KINDS.has(container) || child === 'bpmnPool') return false;
  if (child === 'bpmnLane') return container === 'bpmnPool';
  if (child === 'umlBoundary') return container === 'bpmnPool' || container === 'bpmnLane';
  return true;
}

const sizeOf = (n: ShapeNode) => ({ w: n.width ?? n.measured?.width ?? 160, h: n.height ?? n.measured?.height ?? 70 });

/** Ids of a node and everything inside it (at any depth). */
export function withDescendants(id: string, nodes: ShapeNode[]): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) if (n.parentId && out.has(n.parentId) && !out.has(n.id)) out.add(n.id), (grew = true);
  }
  return out;
}

/** How many containers deep a node is. */
const depthOf = (n: ShapeNode, byId: ReadonlyMap<string, ShapeNode>) => {
  let d = 0;
  const seen = new Set([n.id]);
  for (let p = n.parentId ? byId.get(n.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) seen.add(p.id), d++;
  return d;
};

/**
 * The container that would take `node` if its centre were at canvas point `at`: the innermost (then topmost) visible,
 * unlocked container holding the point that may hold this kind and is not the node or inside it.
 */
export function containerAt(nodes: ShapeNode[], node: Pick<ShapeNode, 'id' | 'data'>, at: { x: number; y: number }): ShapeNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const excluded = byId.has(node.id) ? withDescendants(node.id, nodes) : new Set([node.id]);
  let best: ShapeNode | undefined;
  let bestDepth = -1;
  nodes.forEach((c) => {
    if (!isContainer(c) || c.hidden || c.locked || excluded.has(c.id) || !canContain(c.data.shape, node.data.shape)) return;
    const p = canvasPosition(c, byId);
    const { w, h } = sizeOf(c);
    if (at.x < p.x || at.x > p.x + w || at.y < p.y || at.y > p.y + h) return;
    const d = depthOf(c, byId);
    // Later nodes are drawn on top, so among equals the last one wins.
    if (d >= bestDepth) {
      best = c;
      bestDepth = d;
    }
  });
  return best;
}

/**
 * After the shapes `ids` were dragged or dropped: each one whose centre is now inside a container joins it, and one
 * dragged out of its container leaves it; its place on the canvas does not change. Shapes inside an ordinary group
 * (made with Group) stay in it, and a shape moved together with its container stays inside it. Returns `nodes`
 * itself when nothing changes.
 */
export function settleIntoContainers(nodes: ShapeNode[], ids: string[]): ShapeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const moving = new Set(ids);
  const changes = new Map<string, ShapeNode>();
  for (const id of ids) {
    const n = byId.get(id);
    if (!n || n.locked) continue;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent && (!isContainer(parent) || moving.has(parent.id))) continue;
    const p = canvasPosition(n, byId);
    const { w, h } = sizeOf(n);
    const centre = { x: p.x + w / 2, y: p.y + h / 2 };
    const target = containerAt(nodes, n, centre);
    if ((target?.id ?? undefined) === (parent?.id ?? undefined)) continue;
    // A shape nudged inside its own container stays in it, even when that container is locked (containerAt skips
    // locked containers so nothing new joins them); it leaves only for a container inside its own.
    if (parent && isContainer(parent)) {
      const pp = canvasPosition(parent, byId);
      const ps = sizeOf(parent);
      const inside = centre.x >= pp.x && centre.x <= pp.x + ps.w && centre.y >= pp.y && centre.y <= pp.y + ps.h;
      if (inside && (!target || !withDescendants(parent.id, nodes).has(target.id))) continue;
    }
    const { parentId: _old, ...rest } = n;
    const position = toFrame(p, target?.id, byId);
    changes.set(id, { ...rest, position: { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 }, ...(target ? { parentId: target.id } : {}) } as ShapeNode);
  }
  if (!changes.size) return nodes;
  return parentsFirst(nodes.map((n) => changes.get(n.id) ?? n));
}

/**
 * Adds a lane to the pool that holds (or is) `selected`, at the bottom; the pool grows to fit and every lane is made
 * the pool's width. A pool without lanes first gets one lane around what it already holds, then the new one.
 * Pure: returns the whole new node list and the new lane's id, or null when `selectedId` is not a pool or a lane in one.
 */
export function addLaneTo(nodes: ShapeNode[], selectedId: string, newId: () => string, laneDefaults: { style: ShapeNode['data']; height: number }): { nodes: ShapeNode[]; laneId: string } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sel = byId.get(selectedId);
  if (!sel) return null;
  const pool = sel.data.shape === 'bpmnPool' ? sel : sel.data.shape === 'bpmnLane' && sel.parentId && byId.get(sel.parentId)?.data.shape === 'bpmnPool' ? byId.get(sel.parentId)! : undefined;
  if (!pool) return null;
  const { w: poolW, h: poolH } = sizeOf(pool);
  const band = POOL_BAND;
  const laneW = Math.max(40, poolW - band);
  const lanes = nodes.filter((n) => n.parentId === pool.id && n.data.shape === 'bpmnLane').sort((a, b) => a.position.y - b.position.y);
  const added: ShapeNode[] = [];
  const replaced = new Map<string, ShapeNode>();
  const lane = (y: number, h: number, label: string): ShapeNode => ({
    id: newId(),
    type: 'shape',
    parentId: pool.id,
    position: { x: band, y },
    width: laneW,
    height: h,
    data: { ...laneDefaults.style, label },
    ...(pool.layer ? { layer: pool.layer } : {}),
  });
  let bottom: number;
  if (!lanes.length) {
    // The pool's current contents go into a first lane covering the whole pool.
    const first = lane(0, poolH, 'Lane 1');
    added.push(first);
    for (const n of nodes)
      if (n.parentId === pool.id) replaced.set(n.id, { ...n, parentId: first.id, position: { x: n.position.x - band, y: n.position.y } });
    bottom = poolH;
  } else {
    for (const l of lanes) replaced.set(l.id, { ...l, position: { x: band, y: l.position.y }, width: laneW });
    bottom = Math.max(...lanes.map((l) => l.position.y + sizeOf(l).h));
  }
  const h = lanes.length ? sizeOf(lanes[lanes.length - 1]).h : laneDefaults.height;
  const created = lane(bottom, h, `Lane ${lanes.length + (lanes.length ? 1 : 2)}`);
  added.push(created);
  replaced.set(pool.id, { ...pool, height: Math.max(poolH, bottom + h) });
  // Lanes go right after the pool's existing children so they are painted under shapes added later.
  const out: ShapeNode[] = [];
  for (const n of nodes) {
    out.push(replaced.get(n.id) ?? n);
    if (n.id === pool.id) out.push(...added);
  }
  return { nodes: parentsFirst(out), laneId: created.id };
}
