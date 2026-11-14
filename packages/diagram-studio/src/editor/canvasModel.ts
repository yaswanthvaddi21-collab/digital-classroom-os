/**
 * Canvas operations of Phase 5 (G-CANVAS), as pure functions on the editor's nodes: groups, locks, layers, z-order,
 * distribute, the system-clipboard payload, and how React Flow's changes are redirected so a group behaves like one
 * object (diagrams.net: the first click selects the group, a second click the shape inside it). No React here; the
 * hook in useCanvas.ts wires these into the editor.
 */
import type { NodeChange, NodeDimensionChange, NodePositionChange, NodeSelectionChange } from '@xyflow/react';
import { canvasPosition, inCanvasFrame, toFrame, type DiagramLayer, type Point } from '../model';
import { DEFAULT_SETTINGS, deserializeDiagram, DIAGRAM_SCHEMA, diagramSchemaOf, serializeDiagram, shapeDefaults, type Connector, type DiagramSettings, type ShapeNode } from '../types';

type ById = ReadonlyMap<string, ShapeNode>;
export const byIdOf = (nodes: readonly ShapeNode[]): Map<string, ShapeNode> => new Map(nodes.map((n) => [n.id, n]));
const sizeOf = (n: ShapeNode) => ({ w: n.width ?? n.measured?.width ?? 160, h: n.height ?? n.measured?.height ?? 70 });
export const isGroup = (n: ShapeNode | undefined) => n?.data.shape === 'group';

/** The groups a node sits in, outermost first. A missing parent or a loop ends the chain. */
export function ancestorsOf(n: ShapeNode, byId: ById): ShapeNode[] {
  const out: ShapeNode[] = [];
  const seen = new Set<string>([n.id]);
  for (let p = n.parentId ? byId.get(n.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
    seen.add(p.id);
    out.unshift(p);
  }
  return out;
}

/** `ids` and every node inside them (at any depth). */
export function withDescendantIds(ids: Iterable<string>, nodes: readonly ShapeNode[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  const out = new Set<string>();
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    children.get(id)?.forEach(visit);
  };
  [...ids].forEach(visit);
  return out;
}

/** Selected nodes that are not inside another selected node: what an operation on "the selection" acts on. */
export function topSelected(nodes: readonly ShapeNode[]): ShapeNode[] {
  const byId = byIdOf(nodes);
  return nodes.filter((n) => n.selected && !ancestorsOf(n, byId).some((a) => a.selected));
}

/** Stored order with every parent before its children, keeping sibling order (the order React Flow and saving need). */
export function flattenTree(nodes: readonly ShapeNode[]): ShapeNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string | undefined, ShapeNode[]>();
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : undefined;
    children.set(key, [...(children.get(key) ?? []), n]);
  }
  const out: ShapeNode[] = [];
  const placed = new Set<string>();
  const visit = (n: ShapeNode) => {
    if (placed.has(n.id)) return;
    placed.add(n.id);
    out.push(n);
    children.get(n.id)?.forEach(visit);
  };
  children.get(undefined)?.forEach(visit);
  nodes.forEach(visit); // anything left (a loop) keeps its place at the end
  return out;
}

// ── Groups ───────────────────────────────────────────────────────────────

/**
 * Puts the selected shapes (two or more) into a new group, sized to their bounds on the canvas. Shapes keep their
 * place on the canvas. The group goes where the first of them was in the stacking order, inside their common group
 * if they share one, and becomes the selection. Returns null when fewer than two shapes are selected.
 */
export function groupSelection(nodes: readonly ShapeNode[], groupId: string): ShapeNode[] | null {
  const roots = topSelected(nodes).filter((n) => !n.hidden);
  if (roots.length < 2) return null;
  const byId = byIdOf(nodes);
  const parents = new Set(roots.map((n) => n.parentId ?? ''));
  const common = parents.size === 1 ? roots[0].parentId : undefined;
  const boxes = roots.map((n) => ({ n, p: canvasPosition(n, byId), ...sizeOf(n) }));
  const minX = Math.min(...boxes.map((b) => b.p.x));
  const minY = Math.min(...boxes.map((b) => b.p.y));
  const maxX = Math.max(...boxes.map((b) => b.p.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.p.y + b.h));
  const layers = new Set(roots.map((n) => n.layer ?? ''));
  const layer = layers.size === 1 ? roots[0].layer : roots[roots.length - 1].layer;
  const { width: _w, height: _h, ...style } = shapeDefaults('group');
  const group: ShapeNode = {
    id: groupId,
    type: 'shape',
    position: common ? toFrame({ x: minX, y: minY }, common, byId) : { x: minX, y: minY },
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    selected: true,
    data: { ...style, label: '' },
    ...(common ? { parentId: common } : {}),
    ...(layer ? { layer } : {}),
  };
  const moved = new Map(boxes.map((b) => [b.n.id, { x: b.p.x - minX, y: b.p.y - minY }]));
  const first = nodes.findIndex((n) => moved.has(n.id));
  const out = nodes.map((n) => {
    const position = moved.get(n.id);
    if (position) return { ...n, parentId: groupId, position, selected: false };
    return n.selected ? { ...n, selected: false } : n;
  });
  out.splice(first, 0, group);
  return flattenTree(out);
}

