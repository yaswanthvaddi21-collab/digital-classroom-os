/** G-CANVAS model operations: groups, locks, layers, z-order, distribute, change redirection, clipboard payload. */
import type { NodeChange } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { canvasPosition } from '../model';
import { serializeDiagram, type Connector, type DiagramSettings, type ShapeNode } from '../types';
import {
  addLayer,
  centredOn,
  CLIPBOARD_FORMAT,
  distributeNodes,
  fitGroups,
  groupSelection,
  IMPLICIT_LAYER,
  layerIdOf,
  layerIsEmpty,
  moveLayer,
  moveToLayer,
  normalizeLayers,
  parseClipboardPayload,
  redirectDrag,
  redirectSelection,
  removeEmptyGroups,
  renderNodes,
  scaleGroupResize,
  setLocked,
  toClipboardPayload,
  topSelected,
  ungroupSelection,
  zOrderNodes,
  type DragRedirect,
  type GroupResize,
} from './canvasModel';

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const settings: DiagramSettings = { snapToGrid: true, showGrid: true, autoLayout: 'none' };
const shape = (id: string, x: number, y: number, extra: Partial<ShapeNode> = {}): ShapeNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 50, data: { ...style, shape: 'rectangle', label: id }, ...extra });
const groupNode = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ShapeNode> = {}): ShapeNode => ({ ...shape(id, x, y, extra), width: w, height: h, data: { ...style, shape: 'group', label: '', fill: 'transparent', stroke: 'transparent', strokeWidth: 0 } });
const byId = (ns: ShapeNode[]) => new Map(ns.map((n) => [n.id, n]));
const canvasOf = (ns: ShapeNode[], id: string) => canvasPosition(ns.find((n) => n.id === id)!, byId(ns));
const edge = (id: string, source: string, target: string): Connector => ({ id, source, target, sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } });
const save = (ns: ShapeNode[], es: Connector[] = [], layers?: Parameters<typeof serializeDiagram>[4]) => serializeDiagram(ns, es, null, settings, layers);

