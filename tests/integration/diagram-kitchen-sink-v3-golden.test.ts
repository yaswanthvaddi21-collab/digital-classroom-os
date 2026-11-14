// @vitest-environment jsdom
/**
 * Diagram schema-3 "kitchen sink" golden (Phase 5, Round 3): one diagram that uses every Phase 5 feature: BPMN pool and
 * lanes holding shapes, events, tasks, sub-process, the three gateways, data object and store, message flow and
 * association notations; every network icon (the server with a link, a tooltip and properties); UML lifelines,
 * activations and messages, activity initial/action/fork/final, a use case inside a system boundary; timeline dates on
 * an axis; groups (one inside a BPMN lane, with a bent connector between its shapes and a moved label); layers (a
 * locked layer and a hidden one holding a locked shape); a locked shape; a hidden shape; rotation, opacity, font,
 * alignment and an embedded picture; connection points (corner and floating); all four line types.
 *
 * It is exported to diagrams.net and to SVG and compared with committed snapshots (golden/diagram-v3), checked feature
 * by feature, read back (the .drawio import, the native file, the system-clipboard payload) and copied. Any change to
 * the export output must be a reviewed snapshot update (`npx vitest run -u`). The fixture itself never changes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { schema3Reason, schemaFor } from '../../packages/diagram-studio/src/compat';
import { drawioExportNotes, fromDrawio, toDrawio } from '../../packages/diagram-studio/src/drawio';
import { parseClipboardPayload, toClipboardPayload } from '../../packages/diagram-studio/src/editor/canvasModel';
import { copyForPaste } from '../../packages/diagram-studio/src/editor/mutations';
import { LIBRARY_KINDS } from '../../packages/diagram-studio/src/library/kinds';
import { parseNativeFile, toNativeFile, validateDiagram } from '../../packages/diagram-studio/src/native';
import { deserializeDiagram, serializeDiagram, type DiagramContent, type ShapeNode } from '../../packages/diagram-studio/src/types';
import { renderDiagramSvg } from '../../packages/diagram-studio/src/vector/renderSvg';

const DIR = join(__dirname, '..', 'golden', 'diagram-v3');
const RAW = readFileSync(join(DIR, 'kitchen-sink-v3.json'), 'utf8');
const content = (): DiagramContent => JSON.parse(RAW) as DiagramContent;
const TITLE = 'Kitchen sink v3';

/** The stored form after opening in the editor and saving, as the editor does. */
const reopen = (d: DiagramContent) => {
  const s = deserializeDiagram(d);
  return serializeDiagram(s.nodes, s.edges, null, s.settings, s.layers);
};
const byId = (d: DiagramContent) => new Map(d.nodes.map((n) => [n.id, n]));
const paintOrder = (svg: string) => [...svg.matchAll(/data-node-id="([^"]+)"/g)].map((m) => m[1]);