/**
 * Dissolves every selected group: its shapes move to the group's own frame (keeping their place on the canvas) and
 * become the selection. Returns the nodes and the ids of the removed groups (connectors to them are removed by the
 * caller), or null when no group is selected.
 */
export function ungroupSelection(nodes: readonly ShapeNode[]): { nodes: ShapeNode[]; removed: string[] } | null {
  // A locked group stays a group until it is unlocked.
  const groups = nodes.filter((n) => n.selected && isGroup(n) && !n.locked).map((n) => n.id);
  if (!groups.length) return null;
  let out = [...nodes];
  for (const id of groups) {
    const g = out.find((n) => n.id === id);
    if (!g) continue;
    out = out
      .filter((n) => n.id !== id)
      .map((n) =>
        n.parentId === id
          ? (({ parentId: _p, ...rest }) => ({ ...rest, ...(g.parentId ? { parentId: g.parentId } : {}), position: { x: g.position.x + n.position.x, y: g.position.y + n.position.y }, selected: true }))(n)
          : n,
      );
  }
  return { nodes: out, removed: groups };
}

/**
 * Fits groups to their shapes again (diagrams.net groups are always exactly the bounds of what they hold): after a
 * shape inside one was moved or resized. Works from the innermost group outwards. Shapes keep their canvas place.
 */
export function fitGroups(nodes: readonly ShapeNode[], groupIds: Iterable<string>): ShapeNode[] {
  const byId = byIdOf(nodes);
  const todo = new Set<string>();
  for (const id of groupIds) {
    const g = byId.get(id);
    if (!g) continue;
    for (const n of [g, ...ancestorsOf(g, byId)]) if (isGroup(n)) todo.add(n.id);
  }
  if (!todo.size) return nodes as ShapeNode[];
  const depth = (id: string) => ancestorsOf(byId.get(id)!, byId).length;
  const work = new Map(nodes.map((n) => [n.id, n]));
  for (const id of [...todo].sort((a, b) => depth(b) - depth(a))) {
    const g = work.get(id)!;
    if (g.locked) continue; // a locked group keeps its size
    const kids = [...work.values()].filter((n) => n.parentId === id);
    if (!kids.length) continue;
    const minX = Math.min(...kids.map((k) => k.position.x));
    const minY = Math.min(...kids.map((k) => k.position.y));
    const maxX = Math.max(...kids.map((k) => k.position.x + sizeOf(k).w));
    const maxY = Math.max(...kids.map((k) => k.position.y + sizeOf(k).h));
    const { w, h } = sizeOf(g);
    if (minX === 0 && minY === 0 && maxX === w && maxY === h) continue;
    work.set(id, { ...g, position: { x: g.position.x + minX, y: g.position.y + minY }, width: maxX - minX, height: maxY - minY });
    for (const k of kids) work.set(k.id, { ...k, position: { x: k.position.x - minX, y: k.position.y - minY } });
  }
  return nodes.map((n) => work.get(n.id)!);
}

// ── Locks ────────────────────────────────────────────────────────────────

/** Locks or unlocks the selected shapes. Unlocking stores nothing (the field is absent when false). */
export function setLocked(nodes: readonly ShapeNode[], locked: boolean): ShapeNode[] {
  return nodes.map((n) => {
    if (!n.selected || !!n.locked === locked) return n;
    if (locked) return { ...n, locked: true };
    const { locked: _l, ...rest } = n;
    return rest;
  });
}

// ── Distribute and z-order ───────────────────────────────────────────────

export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * Spaces three or more shapes evenly between the outermost two (equal gaps between them), measured on the canvas so
 * shapes inside groups and outside line up. Only `ids` move. Pure.
 */
export function distributeNodes(nodes: readonly ShapeNode[], ids: ReadonlySet<string>, axis: DistributeAxis): ShapeNode[] {
  return inCanvasFrame([...nodes], (canvas) => {
    const sel = canvas.filter((n) => ids.has(n.id));
    if (sel.length < 3) return canvas;
    const x = axis === 'horizontal';
    const start = (n: ShapeNode) => (x ? n.position.x : n.position.y);
    const len = (n: ShapeNode) => (x ? sizeOf(n).w : sizeOf(n).h);
    const sorted = [...sel].sort((a, b) => start(a) - start(b) || a.id.localeCompare(b.id));
    const first = start(sorted[0]);
    const end = Math.max(...sorted.map((n) => start(n) + len(n)));
    const gap = (end - first - sorted.reduce((s, n) => s + len(n), 0)) / (sorted.length - 1);
    const placed = new Map<string, number>();
    let at = first;
    for (const n of sorted) {
      placed.set(n.id, Math.round(at * 10) / 10);
      at += len(n) + gap;
    }
    // The last shape stays where it ends (rounding aside), the first where it starts.
    return canvas.map((n) => (placed.has(n.id) ? { ...n, position: x ? { ...n.position, x: placed.get(n.id)! } : { ...n.position, y: placed.get(n.id)! } } : n));
  });
}

export type ZOrderOp = 'front' | 'back' | 'forward' | 'backward';

/**
 * Changes the stacking order of `ids` among the shapes that share their group (or the canvas): to the front or back,
 * or one step. The order is the stored order (which is also the paint order); an explicit `zIndex` on those shapes is
 * folded into it and removed. Returns the nodes unchanged when nothing moves. Pure.
 */
