import { addEdge, reconnectEdge, type Connection, type ReactFlowInstance } from '@xyflow/react';
import type { RefObject } from 'react';
import type { EdgePatch, PatchOpts } from '../Inspector';
import { layoutTree, type LayoutDirection } from '../layout';
import { canConnect, facingHandles, HANDLES_FOR, placeNew, quickObstacles, type Box, type Direction } from '../quickConnectGeometry';
import { canvasPosition, inCanvasFrame, toFrame } from '../model';
import { DEFAULT_LABELS } from '../shapes';
import { DEFAULT_CONNECTOR, shapeDefaults, styledEdge, type Connector, type DiagramSettings, type ShapeData, type ShapeKind, type ShapeNode } from '../types';
import type { DiagramState, Snapshot } from './useDiagramState';

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : `${Date.now().toString(36)}${(++counter).toString(36)}`}`;

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Lines the selected nodes up on one edge or centre line of their common bounding box, measured on the canvas, so
 * shapes inside groups line up with the ones outside. Pure.
 */
export function alignNodes(nodes: ShapeNode[], kind: AlignKind): ShapeNode[] {
  return inCanvasFrame(nodes, (canvas) => alignOnCanvas(canvas, kind));
}

function alignOnCanvas(nodes: ShapeNode[], kind: AlignKind): ShapeNode[] {
  const selected = nodes.filter((n) => n.selected);
  const box = selected.map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }));
  const minX = Math.min(...box.map((b) => b.x));
  const maxX = Math.max(...box.map((b) => b.x + b.w));
  const minY = Math.min(...box.map((b) => b.y));
  const maxY = Math.max(...box.map((b) => b.y + b.h));
  return nodes.map((n) => {
    if (!n.selected) return n;
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    const p = { ...n.position };
    if (kind === 'left') p.x = minX;
    if (kind === 'center') p.x = (minX + maxX) / 2 - w / 2;
    if (kind === 'right') p.x = maxX - w;
    if (kind === 'top') p.y = minY;
    if (kind === 'middle') p.y = (minY + maxY) / 2 - h / 2;
    if (kind === 'bottom') p.y = maxY - h;
    return { ...n, position: p };
  });
}

/**
 * Copies of `src` (nodes and the connectors between them) for paste and duplicate: new ids, moved by `offset`,
 * selected. Group links survive the copy: a copied child of a copied group points at the copy; a child copied without
 * its group is placed where it was on the canvas, outside any group. Bend points move with their connector. Pure.
 */
export function copyForPaste(src: Snapshot, all: ShapeNode[], offset: number, id: (prefix: string) => string = newId): { nodes: ShapeNode[]; edges: Connector[] } {
  const ids = new Map(src.nodes.map((n) => [n.id, id('n')]));
  const byId = new Map(all.map((n) => [n.id, n]));
  const absolute = (n: ShapeNode) => canvasPosition(n, byId);
  const nodes = src.nodes.map((n) => {
    const keepParent = !!n.parentId && ids.has(n.parentId);
    const { parentId: _parentId, ...rest } = n;
    // Children keep their place inside a copied group; everything else moves by the offset.
    const at = keepParent ? n.position : absolute(n);
    const position = keepParent ? at : { x: at.x + offset, y: at.y + offset };
    return { ...rest, id: ids.get(n.id)!, position, selected: true, ...(keepParent ? { parentId: ids.get(n.parentId!)! } : {}) };
  });
  const edges = src.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const waypoints = e.data?.waypoints?.map((p) => ({ x: p.x + offset, y: p.y + offset }));
      return { ...e, id: id('e'), source: ids.get(e.source)!, target: ids.get(e.target)!, selected: false, ...(waypoints ? { data: { ...e.data!, waypoints } } : {}) };
    });
  return { nodes, edges };
}

/** A connector without a label stores no label position (@phase5:connect: it would keep the diagram at schema 3). */
function withoutLabelPlace<D extends { labelPosition?: number }>(data: D, label: unknown): D {
  if (label || data.labelPosition === undefined) return data;
  const { labelPosition: _p, ...rest } = data;
  return rest as D;
}

/** Style and look a new shape takes from the one it is made from: not its text, link, tooltip or properties. */
export function inheritedData(d: ShapeData): ShapeData {
  const { link: _link, tooltip: _tooltip, properties: _properties, ...rest } = d;
  return { ...rest, label: '' };
}

/** A new shape made from `model` goes into the same group and layer, so positions stay in the same frame. */
const placement = (model: ShapeNode) => ({ ...(model.parentId ? { parentId: model.parentId } : {}), ...(model.layer ? { layer: model.layer } : {}) });

/** The box a node occupies in its own frame (relative to its group, if it is in one). */
export const boxOf = (n: ShapeNode): Box => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.width ?? n.measured?.width ?? 160, height: n.height ?? n.measured?.height ?? 70 });

/** The box a node occupies on the canvas, for placement and quick connect across groups. */
export const canvasBoxOf = (n: ShapeNode, byId: ReadonlyMap<string, ShapeNode>): Box => ({ ...boxOf(n), ...canvasPosition(n, byId) });

export interface MutationDeps {
  state: DiagramState;
  rf: ReactFlowInstance<ShapeNode, Connector>;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  wrapper: RefObject<HTMLDivElement | null>;
  clipboard: RefObject<Snapshot | null>;
}

/**
 * Every change the editor can make to the diagram. Rebuilt on each render (they read the current state), and each
 * one returns early when the diagram is read-only (audit DS-1) and records an undo step before changing anything.
 */
export function createMutations({ state, rf, toast, wrapper, clipboard }: MutationDeps) {
  const { readOnly, nodes, edges, settings, selectedNodes, selectedEdges, setNodes, setEdges, setSettings, setEditingId, snapshot, recordInspectorChange } = state;
  const lineType = settings.connector ?? 'smoothstep';
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const canvasBox = (n: ShapeNode) => canvasBoxOf(n, byId);

  const editLabel = (id: string | null) => setEditingId(readOnly ? null : id);
  const changeSettings = (update: (s: DiagramSettings) => DiagramSettings) => !readOnly && setSettings(update);

  const viewCenter = () => {
    const r = wrapper.current?.getBoundingClientRect();
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
  };

  /**
   * New shape centred on canvas point `at` (default: the middle of the view). With `model`, it joins the model's
   * group and layer, and its stored position is converted into that group's frame.
   */
  const addShape = (shape: ShapeKind, at?: { x: number; y: number }, model?: ShapeNode) => {
    if (readOnly) return;
    const { width, height, ...style } = shapeDefaults(shape);
    const c = at ?? viewCenter();
    const topLeft = { x: Math.round(c.x - width / 2), y: Math.round(c.y - height / 2) };
    const node: ShapeNode = {
      id: newId('n'),
      type: 'shape',
      position: model?.parentId ? toFrame(topLeft, model.parentId, byId) : topLeft,
      width,
      height,
      selected: true,
      data: { ...style, label: shape === 'text' ? 'Text' : (DEFAULT_LABELS[shape] ?? '') },
      ...(model ? placement(model) : {}),
    };
    snapshot();
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    setEditingId(node.id);
  };

  /** Auto-layout measured on the canvas, so shapes inside groups are placed in the same frame as the rest. */
  const relayout = (ns: ShapeNode[], es: Connector[], dir: LayoutDirection) => {
    let laidEdges = es;
    const laidNodes = inCanvasFrame(ns, (canvas) => {
      const laid = layoutTree(canvas, es, dir);
      laidEdges = laid.edges;
      return laid.nodes;
    });
    return { nodes: laidNodes, edges: laidEdges };
  };

  const applyLayout = (dir: LayoutDirection) => {
    if (readOnly) return;
    if (!edges.length) {
      toast('Connect shapes first — auto-layout arranges connected trees', 'info');
      return;
    }
    snapshot();
    const laid = relayout(nodes, edges, dir);
    setNodes(laid.nodes);
    setEdges(laid.edges);
    setSettings((s) => ({ ...s, autoLayout: dir }));
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.2 }));
  };

  const addChild = (parentId?: string) => {
    const parent = nodes.find((n) => n.id === (parentId ?? (selectedNodes.length === 1 ? selectedNodes[0].id : '')));
    if (!parent || readOnly) return;
    const dir = settings.autoLayout === 'LR' ? 'LR' : 'TB';
    const childEdges = edges.filter((e) => e.source === parent.id);
    const childCount = childEdges.length;
    // New children match their siblings' look; the first child copies the parent.
    const model = nodes.find((n) => n.id === childEdges[0]?.target) ?? parent;
    const w = model.width ?? 160;
    const h = model.height ?? 70;
    const child: ShapeNode = {
      id: newId('n'),
      type: 'shape',
      position: dir === 'TB' ? { x: parent.position.x + childCount * (w + 40), y: parent.position.y + h + 80 } : { x: parent.position.x + w + 80, y: parent.position.y + childCount * (h + 30) },
      width: w,
      height: h,
      selected: true,
      data: inheritedData(model.data),
      ...placement(parent),
    };
    const edge = styledEdge({
      id: newId('e'),
      source: parent.id,
      target: child.id,
      sourceHandle: dir === 'TB' ? 'b' : 'r',
      targetHandle: dir === 'TB' ? 't' : 'l',
      type: 'smoothstep',
      data: { ...DEFAULT_CONNECTOR },
    });
    snapshot();
    let ns = [...nodes.map((n) => ({ ...n, selected: false })), child];
    let es = [...edges, edge];
    if (settings.autoLayout !== 'none') ({ nodes: ns, edges: es } = relayout(ns, es, settings.autoLayout));
    setNodes(ns);
    setEdges(es);
    setEditingId(child.id);
  };

  const addSibling = () => {
    if (selectedNodes.length !== 1) return;
    const parentEdge = edges.find((e) => e.target === selectedNodes[0].id);
    if (parentEdge) addChild(parentEdge.source);
    else {
      const n = selectedNodes[0];
      const p = canvasPosition(n, byId);
      addShape(n.data.shape, { x: p.x + (n.width ?? 160) * 1.5 + 40, y: p.y + (n.height ?? 70) / 2 }, n);
    }
  };

  const pasteSnapshot = (src: Snapshot, offset: number) => {
    if (!src.nodes.length || readOnly) return;
    const { nodes: copies, edges: copiedEdges } = copyForPaste(src, nodes, offset);
    snapshot();
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...copies]);
    setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...copiedEdges]);
  };

  const duplicate = () => pasteSnapshot({ nodes: selectedNodes, edges }, 30);
  const copy = () => {
    if (selectedNodes.length) clipboard.current = { nodes: selectedNodes, edges: edges.filter((e) => selectedNodes.some((n) => n.id === e.source) && selectedNodes.some((n) => n.id === e.target)) };
  };
  const paste = () => clipboard.current && pasteSnapshot(clipboard.current, 40);
  const deleteSelected = () => void (!readOnly && rf.deleteElements({ nodes: selectedNodes, edges: selectedEdges }));
  /** Every shape the user can see: hidden shapes are not drawn, so Delete or Duplicate must not reach them. */
  const selectAll = () => setNodes((ns) => ns.map((n) => (!!n.selected === !n.hidden ? n : { ...n, selected: !n.hidden })));

  const align = (kind: AlignKind) => {
    if (selectedNodes.length < 2 || readOnly) return;
    snapshot();
    setNodes((ns) => alignNodes(ns, kind));
  };

  const patchNodes = (patch: Partial<ShapeData>, opts: PatchOpts) => {
    if (readOnly || !Object.keys(patch).length) return;
    const keys = Object.keys(patch) as Array<keyof ShapeData>;
    if (selectedNodes.every((n) => keys.every((k) => n.data[k] === patch[k]))) return; // nothing would change
    recordInspectorChange(opts);
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const patchEdges = (patch: EdgePatch, opts: PatchOpts) => {
    if (readOnly || !Object.keys(patch).length) return;
    recordInspectorChange(opts);
    setEdges((es) =>
      es.map((e) =>
        e.selected
          ? styledEdge({
              ...e,
              ...(patch.type ? { type: patch.type } : {}),
              ...(patch.label !== undefined ? { label: patch.label || undefined } : {}),
              data: withoutLabelPlace({ ...DEFAULT_CONNECTOR, ...e.data, ...patch.data }, patch.label !== undefined ? patch.label : e.label),
            })
          : e,
      ),
    );
  };

  // ── React Flow handlers ──────────────────────────────────────────────────
  const onConnect = (c: Connection) => {
    if (readOnly) return;
    snapshot();
    setEdges((es) => addEdge(styledEdge({ ...c, id: newId('e'), type: lineType, data: { ...DEFAULT_CONNECTOR } }), es));
  };

  const onReconnect = (oldEdge: Connector, c: Connection) => {
    if (readOnly) return;
    snapshot();
    setEdges((es) => reconnectEdge(oldEdge, c, es));
  };

  // ── Quick connect (draw.io-style blue arrows) ─────────────────────────────
  /** Pans (keeping the zoom) so a box is fully on screen, as diagrams.net does after quick-connect creates a shape. */
  const ensureVisible = (box: Box) => {
    requestAnimationFrame(() => {
      const r = wrapper.current?.getBoundingClientRect();
      if (!r) return;
      const tl = rf.flowToScreenPosition({ x: box.x, y: box.y });
      const br = rf.flowToScreenPosition({ x: box.x + box.width, y: box.y + box.height });
      const margin = 24;
      if (tl.x >= r.left + margin && tl.y >= r.top + margin && br.x <= r.right - margin && br.y <= r.bottom - margin) return;
      void rf.setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom: rf.getZoom(), duration: 250 });
    });
  };

  /** New shape beside the selected one, connected to it, and selected. One undo step covers both. */
  const quickCreate = (dir: Direction, shape?: ShapeKind, at?: { x: number; y: number }) => {
    const source = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    if (!source || readOnly) return;
    const defaults = shape ? shapeDefaults(shape) : null;
    const width = defaults?.width ?? source.width ?? 160;
    const height = defaults?.height ?? source.height ?? 70;
    const data: ShapeData = defaults
      ? { ...(({ width: _w, height: _h, ...style }) => style)(defaults), label: DEFAULT_LABELS[defaults.shape] ?? '' }
      : inheritedData(source.data);
    // Placed on the canvas (`at` is a canvas point), then stored in the frame of the group the source is in.
    const onCanvas = at
      ? { x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2) }
      : placeNew(canvasBox(source), dir, { width, height }, quickObstacles(nodes, source.id).map(canvasBox)); // @phase5: not the lane or group it is in
    const position = source.parentId ? toFrame(onCanvas, source.parentId, byId) : onCanvas;
    const node: ShapeNode = { id: newId('n'), type: 'shape', position, width, height, selected: true, data, ...placement(source) };
    const handles = at ? facingHandles(canvasBox(source), { id: node.id, ...onCanvas, width, height }) : { sourceHandle: HANDLES_FOR[dir].source, targetHandle: HANDLES_FOR[dir].target };
    snapshot();
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
    setEdges((es) => [...es.map((e) => (e.selected ? { ...e, selected: false } : e)), styledEdge({ id: newId('e'), source: source.id, target: node.id, ...handles, type: lineType, data: { ...DEFAULT_CONNECTOR } })]);
    ensureVisible({ id: node.id, ...onCanvas, width, height });
  };

  /** Arrow dragged onto a shape (connect, if allowed) or onto empty canvas (new connected shape there). */
  const quickDrop = (dir: Direction, targetId: string | null, at: { x: number; y: number }) => {
    const source = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    if (!source || readOnly) return;
    if (!targetId) return quickCreate(dir, undefined, at);
    const check = canConnect(edges, new Set(nodes.map((n) => n.id)), source.id, targetId);
    if (!check.ok) {
      toast(check.reason === 'duplicate' ? 'These shapes are already connected.' : check.reason === 'self' ? 'A shape cannot be connected to itself.' : 'That shape no longer exists.', 'info');
      return;
    }
    const target = nodes.find((n) => n.id === targetId)!;
    snapshot();
    setEdges((es) => [...es, styledEdge({ id: newId('e'), source: source.id, target: targetId, ...facingHandles(canvasBox(source), canvasBox(target)), type: lineType, data: { ...DEFAULT_CONNECTOR } })]);
  };

  const fitView = () => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.2 });

  return {
    lineType,
    editLabel,
    changeSettings,
    addShape,
    applyLayout,
    addChild,
    addSibling,
    pasteSnapshot,
    duplicate,
    copy,
    paste,
    deleteSelected,
    selectAll,
    align,
    patchNodes,
    patchEdges,
    onConnect,
    onReconnect,
    quickCreate,
    quickDrop,
    fitView,
  };
}

export type Mutations = ReturnType<typeof createMutations>;
