// @vitest-environment jsdom
/** The .dcosdiagram file: exact round trips, strict validation with readable reasons, and file-type detection. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_PROPERTIES, MAX_WAYPOINTS } from './model';
import { NativeDiagramError, NATIVE_FORMAT, NATIVE_VERSION, parseNativeFile, readDiagramFile, toNativeFile, validateDiagram } from './native';
import { SCHEMA3_TEMPLATES } from './library/templates';
import { diagramTemplates } from './templates';
import { deserializeDiagram, serializeDiagram, type DiagramContent } from './types';

const flowchart = () => diagramTemplates.find((t) => t.id === 'flowchart')!.build();

/** A schema-3 diagram using every field Round 1 adds. */
function kitchenSink(): DiagramContent {
  const d = flowchart();
  d.layers = [
    { id: 'base', name: 'Base', visible: true, locked: false },
    { id: 'notes', name: 'Teacher notes', visible: false, locked: true },
  ];
  d.nodes.unshift({ id: 'grp', position: { x: 500, y: 0 }, width: 300, height: 200, data: { ...d.nodes[0].data, shape: 'group', label: '' } });
  Object.assign(d.nodes[1], { parentId: 'grp', position: { x: 10, y: 10 }, locked: true, layer: 'notes' });
  Object.assign(d.nodes[2], { hidden: true });
  Object.assign(d.nodes[3].data, { rotation: 45, link: 'https://example.com', tooltip: 'Check this', properties: { marks: '5' } });
  Object.assign(d.edges[0].data, { waypoints: [{ x: 1, y: 2 }], labelPosition: 0.75, sourcePort: 'perimeter', targetPort: { x: 0.5, y: 0 } });
  const s = deserializeDiagram(d);
  return serializeDiagram(s.nodes, s.edges, { x: 1, y: 2, zoom: 0.5 }, s.settings, s.layers);
}

const file = (diagram: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ format: NATIVE_FORMAT, version: NATIVE_VERSION, app: '0.2.0', title: 'T', diagram, ...extra });
const refusal = (text: string) => {
  try {
    parseNativeFile(text);
  } catch (err) {
    expect(err).toBeInstanceOf(NativeDiagramError);
    return (err as Error).message;
  }
  throw new Error('expected the file to be refused');
};

describe('.dcosdiagram round trips', () => {
  // G-SHAPES: templates drawn with Phase 5 shapes are schema 3; the rest stay 2.
  it.each(diagramTemplates.map((t) => [t.id, t] as const))('%s comes back exactly, at its schema', (_, t) => {
    const d = t.build();
    const text = toNativeFile(d, t.name);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ format: 'dcos-diagram', version: 1, title: t.name, diagram: d });
    expect(typeof parsed.app).toBe('string');
    const { content, title } = parseNativeFile(text);
    expect(content).toEqual(d);
    expect(content.schemaVersion).toBe(SCHEMA3_TEMPLATES.has(t.id) ? 3 : 2);
    expect(title).toBe(t.name);
  });

  it('a schema-3 diagram with groups, layers, locks, hidden shapes, rotation, links, waypoints and ports comes back exactly', () => {
    const d = kitchenSink();
    expect(d.schemaVersion).toBe(3);
    const { content } = parseNativeFile(toNativeFile(d, 'Sink'));
    expect(content).toEqual(d);
  });
});

