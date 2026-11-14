/** Schema-3 model fields: valid values are kept, invalid ones ignored, and nothing crashes or changes the input. */
import { describe, expect, it } from 'vitest';
import { copyForPaste, inheritedData } from './editor/mutations';
import { isSafeLink, MAX_WAYPOINTS, parentsFirst, readFields, readLayers, readPort, readRotation, SHAPE_DATA_READERS, validParents } from './model';
import { deserializeDiagram, serializeDiagram, shapeDefaults, styledEdge, type ShapeNode } from './types';

const node = (id: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  id,
  position: { x: 10, y: 20 },
  width: 100,
  height: 50,
  data: { ...(({ width: _w, height: _h, ...s }) => s)(shapeDefaults('rectangle')), label: id, ...data },
  ...extra,
});
const edge = (data: Record<string, unknown>) => ({ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#000', width: 2, dashed: false, arrow: 'end', ...data } });

describe('reading schema-3 fields', () => {
  it('keeps valid values', () => {
    const raw = {
      schemaVersion: 3,
      layers: [
        { id: 'L1', name: 'Base', visible: true, locked: false },
        { id: 'L2', name: 'Answers', visible: false, locked: true },
      ],
      nodes: [
        node('g', {}, { shape: 'group' }),
        node('a', { parentId: 'g', locked: true, hidden: true, layer: 'L2' }, { rotation: 90, link: 'https://example.com/a', tooltip: 'Tip', properties: { owner: 'Sam', due: 'Friday' } }),
        node('b'),
      ],
      edges: [edge({ waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }], labelPosition: 0.25, sourcePort: 'perimeter', targetPort: { x: 1, y: 0.5 } })],
      viewport: null,
      settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
    };
    const input = JSON.parse(JSON.stringify(raw));
    const s = deserializeDiagram(input);
    expect(input).toEqual(raw); // the stored content is never changed
    expect(s.layers).toEqual(raw.layers);
    const a = s.nodes.find((n) => n.id === 'a')!;
    expect(a).toMatchObject({ parentId: 'g', locked: true, hidden: true, layer: 'L2' });
    expect(a.data).toMatchObject({ rotation: 90, link: 'https://example.com/a', tooltip: 'Tip', properties: { owner: 'Sam', due: 'Friday' } });
    expect(s.edges[0].data).toMatchObject({ waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }], labelPosition: 0.25, sourcePort: 'perimeter', targetPort: { x: 1, y: 0.5 } });
    const again = serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
    expect(again.schemaVersion).toBe(3);
    expect(again.nodes[1]).toEqual(raw.nodes[1]);
    expect(again.edges[0]).toEqual(raw.edges[0]);
    expect(again.layers).toEqual(raw.layers);
  });

  it('ignores invalid values without crashing', () => {
    const raw = {
      layers: [{ id: 'L1', name: 'ok', visible: true, locked: false }, { id: 'L1', name: 'duplicate' }, { name: 'no id' }, 'junk', null],
      nodes: [
        node('a', { parentId: 'a', locked: 'yes', hidden: 1, layer: 'missing' }, { rotation: 'ninety', link: 'javascript:alert(1)', tooltip: 42, properties: { n: 1, s: 'kept', '': 'no key' } }),
        node('b', { parentId: 'nobody' }, { rotation: 720, link: 'data:text/html,<script>', properties: 'nope' }),
        node('c', { parentId: 'd' }, { rotation: Infinity, properties: ['x'] }),
        node('d', { parentId: 'c' }),
      ],
      edges: [{ ...edge({ waypoints: [{ x: 'a', y: 1 }, null, { x: 5, y: 6 }], labelPosition: 2, sourcePort: { x: 5, y: 0 }, targetPort: 'nearest' }), source: 'a', target: 'b' }],
    };
    const s = deserializeDiagram(JSON.parse(JSON.stringify(raw)));
    expect(s.layers).toEqual([{ id: 'L1', name: 'ok', visible: true, locked: false }]);
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => s.nodes.find((n) => n.id === id)!);
    for (const k of ['parentId', 'locked', 'hidden', 'layer'] as const) expect(a[k], k).toBeUndefined();
    expect(a.data.rotation).toBeUndefined();
    expect(a.data.link).toBeUndefined();
    expect(a.data.tooltip).toBeUndefined();
    expect(a.data.properties).toEqual({ s: 'kept' });
    expect(b.parentId).toBeUndefined();
    expect(b.data.rotation).toBeUndefined();
    expect(b.data.link).toBeUndefined();
    expect(b.data.properties).toBeUndefined();
    expect(c.data.rotation).toBeUndefined();
    // A loop of parents: the link that closes it is dropped, so the shapes stay on the canvas.
    expect([c.parentId, d.parentId].filter(Boolean)).toHaveLength(1);
    expect(s.edges[0].data).toMatchObject({ waypoints: [{ x: 5, y: 6 }] });
    expect(s.edges[0].data!.labelPosition).toBeUndefined();
    expect(s.edges[0].data!.sourcePort).toBeUndefined();
    expect(s.edges[0].data!.targetPort).toBeUndefined();
    // And it saves.
    expect(() => serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers)).not.toThrow();
  });

  it('keeps unknown data fields from a newer version as they are (and they make the diagram schema 3)', () => {
    const s = deserializeDiagram({ nodes: [node('a', {}, { futureField: { deep: [1] } })], edges: [] });
    expect(s.nodes[0].data).toMatchObject({ futureField: { deep: [1] } });
    expect(serializeDiagram(s.nodes, s.edges, null, s.settings).schemaVersion).toBe(3);
  });

  it('rotation, links, ports and layers follow their rules', () => {
    expect([readRotation(90), readRotation(-450), readRotation(360), readRotation(NaN), readRotation('5')]).toEqual([90, -90, undefined, undefined, undefined]);
    for (const ok of ['https://a.b', 'http://a', 'mailto:x@y.z', '#anchor', 'page2', 'data:page/id,abc']) expect(isSafeLink(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', ' JavaScript:x', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', '']) expect(isSafeLink(bad), bad).toBe(false);
    expect([readPort('perimeter'), readPort({ x: 0, y: 1 }), readPort({ x: 1.5, y: 0 }), readPort('left')]).toEqual(['perimeter', { x: 0, y: 1 }, undefined, undefined]);
    expect(readLayers([])).toBeUndefined();
    expect(readLayers([{ id: 'a' }])).toEqual([{ id: 'a', name: '', visible: true, locked: false }]);
  });

  it('caps very long point lists', () => {
    const s = deserializeDiagram({ nodes: [node('a'), node('b')], edges: [edge({ waypoints: Array.from({ length: MAX_WAYPOINTS + 50 }, (_, i) => ({ x: i, y: i })) })] });
    expect(s.edges[0].data!.waypoints).toHaveLength(MAX_WAYPOINTS);
  });

  it('returns the same data object when there is nothing to read, so stored data keeps its exact form', () => {
    const d = { shape: 'rectangle', label: 'x' };
    expect(readFields(d, SHAPE_DATA_READERS)).toBe(d);
  });
});

