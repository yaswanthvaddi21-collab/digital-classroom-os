// @vitest-environment jsdom
/**
 * The model-to-SVG renderer (G-EXPORT, DS-R3/TD-22): true vector output with no foreignObject or HTML, every
 * template, groups, rotation, hidden shapes and layers, links, selection only, markers shared or drawn in place.
 */
import { describe, expect, it } from 'vitest';
import { generateLargeDiagram } from '../../../../tests/fixtures/diagrams/large';
import { shapeDef } from '../shapeRegistry';
import { diagramTemplates } from '../templates';
import type { DiagramContent, SerializedEdge, SerializedNode, ShapeData } from '../types';
import { buildScene, HANDLE_OUTSET, renderDiagramSvg, renderScene, SVG_LABEL_RENDERERS } from './renderSvg';

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const node = (id: string, x: number, y: number, extra: Partial<SerializedNode> = {}, data: Partial<ShapeData> = {}): SerializedNode => ({
  id,
  position: { x, y },
  width: 120,
  height: 60,
  ...extra,
  data: { ...style, shape: 'rectangle', label: id.toUpperCase(), ...data },
});
const edge = (source: string, target: string, extra: Partial<SerializedEdge> = {}): SerializedEdge => ({
  id: `e-${source}-${target}`,
  source,
  target,
  sourceHandle: 'r',
  targetHandle: 'l',
  type: 'straight',
  label: '',
  data: { color: '#475569', width: 2, dashed: false, arrow: 'end' },
  ...extra,
});
const diagram = (nodes: SerializedNode[], edges: SerializedEdge[] = [], more: Partial<DiagramContent> = {}): DiagramContent => ({
  schemaVersion: 3,
  nodes,
  edges,
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
  ...more,
});

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

/** Structural checks every export must pass: well-formed XML, SVG only, every marker reference defined. */
function expectPlainSvg(svg: string) {
  expect(svg.startsWith('<svg')).toBe(true);
  const doc = parse(svg);
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(svg).not.toMatch(/foreignObject|<div|<span|<p\b|class=|style=/i);
  const defined = new Set([...doc.querySelectorAll('marker')].map((m) => m.id));
  for (const el of doc.querySelectorAll('[marker-start], [marker-end]'))
    for (const a of ['marker-start', 'marker-end']) {
      const ref = el.getAttribute(a);
      if (ref) expect(defined.has(/url\(#(.+)\)/.exec(ref)![1]), ref).toBe(true);
    }
  return doc;
}

describe('every template', () => {
  for (const t of diagramTemplates.filter((x) => x.id !== 'blank')) {
    it(`${t.name}: plain vector SVG with every label and connector`, () => {
      const content = t.build();
      const before = JSON.stringify(content);
      const r = renderDiagramSvg(content, { title: t.name });
      expect(JSON.stringify(content)).toBe(before); // never changes the diagram
      const doc = expectPlainSvg(r.svg);
      expect(r.notes).toEqual([]);
      expect(doc.querySelectorAll('[data-node-id]')).toHaveLength(content.nodes.length);
      expect(doc.querySelectorAll('[data-edge-id] > path')).toHaveLength(content.edges.length);
      const text = [...doc.querySelectorAll('text')].map((x) => x.textContent).join(' ');
      for (const n of content.nodes)
        for (const word of n.data.label.split(/\s+/).filter((w) => w && w !== '--')) expect(text, `${n.id}: ${word}`).toContain(word.slice(0, 3));
      for (const e of content.edges) if (e.label) expect(text).toContain(e.label);
      expect(doc.querySelector('title')!.textContent).toBe(t.name);
      expect(r.width).toBeGreaterThan(80);
    });
  }
});

describe('geometry', () => {
  it('sizes the drawing to its contents plus 40 px padding', () => {
    const r = renderDiagramSvg(diagram([node('a', 100, 50), node('b', 400, 250)]));
    expect(r.viewBox).toEqual({ x: 60, y: 10, width: 500, height: 340 });
    const root = parse(r.svg).documentElement;
    expect(root.getAttribute('viewBox')).toBe('60 10 500 340');
    expect(root.getAttribute('width')).toBe('500');
  });

  it('ends connectors at the outer edge of the connection handles, like the canvas', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0), node('b', 300, 0)], [edge('a', 'b')]));
    const d = parse(r.svg).querySelector('[data-edge-id] path')!.getAttribute('d')!;
    expect(d.match(/-?[\d.]+/g)!.map(Number)).toEqual([120 + HANDLE_OUTSET, 30, 300 - HANDLE_OUTSET, 30]);
  });

  it('draws shapes inside groups at their canvas position, and the group itself invisible', () => {
    const r = renderDiagramSvg(
      diagram([node('g', 300, 200, { width: 400, height: 300 }, { shape: 'group', fill: 'transparent', stroke: 'transparent', strokeWidth: 0, label: '' }), node('c', 10, 10, { parentId: 'g' })]),
    );
    const doc = expectPlainSvg(r.svg);
    expect(doc.querySelector('[data-node-id="c"]')!.getAttribute('transform')).toBe('translate(310 210)');
    expect(r.svg).not.toContain('transparent');
    expect(doc.querySelector('[data-node-id="g"] rect')!.getAttribute('fill')).toBe('none');
  });

  it('rotates a shape about its centre and widens the drawing to the rotated corners', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { rotation: 45 })]));
    expect(parse(r.svg).querySelector('[data-node-id="a"]')!.getAttribute('transform')).toBe('translate(0 0) rotate(45 60 30)');
    expect(r.viewBox.width).toBeGreaterThan(120 + 80);
  });

  it('places the label of a connector along it (labelPosition) and draws its background', () => {
    const at = (labelPosition?: number) => {
      const e = edge('a', 'b', { label: 'yes', data: { color: '#475569', width: 2, dashed: false, arrow: 'end', ...(labelPosition !== undefined ? { labelPosition } : {}) } });
      const doc = parse(renderDiagramSvg(diagram([node('a', 0, 0), node('b', 400, 0)], [e])).svg);
      return Number(doc.querySelector('[data-edge-id] text')!.getAttribute('x'));
    };
    expect(at()).toBeCloseTo(260);
    expect(at(0.25)).toBeCloseTo(125 + 0.25 * 270);
  });

  it('keeps the canvas stacking: connectors under shapes, a shape in a group above it', () => {
    const doc = parse(renderDiagramSvg(diagram([node('a', 0, 0), node('b', 300, 0)], [edge('a', 'b')])).svg);
    const order = [...doc.documentElement.children].map((c) => c.getAttribute('data-edge-id') ?? c.getAttribute('data-node-id')).filter(Boolean);
    expect(order).toEqual(['e-a-b', 'a', 'b']);
  });
});

