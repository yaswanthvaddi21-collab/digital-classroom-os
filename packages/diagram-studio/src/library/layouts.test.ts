/** G-SHAPES: mind map (radial, two-sided) and timeline layouts. */
import { describe, expect, it } from 'vitest';
import { facingSide, layoutMindmap, mapTree, mindmapRoot } from './mindmap';
import { layoutTimeline, parseDateKey, timelineOrder } from './timeline';

type N = { id: string; position: { x: number; y: number }; width: number; height: number; data: { shape: string; label: string } };
type E = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; type?: string };

const node = (id: string, x = 0, y = 0, w = 120, h = 50, shape = 'rounded', label = id): N => ({ id, position: { x, y }, width: w, height: h, data: { shape, label } });
const edge = (source: string, target: string): E => ({ id: `${source}-${target}`, source, target, sourceHandle: 'b', targetHandle: 't', type: 'smoothstep' });
const centre = (n: N) => ({ x: n.position.x + n.width / 2, y: n.position.y + n.height / 2 });
const overlaps = (a: N, b: N) => a.position.x < b.position.x + b.width && b.position.x < a.position.x + a.width && a.position.y < b.position.y + b.height && b.position.y < a.position.y + a.height;
const noOverlaps = (ns: N[]) => {
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(overlaps(ns[i], ns[j]), `${ns[i].id} / ${ns[j].id}`).toBe(false);
};

/** root → 4 topics → 2 or 3 sub-topics each; plus an unconnected note. */
function map() {
  const nodes = [node('root', 100, 100, 180, 80)];
  const edges: E[] = [];
  ['a', 'b', 'c', 'd'].forEach((t, i) => {
    nodes.push(node(t));
    edges.push(edge('root', t));
    for (let k = 0; k < 2 + (i % 2); k++) {
      nodes.push(node(`${t}${k}`, 0, 0, 140, 44));
      edges.push(edge(t, `${t}${k}`));
    }
  });
  nodes.push(node('note', -500, -500));
  return { nodes, edges };
}