describe('.dcosdiagram validation', () => {
  it('refuses what is not a diagram file', () => {
    expect(refusal('not json')).toMatch(/not valid JSON/);
    expect(refusal('[]')).toMatch(/not a Classroom OS diagram file/);
    expect(refusal(JSON.stringify({ format: 'dcos-backup', version: 1 }))).toMatch(/not a Classroom OS diagram file/);
    expect(refusal(JSON.stringify({ format: NATIVE_FORMAT, version: 'one', diagram: flowchart() }))).toMatch(/format version/);
    expect(refusal(file(null))).toMatch(/no diagram/);
  });

  it('refuses files from a newer version, saying to update', () => {
    expect(refusal(file(flowchart(), { version: 2 }))).toMatch(/newer file format.*Update the app/);
    expect(refusal(file({ ...flowchart(), schemaVersion: 4 }))).toMatch(/newer format \(schema 4\).*Update/);
    const unknownShape = flowchart();
    // (G-SHAPES: a kind no build has yet; `bpmnTask`, used here before, is now a real kind.)
    (unknownShape.nodes[0].data as { shape: string }).shape = 'bpmnChoreography';
    expect(refusal(file(unknownShape))).toMatch(/kind of shape this version does not know \(“bpmnChoreography”\)/);
    const unknownLine = flowchart();
    (unknownLine.edges[0] as { type: string }).type = 'wavy';
    expect(refusal(file(unknownLine))).toMatch(/line style this version does not know/);
    expect(refusal(file({ ...flowchart(), pages: [] }))).toMatch(/field this version does not know \(“pages”\)/);
    const nodeField = flowchart();
    (nodeField.nodes[0] as unknown as Record<string, unknown>).extent = 'parent';
    expect(refusal(file(nodeField))).toMatch(/Shape 1 has a field this version does not know \(“extent”\)/);
    // Settings and the saved view are checked as strictly as shapes (deserialize would keep a settings field and
    // silently make the diagram schema 3).
    const settingsField = flowchart();
    (settingsField.settings as unknown as Record<string, unknown>).theme = 'dark';
    expect(refusal(file(settingsField))).toMatch(/setting this version does not know \(“theme”\).*Update/);
    expect(refusal(file({ ...flowchart(), viewport: { x: 0, y: 0, zoom: 1, rotate: 90 } }))).toMatch(/saved view has a field this version does not know \(“rotate”\)/);
    // A connection point React Flow cannot draw.
    const handle = flowchart();
    (handle.edges[0] as { sourceHandle: string }).sourceHandle = 'zz';
    expect(refusal(file(handle))).toMatch(/Connector 1 has a connection point this version does not know \(“zz”\)/);
  });

  it('refuses what the stored form would shorten or drop, so an opened file is kept whole', () => {
    const many = flowchart();
    many.edges[0].data.waypoints = Array.from({ length: MAX_WAYPOINTS + 1 }, (_, i) => ({ x: i, y: i }));
    expect(refusal(file(many))).toMatch(new RegExp(`more than ${MAX_WAYPOINTS} bend points`));
    const props = flowchart();
    props.nodes[0].data.properties = Object.fromEntries(Array.from({ length: MAX_PROPERTIES + 1 }, (_, i) => [`k${i}`, 'v']));
    expect(refusal(file(props))).toMatch(new RegExp(`more than ${MAX_PROPERTIES} properties`));
    const empty = flowchart();
    empty.nodes[0].data.properties = { '': 'v' };
    expect(refusal(file(empty))).toMatch(/invalid properties \(each needs a name/);
    // At the limits everything is kept.
    const atLimit = flowchart();
    atLimit.edges[0].data.waypoints = Array.from({ length: MAX_WAYPOINTS }, (_, i) => ({ x: i, y: i }));
    atLimit.nodes[0].data.properties = Object.fromEntries(Array.from({ length: MAX_PROPERTIES }, (_, i) => [`k${i}`, 'v']));
    const { content } = parseNativeFile(file(atLimit));
    expect(content.edges[0].data.waypoints).toHaveLength(MAX_WAYPOINTS);
    expect(Object.keys(content.nodes[0].data.properties!)).toHaveLength(MAX_PROPERTIES);
  });

  it('refuses damaged diagrams with the reason', () => {
    const cases: Array<[(d: any) => void, RegExp]> = [
      [(d) => (d.nodes = 'x'), /no list of shapes/],
      [(d) => (d.nodes[1].id = d.nodes[0].id), /Two shapes have the same id/],
      [(d) => (d.nodes[0].position = { x: 'a', y: 0 }), /Shape 1 has no valid position/],
      [(d) => (d.nodes[0].width = -5), /no valid size/],
      [(d) => (d.nodes[0].data.label = 5), /no text field/],
      [(d) => (d.nodes[0].data.fontSize = 'big'), /invalid font size/],
      [(d) => (d.nodes[0].data.link = 'javascript:alert(1)'), /link that is not a web or mail address/],
      [(d) => (d.nodes[0].data.properties = { a: 1 }), /invalid properties/],
      [(d) => (d.nodes[0].layer = 'nope'), /on a layer the diagram does not have/],
      [(d) => (d.nodes[0].parentId = 'nobody'), /inside a group the diagram does not have/],
      [(d) => ((d.nodes[0].parentId = d.nodes[1].id), (d.nodes[1].parentId = d.nodes[0].id)), /in a loop/],
      [(d) => (d.nodes[0].locked = false), /invalid lock setting/],
      [(d) => (d.edges[0].target = 'gone'), /Connector 1 is not attached/],
      [(d) => (d.edges[1].id = d.edges[0].id), /Two connectors have the same id/],
      [(d) => (d.edges[0].data.endMarker = 'star'), /end this version does not know/],
      [(d) => (d.edges[0].data.waypoints = [{ x: 1 }]), /invalid bend points/],
      [(d) => (d.edges[0].data.labelPosition = 3), /invalid label position/],
      [(d) => (d.edges[0].data.sourcePort = { x: 2, y: 0 }), /invalid attachment point/],
      [(d) => (d.viewport = { x: 0, y: 0, zoom: 0 }), /saved view is damaged/],
      [(d) => (d.settings.autoLayout = 'radial'), /auto-arrange setting is damaged/],
      [(d) => (d.layers = [{ id: 'a', name: 'A', visible: true, locked: false }, { id: 'a', name: 'B', visible: true, locked: false }]), /layers is damaged/],
    ];
    for (const [change, reason] of cases) {
      const d = JSON.parse(JSON.stringify(flowchart()));
      change(d);
      expect(validateDiagram(d), String(reason)).toMatch(reason);
      expect(refusal(file(d))).toMatch(reason);
    }
  });

  it('keeps unknown fields inside shape data, which make the imported diagram schema 3', () => {
    const d = flowchart();
    (d.nodes[0].data as unknown as Record<string, unknown>).future = 1;
    const { content } = parseNativeFile(file(d));
    expect(content.nodes[0].data).toMatchObject({ future: 1 });
    expect(content.schemaVersion).toBe(3);
  });

  it('falls back to the file name when the title is missing or blank', () => {
    expect(parseNativeFile(file(flowchart(), { title: '  ' })).title).toBeNull();
    expect(parseNativeFile(file(flowchart(), { title: undefined })).title).toBeNull();
  });
});

describe('readDiagramFile', () => {
  it('opens its own files and diagrams.net files, telling them apart by content', () => {
    const native = readDiagramFile(toNativeFile(flowchart(), 'Flow'));
    expect(native).toMatchObject({ kind: 'native', title: 'Flow', nodes: 6, edges: 6, notes: [] });
    const xml = readFileSync(join(__dirname, '../../../tests/fixtures/drawio/library-system.drawio'), 'utf8');
    const drawio = readDiagramFile(xml);
    expect(drawio.kind).toBe('drawio');
    expect(drawio.nodes).toBeGreaterThan(0);
  });

  it('refuses anything else with a readable reason', () => {
    expect(() => readDiagramFile('hello')).toThrow(NativeDiagramError);
    expect(() => readDiagramFile('{ broken')).toThrow(/not valid JSON/);
    expect(() => readDiagramFile('<svg/>')).toThrow(/not a diagrams.net file/);
  });
});