describe('text', () => {
  it('breaks a long label into lines inside the shape, centred, with real <text>', () => {
    const doc = parse(renderDiagramSvg(diagram([node('a', 0, 0, {}, { label: 'This label is far too long for one line' })])).svg);
    const lines = [...doc.querySelectorAll('[data-node-id="a"] text')];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((l) => l.textContent).join(' ')).toBe('This label is far too long for one line');
    for (const l of lines) {
      expect(l.getAttribute('text-anchor')).toBe('middle');
      expect(l.getAttribute('x')).toBe('60');
      expect(l.getAttribute('font-family')).toContain('Helvetica');
    }
  });

  it('draws a UML class as a header, rules and monospace rows, and PK keys bold and underlined', () => {
    const doc = parse(
      renderDiagramSvg(
        diagram([
          node('c', 0, 0, { width: 200, height: 130 }, { shape: 'umlClass', label: 'Student\n+ name: String\n--\n+ enrol(): void' }),
          node('e', 300, 0, { width: 190, height: 120 }, { shape: 'erEntity', label: 'Course\nPK id\ntitle' }),
        ]),
      ).svg,
    );
    const texts = [...doc.querySelectorAll('[data-node-id="c"] text')];
    expect(texts.map((t) => t.textContent)).toEqual(['Student', '+ name: String', '+ enrol(): void']);
    expect(texts[0].getAttribute('font-weight')).toBe('bold');
    expect(texts[1].getAttribute('font-family')).toContain('Courier');
    expect(doc.querySelectorAll('[data-node-id="c"] rect[height="2"]')).toHaveLength(2); // the two compartment rules
    const pk = [...doc.querySelectorAll('[data-node-id="e"] text')].find((t) => t.textContent === 'PK id')!;
    expect(pk.getAttribute('font-weight')).toBe('bold');
    expect(pk.nextElementSibling!.getAttribute('d')).toMatch(/^M8,[\d.]+ H[\d.]+$/); // the underline
  });

  it('follows the text alignment, font and opacity a diagrams.net file gave the shape', () => {
    const doc = parse(renderDiagramSvg(diagram([node('a', 0, 0, {}, { label: 'Left', textAlign: 'left', verticalAlign: 'top', fontFamily: 'Georgia', opacity: 40 } as Partial<ShapeData>)])).svg);
    const t = doc.querySelector('[data-node-id="a"] text')!;
    expect(t.getAttribute('text-anchor')).toBe('start');
    expect(Number(t.getAttribute('x'))).toBeLessThan(20);
    expect(Number(t.getAttribute('y'))).toBeLessThan(25);
    expect(t.getAttribute('font-family')).toBe('Georgia, Helvetica, Arial, sans-serif');
    // Fill and outline fade; the text stays opaque, as on the canvas.
    expect(doc.querySelector('[data-node-id="a"] > g[opacity="0.4"] rect')).not.toBeNull();
    expect(t.closest('g[opacity]')).toBeNull();
  });

  it.skipIf(!shapeDef('bpmnLane'))('turns the title of a pool or lane to read up its band, as on the canvas', () => {
    const r = renderDiagramSvg(diagram([node('l', 0, 0, { width: 600, height: 150 }, { shape: 'bpmnLane' as ShapeData['shape'], label: 'Teacher' })]));
    const g = parse(r.svg).querySelector('[data-node-id="l"] g[transform^="rotate(-90"]')!;
    expect(g.querySelector('text')!.textContent).toBe('Teacher');
  });

  it.skipIf(!shapeDef('bpmnStart'))('makes room for text drawn below a shape', () => {
    const r = renderDiagramSvg(diagram([node('s', 0, 0, { width: 50, height: 50 }, { shape: 'bpmnStart' as ShapeData['shape'], label: 'Order received' })]));
    expect(r.viewBox.y + r.viewBox.height).toBeGreaterThan(50 + 40 + 20);
    expect(r.viewBox.x).toBeLessThan(-40 - 20);
  });

  it('escapes markup in labels', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { label: '<b>&"x"' })]));
    expect(parse(r.svg).querySelector('text')!.textContent).toBe('<b>&"x"');
  });

  it('lets a shape kind draw its own text (hook for pools and lanes)', () => {
    SVG_LABEL_RENDERERS.note = (d) => <text x={1} y={2}>{`custom ${d.label}`}</text>;
    try {
      const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { shape: 'note', label: 'x' })]));
      expect(parse(r.svg).querySelector('text')!.textContent).toBe('custom x');
    } finally {
      delete SVG_LABEL_RENDERERS.note;
    }
  });
});