export function zOrderNodes(nodes: readonly ShapeNode[], ids: ReadonlySet<string>, op: ZOrderOp): ShapeNode[] {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const known = new Set(nodes.map((n) => n.id));
  const families = new Map<string, ShapeNode[]>();
  for (const n of nodes) {
    const key = n.parentId && known.has(n.parentId) ? n.parentId : '';
    families.set(key, [...(families.get(key) ?? []), n]);
  }
  const out = [...nodes];
  let changed = false;
  for (const siblings of families.values()) {
    if (!siblings.some((n) => ids.has(n.id))) continue;
    const current = [...siblings].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || index.get(a.id)! - index.get(b.id)!);
    const sel = (n: ShapeNode) => ids.has(n.id);
    let next: ShapeNode[];
    if (op === 'front') next = [...current.filter((n) => !sel(n)), ...current.filter(sel)];
    else if (op === 'back') next = [...current.filter(sel), ...current.filter((n) => !sel(n))];
    else {
      next = [...current];
      const step = op === 'forward' ? -1 : 1;
      const from = op === 'forward' ? next.length - 2 : 1;
      for (let i = from; i >= 0 && i < next.length; i += step) {
        const j = i - step; // the neighbour it passes
        if (sel(next[i]) && !sel(next[j])) [next[i], next[j]] = [next[j], next[i]];
      }
    }
    const hadZ = siblings.some((n) => n.zIndex !== undefined);
    if (!hadZ && next.every((n, i) => n === current[i])) continue;
    changed = true;
    const slots = siblings.map((n) => index.get(n.id)!).sort((a, b) => a - b);
    next.forEach((n, i) => {
      const { zIndex: _z, ...rest } = n;
      out[slots[i]] = hadZ ? rest : n;
    });
  }
  return changed ? flattenTree(out) : (nodes as ShapeNode[]);
}

// ── Layers ───────────────────────────────────────────────────────────────

/** The layers a diagram shows in the Layers panel: its own, or the one implicit layer everything is on. */
export const IMPLICIT_LAYER: DiagramLayer = { id: 'layer-1', name: 'Layer 1', visible: true, locked: false };
export const layersOrImplicit = (layers: DiagramLayer[] | undefined): DiagramLayer[] => (layers?.length ? layers : [IMPLICIT_LAYER]);

/**
 * The layer a node is on: its own; else (with `byId`) the layer of the nearest group or container it sits in that
 * names one (a shape inside a group is on the group's layer, as in diagrams.net); else the first (bottom) layer.
 * A layer id that does not exist counts as none.
 */
export function layerIdOf(n: ShapeNode, layers: readonly DiagramLayer[], byId?: ById): string {
  const known = (id: string | undefined): id is string => !!id && layers.some((l) => l.id === id);
  if (known(n.layer)) return n.layer;
  if (byId) {
    const seen = new Set<string>([n.id]);
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
      seen.add(p.id);
      if (known(p.layer)) return p.layer;
    }
  }
  return layers[0].id;
}

/** Every node names its layer explicitly (as `layers` places it), so reordering or removing a layer cannot move shapes. */
function pinLayers(nodes: readonly ShapeNode[], layers: readonly DiagramLayer[]): ShapeNode[] {
  const byId = byIdOf(nodes);
  return nodes.map((n) => {
    const id = layerIdOf(n, layers, byId);
    return n.layer === id ? n : { ...n, layer: id };
  });
}

/**
 * Stored form of a layer change: with only one visible, unlocked layer left the diagram has no layers again (so it
 * can be saved as schema 2 if nothing else needs 3); otherwise every node names its layer. Shapes are placed by the
 * layers as they were before the change (`previous`), so a shape that named no layer stays on the layer it was on
 * when the layers are reordered.
 */
export function normalizeLayers(
  nodes: readonly ShapeNode[],
  layers: DiagramLayer[],
  previous: readonly DiagramLayer[] = layers,
): { nodes: ShapeNode[]; layers: DiagramLayer[] | undefined } {
  if (layers.length === 1 && layers[0].visible && !layers[0].locked) {
    return { nodes: nodes.map((n) => (n.layer === undefined ? n : (({ layer: _l, ...rest }) => rest)(n))), layers: undefined };
  }
  return { nodes: pinLayers(previous.length ? pinLayers(nodes, previous) : [...nodes], layers), layers };
}

export function addLayer(layers: DiagramLayer[] | undefined, id: string): DiagramLayer[] {
  const all = layersOrImplicit(layers);
  const used = new Set(all.map((l) => l.name));
  let k = all.length + 1;
  while (used.has(`Layer ${k}`)) k++;
  return [...all, { id, name: `Layer ${k}`, visible: true, locked: false }];
}

/** Moves a layer up (towards the top, drawn over the others) or down. */
export function moveLayer(layers: DiagramLayer[], id: string, dir: 'up' | 'down'): DiagramLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  const j = dir === 'up' ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= layers.length) return layers;
  const out = [...layers];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export const updateLayer = (layers: DiagramLayer[], id: string, patch: Partial<Omit<DiagramLayer, 'id'>>) => layers.map((l) => (l.id === id ? { ...l, ...patch } : l));

