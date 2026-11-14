// @vitest-environment jsdom
/** G-SHAPES: every library shape is registered, drawn, searchable, schema 3, and survives save, .dcosdiagram and .drawio. */
import { describe, expect, it } from 'vitest';
import { schema3Reason, schemaFor } from '../compat';
import { fromDrawio, toDrawio } from '../drawio';
import { parseNativeFile, toNativeFile } from '../native';
import { shapeDef, SHAPE_DEFS } from '../shapeRegistry';
import { SHAPE_RENDERERS } from '../shapes';
import { deserializeDiagram, serializeDiagram, shapeDefaults, type DiagramContent, type ShapeKind } from '../types';
import { resolveEntry, searchShapes, SHAPE_CATEGORIES } from './categories';
import { CONTAINER_KINDS, LABEL_PLACEMENT, LIBRARY_KINDS } from './kinds';
import { CONNECTOR_PRESETS, matchingPreset } from './presets';

const one = (kind: ShapeKind): DiagramContent => {
  const { width, height, ...style } = shapeDefaults(kind);
  const { width: bw, height: bh, ...rounded } = shapeDefaults('rounded');
  return {
    schemaVersion: 3,
    nodes: [
      { id: 'a', position: { x: 10, y: 20 }, width, height, data: { ...style, label: `A ${kind}` } },
      { id: 'b', position: { x: 400, y: 20 }, width: bw, height: bh, data: { ...rounded, label: 'B' } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } }],
    viewport: null,
    settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
  };
};
const save = (d: DiagramContent) => {
  const s = deserializeDiagram(d);
  return serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
};