describe('what is left out, and the notes that say so', () => {
  it('leaves out hidden shapes, shapes on hidden layers and connectors to them, and names each', () => {
    const content = diagram(
      [node('a', 0, 0), node('h', 200, 0, { hidden: true }), node('l', 400, 0, { layer: 'L2' }), node('v', 0, 200, { layer: 'L1' })],
      [edge('a', 'h'), edge('a', 'l'), edge('a', 'v')],
      { layers: [{ id: 'L1', name: 'Base', visible: true, locked: false }, { id: 'L2', name: 'Notes', visible: false, locked: false }] },
    );
    const r = renderDiagramSvg(content);
    const doc = expectPlainSvg(r.svg);
    expect([...doc.querySelectorAll('[data-node-id]')].map((n) => n.getAttribute('data-node-id'))).toEqual(['a', 'v']);
    expect([...doc.querySelectorAll('[data-edge-id]')].map((n) => n.getAttribute('data-edge-id'))).toEqual(['e-a-v']);
    expect(r.notes).toEqual(['1 hidden shape was left out.', '1 shape on a hidden layer was left out.', '2 connectors to shapes that are not shown were left out.']);
  });

  it('treats shapes without a layer as on the first layer', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0), node('b', 200, 0, { layer: 'L2' })], [], { layers: [{ id: 'L1', name: 'Base', visible: false, locked: false }, { id: 'L2', name: 'Top', visible: true, locked: false }] }));
    expect(r.stats).toMatchObject({ shapes: 1, hiddenLayerShapes: 1 });
  });

  it('draws a shape and a line style from a newer version as placeholders, and says so', () => {
    const content = diagram([node('a', 0, 0, {}, { shape: 'hologram' as never }), node('b', 300, 0)], [edge('a', 'b', { type: 'zigzag' as never })]);
    const r = renderDiagramSvg(content);
    expectPlainSvg(r.svg);
    expect(r.svg).toContain('unknown shape');
    expect(r.notes).toEqual(['1 shape from a newer version was drawn as a placeholder.', '1 connector with a line style from a newer version was drawn curved.']);
  });

  it('leaves out a connector naming a connection point this version does not have (as the canvas does)', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0), node('b', 300, 0)], [edge('a', 'b', { sourceHandle: 'zz' })]));
    expect(r.stats.undrawableConnectors).toBe(1);
    expect(r.notes[0]).toMatch(/connection point this version does not have/);
  });

  it('refuses an empty drawing in words', () => {
    expect(() => renderDiagramSvg(diagram([]))).toThrow('The diagram is empty');
    expect(() => renderDiagramSvg(diagram([node('a', 0, 0, { hidden: true })]), { selection: { nodes: ['a'] } })).toThrow('Nothing selected to export');
  });
});