/** Whether a layer holds no shapes (only empty layers can be deleted; the last layer never). */
export const layerIsEmpty = (nodes: readonly ShapeNode[], layers: readonly DiagramLayer[], id: string) => {
  const byId = byIdOf(nodes);
  return !nodes.some((n) => layerIdOf(n, layers, byId) === id);
};

/** Puts the selected shapes, and the shapes inside them, on layer `id`. */
export function moveToLayer(nodes: readonly ShapeNode[], id: string): ShapeNode[] {
  const ids = withDescendantIds(
    nodes.filter((n) => n.selected).map((n) => n.id),
    nodes,
  );
  return nodes.map((n) => (ids.has(n.id) && n.layer !== id ? { ...n, layer: id } : n));
}

// ── What React Flow is given ─────────────────────────────────────────────

interface Derived {
  sig: string;
  out: ShapeNode;
}

/**
 * The nodes React Flow draws, derived from the stored ones: hidden layers hidden, locked shapes and shapes on locked
 * layers not draggable or deletable (shapes on locked layers not selectable either, as in diagrams.net), a group that
 * holds a locked shape not deletable, tooltips as the native title, and, once there are groups or several layers, a
 * stacking order (`zIndex`) of layer, then stored order with each group's shapes right above the group. A node
 * that needs none of this is passed through as the same object, and derived nodes are cached per stored node, so
 * React Flow only redraws what changed.
 */
export function renderNodes(nodes: ShapeNode[], layers: DiagramLayer[] | undefined, cache: WeakMap<ShapeNode, Derived>): ShapeNode[] {
  const byId = byIdOf(nodes);
  const layerById = new Map((layers ?? []).map((l, i) => [l.id, { l, i }]));
  const own = (n: ShapeNode) => (layers?.length ? layerById.get(layerIdOf(n, layers, byId))! : undefined);
  const flag = (key: 'hidden' | 'locked') => {
    const memo = new Map<string, boolean>();
    const get = (n: ShapeNode, depth = 0): boolean => {
      const known = memo.get(n.id);
      if (known !== undefined) return known;
      const l = own(n)?.l;
      const mine = key === 'hidden' ? l?.visible === false : l?.locked === true;
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      const v = mine || (!!parent && depth < 64 && get(parent, depth + 1));
      memo.set(n.id, v);
      return v;
    };
    return get;
  };
  const layerHidden = flag('hidden');
  const layerLocked = flag('locked');
  const holdsLocked = new Set<string>();
  for (const n of nodes) if (n.locked) for (const a of ancestorsOf(n, byId)) holdsLocked.add(a.id);
  /** A shape inside a locked group is fixed with it (a group is one object; containers such as lanes are not). */
  const inLockedGroup = (n: ShapeNode) => ancestorsOf(n, byId).some((a) => isGroup(a) && a.locked);

  let rank: Map<string, number> | null = null;
  if (nodes.some((n) => n.parentId) || (layers?.length ?? 0) > 1) {
    rank = new Map();
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const kids = new Map<string | undefined, ShapeNode[]>();
    for (const n of nodes) {
      const key = n.parentId && byId.has(n.parentId) ? n.parentId : undefined;
      kids.set(key, [...(kids.get(key) ?? []), n]);
    }
    const order = (list: ShapeNode[], top: boolean) =>
      [...list].sort((a, b) => (top ? (own(a)?.i ?? 0) - (own(b)?.i ?? 0) : 0) || (a.zIndex ?? 0) - (b.zIndex ?? 0) || index.get(a.id)! - index.get(b.id)!);
    let r = 0;
    const visit = (n: ShapeNode) => {
      if (rank!.has(n.id)) return;
      rank!.set(n.id, r++);
      order(kids.get(n.id) ?? [], false).forEach(visit);
    };
    order(kids.get(undefined) ?? [], true).forEach(visit);
    nodes.forEach(visit);
  }

  return nodes.map((n) => {
    const hidden = !!n.hidden || layerHidden(n);
    const lLocked = layerLocked(n);
    const locked = !!n.locked;
    const zIndex = rank ? rank.get(n.id) : n.zIndex;
    const tooltip = n.data.tooltip;
    const fixed = locked || lLocked || (!!n.parentId && inLockedGroup(n));
    const undeletable = fixed || holdsLocked.has(n.id);
    if (hidden === !!n.hidden && !fixed && !undeletable && !tooltip && zIndex === n.zIndex) return n;
    const sig = `${hidden}|${locked}|${lLocked}|${fixed}|${undeletable}|${tooltip ?? ''}|${zIndex}`;
    const hit = cache.get(n);
    if (hit && hit.sig === sig) return hit.out;
    const out: ShapeNode = {
      ...n,
      hidden,
      ...(zIndex !== undefined ? { zIndex } : {}),
      ...(fixed ? { draggable: false } : {}),
      ...(undeletable ? { deletable: false } : {}),
      ...(lLocked ? { selectable: false } : {}),
      ...(locked ? { className: [n.className, 'dcos-locked'].filter(Boolean).join(' '), ariaLabel: `Locked: ${n.data.label || 'shape'}` } : {}),
      ...(tooltip ? { domAttributes: { title: tooltip } } : {}),
    };
    cache.set(n, { sig, out });
    return out;
  });
}

// ── Redirecting React Flow's changes ─────────────────────────────────────

