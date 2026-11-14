/** G-SHAPES: shapes join and leave BPMN pools, lanes and UML system boundaries; Add lane. */
import { describe, expect, it } from 'vitest';
import { redirectDrag, redirectSelection } from '../editor/canvasModel';
import { canvasPosition } from '../model';
import { shapeDefaults, type ShapeKind, type ShapeNode } from '../types';
import { addLaneTo, canContain, containerAt, settleIntoContainers } from './containers';

const shape = (id: string, kind: ShapeKind, x: number, y: number, w: number, h: number, extra: Partial<ShapeNode> = {}): ShapeNode => {
  const { width: _w, height: _h, ...style } = shapeDefaults(kind);
  return { id, type: 'shape', position: { x, y }, width: w, height: h, data: { ...style, label: id }, ...extra };
};

/** A pool at (100, 100) with two lanes; a task in the first lane and one on the canvas. */
function bpmn(): ShapeNode[] {
  return [
    shape('pool', 'bpmnPool', 100, 100, 630, 400),
    shape('l1', 'bpmnLane', 30, 0, 600, 200, { parentId: 'pool' }),
    shape('l2', 'bpmnLane', 30, 200, 600, 200, { parentId: 'pool' }),
    shape('t1', 'bpmnTask', 50, 50, 140, 80, { parentId: 'l1' }),
    shape('free', 'bpmnTask', 900, 100, 140, 80),
  ];
}
const byId = (ns: ShapeNode[]) => new Map(ns.map((n) => [n.id, n]));
const at = (ns: ShapeNode[], id: string) => canvasPosition(byId(ns).get(id)!, byId(ns));
const move = (ns: ShapeNode[], id: string, position: { x: number; y: number }) => ns.map((n) => (n.id === id ? { ...n, position } : n));

describe('containers', () => {
  it('who may hold what: pools never nest, lanes only in pools', () => {
    expect(canContain('bpmnPool', 'bpmnLane')).toBe(true);
    expect(canContain('bpmnLane', 'bpmnLane')).toBe(false);
    expect(canContain('bpmnPool', 'bpmnPool')).toBe(false);
    expect(canContain('bpmnLane', 'bpmnTask')).toBe(true);
    expect(canContain('umlBoundary', 'ellipse')).toBe(true);
    expect(canContain('umlBoundary', 'bpmnLane')).toBe(false);
    expect(canContain('rectangle', 'bpmnTask')).toBe(false);
    expect(canContain('group', 'bpmnTask')).toBe(false);
  });

  it('finds the innermost container under a point, skipping the shape itself, hidden and locked ones', () => {
    const ns = bpmn();
    expect(containerAt(ns, ns[4], { x: 200, y: 150 })?.id).toBe('l1');
    expect(containerAt(ns, ns[4], { x: 200, y: 450 })?.id).toBe('l2');
    expect(containerAt(ns, ns[4], { x: 110, y: 150 })?.id).toBe('pool'); // the pool's title band
    expect(containerAt(ns, ns[4], { x: 50, y: 50 })).toBeUndefined();
    expect(containerAt(ns, ns[1], { x: 200, y: 450 })?.id).toBe('pool'); // a lane cannot go in a lane
    expect(containerAt(ns, ns[0], { x: 200, y: 150 })).toBeUndefined(); // nor a pool in itself or its lanes
    expect(containerAt(ns.map((n) => (n.id === 'l2' ? { ...n, hidden: true } : n)), ns[4], { x: 200, y: 450 })?.id).toBe('pool');
    expect(containerAt(ns.map((n) => (n.id === 'l2' ? { ...n, locked: true } : n)), ns[4], { x: 200, y: 450 })?.id).toBe('pool');
  });

  it('a task dragged into the other lane joins it and keeps its place on the canvas', () => {
    const ns = bpmn();
    const dragged = move(ns, 't1', { x: 50, y: 260 }); // still stored relative to l1; now over l2
    const before = at(dragged, 't1');
    const out = settleIntoContainers(dragged, ['t1']);
    const t1 = out.find((n) => n.id === 't1')!;
    expect(t1.parentId).toBe('l2');
    expect(t1.position).toEqual({ x: 50, y: 60 });
    expect(at(out, 't1')).toEqual(before);
  });

  it('a task dragged out of the pool leaves it; a free task dropped in a lane joins it', () => {
    let ns = move(bpmn(), 't1', { x: 50, y: 600 });
    ns = settleIntoContainers(ns, ['t1']);
    expect(ns.find((n) => n.id === 't1')!.parentId).toBeUndefined();
    expect(ns.find((n) => n.id === 't1')!.position).toEqual({ x: 180, y: 700 });
    ns = move(ns, 'free', { x: 400, y: 120 });
    ns = settleIntoContainers(ns, ['free']);
    const free = ns.find((n) => n.id === 'free')!;
    expect(free.parentId).toBe('l1');
    expect(free.position).toEqual({ x: 270, y: 20 });
    // React Flow needs parents before children: the lane comes before the task.
    expect(ns.findIndex((n) => n.id === 'l1')).toBeLessThan(ns.findIndex((n) => n.id === 'free'));
  });

  it('changes nothing when nothing moves between containers', () => {
    const ns = bpmn();
    expect(settleIntoContainers(ns, ['t1', 'free', 'missing'])).toBe(ns);
  });

  it('leaves shapes inside ordinary groups alone, and a shape moved with its container stays in it', () => {
    const group = shape('g', 'group', 300, 300, 200, 100);
    const child = shape('c', 'rounded', 1000, 1000, 50, 50, { parentId: 'g' });
    const ns = [...bpmn(), group, child];
    expect(settleIntoContainers(ns, ['c'])).toBe(ns);
    // Dragging the lane and its task together: the task stays in the lane.
    expect(settleIntoContainers(ns, ['l1', 't1'])).toBe(ns);
    // A group dropped on a lane joins it as a whole.
    const out = settleIntoContainers(move(ns, 'g', { x: 200, y: 330 }), ['g']);
    expect(out.find((n) => n.id === 'g')!.parentId).toBe('l2');
    expect(out.find((n) => n.id === 'c')!.parentId).toBe('g');
  });

  it('locked shapes do not change container', () => {
    const ns = move(bpmn(), 't1', { x: 50, y: 600 }).map((n) => (n.id === 't1' ? { ...n, locked: true } : n));
    expect(settleIntoContainers(ns, ['t1'])).toBe(ns);
  });
});

