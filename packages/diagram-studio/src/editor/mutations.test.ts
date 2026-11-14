/**
 * Mutations on shapes inside groups (Phase 5 R1 fix): a shape in a group stores its position relative to the group,
 * while drop points, quick-connect placement and alignment work on the canvas. Each test failed before the fix.
 */
import type { ReactFlowInstance } from '@xyflow/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { canvasPosition, inCanvasFrame } from '../model';
import { placeNew, quickObstacles } from '../quickConnectGeometry';
import { DEFAULT_CONNECTOR, shapeDefaults, type Connector, type DiagramSettings, type ShapeNode } from '../types';
import { alignNodes, canvasBoxOf, createMutations } from './mutations';
import type { DiagramState } from './useDiagramState';

beforeAll(() => {
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
});

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const shape = (id: string, x: number, y: number, extra: Partial<ShapeNode> = {}): ShapeNode => ({
  id,
  type: 'shape',
  position: { x, y },
  width: 120,
  height: 60,
  data: { ...style, shape: 'rectangle', label: id },
  ...extra,
});

/** Group at (300,200) holding child `c` at (10,10), i.e. (310,210) on the canvas; `b` on the canvas. */
const world = (selected: string[], b = { x: 600, y: 0 }): ShapeNode[] =>
  [
    shape('g', 300, 200, { width: 400, height: 240, data: { ...style, shape: 'group', label: '' } }),
    shape('c', 10, 10, { parentId: 'g' }),
    shape('b', b.x, b.y),
  ].map((n) => ({ ...n, selected: selected.includes(n.id) }));

function harness(initial: ShapeNode[], edges: Connector[] = []) {
  let nodes = initial;
  let es = edges;
  const settings: DiagramSettings = { snapToGrid: false, showGrid: true, autoLayout: 'none' };
  const state = {
    readOnly: false,
    nodes,
    edges: es,
    settings,
    selectedNodes: nodes.filter((n) => n.selected),
    selectedEdges: es.filter((e) => e.selected),
    setNodes: (u: ShapeNode[] | ((ns: ShapeNode[]) => ShapeNode[])) => void (nodes = typeof u === 'function' ? u(nodes) : u),
    setEdges: (u: Connector[] | ((e: Connector[]) => Connector[])) => void (es = typeof u === 'function' ? u(es) : u),
    setSettings: () => {},
    setEditingId: () => {},
    snapshot: () => {},
    recordInspectorChange: () => {},
  } as unknown as DiagramState;
  const rf = {
    screenToFlowPosition: (p: { x: number; y: number }) => p,
    flowToScreenPosition: (p: { x: number; y: number }) => p,
    setCenter: async () => true,
    getZoom: () => 1,
    fitView: async () => true,
    deleteElements: async () => ({ deletedNodes: [], deletedEdges: [] }),
  } as unknown as ReactFlowInstance<ShapeNode, Connector>;
  const m = createMutations({ state, rf, toast: () => {}, wrapper: { current: null }, clipboard: { current: null } });
  return { m, nodes: () => nodes, edges: () => es };
}

const added = (before: ShapeNode[], after: ShapeNode[]) => after.find((n) => !before.some((b) => b.id === n.id))!;
const onCanvas = (n: ShapeNode, all: ShapeNode[]) => canvasPosition(n, new Map(all.map((x) => [x.id, x])));

describe('quick connect from a shape inside a group', () => {
  it('a drag to empty canvas creates the shape where it was dropped, inside the same group', () => {
    const before = world(['c']);
    const h = harness(before);
    h.m.quickDrop('right', null, { x: 900, y: 600 });
    const n = added(before, h.nodes());
    expect(n.parentId).toBe('g');
    // Centred on the drop point on the canvas (120×60, the source's size), stored relative to the group.
    expect(onCanvas(n, h.nodes())).toEqual({ x: 840, y: 570 });
    expect(n.position).toEqual({ x: 540, y: 370 });
  });

  it('an arrow click places the new shape beside the child on the canvas, not at its relative position', () => {
    const before = world(['c']);
    const h = harness(before);
    h.m.quickCreate('right');
    const n = added(before, h.nodes());
    expect(n.parentId).toBe('g');
    const byId = new Map(before.map((x) => [x.id, x]));
    // Round 3: the group holding the child is not an obstacle (the new shape joins it, right beside the child).
    const expected = placeNew(canvasBoxOf(before[1], byId), 'right', { width: 120, height: 60 }, quickObstacles(before, 'c').map((x) => canvasBoxOf(x, byId)));
    expect(onCanvas(n, h.nodes())).toEqual(expected);
    expect(expected.x).toBeGreaterThan(310 + 120);
    expect(expected.y).toBe(210);
  });

  it('dropping onto a shape picks the connection points that face each other on the canvas', () => {
    // On the canvas b (100,215) is left of c (310,210); in c's own frame (10,10) it would look to the right.
    const before = world(['c'], { x: 100, y: 215 });
    const h = harness(before);
    h.m.quickDrop('left', 'b', { x: 150, y: 240 });
    expect(h.edges()).toHaveLength(1);
    expect(h.edges()[0]).toMatchObject({ source: 'c', target: 'b', sourceHandle: 'l', targetHandle: 'r' });
  });
});