/**
 * diagrams.net selection in groups: clicking a shape inside a group selects the outermost group not yet "entered";
 * clicking again (while that group is selected) enters it and selects the next level, down to the shape itself.
 * `entered` holds the groups entered by the last selection. With `drill` false (a selection rectangle) nothing is
 * entered: shapes inside groups select their group. Returns the changes to apply and the new `entered`.
 */
export function redirectSelection(
  changes: NodeChange<ShapeNode>[],
  nodes: readonly ShapeNode[],
  entered: ReadonlySet<string>,
  drill: boolean,
  selectable: (id: string) => boolean = () => true,
): { changes: NodeChange<ShapeNode>[]; entered: Set<string> } {
  const selects = changes.filter((c): c is NodeSelectionChange => c.type === 'select');
  if (!selects.length) return { changes, entered: new Set(entered) };
  if (!selects.some((c) => c.selected)) return { changes, entered: new Set() };
  const byId = byIdOf(nodes);
  let nextEntered = new Set<string>(entered);
  const chosen = new Set<string>();
  const out: NodeChange<ShapeNode>[] = [];
  for (const c of changes) {
    if (c.type !== 'select' || !c.selected) {
      out.push(c);
      continue;
    }
    const n = byId.get(c.id);
    if (!n?.parentId) {
      chosen.add(c.id);
      out.push(c);
      continue;
    }
    const walked = new Set<string>();
    let target = c.id;
    // @phase5:shapes (G-SHAPES) — only groups redirect: a shape in a BPMN pool/lane or UML boundary (a container)
    // is selected directly, as in diagrams.net.
    for (const a of ancestorsOf(n, byId).filter(isGroup)) {
      if (!selectable(a.id)) continue;
      if (entered.has(a.id) || (drill && a.selected)) {
        walked.add(a.id);
        continue;
      }
      target = a.id;
      break;
    }
    nextEntered = walked;
    if (!chosen.has(target)) out.push(target === c.id ? c : { id: target, type: 'select', selected: true });
    chosen.add(target);
  }
  // A shape chosen above is not also deselected by the same batch.
  return { changes: out.filter((c) => !(c.type === 'select' && !c.selected && chosen.has(c.id))), entered: nextEntered };
}

/** A drag of a shape inside a group that is carried out on the group instead (diagrams.net moves the whole group). */
export interface DragRedirect {
  target: string;
  /** Where the dragged shape was on the canvas when the drag began. */
  childStart: Point;
  targetStart: Point;
  /** The group's position from the last move: the drag's final change repeats it. */
  last?: Point;
}

/**
 * Dragging a shape inside a group that is not selected and whose group was not entered moves the group (the
 * outermost one not entered) instead. React Flow drags the shape it was given; its position changes are turned into
 * the same movement of the group. `active` remembers each drag from its first change until `dragging` is false.
 */
export function redirectDrag(
  changes: NodeChange<ShapeNode>[],
  nodes: readonly ShapeNode[],
  entered: ReadonlySet<string>,
  active: Map<string, DragRedirect>,
  draggable: (id: string) => boolean = () => true,
  /** Where React Flow has a group on the canvas right now (its store can lag the editor's state by a render). */
  originOf?: (groupId: string) => Point | undefined,
  /**
   * How far the pointer has moved on the canvas since it went down (the editor tracks it). Preferred: React Flow
   * measures the dragged shape against its group while the group moves, which lags by a render on some engines.
   */
  pointerDelta?: () => Point | undefined,
  /** Grid size when snapping is on: the group's position is snapped to it, as React Flow snaps dragged shapes. */
  snap?: number,
): NodeChange<ShapeNode>[] {
  if (!changes.some((c) => c.type === 'position')) return changes;
  const byId = byIdOf(nodes);
  const out: NodeChange<ShapeNode>[] = [];
  for (const c of changes) {
    if (c.type !== 'position' || !c.position) {
      out.push(c);
      continue;
    }
    const n = byId.get(c.id);
    let r = active.get(c.id);
    if (!r && n?.parentId && !n.selected) {
      const outer = ancestorsOf(n, byId).find((a) => isGroup(a) && !entered.has(a.id)); // @phase5:shapes (G-SHAPES) — containers do not redirect drags
      if (outer) r = { target: outer.id, childStart: canvasPosition(n, byId), targetStart: { ...outer.position } };
      if (r) active.set(c.id, r);
    }
    if (!r) {
      out.push(c);
      continue;
    }
    if (c.dragging === false) active.delete(c.id);
    if (!draggable(r.target)) continue; // a locked group does not move
    // React Flow gives the shape's position relative to its group as the group is now (it moves during the drag), so
    // the movement is measured on the canvas: the pointer's movement, not half of it.
    // The drag's last change (dragging false) repeats the shape's position from the last move, measured against the
    // group as it was then; the group has moved since, so measuring it again would add one more step (WebKit, where
    // React has re-rendered by then). It ends where the last move put it.
    let position: Point;
    const delta = pointerDelta?.();
    if (delta) {
      position = { x: r.targetStart.x + delta.x, y: r.targetStart.y + delta.y };
      if (snap) position = { x: Math.round(position.x / snap) * snap, y: Math.round(position.y / snap) * snap };
      r.last = position;
    } else if (c.dragging === false && r.last) position = r.last;
    else {
      const parent = n?.parentId ? byId.get(n.parentId) : undefined;
      const origin = parent ? (originOf?.(parent.id) ?? canvasPosition(parent, byId)) : { x: 0, y: 0 };
      position = { x: r.targetStart.x + origin.x + c.position.x - r.childStart.x, y: r.targetStart.y + origin.y + c.position.y - r.childStart.y };
      r.last = position;
    }
    const change: NodePositionChange = { id: r.target, type: 'position', position, dragging: c.dragging };
    out.push(change);
  }
  return out;
}