describe('Add lane', () => {
  const style = (({ width: _w, height: _h, ...s }) => ({ ...s, label: '' }))(shapeDefaults('bpmnLane'));
  let n = 0;
  const id = () => `new${++n}`;

  it('adds a lane under the last one, the pool grows, and every lane takes the pool width', () => {
    const ns = bpmn().map((x) => (x.id === 'l2' ? { ...x, width: 500 } : x));
    const plan = addLaneTo(ns, 'l1', id, { style, height: 130 })!;
    const lane = plan.nodes.find((x) => x.id === plan.laneId)!;
    expect(lane).toMatchObject({ parentId: 'pool', position: { x: 30, y: 400 }, width: 600, height: 200 });
    expect(lane.data.label).toBe('Lane 3');
    expect(plan.nodes.find((x) => x.id === 'pool')!.height).toBe(600);
    expect(plan.nodes.find((x) => x.id === 'l2')!.width).toBe(600);
    expect(plan.nodes.find((x) => x.id === 't1')).toBe(ns[3]);
    expect(plan.nodes.findIndex((x) => x.id === 'pool')).toBeLessThan(plan.nodes.findIndex((x) => x.id === plan.laneId));
  });

  it('a pool without lanes first gets a lane around what it holds, then the new one', () => {
    const ns = [shape('pool', 'bpmnPool', 0, 0, 630, 250), shape('t', 'bpmnTask', 100, 40, 140, 80, { parentId: 'pool' })];
    const plan = addLaneTo(ns, 'pool', id, { style, height: 130 })!;
    const lanes = plan.nodes.filter((x) => x.data.shape === 'bpmnLane');
    expect(lanes.map((l) => [l.position, l.height, l.data.label])).toEqual([
      [{ x: 30, y: 0 }, 250, 'Lane 1'],
      [{ x: 30, y: 250 }, 130, 'Lane 2'],
    ]);
    const t = plan.nodes.find((x) => x.id === 't')!;
    expect(t.parentId).toBe(lanes[0].id);
    expect(canvasPosition(t, byId(plan.nodes))).toEqual({ x: 100, y: 40 });
    expect(plan.nodes.find((x) => x.id === 'pool')!.height).toBe(380);
  });

  it('needs a pool, or a lane in one', () => {
    expect(addLaneTo(bpmn(), 'free', id, { style, height: 130 })).toBeNull();
    expect(addLaneTo([shape('lone', 'bpmnLane', 0, 0, 600, 100)], 'lone', id, { style, height: 130 })).toBeNull();
  });
});

describe('selection and dragging inside containers (with G-CANVAS group behaviour)', () => {
  it('clicking a shape in a lane selects the shape itself, not the pool (groups still redirect)', () => {
    const ns = bpmn();
    const sel = redirectSelection([{ id: 't1', type: 'select', selected: true }], ns, new Set(), true);
    expect(sel.changes).toEqual([{ id: 't1', type: 'select', selected: true }]);
    const grouped = [...ns, shape('g', 'group', 0, 0, 100, 100), shape('k', 'rounded', 0, 0, 50, 50, { parentId: 'g' })];
    expect(redirectSelection([{ id: 'k', type: 'select', selected: true }], grouped, new Set(), true).changes).toEqual([{ id: 'g', type: 'select', selected: true }]);
  });

  it('dragging a shape in a lane moves the shape, not the pool', () => {
    const ns = bpmn();
    const out = redirectDrag([{ id: 't1', type: 'position', position: { x: 60, y: 70 }, dragging: true }], ns, new Set(), new Map());
    expect(out).toEqual([{ id: 't1', type: 'position', position: { x: 60, y: 70 }, dragging: true }]);
  });
});

describe('locked containers (Round 3)', () => {
  it('a shape nudged inside its locked lane stays in it, and nothing new joins the locked lane', () => {
    const ns = bpmn().map((n) => (n.id === 'l1' ? { ...n, locked: true } : n));
    const nudged = move(ns, 't1', { x: 70, y: 60 });
    expect(settleIntoContainers(nudged, ['t1'])).toBe(nudged);
    // The free task dropped on the locked lane joins the pool around it instead (the lane is not offered).
    const dropped = move(ns, 'free', { x: 300, y: 150 });
    expect(settleIntoContainers(dropped, ['free']).find((n) => n.id === 'free')!.parentId).toBe('pool');
  });

  it('a lane nudged inside its locked pool stays in it', () => {
    const ns = bpmn().map((n) => (n.id === 'pool' ? { ...n, locked: true } : n));
    const nudged = move(ns, 'l2', { x: 30, y: 205 });
    expect(settleIntoContainers(nudged, ['l2'])).toBe(nudged);
  });

  it('dragged out of its locked lane, a shape still leaves it', () => {
    const ns = bpmn().map((n) => (n.id === 'l1' ? { ...n, locked: true } : n));
    const out = settleIntoContainers(move(ns, 't1', { x: 2000, y: 2000 }), ['t1']);
    expect(out.find((n) => n.id === 't1')!.parentId).toBeUndefined();
  });
});