describe('library shape registry', () => {
  it.each(LIBRARY_KINDS.map((k) => [k]))('%s has a definition, a renderer, a library entry and a diagrams.net style', (kind) => {
    const def = shapeDef(kind)!;
    expect(def).toBeDefined();
    expect(def.catalog?.name).toBeTruthy();
    expect(def.drawioStyle).toMatch(/;$/);
    expect(def.drawioStyle).not.toMatch(/dcosShape|fillColor|strokeColor/); // the exporter adds these
    expect(SHAPE_RENDERERS[kind]).toBeTypeOf('function');
    expect(SHAPE_CATEGORIES.some((c) => c.entries.some((e) => e.kind === kind))).toBe(true);
    // Each renderer draws something at full size and at the library preview size.
    for (const [w, h] of [
      [def.width, def.height],
      [44, 30],
    ])
      expect(SHAPE_RENDERERS[kind]!({ w, h, i: 1.5, common: { fill: '#fff', stroke: '#000', strokeWidth: 2, strokeDasharray: undefined, strokeLinejoin: 'round' } })).toBeTruthy();
  });

  it('kinds are unique and not shadowing earlier ones', () => {
    const kinds = SHAPE_DEFS.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('pools and lanes export as diagrams.net swimlanes with the title band on the left (horizontal=0)', () => {
    for (const k of ['bpmnPool', 'bpmnLane']) expect(shapeDef(k)!.drawioStyle).toMatch(/^swimlane;horizontal=0;/);
    expect([...CONTAINER_KINDS].sort()).toEqual(['bpmnLane', 'bpmnPool', 'umlBoundary']);
    expect(Object.keys(LABEL_PLACEMENT).every((k) => (LIBRARY_KINDS as readonly string[]).includes(k))).toBe(true);
  });
});

describe('library shapes in saved diagrams', () => {
  it.each(LIBRARY_KINDS.map((k) => [k]))('%s marks the diagram schema 3 and survives save, .dcosdiagram and .drawio', (kind) => {
    const d = one(kind);
    expect(schemaFor(d)).toBe(3);
    expect(schema3Reason(d)).toBe(`node a: shape ${kind}`);
    const saved = save(d);
    expect(saved.schemaVersion).toBe(3);
    expect(saved.nodes[0]).toEqual(d.nodes[0]);
    expect(parseNativeFile(toNativeFile(saved, 'T')).content).toEqual(saved);
    const { content, report } = fromDrawio(toDrawio(saved, 'T'));
    expect(report.notes).toEqual([]);
    const back = content.nodes.find((n) => n.id === 'a')!;
    expect([back.data.shape, back.data.label, back.position, back.width, back.height, back.data.fill, back.data.stroke, back.data.strokeWidth]).toEqual([
      kind,
      `A ${kind}`,
      d.nodes[0].position,
      d.nodes[0].width,
      d.nodes[0].height,
      d.nodes[0].data.fill,
      d.nodes[0].data.stroke,
      d.nodes[0].data.strokeWidth,
    ]);
  });

  it('a diagram without library shapes stays schema 2', () => {
    expect(schemaFor(one('rounded'))).toBe(2);
  });
});

describe('importing diagrams.net drawings of library shapes', () => {
  const file = (style: string, w = 50, h = 50) =>
    `<mxfile><diagram name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="v" value="X" style="${style}" vertex="1" parent="1"><mxGeometry x="10" y="10" width="${w}" height="${h}" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;
  const kindOf = (style: string) => fromDrawio(file(style)).content.nodes[0].data.shape;

  it('maps BPMN events by outline and gateways by type', () => {
    expect(kindOf('shape=mxgraph.bpmn.event;outline=standard;symbol=general;')).toBe('bpmnStart');
    expect(kindOf('shape=mxgraph.bpmn.event;outline=catching;symbol=general;')).toBe('bpmnIntermediate');
    expect(kindOf('shape=mxgraph.bpmn.event;outline=throwing;symbol=general;')).toBe('bpmnIntermediate');
    expect(kindOf('shape=mxgraph.bpmn.event;outline=end;symbol=general;')).toBe('bpmnEnd');
    expect(kindOf('shape=mxgraph.bpmn.gateway2;gwType=exclusive;')).toBe('bpmnExclusive');
    expect(kindOf('shape=mxgraph.bpmn.gateway2;gwType=parallel;')).toBe('bpmnParallel');
    expect(kindOf('shape=mxgraph.bpmn.gateway2;gwType=inclusive;')).toBe('bpmnInclusive');
  });

  it('notes what it simplifies', () => {
    expect(fromDrawio(file('shape=mxgraph.bpmn.event;outline=catching;symbol=timer;')).report.notes).toContain('BPMN event symbols (message, timer …) were not imported: the events are drawn plain.');
    const complex = fromDrawio(file('shape=mxgraph.bpmn.gateway2;gwType=complex;'));
    expect(complex.content.nodes[0].data.shape).toBe('bpmnExclusive');
    expect(complex.report.notes).toContain('Complex and event-based BPMN gateways were imported as exclusive gateways.');
  });

  it('maps UML lifelines, initial and final nodes, and network stencils', () => {
    expect(kindOf('shape=umlLifeline;perimeter=lifelinePerimeter;size=40;')).toBe('umlLifeline');
    expect(kindOf('ellipse;html=1;shape=startState;fillColor=#000000;')).toBe('umlInitial');
    expect(kindOf('ellipse;html=1;shape=endState;fillColor=#000000;')).toBe('umlFinal');
    expect(kindOf('shape=mxgraph.networks.router;html=1;')).toBe('netRouter');
    expect(kindOf('shape=mxgraph.networks.wireless_hub;html=1;')).toBe('netAccessPoint');
  });

  it('our own exports are read back by their tag, not re-guessed from the diagrams.net style', () => {
    // An end event is written as a plain ellipse; the tag brings it back as an end event.
    expect(kindOf('ellipse;html=1;dcosShape=bpmnEnd;')).toBe('bpmnEnd');
    expect(kindOf('rhombus;html=1;dcosShape=bpmnParallel;')).toBe('bpmnParallel');
  });
});

describe('shape library search and categories', () => {
  it('finds shapes by name, hint, keyword and notation, names first', () => {
    expect(searchShapes('router').map((e) => e.kind)).toEqual(['netRouter']);
    expect(searchShapes('gateway').map((e) => e.kind)).toEqual(['bpmnExclusive', 'bpmnParallel', 'bpmnInclusive']);
    expect(searchShapes('wifi').map((e) => e.kind)).toEqual(['netAccessPoint']);
    expect(searchShapes('Wi-Fi').map((e) => e.kind)).toEqual(['netAccessPoint']);
    expect(searchShapes('swim').map((e) => e.kind)).toEqual(['bpmnPool', 'bpmnLane']);
    expect(searchShapes('start').map((e) => e.kind)).toEqual(['ellipse', 'bpmnStart', 'umlInitial']);
    expect(searchShapes('use case').map((e) => e.name)).toContain('Use case');
    expect(searchShapes('  ')).toEqual([]);
    expect(searchShapes('qqqq')).toEqual([]);
  });

  it('lists each shape once in search results even when it is in several categories', () => {
    const actors = searchShapes('actor');
    expect(actors.filter((e) => e.kind === 'actor')).toHaveLength(1);
  });

  it('every entry resolves to a drawable kind with a name', () => {
    for (const c of SHAPE_CATEGORIES)
      for (const e of c.entries) {
        const r = resolveEntry(e, c);
        expect(shapeDef(r.kind), `${c.id}/${r.kind}`).toBeDefined();
        expect(r.name).not.toBe(r.kind);
      }
    // The first category is the Phase 4 library, in its order.
    expect(SHAPE_CATEGORIES[0].entries.map((e) => e.kind)).toEqual(['rounded', 'rectangle', 'ellipse', 'diamond', 'parallelogram', 'circle', 'hexagon', 'cylinder', 'document', 'triangle', 'note', 'text']);
  });
});

describe('connector notations', () => {
  it('use only schema-2 fields, and each is recognised again', () => {
    for (const p of CONNECTOR_PRESETS) {
      const d = one('rounded');
      d.edges[0] = { ...d.edges[0], ...(p.type ? { type: p.type } : {}), data: { ...d.edges[0].data, ...p.data } };
      expect(schemaFor(save(d)), p.id).toBe(2);
      const e = save(d).edges[0];
      expect(matchingPreset(e.type, e.data, { start: e.data.startMarker!, end: e.data.endMarker! })?.id).toBe(p.id);
    }
  });
});