describe('Enter (add sibling) on a shape inside a group', () => {
  it('puts the sibling next to the shape, in the same group', () => {
    const before = world(['c']);
    const h = harness(before);
    h.m.addSibling();
    const n = added(before, h.nodes());
    expect(n.parentId).toBe('g');
    const { width, height } = shapeDefaults('rectangle');
    // Centre 1.5 widths + 40 to the right of the shape's corner, on the canvas (same rule as outside a group).
    expect(onCanvas(n, h.nodes())).toEqual({ x: Math.round(310 + 120 * 1.5 + 40 - width / 2), y: Math.round(210 + 30 - height / 2) });
  });

  it('outside a group nothing changes', () => {
    const before = world(['b']);
    const h = harness(before);
    h.m.addSibling();
    const n = added(before, h.nodes());
    expect(n.parentId).toBeUndefined();
    const { width, height } = shapeDefaults('rectangle');
    expect(n.position).toEqual({ x: Math.round(600 + 180 + 40 - width / 2), y: Math.round(30 - height / 2) });
  });
});

describe('align across groups', () => {
  it('lines a child up with a top-level shape on the canvas', () => {
    const top = alignNodes(world(['c', 'b']), 'top');
    expect(top.find((n) => n.id === 'c')!.position).toEqual({ x: 10, y: -200 }); // canvas y 0
    expect(top.find((n) => n.id === 'b')!.position).toEqual({ x: 600, y: 0 });
    const left = alignNodes(world(['c', 'b']), 'left');
    expect(left.find((n) => n.id === 'b')!.position).toEqual({ x: 310, y: 0 });
    expect(left.find((n) => n.id === 'c')!.position).toEqual({ x: 10, y: 10 });
    expect(left.find((n) => n.id === 'g')!.position).toEqual({ x: 300, y: 200 }); // not selected, not moved
  });

  it('a group and its child selected together both land on the line', () => {
    const out = alignNodes(world(['g', 'c', 'b']), 'right');
    const all = out;
    // Right edges: g 700, c 430, b 720 → all at 720 on the canvas.
    for (const id of ['g', 'c', 'b']) {
      const n = all.find((x) => x.id === id)!;
      expect(onCanvas(n, all).x + (n.width ?? 0)).toBe(720);
    }
  });

  it('leaves diagrams without groups exactly as before', () => {
    const flat = [shape('a', 0, 0, { selected: true }), shape('b', 50, 100, { selected: true, width: 200 })];
    expect(alignNodes(flat, 'right').map((n) => n.position)).toEqual([{ x: 130, y: 0 }, { x: 50, y: 100 }]);
  });
});

describe('inCanvasFrame', () => {
  it('a child that the change did not move rides along with its moved group', () => {
    const out = inCanvasFrame(world([]), (ns) => ns.map((n) => (n.id === 'g' ? { ...n, position: { x: 0, y: 0 } } : n)));
    expect(out.find((n) => n.id === 'g')!.position).toEqual({ x: 0, y: 0 });
    expect(out.find((n) => n.id === 'c')!.position).toEqual({ x: 10, y: 10 });
  });

  it('survives a parent loop without hanging', () => {
    const loop = [shape('x', 5, 5, { parentId: 'y' }), shape('y', 7, 7, { parentId: 'x' })];
    const out = inCanvasFrame(loop, (ns) => ns.map((n) => ({ ...n, position: { x: 0, y: 0 } })));
    expect(out).toHaveLength(2);
  });
});

describe('select all (Ctrl+A)', () => {
  it('selects only the shapes that are drawn, so Delete and Duplicate never reach hidden ones', () => {
    const before = [shape('a', 0, 0), shape('h', 0, 100, { hidden: true }), shape('b', 0, 200)];
    const h = harness(before);
    h.m.selectAll();
    expect(h.nodes().filter((n) => n.selected).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('auto-layout with a group', () => {
  it('Tab on a child in a group keeps the new child in the group frame under its parent', () => {
    const before = world(['c']);
    const h = harness(before, []);
    h.m.addChild();
    const n = added(before, h.nodes());
    expect(n.parentId).toBe('g');
    expect(onCanvas(n, h.nodes()).y).toBeGreaterThan(210 + 60);
    expect(h.edges()[0]).toMatchObject({ source: 'c', target: n.id, data: DEFAULT_CONNECTOR });
  });
});