describe('the schema-3 kitchen sink', () => {
  it('uses every Phase 5 feature', () => {
    const k = content();
    expect(k.schemaVersion).toBe(3);
    expect(schemaFor(k)).toBe(3);
    expect(schema3Reason(k)).toBeTruthy();
    const kinds = new Set(k.nodes.map((n) => n.data.shape));
    for (const kind of [...LIBRARY_KINDS, 'image', 'group', 'actor', 'ellipse', 'rounded']) expect(kinds, kind).toContain(kind);
    const nodeFields = new Set(k.nodes.flatMap((n) => Object.keys(n)));
    for (const f of ['parentId', 'locked', 'hidden', 'layer']) expect(nodeFields).toContain(f);
    const dataFields = new Set(k.nodes.flatMap((n) => Object.keys(n.data)));
    for (const f of ['rotation', 'link', 'tooltip', 'properties', 'opacity', 'fontFamily', 'textAlign', 'verticalAlign', 'image']) expect(dataFields).toContain(f);
    const edgeFields = new Set(k.edges.flatMap((e) => Object.keys(e.data ?? {})));
    for (const f of ['waypoints', 'labelPosition', 'sourcePort', 'targetPort']) expect(edgeFields).toContain(f);
    expect(new Set(k.edges.map((e) => e.type))).toEqual(new Set(['straight', 'smoothstep', 'step', 'default']));
    expect(k.layers?.map((l) => [l.id, l.visible, l.locked])).toEqual([
      ['base', true, false],
      ['overlay', true, true],
      ['answers', false, false],
    ]);
    // Cross-feature cases.
    const m = byId(k);
    expect(m.get('g-lane')).toMatchObject({ parentId: 'laneA', data: { shape: 'group' } }); // a group inside a BPMN lane
    expect(m.get('task1')!.parentId).toBe('g-lane');
    expect(m.get('secret')).toMatchObject({ layer: 'answers', locked: true }); // a locked shape on a hidden layer
    expect(k.edges.find((e) => e.id === 'e-tasks')!.data!.waypoints).toHaveLength(2); // bends between grouped shapes
    expect(m.get('server')!.data).toMatchObject({ link: expect.stringMatching(/^https:/), properties: { ip: '10.0.0.5' } }); // network icon with a link and properties
  });

  it('opens and saves unchanged (stored content is never rewritten)', () => {
    expect(reopen(content())).toEqual(content());
    expect(validateDiagram(content())).toBeNull();
  });

  describe('diagrams.net', () => {
    const xml = toDrawio(content(), TITLE);

    it('matches the golden .drawio', async () => {
      await expect(xml).toMatchFileSnapshot(join(DIR, 'kitchen-sink-v3.drawio'));
    });

    it('is well-formed, uses diagrams.net forms, and loses nothing it reports', () => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      expect(drawioExportNotes(content())).toEqual([]);
      // Pools and lanes are swimlanes with their shapes inside; the group in the lane is a group cell inside it.
      // A cell wrapped in a UserObject (link, tooltip, properties) takes its id from the wrapper.
      const cell = (id: string) => [...doc.getElementsByTagName('mxCell')].find((c) => (c.getAttribute('id') ?? c.parentElement?.getAttribute('id')) === id)!;
      expect(cell('laneA').getAttribute('style')).toMatch(/^swimlane;horizontal=0/);
      expect(cell('laneA').getAttribute('parent')).toBe('pool');
      expect(cell('g-lane').getAttribute('parent')).toBe('laneA');
      expect(cell('g-lane').getAttribute('style')).toMatch(/^group;/);
      expect(cell('task1').getAttribute('parent')).toBe('g-lane');
      expect(cell('gw').getAttribute('style')).toMatch(/shape=mxgraph\.bpmn\.gateway2;.*gwType=exclusive/);
      expect(cell('server').getAttribute('style')).toMatch(/shape=mxgraph\.networks\.server/);
      // The server's link, tooltip and properties are a UserObject; the hidden layer and locked shape are marked.
      const server = [...doc.getElementsByTagName('UserObject')].find((u) => u.getAttribute('id') === 'server')!;
      expect(server.getAttribute('link')).toBe('https://example.com/servers/main?a=1&b=2');
      expect(server.getAttribute('owner')).toBe('IT & Labs');
      expect(cell('answers').getAttribute('visible')).toBe('0');
      expect(cell('secret').getAttribute('style')).toMatch(/locked=1/);
      expect(cell('hiddenNote').getAttribute('visible')).toBe('0');
      // Bends and the moved label of the connector between the grouped shapes.
      const bent = cell('e-tasks');
      expect(bent.getElementsByTagName('Array')[0].getAttribute('as')).toBe('points');
    });

    it('comes back exactly from the .drawio file, naming only what is hidden', () => {
      const { content: back, report } = fromDrawio(xml);
      expect(back.nodes).toEqual(content().nodes);
      expect(back.edges).toEqual(content().edges);
      expect(back.layers).toEqual(content().layers);
      expect(report.notes).toEqual(['1 shape hidden in the file was imported hidden: “Hidden draft”. “Show hidden shapes” in the Layers panel shows it.', 'The layer “Answers” is hidden in the file, so it was imported as a hidden layer.']);
    });
  });

  describe('SVG', () => {
    const r = renderDiagramSvg(content(), { title: TITLE });

    it('matches the golden SVG', async () => {
      await expect(r.svg).toMatchFileSnapshot(join(DIR, 'kitchen-sink-v3.svg'));
    });

    it('is plain vector SVG that draws what the canvas draws, with the notes the toast shows', () => {
      const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(r.svg).not.toMatch(/foreignObject|<div|class=/);
      const drawn = paintOrder(r.svg);
      // Hidden shape and the hidden layer's locked shape are left out, with their connectors.
      expect(drawn).not.toContain('hiddenNote');
      expect(drawn).not.toContain('secret');
      expect(r.notes).toEqual(['1 hidden shape was left out.', '1 shape on a hidden layer was left out.', '2 connectors to shapes that are not shown were left out.']);
      // Containers under what they hold: pool, lane, group, then the grouped tasks; the locked layer's note on top.
      const at = (id: string) => drawn.indexOf(id);
      expect(at('pool')).toBeLessThan(at('laneA'));
      expect(at('laneA')).toBeLessThan(at('g-lane'));
      expect(at('g-lane')).toBeLessThan(at('task1'));
      expect(at('teacher')).toBe(drawn.length - 1);
      // The network icon keeps its link and tooltip; the picture is embedded; rotation and opacity are drawn.
      expect(r.svg).toContain('href="https://example.com/servers/main?a=1&amp;b=2"');
      expect(r.svg).toContain('<title>Rack 2, &quot;top&quot; slot</title>');
      expect(r.svg).toMatch(/<image [^>]*href="data:image\/png;base64,/);
      expect(r.svg).toMatch(/data-node-id="styled"/);
      expect(r.svg).toMatch(/rotate\(15 /);
      for (const label of ['Search catalogue', 'Reserve copy', 'School server', 'Borrow a book', '1947', 'Library system']) expect(r.svg).toContain(label);
    });
  });

  it('survives the native file and the system clipboard', () => {
    const file = toNativeFile(content(), TITLE);
    expect(parseNativeFile(file).content).toEqual(content());
    // Copy the group inside the lane, with its shapes and the bent connector between them.
    const d = deserializeDiagram(content());
    const nodes = d.nodes.map((n) => (n.id === 'g-lane' ? { ...n, selected: true } : n)) as ShapeNode[];
    const payload = toClipboardPayload(nodes, d.edges, 'editor-a', 1, d.settings)!;
    expect(payload.nodes.map((n) => (n as { id: string }).id)).toEqual(['g-lane', 'task1', 'task2']);
    const pasted = parseClipboardPayload(JSON.stringify(payload))!.diagram;
    expect(pasted.edges.map((e) => [e.id, e.data?.waypoints])).toEqual([['e-tasks', [{ x: 290, y: 110 }, { x: 330, y: 110 }]]]);
    // The copied group leaves the lane (its lane was not copied) at its canvas place; bends move with the paste.
    expect(pasted.nodes[0].parentId).toBeUndefined();
    expect(pasted.nodes[0].position).toEqual({ x: 150, y: 30 });
    let k = 0;
    const copy = copyForPaste({ nodes: pasted.nodes, edges: pasted.edges }, pasted.nodes, 30, (p) => `${p}-${++k}`);
    expect(copy.nodes.map((n) => n.parentId)).toEqual([undefined, copy.nodes[0].id, copy.nodes[0].id]);
    expect(copy.edges[0].data!.waypoints).toEqual([
      { x: 320, y: 140 },
      { x: 360, y: 140 },
    ]);
  });
});