describe('groups', () => {
  it('validParents drops self, missing and looping parents', () => {
    const p = validParents([
      { id: 'a', parentId: 'g' },
      { id: 'g' },
      { id: 's', parentId: 's' },
      { id: 'm', parentId: 'missing' },
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'z' },
      { id: 'z', parentId: 'x' },
    ]);
    expect(p.get('a')).toBe('g');
    expect(p.has('s')).toBe(false);
    expect(p.has('m')).toBe(false);
    expect(['x', 'y', 'z'].filter((id) => p.has(id))).toHaveLength(2);
  });

  it('parentsFirst puts every parent before its children and keeps a valid order as it is', () => {
    const ok = [{ id: 'g' }, { id: 'a', parentId: 'g' }, { id: 'b' }];
    expect(parentsFirst(ok)).toBe(ok);
    const out = parentsFirst([{ id: 'a', parentId: 'g' }, { id: 'b' }, { id: 'h', parentId: 'g2' }, { id: 'g', parentId: 'g2' }, { id: 'g2' }]);
    const at = (id: string) => out.findIndex((n) => n.id === id);
    expect(out).toHaveLength(5);
    expect(at('g')).toBeLessThan(at('a'));
    expect(at('g2')).toBeLessThan(at('g'));
    expect(at('g2')).toBeLessThan(at('h'));
  });

  it('deserialize orders parents first for React Flow', () => {
    const s = deserializeDiagram({ nodes: [node('a', { parentId: 'g' }), node('g', {}, { shape: 'group' })], edges: [] });
    expect(s.nodes.map((n) => n.id)).toEqual(['g', 'a']);
  });
});

describe('copy and paste keep the new fields', () => {
  const rf = (n: ReturnType<typeof node>): ShapeNode => ({ ...(n as unknown as ShapeNode), type: 'shape' });
  const all = [rf(node('g', { position: { x: 100, y: 100 } }, { shape: 'group' })), rf(node('a', { parentId: 'g', locked: true, layer: 'L1' }, { rotation: 30, link: 'https://x.y', properties: { k: 'v' } })), rf(node('b'))];
  let i = 0;
  const id = (p: string) => `${p}${++i}`;

  it('a copied group keeps its children inside the copy, with every field', () => {
    const edges = [styledEdge({ ...edge({ waypoints: [{ x: 50, y: 50 }], labelPosition: 0.3 }), source: 'a', target: 'b' } as never)];
    const out = copyForPaste({ nodes: all, edges }, all, 40, id);
    const [g, a] = out.nodes;
    expect(g.position).toEqual({ x: 140, y: 140 });
    expect(a.parentId).toBe(g.id);
    expect(a.position).toEqual({ x: 10, y: 20 }); // relative to its (moved) group
    expect(a).toMatchObject({ locked: true, layer: 'L1', data: { rotation: 30, link: 'https://x.y', properties: { k: 'v' } } });
    expect(out.edges[0].data).toMatchObject({ waypoints: [{ x: 90, y: 90 }], labelPosition: 0.3 });
    expect(out.edges[0]).toMatchObject({ source: a.id, target: out.nodes[2].id });
  });

  it('a child copied without its group lands at its place on the canvas, outside any group', () => {
    const out = copyForPaste({ nodes: [all[1]], edges: [] }, all, 30, id);
    expect(out.nodes[0].parentId).toBeUndefined();
    expect(out.nodes[0].position).toEqual({ x: 140, y: 150 });
  });

  it('a new shape made from another takes its look, not its text, link, tooltip or properties', () => {
    const d = inheritedData({ ...all[1].data, tooltip: 't' });
    expect(d).toMatchObject({ rotation: 30, label: '' });
    expect(d).not.toHaveProperty('link');
    expect(d).not.toHaveProperty('tooltip');
    expect(d).not.toHaveProperty('properties');
  });
});