describe('mind map layouts', () => {
  it('radial: topics on one ring around the fixed central idea, sub-topics further out, nothing overlapping', () => {
    const { nodes, edges } = map();
    const out = layoutMindmap(nodes, edges, 'root', 'radial');
    const by = new Map(out.nodes.map((n) => [n.id, n]));
    expect(by.get('root')).toBe(nodes[0]);
    const rc = centre(by.get('root')!);
    const r = (id: string) => Math.hypot(centre(by.get(id)!).x - rc.x, centre(by.get(id)!).y - rc.y);
    const ring1 = ['a', 'b', 'c', 'd'].map(r);
    expect(Math.max(...ring1) - Math.min(...ring1)).toBeLessThan(1.5);
    for (const t of ['a0', 'b1', 'c1', 'd2']) expect(r(t)).toBeGreaterThan(ring1[0] + 100);
    // Branches go all the way round: some above, below, left and right of the centre.
    const sides = new Set(out.nodes.filter((n) => n.id !== 'root' && n.id !== 'note').map((n) => facingSide(centre(n).x - rc.x, centre(n).y - rc.y)));
    expect(sides).toEqual(new Set(['t', 'r', 'b', 'l']));
    noOverlaps(out.nodes);
    expect(by.get('note')).toBe(nodes.at(-1)); // not in the map: not moved
  });

  it('radial: connectors become curved and attach on the sides facing each other', () => {
    const { nodes, edges } = map();
    const out = layoutMindmap(nodes, edges, 'root', 'radial');
    const by = new Map(out.nodes.map((n) => [n.id, n]));
    for (const e of out.edges) {
      expect(e.type).toBe('default');
      const a = centre(by.get(e.source)!);
      const b = centre(by.get(e.target)!);
      expect(e.sourceHandle).toBe(facingSide(b.x - a.x, b.y - a.y));
      expect(e.targetHandle).toBe(facingSide(a.x - b.x, a.y - b.y));
    }
  });

  it('two-sided: topics split left and right in balance, levels in columns, nothing overlapping', () => {
    const { nodes, edges } = map();
    const out = layoutMindmap(nodes, edges, 'root', 'two-sided');
    const by = new Map(out.nodes.map((n) => [n.id, n]));
    const rc = centre(by.get('root')!);
    const right = ['a', 'b', 'c', 'd'].filter((t) => centre(by.get(t)!).x > rc.x);
    const left = ['a', 'b', 'c', 'd'].filter((t) => centre(by.get(t)!).x < rc.x);
    expect(right).toEqual(['a', 'b']);
    expect(left).toEqual(['c', 'd']);
    // Sub-topics are further out on their topic's side, in one column per level.
    expect(new Set(['a0', 'a1', 'b0', 'b1', 'b2'].map((id) => centre(by.get(id)!).x)).size).toBe(1);
    expect(centre(by.get('a0')!).x).toBeGreaterThan(centre(by.get('a')!).x);
    expect(centre(by.get('c0')!).x).toBeLessThan(centre(by.get('c')!).x);
    // Topics on one side are centred on the central idea, vertically.
    const ys = right.map((t) => centre(by.get(t)!).y);
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - rc.y)).toBeLessThan(40);
    noOverlaps(out.nodes);
    expect(out.edges.find((e) => e.target === 'a')!).toMatchObject({ sourceHandle: 'r', targetHandle: 'l', type: 'default' });
    expect(out.edges.find((e) => e.target === 'c')!).toMatchObject({ sourceHandle: 'l', targetHandle: 'r' });
  });

  it('follows connectors in either direction and stops at cycles', () => {
    const nodes = [node('r'), node('x'), node('y')];
    const edges = [edge('x', 'r'), edge('r', 'y'), edge('y', 'x')];
    const tree = mapTree('r', edges, new Set(['r', 'x', 'y']));
    expect([...tree.keys()].sort()).toEqual(['r', 'x', 'y']);
    const out = layoutMindmap(nodes, edges, 'r', 'radial');
    expect(out.nodes).toHaveLength(3);
    expect(out.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  });

  it('leaves the diagram alone when the root has no branches', () => {
    const nodes = [node('r'), node('x')];
    const out = layoutMindmap(nodes, [], 'r', 'radial');
    expect(out.nodes).toBe(nodes);
  });

  it('picks the central idea: the selection, else the shape connectors lead away from, else the middle', () => {
    const { nodes, edges } = map();
    expect(mindmapRoot(nodes, edges, 'b')).toBe('b');
    expect(mindmapRoot(nodes, edges)).toBe('root');
    // A topic with more sub-topics than the centre has topics is still not the centre.
    const lop = [...edges.filter((e) => e.target !== 'c' && e.target !== 'd' && e.source !== 'c' && e.source !== 'd')];
    expect(mindmapRoot(nodes, lop)).toBe('root');
    // Connectors drawn every which way: the middle of the map.
    const chain = [edge('p', 'q'), edge('r', 'q'), edge('r', 's'), edge('t', 's')];
    expect(mindmapRoot(['p', 'q', 'r', 's', 't'].map((id) => node(id)), [...chain, edge('s', 'p')])).toBe('r');
    expect(mindmapRoot([node('lonely')], [])).toBeNull();
  });
});