/** A group being resized, with the frame of everything inside it at the start. */
export interface GroupResize {
  w: number;
  h: number;
  inside: Map<string, { x: number; y: number; w: number; h: number }>;
}

/**
 * Resizing a group scales what it holds (diagrams.net): every shape inside keeps its relative place and size. React
 * Flow's own corrections of the direct children (it keeps them still when the top or left edge moves) are replaced.
 */
export function scaleGroupResize(changes: NodeChange<ShapeNode>[], nodes: readonly ShapeNode[], active: Map<string, GroupResize>): NodeChange<ShapeNode>[] {
  const resizes = changes.filter((c): c is NodeDimensionChange => c.type === 'dimensions' && c.resizing !== undefined && !!c.dimensions);
  if (!resizes.length) return changes;
  const byId = byIdOf(nodes);
  let out = changes;
  for (const r of resizes) {
    const g = byId.get(r.id);
    if (!isGroup(g)) continue;
    let s = active.get(r.id);
    if (!s) {
      const inside = withDescendantIds([r.id], nodes);
      inside.delete(r.id);
      if (!inside.size) continue;
      const { w, h } = sizeOf(g!);
      s = { w, h, inside: new Map([...inside].map((id) => [id, { ...byId.get(id)!.position, ...(({ w: ww, h: hh }) => ({ w: ww, h: hh }))(sizeOf(byId.get(id)!)) }])) };
      active.set(r.id, s);
    }
    if (r.resizing === false) active.delete(r.id);
    const sx = s.w > 0 ? r.dimensions!.width / s.w : 1;
    const sy = s.h > 0 ? r.dimensions!.height / s.h : 1;
    const scaled: NodeChange<ShapeNode>[] = [];
    for (const [id, b] of s.inside) {
      scaled.push({ id, type: 'position', position: { x: b.x * sx, y: b.y * sy } });
      scaled.push({ id, type: 'dimensions', dimensions: { width: Math.max(1, b.w * sx), height: Math.max(1, b.h * sy) }, setAttributes: true });
    }
    out = [...out.filter((c) => !(c.type === 'position' && s!.inside.has(c.id))), ...scaled];
  }
  return out;
}

/** Groups left with nothing in them by a removal are removed too (an empty group is an invisible box). */
export function removeEmptyGroups(changes: NodeChange<ShapeNode>[], nodes: readonly ShapeNode[]): NodeChange<ShapeNode>[] {
  const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
  if (!removed.size) return changes;
  const extra: NodeChange<ShapeNode>[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of nodes) {
      if (!isGroup(g) || g.locked || removed.has(g.id)) continue;
      const kids = nodes.filter((n) => n.parentId === g.id);
      if (kids.length && kids.every((k) => removed.has(k.id))) {
        removed.add(g.id);
        extra.push({ id: g.id, type: 'remove' });
        grew = true;
      }
    }
  }
  return extra.length ? [...changes, ...extra] : changes;
}

// ── System clipboard ─────────────────────────────────────────────────────

// Phase 6 (CLIPBOARD): the JSON travels in CLIPBOARD_MIME and, for browsers whose async clipboard cannot write custom
// types, inside text/html (CLIPBOARD_HTML_ATTR); other apps get readable text/plain (the shape labels). See
// clipboardForms and readClipboardPayload.
export const CLIPBOARD_FORMAT = 'dcos-diagram-clipboard';
/** The custom clipboard type (pages of this app read it; other apps see the text/plain copy of the same JSON). */
export const CLIPBOARD_MIME = 'application/x-dcos-diagram';

export interface ClipboardPayload {
  format: typeof CLIPBOARD_FORMAT;
  version: 1;
  /** The editor instance that copied, so a paste back into it can use the in-memory copy (which keeps layers). */
  source: string;
  /** Serial of that copy within the editor. */
  serial: number;
  schemaVersion: number;
  nodes: unknown[];
  edges: unknown[];
}

/**
 * The selection as clipboard data: the shapes with everything inside them, the connectors between them, in the
 * stored (validated) form. Shapes whose group is not copied are written at their canvas position, outside any group.
 */
export function toClipboardPayload(nodes: readonly ShapeNode[], edges: readonly Connector[], source: string, serial: number, settings: DiagramSettings): ClipboardPayload | null {
  const ids = withDescendantIds(
    nodes.filter((n) => n.selected).map((n) => n.id),
    nodes,
  );
  if (!ids.size) return null;
  const byId = byIdOf(nodes);
  const picked = nodes
    .filter((n) => ids.has(n.id))
    .map((n) => {
      if (!n.parentId || ids.has(n.parentId)) return n;
      const { parentId: _p, ...rest } = n;
      return { ...rest, position: canvasPosition(n, byId) };
    });
  const content = serializeDiagram(
    picked,
    edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    null,
    settings,
  );
  return { format: CLIPBOARD_FORMAT, version: 1, source, serial, schemaVersion: content.schemaVersion, nodes: content.nodes, edges: content.edges };
}