describe('group and ungroup', () => {
  const flat = () => [shape('a', 100, 100, { selected: true }), shape('b', 300, 220, { selected: true }), shape('c', 600, 0)];

  it('groups the selection at its bounds, keeping every shape where it was on the canvas, and selects the group', () => {
    const out = groupSelection(flat(), 'g')!;
    const g = out.find((n) => n.id === 'g')!;
    expect(g).toMatchObject({ position: { x: 100, y: 100 }, width: 300, height: 170, selected: true, data: { shape: 'group' } });
    expect(out.map((n) => n.id)).toEqual(['g', 'a', 'b', 'c']);
    expect(out.find((n) => n.id === 'a')).toMatchObject({ parentId: 'g', position: { x: 0, y: 0 }, selected: false });
    expect(canvasOf(out, 'b')).toEqual({ x: 300, y: 220 });
    expect(save(out).schemaVersion).toBe(3);
  });

  it('needs two shapes', () => {
    expect(groupSelection([shape('a', 0, 0, { selected: true }), shape('b', 9, 9)], 'g')).toBeNull();
  });

  it('groups shapes inside a group into a nested group, and shapes from different groups at the top level', () => {
    const ns = [groupNode('outer', 50, 50, 500, 300), shape('a', 10, 10, { parentId: 'outer', selected: true }), shape('b', 200, 100, { parentId: 'outer', selected: true }), shape('c', 800, 0)];
    const nested = groupSelection(ns, 'inner')!;
    expect(nested.find((n) => n.id === 'inner')).toMatchObject({ parentId: 'outer', position: { x: 10, y: 10 } });
    expect(canvasOf(nested, 'b')).toEqual({ x: 250, y: 150 });
    const mixed = groupSelection(
      ns.map((n) => (n.id === 'c' ? { ...n, selected: true } : n.id === 'b' ? { ...n, selected: false } : n)),
      'top',
    )!;
    expect(mixed.find((n) => n.id === 'top')!.parentId).toBeUndefined();
    expect(canvasOf(mixed, 'a')).toEqual({ x: 60, y: 60 });
    expect(canvasOf(mixed, 'c')).toEqual({ x: 800, y: 0 });
  });

  it('ungroup puts the shapes back where they were and the diagram is schema 2 again', () => {
    const original = flat();
    const grouped = groupSelection(original, 'g')!;
    const r = ungroupSelection(grouped)!;
    expect(r.removed).toEqual(['g']);
    expect(save(r.nodes)).toEqual(save(original));
    expect(save(r.nodes).schemaVersion).toBe(2);
    expect(r.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(['a', 'b']);
    expect(ungroupSelection(original)).toBeNull();
  });

  it('ungrouping an outer group keeps an inner group and its shapes in place', () => {
    const ns = [groupNode('outer', 50, 50, 500, 300, { selected: true }), groupNode('inner', 10, 10, 300, 200, { parentId: 'outer' }), shape('a', 5, 5, { parentId: 'inner' })];
    const r = ungroupSelection(ns)!;
    expect(r.nodes.find((n) => n.id === 'inner')).toMatchObject({ position: { x: 60, y: 60 } });
    expect(r.nodes.find((n) => n.id === 'inner')!.parentId).toBeUndefined();
    expect(canvasOf(r.nodes, 'a')).toEqual({ x: 65, y: 65 });
  });

  it('a group fits its shapes again after one moved out of its bounds; nothing moves on the canvas', () => {
    const ns = [groupNode('g', 100, 100, 300, 170), shape('a', -40, 0, { parentId: 'g' }), shape('b', 200, 300, { parentId: 'g' })];
    const before = { a: canvasOf(ns, 'a'), b: canvasOf(ns, 'b') };
    const out = fitGroups(ns, ['g']);
    expect(out[0]).toMatchObject({ position: { x: 60, y: 100 }, width: 340, height: 350 });
    expect({ a: canvasOf(out, 'a'), b: canvasOf(out, 'b') }).toEqual(before);
    expect(fitGroups(out, ['g'])).toEqual(out);
  });

  it('topSelected leaves out shapes whose group is selected', () => {
    const ns = [groupNode('g', 0, 0, 10, 10, { selected: true }), shape('a', 0, 0, { parentId: 'g', selected: true }), shape('b', 0, 0, { selected: true })];
    expect(topSelected(ns).map((n) => n.id)).toEqual(['g', 'b']);
  });

  it('removes a group whose last shapes are removed, and nothing else', () => {
    const ns = [groupNode('g', 0, 0, 10, 10), shape('a', 0, 0, { parentId: 'g' }), shape('b', 0, 0, { parentId: 'g' })];
    expect(removeEmptyGroups([{ id: 'a', type: 'remove' }], ns)).toEqual([{ id: 'a', type: 'remove' }]);
    expect(removeEmptyGroups([{ id: 'a', type: 'remove' }, { id: 'b', type: 'remove' }], ns)).toContainEqual({ id: 'g', type: 'remove' });
  });
});

describe('locks', () => {
  it('locks and unlocks the selection; unlocked shapes store nothing, so the diagram goes back to schema 2', () => {
    const ns = [shape('a', 0, 0, { selected: true }), shape('b', 0, 0)];
    const locked = setLocked(ns, true);
    expect(locked[0].locked).toBe(true);
    expect(locked[1]).toBe(ns[1]);
    expect(save(locked).schemaVersion).toBe(3);
    const unlocked = setLocked(locked, false);
    expect(unlocked[0]).not.toHaveProperty('locked');
    expect(save(unlocked)).toEqual(save(ns));
  });
});

describe('distribute', () => {
  it('spaces three or more shapes with equal gaps between the outermost two', () => {
    const ns = [shape('a', 0, 0), shape('b', 120, 30), shape('c', 400, 60, { width: 200 })];
    const out = distributeNodes(ns, new Set(['a', 'b', 'c']), 'horizontal');
    // span 0..600, widths 100+100+200 = 400, two gaps of 100
    expect(out.map((n) => n.position.x)).toEqual([0, 200, 400]);
    expect(out.map((n) => n.position.y)).toEqual([0, 30, 60]);
    const v = distributeNodes([shape('a', 0, 0), shape('b', 0, 10), shape('c', 0, 300)], new Set(['a', 'b', 'c']), 'vertical');
    expect(v.map((n) => n.position.y)).toEqual([0, 150, 300]);
  });

  it('measures on the canvas for shapes inside groups', () => {
    const ns = [groupNode('g', 1000, 0, 400, 100), shape('a', 0, 0), shape('b', 10, 0, { parentId: 'g' }), shape('c', 2000, 0)];
    const out = distributeNodes(ns, new Set(['a', 'b', 'c']), 'horizontal');
    expect(canvasOf(out, 'b').x).toBe(1000);
    expect(out.find((n) => n.id === 'b')!.position.x).toBe(0);
    expect(distributeNodes(ns, new Set(['a', 'b']), 'horizontal')).toEqual(ns);
  });
});

describe('z-order', () => {
  const ids = (ns: ShapeNode[]) => ns.map((n) => n.id).join('');
  const flat = () => ['a', 'b', 'c', 'd'].map((id) => shape(id, 0, 0));
  it('brings to front, sends to back, and moves one step', () => {
    expect(ids(zOrderNodes(flat(), new Set(['b']), 'front'))).toBe('acdb');
    expect(ids(zOrderNodes(flat(), new Set(['c']), 'back'))).toBe('cabd');
    expect(ids(zOrderNodes(flat(), new Set(['b']), 'forward'))).toBe('acbd');
    expect(ids(zOrderNodes(flat(), new Set(['c']), 'backward'))).toBe('acbd');
    expect(ids(zOrderNodes(flat(), new Set(['a', 'b']), 'forward'))).toBe('cabd');
    const same = flat();
    expect(zOrderNodes(same, new Set(['d']), 'front')).toBe(same);
  });

  it('orders shapes among those in the same group, and a group moves with its shapes', () => {
    const ns = [groupNode('g', 0, 0, 10, 10), shape('x', 0, 0, { parentId: 'g' }), shape('y', 0, 0, { parentId: 'g' }), shape('b', 0, 0)];
    expect(ids(zOrderNodes(ns, new Set(['x']), 'front'))).toBe('gyxb');
    expect(ids(zOrderNodes(ns, new Set(['g']), 'front'))).toBe('bgxy');
  });

  it('folds an explicit zIndex into the order and removes it', () => {
    const ns = [shape('a', 0, 0, { zIndex: 5 }), shape('b', 0, 0), shape('c', 0, 0, { zIndex: 1 })];
    const out = zOrderNodes(ns, new Set(['b']), 'forward');
    expect(ids(out)).toBe('cba');
    expect(out.some((n) => n.zIndex !== undefined)).toBe(false);
  });
});

describe('layers', () => {
  it('the first added layer joins the implicit one; every shape then names its layer', () => {
    const layers = addLayer(undefined, 'L2');
    expect(layers).toEqual([IMPLICIT_LAYER, { id: 'L2', name: 'Layer 2', visible: true, locked: false }]);
    const norm = normalizeLayers([shape('a', 0, 0)], layers);
    expect(norm.nodes[0].layer).toBe(IMPLICIT_LAYER.id);
    expect(save(norm.nodes, [], norm.layers).schemaVersion).toBe(3);
  });

  it('one visible, unlocked layer left means no layers again (schema 2)', () => {
    const norm = normalizeLayers([shape('a', 0, 0, { layer: 'L1' })], [{ id: 'L1', name: 'x', visible: true, locked: false }]);
    expect(norm.layers).toBeUndefined();
    expect(norm.nodes[0]).not.toHaveProperty('layer');
    expect(save(norm.nodes, [], norm.layers).schemaVersion).toBe(2);
    // A hidden or locked single layer is kept.
    expect(normalizeLayers([shape('a', 0, 0)], [{ id: 'L1', name: 'x', visible: false, locked: false }]).layers).toHaveLength(1);
  });

  it('reorders, tells empty layers, and moves the selection with its contents', () => {
    const layers = [IMPLICIT_LAYER, { id: 'L2', name: 'Two', visible: true, locked: false }];
    expect(moveLayer(layers, 'L2', 'down').map((l) => l.id)).toEqual(['L2', IMPLICIT_LAYER.id]);
    expect(moveLayer(layers, 'L2', 'up')).toBe(layers);
    const ns = [groupNode('g', 0, 0, 10, 10, { selected: true }), shape('a', 0, 0, { parentId: 'g' }), shape('b', 0, 0)];
    expect(layerIsEmpty(ns, layers, 'L2')).toBe(true);
    expect(layerIsEmpty(ns, layers, IMPLICIT_LAYER.id)).toBe(false);
    const moved = moveToLayer(ns, 'L2');
    expect(moved.map((n) => n.layer)).toEqual(['L2', 'L2', undefined]);
  });
});

describe('what React Flow is given', () => {
  const layers = [
    { id: 'L1', name: 'Base', visible: true, locked: false },
    { id: 'L2', name: 'Top', visible: true, locked: false },
  ];

  it('passes plain shapes through as the same objects', () => {
    const ns = [shape('a', 0, 0), shape('b', 0, 0)];
    const out = renderNodes(ns, undefined, new WeakMap());
    expect(out[0]).toBe(ns[0]);
    expect(out[1]).toBe(ns[1]);
  });

  it('locks: not draggable or deletable, a badge class and a label; a group holding one is not deletable', () => {
    const ns = [groupNode('g', 0, 0, 10, 10), shape('a', 0, 0, { parentId: 'g', locked: true }), shape('b', 0, 0)];
    const [g, a] = renderNodes(ns, undefined, new WeakMap());
    expect(a).toMatchObject({ draggable: false, deletable: false, className: 'dcos-locked', ariaLabel: 'Locked: a' });
    expect(a.selectable).toBeUndefined();
    expect(g.deletable).toBe(false);
    expect(g.draggable).toBeUndefined();
  });

  it('hidden layers hide their shapes and the shapes inside them; locked layers make them unselectable', () => {
    const ns = [groupNode('g', 0, 0, 10, 10, { layer: 'L2' }), shape('a', 0, 0, { parentId: 'g', layer: 'L1' }), shape('b', 0, 0)];
    const hidden = renderNodes(ns, [layers[0], { ...layers[1], visible: false }], new WeakMap());
    expect(hidden.map((n) => !!n.hidden)).toEqual([true, true, false]);
    const locked = renderNodes(ns, [layers[0], { ...layers[1], locked: true }], new WeakMap());
    expect(locked.map((n) => n.selectable)).toEqual([false, false, undefined]);
    expect(locked[0].draggable).toBe(false);
  });

  it('stacks by layer, then stored order, with each group’s shapes right above the group', () => {
    const ns = [shape('top', 0, 0, { layer: 'L2' }), groupNode('g', 0, 0, 10, 10), shape('x', 0, 0, { parentId: 'g' }), shape('b', 0, 0)];
    const z = Object.fromEntries(renderNodes(ns, layers, new WeakMap()).map((n) => [n.id, n.zIndex]));
    expect(z).toEqual({ g: 0, x: 1, b: 2, top: 3 });
  });

  it('shows a tooltip as the native title, and reuses the derived node while nothing changes', () => {
    const ns = [shape('a', 0, 0, { data: { ...style, shape: 'rectangle', label: 'a', tooltip: 'Hello' } })];
    const cache = new WeakMap();
    const first = renderNodes(ns, undefined, cache);
    expect(first[0].domAttributes).toEqual({ title: 'Hello' });
    expect(renderNodes(ns, undefined, cache)[0]).toBe(first[0]);
  });
});

describe('selection in groups (diagrams.net)', () => {
  const ns = (selected: string[] = []) =>
    [groupNode('outer', 0, 0, 500, 300), groupNode('inner', 10, 10, 300, 200, { parentId: 'outer' }), shape('a', 5, 5, { parentId: 'inner' }), shape('b', 400, 0)].map((n) => ({ ...n, selected: selected.includes(n.id) }));
  const sel = (id: string): NodeChange<ShapeNode> => ({ id, type: 'select', selected: true });
  const desel = (id: string): NodeChange<ShapeNode> => ({ id, type: 'select', selected: false });

  it('first click selects the outermost group, each further click one level deeper', () => {
    const one = redirectSelection([sel('a')], ns(), new Set(), true);
    expect(one.changes).toEqual([sel('outer')]);
    const two = redirectSelection([desel('outer'), sel('a')], ns(['outer']), one.entered, true);
    expect(two.changes).toEqual([desel('outer'), sel('inner')]);
    const three = redirectSelection([desel('inner'), sel('a')], ns(['inner']), two.entered, true);
    expect(three.changes).toEqual([desel('inner'), sel('a')]);
    expect([...three.entered].sort()).toEqual(['inner', 'outer']);
  });

  it('keeps entered groups until the selection is cleared', () => {
    const r = redirectSelection([sel('inner')], ns(), new Set(['outer']), true);
    expect(r.changes).toEqual([sel('inner')]);
    expect(redirectSelection([desel('inner')], ns(['inner']), new Set(['outer']), true).entered.size).toBe(0);
  });

  it('a selection rectangle selects groups, never drilling in', () => {
    const r = redirectSelection([sel('outer'), sel('inner'), sel('a'), sel('b')], ns(['outer']), new Set(), false);
    expect(r.changes).toEqual([sel('outer'), sel('b')]);
  });

  it('skips groups that cannot be selected', () => {
    expect(redirectSelection([sel('a')], ns(), new Set(), true, (id) => id !== 'outer').changes).toEqual([sel('inner')]);
  });
});

describe('dragging and resizing groups', () => {
  it('dragging a shape in a group that is not entered moves the group by the same amount', () => {
    const ns = [groupNode('g', 100, 100, 300, 200), shape('a', 10, 10, { parentId: 'g' })];
    const active = new Map<string, DragRedirect>();
    const move = (x: number, y: number, dragging: boolean): NodeChange<ShapeNode> => ({ id: 'a', type: 'position', position: { x, y }, dragging });
    expect(redirectDrag([move(30, 15, true)], ns, new Set(), active)).toEqual([{ id: 'g', type: 'position', position: { x: 120, y: 105 }, dragging: true }]);
    // The group has moved by then: React Flow reports the shape relative to the moved group (pointer moved 60, 60).
    const movedGroup = [{ ...ns[0], position: { x: 120, y: 105 } }, ns[1]];
    expect(redirectDrag([move(50, 65, true)], movedGroup, new Set(), active)).toEqual([{ id: 'g', type: 'position', position: { x: 160, y: 160 }, dragging: true }]);
    // React Flow's last change repeats the last move's position, measured against the group as it was before that
    // move; by then the group is at (160, 160). The group ends where the last move put it, not one step further
    // (the WebKit overshoot: 113 instead of 100).
    const groupAtEnd = [{ ...ns[0], position: { x: 160, y: 160 } }, ns[1]];
    expect(redirectDrag([move(50, 65, false)], groupAtEnd, new Set(), active)).toEqual([{ id: 'g', type: 'position', position: { x: 160, y: 160 }, dragging: false }]);
    expect(active.size).toBe(0);
    // Entered, or selected: the shape itself moves.
    expect(redirectDrag([move(30, 15, true)], ns, new Set(['g']), new Map())).toEqual([move(30, 15, true)]);
    // A locked group does not move.
    expect(redirectDrag([move(30, 15, true)], ns, new Set(), new Map(), (id) => id !== 'g')).toEqual([]);
  });

  it('with the pointer tracked, the group moves exactly as far as the pointer, whatever React Flow measured', () => {
    const ns = [groupNode('g', 100, 100, 300, 200), shape('a', 10, 10, { parentId: 'g' })];
    const active = new Map<string, DragRedirect>();
    let delta = { x: 12.5, y: 6 };
    const move = (x: number, y: number, dragging: boolean): NodeChange<ShapeNode> => ({ id: 'a', type: 'position', position: { x, y }, dragging });
    // React Flow's numbers (relative to a moving group) are ignored; the pointer decides.
    expect(redirectDrag([move(999, 999, true)], ns, new Set(), active, undefined, undefined, () => delta)).toEqual([{ id: 'g', type: 'position', position: { x: 112.5, y: 106 }, dragging: true }]);
    delta = { x: 100, y: 50 };
    expect(redirectDrag([move(-5, -5, false)], ns, new Set(), active, undefined, undefined, () => delta)).toEqual([{ id: 'g', type: 'position', position: { x: 200, y: 150 }, dragging: false }]);
    // Snapping puts the group on the grid.
    delta = { x: 13, y: 26 };
    expect(redirectDrag([move(0, 0, false)], ns, new Set(), new Map(), undefined, undefined, () => delta, 10)).toEqual([{ id: 'g', type: 'position', position: { x: 110, y: 130 }, dragging: false }]);
  });

  it('resizing a group scales what it holds, replacing React Flow’s own corrections', () => {
    const ns = [groupNode('g', 0, 0, 200, 100), shape('a', 100, 50, { parentId: 'g', width: 100, height: 50 })];
    const active = new Map<string, GroupResize>();
    const out = scaleGroupResize(
      [
        { id: 'g', type: 'position', position: { x: -200, y: -100 } },
        { id: 'g', type: 'dimensions', dimensions: { width: 400, height: 200 }, resizing: true, setAttributes: true },
        { id: 'a', type: 'position', position: { x: 300, y: 150 } },
      ],
      ns,
      active,
    );
    expect(out).toContainEqual({ id: 'a', type: 'position', position: { x: 200, y: 100 } });
    expect(out).toContainEqual({ id: 'a', type: 'dimensions', dimensions: { width: 200, height: 100 }, setAttributes: true });
    expect(out.filter((c) => c.type === 'position' && c.id === 'a')).toHaveLength(1);
    scaleGroupResize([{ id: 'g', type: 'dimensions', dimensions: { width: 400, height: 200 }, resizing: false }], ns, active);
    expect(active.size).toBe(0);
  });
});

describe('system clipboard data', () => {
  const ns = [groupNode('g', 100, 100, 300, 200), shape('a', 10, 10, { parentId: 'g', selected: true, data: { ...style, shape: 'rectangle', label: 'A', link: 'https://example.com', properties: { k: 'v' } } }), shape('b', 600, 0, { selected: true }), shape('c', 900, 0)];
  const es = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];

  it('holds the selection with its contents and the connectors between, shapes without their group at their canvas place', () => {
    const p = toClipboardPayload(ns, es, 'ed-1', 1, settings)!;
    expect(p).toMatchObject({ format: CLIPBOARD_FORMAT, version: 1, source: 'ed-1', serial: 1, schemaVersion: 3 });
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[0]).toMatchObject({ id: 'a', position: { x: 110, y: 110 } });
    expect(p.nodes[0]).not.toHaveProperty('parentId');
    expect(p.edges.map((e) => (e as { id: string }).id)).toEqual(['e1']);
    const back = parseClipboardPayload(JSON.stringify(p))!;
    expect(back.diagram.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(back.diagram.nodes[0].data).toMatchObject({ link: 'https://example.com', properties: { k: 'v' } });
    expect(back.diagram.edges).toHaveLength(1);
  });

  it('copies a group with what it holds', () => {
    const p = toClipboardPayload(
      ns.map((n) => ({ ...n, selected: n.id === 'g' })),
      es,
      'x',
      1,
      settings,
    )!;
    expect(p.nodes.map((n) => (n as { id: string }).id)).toEqual(['g', 'a']);
    expect(p.nodes[1]).toMatchObject({ parentId: 'g' });
    expect(toClipboardPayload(ns.map((n) => ({ ...n, selected: false })), es, 'x', 1, settings)).toBeNull();
  });

  it('reads only this app’s data; refuses data from a newer version; drops unsafe values', () => {
    expect(parseClipboardPayload('hello')).toBeNull();
    expect(parseClipboardPayload(`{"format":"${CLIPBOARD_FORMAT}"`)).toBeNull();
    expect(parseClipboardPayload(JSON.stringify({ format: 'other', nodes: [], edges: [] }))).toBeNull();
    expect(() => parseClipboardPayload(JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, schemaVersion: 99, nodes: [], edges: [] }))).toThrow(/newer version/);
    const evil = parseClipboardPayload(
      JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, schemaVersion: 3, source: 's', serial: 1, nodes: [{ id: 'x', position: { x: 0, y: 0 }, width: 10, height: 10, data: { ...style, shape: 'rectangle', label: '', link: 'javascript:alert(1)' } }], edges: [] }),
    )!;
    expect(evil.diagram.nodes[0].data.link).toBeUndefined();
  });

  it('centres pasted shapes (and bend points) on a point', () => {
    const r = centredOn([shape('a', 0, 0), shape('b', 200, 100)], [{ ...edge('e', 'a', 'b'), data: { ...edge('e', 'a', 'b').data!, waypoints: [{ x: 50, y: 50 }] } }], { x: 1000, y: 1000 });
    expect(r.nodes.map((n) => n.position)).toEqual([
      { x: 850, y: 925 },
      { x: 1050, y: 1025 },
    ]);
    expect(r.edges[0].data!.waypoints).toEqual([{ x: 900, y: 975 }]);
  });
});