describe('timeline', () => {
  it('reads dates from labels', () => {
    expect(parseDateKey('1947')).toBe(19470000);
    expect(parseDateKey('300 BC')).toBe(-3000000);
    expect(parseDateKey('2023-08-23')).toBe(20230823);
    expect(parseDateKey('23/08/2023')).toBe(20230823);
    expect(parseDateKey('Aug 2023')).toBe(20230800);
    expect(parseDateKey('August 23, 2023')).toBe(20230823);
    expect(parseDateKey('23 August 2023')).toBe(20230823);
    expect(parseDateKey('1990s')).toBe(19900000);
    expect(parseDateKey('New date')).toBeNull();
    expect(parseDateKey('')).toBeNull();
  });

  const date = (id: string, label: string, x: number, y = 200) => node(id, x, y, 96, 40, 'timelineDate', label);
  const axis = (a: N, b: N): E => ({ id: `axis-${a.id}-${b.id}`, source: a.id, target: b.id });

  it('orders by date when every label is a date, else left to right', () => {
    const ds = [date('a', '1991', 0), date('b', '1947', 300), date('c', '1969', 600)];
    expect(timelineOrder(ds).map((d) => d.id)).toEqual(['b', 'c', 'a']);
    ds[1].data.label = 'Someday';
    expect(timelineOrder(ds).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('spaces dates evenly on one axis, alternates events, and joins neighbours only', () => {
    const nodes = [date('d1991', '1991', 50, 260), date('d1947', '1947', 0), date('d1969', '1969', 700, 330), node('e1', 0, 0, 160, 60), node('e2', 0, 0, 220, 60), node('e3', 0, 0, 160, 60), node('loose', 999, 999)];
    const edges: E[] = [edge('d1947', 'e1'), edge('e2', 'd1969'), edge('d1991', 'e3'), { id: 'old', source: 'd1947', target: 'd1991' }];
    const out = layoutTimeline(nodes, edges, axis);
    const by = new Map(out.nodes.map((n) => [n.id, n]));
    const order = ['d1947', 'd1969', 'd1991'].map((id) => by.get(id)!);
    // The first date (in date order) keeps its place; spacing fits the widest event.
    expect(order[0].position).toEqual({ x: 0, y: 200 });
    expect(order.map((d) => d.position.y)).toEqual([200, 200, 200]);
    expect(order[1].position.x - order[0].position.x).toBe(220 + 32);
    expect(order[2].position.x - order[1].position.x).toBe(220 + 32);
    // Events: above, below, above; centred on their date.
    expect(centre(by.get('e1')!).y).toBeLessThan(200);
    expect(centre(by.get('e2')!).y).toBeGreaterThan(240);
    expect(centre(by.get('e3')!).y).toBeLessThan(200);
    expect(centre(by.get('e2')!).x).toBe(centre(by.get('d1969')!).x);
    expect(by.get('loose')).toBe(nodes.at(-1));
    // The 1947–1991 connector no longer joins neighbours: replaced by 1947–1969 and 1969–1991.
    const axes = out.edges.filter((e) => e.id === 'old' || e.id.startsWith('axis-'));
    expect(axes.map((e) => `${e.source}>${e.target}:${e.sourceHandle}${e.targetHandle}`).sort()).toEqual(['d1947>d1969:rl', 'd1969>d1991:rl']);
    expect(out.edges.find((e) => e.id === 'e2-d1969')).toMatchObject({ sourceHandle: 't', targetHandle: 'b' });
    expect(out.edges.find((e) => e.id === 'd1947-e1')).toMatchObject({ sourceHandle: 't', targetHandle: 'b' });
    noOverlaps(out.nodes.filter((n) => n.id !== 'loose'));
  });

  it('keeps connectors between dates that the user drew (a labelled "led to", an arrow), dropping only old axis segments', () => {
    const nodes = [date('a', '1900', 0), date('b', '1950', 300), date('c', '2000', 600)];
    const straight = { type: 'straight', data: { arrow: 'none', startMarker: 'none', endMarker: 'none' } };
    const edges = [
      { id: 'ab', source: 'a', target: 'b', ...straight },
      { id: 'bc', source: 'b', target: 'c', ...straight },
      { id: 'ac-axis', source: 'a', target: 'c', ...straight },
      { id: 'ac-led', source: 'a', target: 'c', label: 'led to', ...straight },
      { id: 'ca-arrow', source: 'c', target: 'a', type: 'smoothstep', data: { arrow: 'end' } },
    ] as E[];
    const out = layoutTimeline(nodes, edges, axis);
    expect(out.edges.map((e) => e.id).sort()).toEqual(['ab', 'ac-led', 'bc', 'ca-arrow']);
    expect(out.removed.map((e) => e.id)).toEqual(['ac-axis']); // reported, so the editor can say so
  });

  it('keeps an existing axis connector (either direction) and does not duplicate it', () => {
    const nodes = [date('a', '1', 0), date('b', '2', 300)];
    const edges: E[] = [{ id: 'keep', source: 'b', target: 'a' }];
    const out = layoutTimeline(nodes, edges, axis);
    expect(out.edges).toEqual([{ id: 'keep', source: 'b', target: 'a', sourceHandle: 'l', targetHandle: 'r' }]);
    expect(layoutTimeline([node('x')], [], axis).nodes).toEqual([node('x')]);
  });
});