describe('links and tooltips', () => {
  it('wraps a linked shape in an SVG link and keeps its tooltip as a <title>', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { link: 'https://example.com/a?b=1&c=2', tooltip: 'More about A' })]));
    const doc = expectPlainSvg(r.svg);
    const a = doc.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com/a?b=1&c=2');
    expect(a.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('https://example.com/a?b=1&c=2');
    expect(a.querySelector('[data-node-id="a"] > title')!.textContent).toBe('More about A');
    expect(r.stats).toMatchObject({ links: 1, tooltips: 1 });
  });

  it('never writes an unsafe link', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { link: 'javascript:alert(1)' })]));
    expect(r.svg).not.toContain('javascript');
    expect(r.stats.links).toBe(0);
  });
});

describe('selection only', () => {
  const content = () =>
    diagram(
      [node('a', 0, 0), node('b', 300, 0), node('c', 600, 400), node('g', 1000, 0, { width: 300, height: 200 }, { shape: 'group', label: '' }), node('k', 20, 20, { parentId: 'g' })],
      [edge('a', 'b'), edge('b', 'c'), edge('a', 'k')],
    );

  it('draws the chosen shapes, the shapes in chosen groups and the connectors between them', () => {
    const r = renderDiagramSvg(content(), { selection: { nodes: ['a', 'b'] } });
    const doc = parse(r.svg);
    expect([...doc.querySelectorAll('[data-node-id]')].map((n) => n.getAttribute('data-node-id'))).toEqual(['a', 'b']);
    expect([...doc.querySelectorAll('[data-edge-id]')].map((n) => n.getAttribute('data-edge-id'))).toEqual(['e-a-b']);
    expect(r.viewBox.width).toBeLessThan(600);
    expect(r.notes).toEqual([]);
    const g = renderDiagramSvg(content(), { selection: { nodes: ['g', 'a'] } });
    expect([...parse(g.svg).querySelectorAll('[data-node-id]')].map((n) => n.getAttribute('data-node-id'))).toEqual(['a', 'g', 'k']);
    expect(parse(g.svg).querySelectorAll('[data-edge-id]')).toHaveLength(1);
  });

  it('does not draw a connector whose other end is left out', () => {
    const r = renderDiagramSvg(content(), { selection: { nodes: ['c'], edges: ['e-b-c'] } });
    expect(parse(r.svg).querySelectorAll('[data-edge-id]')).toHaveLength(0);
    expect(r.notes).toEqual([]);
  });
});

describe('connector ends', () => {
  const content = () =>
    diagram([node('a', 0, 0), node('b', 300, 0), node('c', 0, 300)], [
      edge('a', 'b', { data: { color: '#ff0000', width: 3, dashed: true, arrow: 'both' } }),
      edge('a', 'c', { sourceHandle: 'b', targetHandle: 't', data: { color: '#475569', width: 2, dashed: false, arrow: 'none', endMarker: 'diamond-filled', startMarker: 'crow-many' } }),
    ]);

  it('shares one <marker> per kind and colour, referenced by every end', () => {
    const doc = expectPlainSvg(renderDiagramSvg(content()).svg);
    expect(doc.querySelectorAll('marker')).toHaveLength(3); // red arrow (both ends), diamond, crow's foot
    expect(doc.querySelector('[data-edge-id="e-a-b"] path')!.getAttribute('stroke-dasharray')).toBe('6 5');
  });

  it('draws the ends in place for the PDF, pointing along the line and outward at the start', () => {
    const doc = expectPlainSvg(renderScene(buildScene(content()), { inlineMarkers: true }).svg);
    expect(doc.querySelectorAll('marker, [marker-start], [marker-end]')).toHaveLength(0);
    const ends = [...doc.querySelectorAll('[data-edge-id="e-a-b"] g')].map((g) => g.getAttribute('transform'));
    expect(ends).toEqual(['translate(125 30) rotate(180) scale(0.9) translate(-20 -10)', 'translate(295 30) rotate(0) scale(0.9) translate(-20 -10)']);
    expect(doc.querySelector('[data-edge-id="e-a-c"] g:last-of-type')!.getAttribute('transform')).toContain('rotate(90)');
  });
});