/** Shown when copied shapes (or a copied document diagram) come from a newer version of the app. */
export const NEWER_SHAPES_MESSAGE = 'These shapes were copied from a newer version of Classroom OS. Update the app on this device to paste them.';

/** Reads clipboard text; null when it is not this app's diagram data. Throws a readable error for newer data. */
export function parseClipboardPayload(text: string | null | undefined): (ClipboardPayload & { diagram: { nodes: ShapeNode[]; edges: Connector[] } }) | null {
  if (!text || !text.includes(CLIPBOARD_FORMAT)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const p = raw as Partial<ClipboardPayload>;
  if (!p || typeof p !== 'object' || p.format !== CLIPBOARD_FORMAT || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return null;
  if (p.version !== 1 || (typeof p.schemaVersion === 'number' && p.schemaVersion > DIAGRAM_SCHEMA)) {
    throw new Error(NEWER_SHAPES_MESSAGE);
  }
  const d = deserializeDiagram({ nodes: p.nodes, edges: p.edges });
  return { ...(p as ClipboardPayload), diagram: { nodes: d.nodes, edges: d.edges } };
}

/** Moves pasted shapes (and the bend points of their connectors) so their bounds are centred on `center`. */
export function centredOn(nodes: ShapeNode[], edges: Connector[], center: Point): { nodes: ShapeNode[]; edges: Connector[] } {
  const ids = new Set(nodes.map((n) => n.id));
  const tops = nodes.filter((n) => !n.parentId || !ids.has(n.parentId));
  if (!tops.length) return { nodes, edges };
  const minX = Math.min(...tops.map((n) => n.position.x));
  const minY = Math.min(...tops.map((n) => n.position.y));
  const maxX = Math.max(...tops.map((n) => n.position.x + sizeOf(n).w));
  const maxY = Math.max(...tops.map((n) => n.position.y + sizeOf(n).h));
  const dx = Math.round(center.x - (minX + maxX) / 2);
  const dy = Math.round(center.y - (minY + maxY) / 2);
  return {
    nodes: nodes.map((n) => (tops.includes(n) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
    edges: edges.map((e) => (e.data?.waypoints ? { ...e, data: { ...e.data, waypoints: e.data.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy })) } } : e)),
  };
}

// ── Phase 6 (CLIPBOARD): readable text for other apps, the HTML carrier, and document diagrams pasted as shapes ──

/** Attribute of the text/html carrier element that holds the clipboard JSON (see clipboardForms). */
export const CLIPBOARD_HTML_ATTR = 'data-dcos-diagram-clipboard';
/** Upper bound for clipboard data this editor reads (the same as a .dcosdiagram file). */
export const CLIPBOARD_MAX_CHARS = 64 * 1024 * 1024;

const oneLine = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Plain text for other apps: each shape's label on its own line (top to bottom, then left to right), then each labelled
 * connector as "From → To: label". Shapes without any text give "[Diagram: n shapes]".
 */
export function clipboardText(payload: Pick<ClipboardPayload, 'nodes' | 'edges'>): string {
  type N = { id?: unknown; parentId?: unknown; position?: { x?: unknown; y?: unknown }; data?: { label?: unknown } };
  type E = { source?: unknown; target?: unknown; label?: unknown };
  const nodes = (payload.nodes as N[]).filter((n) => n && typeof n === 'object');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  // Canvas position: positions inside a copied group are relative to it.
  const at = (n: N, depth = 0): { x: number; y: number } => {
    const p = { x: num(n.position?.x), y: num(n.position?.y) };
    const parent = depth < 50 && typeof n.parentId === 'string' ? byId.get(n.parentId) : undefined;
    if (!parent) return p;
    const q = at(parent, depth + 1);
    return { x: p.x + q.x, y: p.y + q.y };
  };
  const label = (n: N | undefined) => oneLine(n?.data?.label);
  const lines = nodes
    .map((n) => ({ text: label(n), ...at(n) }))
    .filter((l) => l.text)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => l.text);
  for (const e of payload.edges as E[]) {
    const text = oneLine(e?.label);
    if (!text) continue;
    const from = label(byId.get(e.source)) || 'shape';
    const to = label(byId.get(e.target)) || 'shape';
    lines.push(`${from} → ${to}: ${text}`);
  }
  if (lines.length) return lines.join('\n');
  const count = nodes.length;
  return `[Diagram: ${count} ${count === 1 ? 'shape' : 'shapes'}]`;
}

/**
 * What a copy puts on the clipboard: the JSON (for CLIPBOARD_MIME), readable text (text/plain) and HTML that shows the
 * same text in other apps and carries the JSON in CLIPBOARD_HTML_ATTR for pages of this app whose browser cannot
 * write a custom clipboard type (Safari's async clipboard).
 */
export function clipboardForms(payload: ClipboardPayload): { json: string; text: string; html: string } {
  const json = JSON.stringify(payload);
  const text = clipboardText(payload);
  const paragraphs = text
    .split('\n')
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('');
  return { json, text, html: `<div ${CLIPBOARD_HTML_ATTR}="${escapeHtml(json)}">${paragraphs}</div>` };
}