// ── Round 3 integration fixes (verifier findings) ───────────────────────────
describe('layers: reordering never moves a shape (Round 3)', () => {
  const L1 = { id: 'L1', name: 'L1', visible: true, locked: false };
  const L2 = { id: 'L2', name: 'L2', visible: true, locked: false };

  it('a shape that names no layer stays on the layer it was on when the layers are reordered', () => {
    // A shape added while the bottom layer was current stores no layer id.
    const ns = [shape('a', 0, 0, { layer: 'L1' }), shape('b', 0, 0, { layer: 'L2' }), shape('circle', 0, 0)];
    const before = [L1, L2];
    const after = moveLayer(before, 'L1', 'up');
    const out = normalizeLayers(ns, after, before).nodes;
    expect(out.map((n) => [n.id, n.layer])).toEqual([
      ['a', 'L1'],
      ['b', 'L2'],
      ['circle', 'L1'],
    ]);
    // Without the previous order it would land on the new bottom layer (the Round 2 bug).
    expect(normalizeLayers(ns, after).nodes.find((n) => n.id === 'circle')!.layer).toBe('L2');
  });

  it('a shape inside a group is on its group’s layer (pasted groups whose shapes name no layer)', () => {
    const ns = [groupNode('g', 0, 0, 300, 200, { layer: 'L2' }), shape('c', 10, 10, { parentId: 'g' }), shape('d', 400, 0)];
    const map = byId(ns);
    expect(layerIdOf(ns[1], [L1, L2], map)).toBe('L2');
    expect(layerIdOf(ns[2], [L1, L2], map)).toBe('L1');
    // Hiding the bottom layer does not hide the group's shapes; hiding the group's layer does.
    const hidL1 = renderNodes(ns, [{ ...L1, visible: false }, L2], new WeakMap());
    expect(hidL1.map((n) => [n.id, !!n.hidden])).toEqual([
      ['g', false],
      ['c', false],
      ['d', true],
    ]);
    // Reordering pins the child to the group's layer.
    const out = normalizeLayers(ns, moveLayer([L1, L2], 'L2', 'down'), [L1, L2]).nodes;
    expect(out.find((n) => n.id === 'c')!.layer).toBe('L2');
    expect(layerIsEmpty(ns, [L1, L2], 'L2')).toBe(false);
  });
});

