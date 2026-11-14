// @vitest-environment jsdom
/** Schema 2 vs 3: the frozen vocabulary, which content stays schema 2, and that every schema-3 field marks 3. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEMA2_VOCABULARY, schema3Reason, schemaFor } from './compat';
import { fromDrawio } from './drawio';
import { DRAWIO_SHAPE_KEYS, LINE_TO_DRAWIO, MARKER_TO_DRAWIO } from './drawioRegistry';
import { EDGE_PATHS } from './edges';
import { SHAPE_DEFS } from './shapeRegistry';
import { SHAPE_RENDERERS } from './shapes';
import { SCHEMA3_TEMPLATES } from './library/templates';
import { diagramTemplates } from './templates';
import { createEmptyDiagram, deserializeDiagram, DIAGRAM_SCHEMA, EDGE_LINE_TYPES, MARKER_KINDS, serializeDiagram, type DiagramContent } from './types';

const roundTrip = (c: unknown): DiagramContent => {
  const s = deserializeDiagram(JSON.parse(JSON.stringify(c)));
  return serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
};

const base = (): DiagramContent => ({
  schemaVersion: 2,
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, width: 160, height: 70, data: { shape: 'rounded', fill: '#fff', stroke: '#000', strokeWidth: 2, textColor: '#000', fontSize: 14, dashed: false, bold: false, label: 'A' } },
    { id: 'b', position: { x: 300, y: 0 }, width: 160, height: 70, data: { shape: 'rectangle', fill: '#fff', stroke: '#000', strokeWidth: 2, textColor: '#000', fontSize: 14, dashed: false, bold: false, label: 'B' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } }],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
});

describe('the frozen schema-2 vocabulary', () => {
  it('is what the Phase 4 build (git 206e080) could store, and this build still has all of it', () => {
    expect(DIAGRAM_SCHEMA).toBe(3);
    expect(Object.isFrozen(SCHEMA2_VOCABULARY)).toBe(true);
    // Every schema-2 shape kind, marker and line type still exists (none was renamed or removed).
    for (const k of SCHEMA2_VOCABULARY.shapeKinds) expect(SHAPE_DEFS.some((d) => d.kind === k), k).toBe(true);
    expect(MARKER_KINDS.slice(0, SCHEMA2_VOCABULARY.markerKinds.length)).toEqual([...SCHEMA2_VOCABULARY.markerKinds]);
    for (const t of SCHEMA2_VOCABULARY.edgeTypes) expect(EDGE_LINE_TYPES).toContain(t);
    // The Phase 4 build's 16 shape kinds, 11 markers and 4 line types (from types.ts at 206e080).
    expect(SCHEMA2_VOCABULARY.shapeKinds).toHaveLength(16);
    expect(SCHEMA2_VOCABULARY.markerKinds).toHaveLength(11);
    expect(SCHEMA2_VOCABULARY.edgeTypes).toHaveLength(4);
  });

  it('every template, the empty diagram and an imported diagrams.net file are schema 2, and stay 2 after a save', () => {
    // G-SHAPES: templates drawn with Phase 5 shapes are schema 3 (checked in library/templates.test.ts); every other
    // template stays 2.
    for (const t of diagramTemplates.filter((x) => !SCHEMA3_TEMPLATES.has(x.id))) {
      const d = t.build();
      expect(d.schemaVersion, t.id).toBe(2);
      expect(schema3Reason(d), t.id).toBeNull();
      expect(roundTrip(d).schemaVersion, t.id).toBe(2);
    }
    expect(createEmptyDiagram().schemaVersion).toBe(2);
    const xml = readFileSync(join(__dirname, '../../../tests/fixtures/drawio/library-system.drawio'), 'utf8');
    expect(fromDrawio(xml).content.schemaVersion).toBe(2);
    expect(roundTrip(base())).toEqual(base());
  });
});

describe('each schema-3 feature marks the diagram schema 3', () => {
  const cases: Array<[string, (d: DiagramContent) => void]> = [
    ['a group (parentId)', (d) => void (d.nodes[1].parentId = 'a')],
    ['a locked shape', (d) => void (d.nodes[0].locked = true)],
    ['a hidden shape', (d) => void (d.nodes[0].hidden = true)],
    ['layers', (d) => void (d.layers = [{ id: 'L1', name: 'Answers', visible: false, locked: false }])],
    ['a shape on a layer', (d) => ((d.layers = [{ id: 'L1', name: 'Top', visible: true, locked: false }]), (d.nodes[0].layer = 'L1'))],
    ['rotation', (d) => void (d.nodes[0].data.rotation = 30)],
    ['a link', (d) => void (d.nodes[0].data.link = 'https://example.com')],
    ['a tooltip', (d) => void (d.nodes[0].data.tooltip = 'Hello')],
    ['properties', (d) => void (d.nodes[0].data.properties = { owner: 'Sam' })],
    ['waypoints', (d) => void (d.edges[0].data.waypoints = [{ x: 200, y: 100 }])],
    ['a label position', (d) => void (d.edges[0].data.labelPosition = 0.2)],
    ['a perimeter source port', (d) => void (d.edges[0].data.sourcePort = 'perimeter')],
    ['a fixed target port', (d) => void (d.edges[0].data.targetPort = { x: 0, y: 0.25 })],
    ['the group container kind', (d) => void (d.nodes[0].data.shape = 'group')],
  ];

  it.each(cases)('%s', (_, change) => {
    const d = base();
    change(d);
    const saved = roundTrip(d);
    expect(saved.schemaVersion).toBe(3);
    // And the field survives the save → load → save round trip.
    expect(roundTrip(saved)).toEqual(saved);
  });

  it('new kinds, line types, handles and fields from later versions are schema 3 (never silently 2)', () => {
    const mark = (change: (d: Record<string, any>) => void) => {
      const d = base() as unknown as Record<string, any>;
      change(d);
      return schemaFor(d);
    };
    expect(mark((d) => (d.nodes[0].data.shape = 'bpmnTask'))).toBe(3);
    expect(mark((d) => (d.edges[0].type = 'orthogonal-rounded'))).toBe(3);
    expect(mark((d) => (d.edges[0].sourceHandle = 'tl'))).toBe(3);
    expect(mark((d) => (d.edges[0].data.endMarker = 'bpmn-message'))).toBe(3);
    expect(mark((d) => (d.edges[0].data.arrow = 'start'))).toBe(3);
    expect(mark((d) => (d.nodes[0].data.gradient = '#000'))).toBe(3);
    expect(mark((d) => (d.nodes[0].extent = 'parent'))).toBe(3);
    expect(mark((d) => (d.edges[0].layer = 'x'))).toBe(3);
    expect(mark((d) => (d.settings.pageSize = 'A4'))).toBe(3);
    expect(mark((d) => (d.settings.autoLayout = 'radial'))).toBe(3);
    expect(mark((d) => (d.settings.connector = 'curvy'))).toBe(3);
    expect(mark((d) => (d.viewport = { x: 0, y: 0, zoom: 1, rotation: 0 }))).toBe(3);
    expect(mark((d) => (d.pages = []))).toBe(3);
    // Fields left undefined are not stored, so they do not count.
    expect(mark((d) => (d.nodes[0].data.rotation = undefined))).toBe(2);
  });

  it('features at their default are not stored, so the diagram stays schema 2', () => {
    const d = base();
    Object.assign(d.nodes[0].data, { rotation: 0, link: '', tooltip: '', properties: {} });
    Object.assign(d.edges[0].data, { waypoints: [], labelPosition: 0.5 });
    d.layers = [];
    const saved = roundTrip(d);
    expect(saved.schemaVersion).toBe(2);
    expect(saved).toEqual(base());
  });

  it('removing the last schema-3 feature makes the diagram schema 2 again', () => {
    const d = base();
    d.nodes[0].data.rotation = 45;
    const s = deserializeDiagram(d);
    expect(serializeDiagram(s.nodes, s.edges, null, s.settings).schemaVersion).toBe(3);
    s.nodes[0] = { ...s.nodes[0], data: { ...s.nodes[0].data, rotation: undefined } };
    expect(serializeDiagram(s.nodes, s.edges, null, s.settings).schemaVersion).toBe(2);
  });
});

describe('registries agree with each other', () => {
  it('every shape kind has a renderer (except text, drawn as text only), and every renderer a kind', () => {
    for (const d of SHAPE_DEFS) if (d.kind !== 'text') expect(SHAPE_RENDERERS[d.kind], d.kind).toBeTypeOf('function');
    for (const k of Object.keys(SHAPE_RENDERERS)) expect(SHAPE_DEFS.some((d) => d.kind === k), k).toBe(true);
    for (const k of Object.values(DRAWIO_SHAPE_KEYS)) expect(SHAPE_DEFS.some((d) => d.kind === k), k).toBe(true);
    expect(new Set(SHAPE_DEFS.map((d) => d.kind)).size).toBe(SHAPE_DEFS.length);
  });

  it('every line type has a path and a diagrams.net style, and every marker a diagrams.net arrow', () => {
    expect(Object.keys(EDGE_PATHS).sort()).toEqual([...EDGE_LINE_TYPES].sort());
    expect(Object.keys(LINE_TO_DRAWIO).sort()).toEqual([...EDGE_LINE_TYPES].sort());
    expect(Object.keys(MARKER_TO_DRAWIO).sort()).toEqual([...MARKER_KINDS].sort());
  });
});
