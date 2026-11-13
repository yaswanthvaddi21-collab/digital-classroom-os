import { describe, expect, it } from 'vitest';
import { UndoStack } from './history';
import { layoutTree } from './layout';
import { diagramTemplates } from './templates';
import { deserializeDiagram, edgeMarkers, serializeDiagram, styledEdge } from './types';

describe('UndoStack', () => {
  it('undoes and redoes in order, and a new change clears redo', () => {
    const h = new UndoStack<number>();
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeUndefined();
    expect(h.redo(1)).toBe(2);
    expect(h.canRedo).toBe(true);
    h.push(2);
    expect(h.canRedo).toBe(false);
  });

  it('caps history length', () => {
    const h = new UndoStack<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => h.push(n));
    expect([h.undo(6), h.undo(5), h.undo(4), h.undo(3)]).toEqual([5, 4, 3, undefined]);
  });
});

const box = (id: string, x = 0, y = 0) => ({ id, position: { x, y }, width: 100, height: 50 });

describe('layoutTree', () => {
  const nodes = [box('root', 500, 100), box('a'), box('b'), box('a1'), box('a2'), box('loose', 999, 999)];
  const edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }> = [
    { source: 'root', target: 'a' },
    { source: 'root', target: 'b' },
    { source: 'a', target: 'a1' },
    { source: 'a', target: 'a2' },
  ];

  it('places children below parents, centred, without overlaps, and keeps the root in place', () => {
    const { nodes: out, edges: outEdges } = layoutTree(nodes, edges, 'TB', { siblingGap: 20, levelGap: 40 });
    const at = Object.fromEntries(out.map((n) => [n.id, n.position]));
    expect(at.root).toEqual({ x: 500, y: 100 });
    expect(at.a.y).toBe(190);
    expect(at.a1.y).toBe(280);
    expect(at.a.x).toBeLessThan(at.b.x);
    expect(at.a.x + 50).toBe((at.a1.x + at.a2.x + 100) / 2);
    expect(at.a2.x - at.a1.x).toBeGreaterThanOrEqual(120);
    expect(at.loose).toEqual({ x: 999, y: 999 });
    expect(outEdges.every((e) => e.sourceHandle === 'b' && e.targetHandle === 't')).toBe(true);
  });

  it('lays out left to right with side handles', () => {
    const { nodes: out, edges: outEdges } = layoutTree(nodes, edges, 'LR');
    const at = Object.fromEntries(out.map((n) => [n.id, n.position]));
    expect(at.a.x).toBeGreaterThan(at.root.x);
    expect(outEdges[0].sourceHandle).toBe('r');
  });

  it('survives cycles and self-loops', () => {
    const cyc = [
      { source: 'root', target: 'a' },
      { source: 'a', target: 'root' },
      { source: 'b', target: 'b' },
    ];
    expect(() => layoutTree(nodes, cyc, 'TB')).not.toThrow();
  });
});

describe('serialization', () => {
  it('round-trips a template, dropping runtime-only fields', () => {
    const original = diagramTemplates.find((t) => t.id === 'flowchart')!.build();
    const state = deserializeDiagram(original);
    state.nodes[0].selected = true;
    const again = serializeDiagram(state.nodes, state.edges, { x: 1, y: 2, zoom: 1.5 }, state.settings);
    expect(again.nodes).toHaveLength(original.nodes.length);
    expect(again.nodes[0]).not.toHaveProperty('selected');
    expect(again.edges.map((e) => [e.source, e.target, e.label])).toEqual(original.edges.map((e) => [e.source, e.target, e.label]));
    expect(again.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(deserializeDiagram(JSON.parse(JSON.stringify(again))).nodes[0].data).toEqual(state.nodes[0].data);
  });

  it('drops edges whose endpoints no longer exist and fills defaults', () => {
    const state = deserializeDiagram({
      nodes: [{ id: 'x', position: { x: 1, y: 2 }, data: { label: 'Hi', shape: 'diamond' } }],
      edges: [{ id: 'e', source: 'x', target: 'gone' }],
    });
    expect(state.edges).toHaveLength(0);
    expect(state.nodes[0].width).toBe(150);
    expect(state.nodes[0].data.fill).toBe('#fef3c7');
    expect(state.settings.snapToGrid).toBe(true);
  });

  it('tolerates garbage input', () => {
    expect(deserializeDiagram(null).nodes).toEqual([]);
    expect(deserializeDiagram({ nodes: 'nope' }).nodes).toEqual([]);
  });

  it('keeps the meaning of v1 arrow settings and lets schema 2 markers override them', () => {
    const base = { color: '#000', width: 1, dashed: false };
    expect(edgeMarkers({ ...base, arrow: 'end' })).toEqual({ start: 'none', end: 'arrow' });
    expect(edgeMarkers({ ...base, arrow: 'both' })).toEqual({ start: 'arrow', end: 'arrow' });
    expect(edgeMarkers({ ...base, arrow: 'none' })).toEqual({ start: 'none', end: 'none' });
    expect(edgeMarkers({ ...base, arrow: 'end', startMarker: 'diamond', endMarker: 'triangle' })).toEqual({ start: 'diamond', end: 'triangle' });
    // Markers are drawn inside the connector (so exports include them), not by React Flow.
    const e = styledEdge({ id: 'e', source: 'a', target: 'b', data: { ...base, color: '#ff0000', width: 2, dashed: true, arrow: 'both' } });
    expect(e.markerEnd).toBeUndefined();
    expect(e.style?.strokeDasharray).toBeTruthy();
  });

});

describe('templates', () => {
  it.each(diagramTemplates.map((t) => [t.id, t] as const))('%s is internally consistent', (_, t) => {
    const d = t.build();
    const ids = new Set(d.nodes.map((n) => n.id));
    expect(ids.size).toBe(d.nodes.length);
    for (const e of d.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it('tree templates have no overlapping boxes', () => {
    for (const id of ['tree', 'mindmap', 'orgchart', 'hierarchy']) {
      const { nodes } = diagramTemplates.find((t) => t.id === id)!.build();
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const overlap = a.position.x < b.position.x + b.width && b.position.x < a.position.x + a.width && a.position.y < b.position.y + b.height && b.position.y < a.position.y + a.height;
          expect(overlap, `${id}: ${a.data.label} overlaps ${b.data.label}`).toBe(false);
        }
    }
  });
});