describe('a locked group stays one fixed object (Round 3)', () => {
  const locked = () => [groupNode('g', 0, 0, 360, 190, { locked: true, selected: true }), shape('a', 0, 0, { parentId: 'g' }), shape('b', 260, 140, { parentId: 'g' })];

  it('cannot be ungrouped', () => {
    expect(ungroupSelection(locked())).toBeNull();
  });

  it('its shapes cannot be moved, deleted or edited on the canvas', () => {
    const r = new Map(renderNodes(locked(), undefined, new WeakMap()).map((n) => [n.id, n]));
    for (const id of ['a', 'b']) {
      expect(r.get(id)!.draggable).toBe(false);
      expect(r.get(id)!.deletable).toBe(false);
      // Only the group shows the lock badge (it is the locked one).
      expect(r.get(id)!.className ?? '').not.toContain('dcos-locked');
    }
    expect(r.get('g')!.className).toContain('dcos-locked');
  });

  it('keeps its size when fitted, and is not removed with its shapes', () => {
    const ns = locked().map((n) => (n.id === 'b' ? { ...n, position: { x: 400, y: 300 } } : n));
    expect(fitGroups(ns, ['g']).find((n) => n.id === 'g')).toMatchObject({ width: 360, height: 190 });
    const changes: NodeChange<ShapeNode>[] = [
      { id: 'a', type: 'remove' },
      { id: 'b', type: 'remove' },
    ];
    expect(removeEmptyGroups(changes, locked())).toBe(changes);
  });
});