describe('PDF tiles and hooks', () => {
  it('draws only what reaches a region', () => {
    const scene = buildScene(diagram([node('a', 0, 0), node('b', 2000, 0)]));
    const r = renderScene(scene, { region: { x: -40, y: -40, width: 500, height: 500 } });
    expect([...parse(r.svg).querySelectorAll('[data-node-id]')].map((n) => n.getAttribute('data-node-id'))).toEqual(['a']);
    expect(r.viewBox.width).toBe(2200); // the drawing keeps its full size; tiles show parts of it
  });

  it('draws ports and bend points with the canvas connector geometry', () => {
    const data = { color: '#475569', width: 2, dashed: false, arrow: 'end' as const, sourcePort: { x: 1, y: 0 }, targetPort: 'perimeter' as const };
    const d = parse(renderDiagramSvg(diagram([node('a', 0, 0), node('b', 300, 0)], [edge('a', 'b', { data })])).svg).querySelector('[data-edge-id] path')!.getAttribute('d')!;
    expect(d.match(/-?[\d.]+/g)!.map(Number).slice(0, 2)).toEqual([120, 0]); // the fixed point: a's top-right corner
    const bent = renderDiagramSvg(diagram([node('a', 0, 0), node('b', 300, 0)], [edge('a', 'b', { data: { ...data, sourcePort: undefined, targetPort: undefined, waypoints: [{ x: 200, y: 300 }] } })]));
    const path = parse(bent.svg).querySelector('[data-edge-id] path')!.getAttribute('d')!;
    expect(path).toMatch(/200[ ,]300/); // passes through the bend point
    expect(bent.viewBox.y + bent.viewBox.height).toBeGreaterThanOrEqual(300 + 40); // and the drawing includes it
  });
});

describe('large diagrams', () => {
  it('renders 2000 shapes and their connectors quickly', () => {
    const content = generateLargeDiagram(2000);
    const t0 = performance.now();
    const r = renderDiagramSvg(content);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(8000);
    expect((r.svg.match(/data-node-id=/g) ?? []).length).toBe(2000);
    expect((r.svg.match(/<marker /g) ?? []).length).toBeLessThanOrEqual(10);
  });
});

describe('the export draws what the canvas draws (Round 3)', () => {
  const order = (svg: string) => [...svg.matchAll(/data-node-id="([^"]+)"/g)].map((m) => m[1]);
  const L1 = { id: 'L1', name: 'Bottom', visible: true, locked: false };
  const L2 = { id: 'L2', name: 'Top', visible: true, locked: false };

  it('paints shapes on a higher layer over shapes on a lower one, whatever their stored order', () => {
    const svg = renderDiagramSvg(diagram([node('a', 0, 0, { layer: 'L2' }), node('b', 20, 20, { layer: 'L1' })], [], { layers: [L1, L2] })).svg;
    expect(order(svg)).toEqual(['b', 'a']);
  });

  it('leaves out the shapes of a group on a hidden layer, even when they name a visible layer', () => {
    const r = renderDiagramSvg(
      diagram([node('g', 0, 0, { layer: 'L2', width: 300, height: 200 }, { shape: 'group' }), node('c', 10, 10, { parentId: 'g', layer: 'L1' }), node('d', 400, 0, { layer: 'L1' })], [], { layers: [L1, { ...L2, visible: false }] }),
    );
    expect(order(r.svg)).toEqual(['d']);
    expect(r.notes).toEqual(['2 shapes on hidden layers were left out.']);
  });

  it('treats a layer id the diagram does not have as the bottom layer (hidden when that layer is)', () => {
    const r = renderDiagramSvg(diagram([node('a', 0, 0, { layer: 'nope' }), node('b', 200, 0, { layer: 'L2' })], [], { layers: [{ ...L1, visible: false }, L2] }));
    expect(order(r.svg)).toEqual(['b']);
  });

  it('writes well-formed XML when a label holds control characters (a vertical tab pasted from PowerPoint)', () => {
    for (const ch of ['\u000b', '\u000c', '\u0001', '￾', '\ud800']) {
      const r = renderDiagramSvg(diagram([node('a', 0, 0, {}, { label: `Line one${ch}Line two`, tooltip: `tip${ch}` })]));
      expectPlainSvg(r.svg);
      expect(r.svg).toContain('Line');
    }
  });
});