/** Clipboard data by type; a type that cannot be read gives ''. */
export type ClipboardGetter = (type: string) => string;

const parseHtml = (html: string): Document | null => {
  if (!html || html.length > CLIPBOARD_MAX_CHARS || typeof DOMParser === 'undefined') return null;
  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
};

/**
 * Copied shapes from any clipboard form: CLIPBOARD_MIME, the text/html carrier, or text/plain JSON (what earlier
 * versions wrote). Null when the clipboard holds no shapes; throws NEWER_SHAPES_MESSAGE for data from a newer version.
 */
export function readClipboardPayload(get: ClipboardGetter): ReturnType<typeof parseClipboardPayload> {
  const capped = (t: string) => (t && t.length <= CLIPBOARD_MAX_CHARS ? t : '');
  const direct = parseClipboardPayload(capped(get(CLIPBOARD_MIME)));
  if (direct) return direct;
  const html = get('text/html');
  if (html && html.includes(CLIPBOARD_HTML_ATTR)) {
    const carried = parseHtml(html)?.querySelector(`[${CLIPBOARD_HTML_ATTR}]`)?.getAttribute(CLIPBOARD_HTML_ATTR);
    const p = parseClipboardPayload(carried);
    if (p) return p;
  }
  return parseClipboardPayload(capped(get('text/plain')));
}

/** Shown when a copied document diagram has lost its editable data (a picture alone cannot become shapes). */
export const DOCUMENT_DIAGRAM_NO_DATA = "The copied diagram's data is missing, so it can't be pasted as shapes.";

/**
 * Diagrams copied from a document (text/html `figure[data-type=diagram]` with its data in `data-diagram`), as shapes
 * to paste. Several diagrams are placed side by side. Null when the HTML holds no document diagram. Throws
 * NEWER_SHAPES_MESSAGE for a diagram from a newer version and DOCUMENT_DIAGRAM_NO_DATA when none has usable data.
 * The copied data is only read: it is never changed.
 */
export function documentDiagramsFromHtml(html: string | null | undefined): { nodes: ShapeNode[]; edges: Connector[]; count: number } | null {
  if (!html || !html.includes('data-diagram')) return null;
  const figures = [...(parseHtml(html)?.querySelectorAll('figure[data-type="diagram"]') ?? [])];
  if (!figures.length) return null;
  const sources: unknown[] = [];
  for (const f of figures) {
    try {
      const data: unknown = JSON.parse(f.getAttribute('data-diagram') ?? '');
      const source = data && typeof data === 'object' ? (data as { source?: unknown }).source : null;
      if (source && typeof source === 'object' && !Array.isArray(source)) sources.push(source);
    } catch {
      // unusable: counted as missing below
    }
  }
  if (sources.some((s) => diagramSchemaOf(s) > DIAGRAM_SCHEMA)) throw new Error(NEWER_SHAPES_MESSAGE);
  const nodes: ShapeNode[] = [];
  const edges: Connector[] = [];
  let count = 0;
  let right: number | null = null;
  let top = 0;
  sources.forEach((source, i) => {
    const d = deserializeDiagram(source);
    if (!d.nodes.length) return;
    count++;
    // Ids are made unique per diagram (the paste gives every shape a new id anyway).
    const id = (x: string) => `d${i}-${x}`;
    const ids = new Set(d.nodes.map((n) => n.id));
    let ns = d.nodes.map((n) => ({ ...n, id: id(n.id), selected: false, ...(n.parentId && ids.has(n.parentId) ? { parentId: id(n.parentId) } : {}) }));
    let es = d.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, id: id(e.id), source: id(e.source), target: id(e.target), selected: false }));
    const tops = ns.filter((n) => !n.parentId);
    const minX = Math.min(...tops.map((n) => n.position.x));
    const minY = Math.min(...tops.map((n) => n.position.y));
    const maxX = Math.max(...tops.map((n) => n.position.x + sizeOf(n).w));
    if (right === null) {
      right = maxX;
      top = minY;
    } else {
      // Next to the previous diagram, top-aligned with the first.
      const dx = right + 60 - minX;
      const dy = top - minY;
      ns = ns.map((n) => (n.parentId ? n : { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
      es = es.map((e) => (e.data?.waypoints ? { ...e, data: { ...e.data, waypoints: e.data.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy })) } } : e));
      right = maxX + dx;
    }
    nodes.push(...ns);
    edges.push(...es);
  });
  if (!count) throw new Error(DOCUMENT_DIAGRAM_NO_DATA);
  return { nodes, edges, count };
}

/**
 * Copied shapes as a new diagram to embed in a document (the document's paste of Diagram Studio shapes). Shapes keep
 * their places; layer names are dropped because the new diagram has no layers. Null when the text holds no shapes;
 * throws NEWER_SHAPES_MESSAGE for newer data.
 */
export function diagramFromClipboard(get: ClipboardGetter) {
  const p = readClipboardPayload(get);
  if (!p || !p.diagram.nodes.length) return null;
  const nodes = p.diagram.nodes.map(({ layer: _l, selected: _s, ...n }) => n as ShapeNode);
  return serializeDiagram(nodes, p.diagram.edges.map(({ selected: _s, ...e }) => e as Connector), null, { ...DEFAULT_SETTINGS });
}
