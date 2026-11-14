// @vitest-environment jsdom
/**
 * Large diagrams (TD-19): 500 and 2000 generated shapes load, save, lay out, and survive a diagrams.net and a
 * .dcosdiagram round trip. Timings are asserted generously (several times the measured cost) to catch only real
 * regressions such as quadratic work, not machine speed.
 */
import { describe, expect, it } from 'vitest';
import { deserializeDiagram, fromDrawio, layoutTree, parseNativeFile, schemaFor, serializeDiagram, toDrawio, toNativeFile } from '@dcos/diagram-studio';
import { generateLargeDiagram } from '../fixtures/diagrams/large';

const time = <T>(fn: () => T): [T, number] => {
  const start = performance.now();
  const out = fn();
  return [out, performance.now() - start];
};

describe.each([
  [500, { load: 300, save: 300, layout: 800, toDrawio: 1500, fromDrawio: 4000, native: 1500 }],
  [2000, { load: 1000, save: 1000, layout: 2500, toDrawio: 5000, fromDrawio: 12000, native: 5000 }],
])('a generated diagram of %i shapes', (count, limits) => {
  const diagram = generateLargeDiagram(count);

  it('is schema 2 and loads and saves unchanged, quickly', () => {
    expect(diagram.nodes).toHaveLength(count);
    expect(schemaFor(diagram)).toBe(2);
    const [state, load] = time(() => deserializeDiagram(diagram));
    expect(state.nodes).toHaveLength(count);
    expect(state.edges).toHaveLength(diagram.edges.length);
    const [again, save] = time(() => serializeDiagram(state.nodes, state.edges, state.viewport, state.settings, state.layers));
    expect(again).toEqual(diagram);
    expect(load).toBeLessThan(limits.load);
    expect(save).toBeLessThan(limits.save);
  });

  it('lays out as a tree without overlaps along the first level', () => {
    const state = deserializeDiagram(diagram);
    const [laid, ms] = time(() => layoutTree(state.nodes, state.edges, 'TB'));
    expect(laid.nodes).toHaveLength(count);
    expect(ms).toBeLessThan(limits.layout);
    const children = laid.nodes.filter((n) => ['n1', 'n2', 'n3'].includes(n.id)).sort((a, b) => a.position.x - b.position.x);
    for (let i = 1; i < children.length; i++) expect(children[i].position.x).toBeGreaterThanOrEqual(children[i - 1].position.x + (children[i - 1].width ?? 0));
  });

  it('round-trips through diagrams.net with every shape, label and connector', () => {
    const [xml, write] = time(() => toDrawio(diagram, 'Large'));
    const [{ content, report }, read] = time(() => fromDrawio(xml));
    expect(report.notes).toEqual([]);
    expect(content.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position])).toEqual(diagram.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position]));
    expect(content.edges.map((e) => [e.id, e.source, e.target, e.type, e.label])).toEqual(diagram.edges.map((e) => [e.id, e.source, e.target, e.type, e.label]));
    expect(write).toBeLessThan(limits.toDrawio);
    expect(read).toBeLessThan(limits.fromDrawio);
  });

  it('round-trips through a .dcosdiagram file exactly', () => {
    const [{ content }, ms] = time(() => parseNativeFile(toNativeFile(diagram, 'Large')));
    expect(content).toEqual(diagram);
    expect(ms).toBeLessThan(limits.native);
  });
});
