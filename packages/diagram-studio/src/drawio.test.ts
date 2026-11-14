// @vitest-environment jsdom
import { deflateSync, strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrawioImportError, fromDrawio, htmlToText, toDrawio } from './drawio';
import { DRAWIO_SWIMLANE_KINDS } from './drawioFeatures';
import { canvasPosition } from './model';
import { diagramTemplates } from './templates';
import { deserializeDiagram, edgeMarkers, serializeDiagram } from './types';

describe('diagrams.net export → import round trip', () => {
  it.each(diagramTemplates.filter((t) => t.id !== 'blank').map((t) => [t.id, t] as const))('%s comes back exactly', (_, t) => {
    const original = t.build();
    const xml = toDrawio(original, t.name);
    expect(xml).toContain('<mxfile');
    const { content, report } = fromDrawio(xml);
    expect(report.notes).toEqual([]);
    expect(report.title).toBe(t.name);
    expect(content.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position, n.width, n.height])).toEqual(
      original.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position, n.width, n.height]),
    );
    expect(content.nodes.map((n) => [n.data.fill, n.data.stroke, n.data.textColor, n.data.fontSize, n.data.dashed])).toEqual(
      original.nodes.map((n) => [n.data.fill, n.data.stroke, n.data.textColor, n.data.fontSize, n.data.dashed]),
    );
    expect(content.edges.map((e) => [e.source, e.target, e.type, e.label, e.sourceHandle, e.targetHandle, edgeMarkers(e.data), e.data.dashed, e.data.color])).toEqual(
      original.edges.map((e) => [e.source, e.target, e.type, e.label, e.sourceHandle, e.targetHandle, edgeMarkers(e.data), e.data.dashed, e.data.color]),
    );
    // And the result is a diagram the editor can load.
    const state = deserializeDiagram(content);
    expect(state.nodes).toHaveLength(original.nodes.length);
    expect(serializeDiagram(state.nodes, state.edges, null, state.settings).edges).toHaveLength(original.edges.length);
  });

  it('escapes text so labels with markup and quotes survive', () => {
    const original = diagramTemplates.find((t) => t.id === 'flowchart')!.build();
    original.nodes[0].data.label = 'A < B & "C"\nline 2';
    const { content } = fromDrawio(toDrawio(original));
    expect(content.nodes[0].data.label).toBe('A < B & "C"\nline 2');
  });
});

const SAMPLE = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="d" value="Is it raining?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="200" y="40" width="120" height="80" as="geometry"/></mxCell>
  <mxCell id="s" value="&lt;b&gt;Start&lt;/b&gt;" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="-80" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="cls" value="Book" style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;" vertex="1" parent="1"><mxGeometry x="500" y="40" width="160" height="104" as="geometry"/></mxCell>
  <mxCell id="r1" value="+ title: String&lt;br&gt;+ isbn: String" style="text;align=left;" vertex="1" parent="cls"><mxGeometry y="26" width="160" height="40" as="geometry"/></mxCell>
  <mxCell id="ln" style="line;strokeWidth=1;" vertex="1" parent="cls"><mxGeometry y="66" width="160" height="8" as="geometry"/></mxCell>
  <mxCell id="r2" value="+ borrow(): void" style="text;align=left;" vertex="1" parent="cls"><mxGeometry y="74" width="160" height="30" as="geometry"/></mxCell>
  <mxCell id="grp" style="group" vertex="1" parent="1"><mxGeometry x="100" y="300" width="200" height="100" as="geometry"/></mxCell>
  <mxCell id="inner" value="Inside group" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="grp"><mxGeometry x="20" y="10" width="120" height="50" as="geometry"/></mxCell>
  <mxCell id="pic" value="" style="shape=image;image=data:image/png,abc;" vertex="1" parent="1"><mxGeometry x="700" y="300" width="50" height="50" as="geometry"/></mxCell>
  <mxCell id="star" value="Star" style="shape=mxgraph.basic.star;" vertex="1" parent="1"><mxGeometry x="800" y="300" width="50" height="50" as="geometry"/></mxCell>
  <mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=block;endFill=1;" edge="1" parent="1" source="s" target="d"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="lbl" value="yes" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e2"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="e2" value="" style="endArrow=ERmany;startArrow=ERmandOne;edgeStyle=none;" edge="1" parent="1" source="d" target="r2"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="e3" style="endArrow=block;endFill=0;dashed=1;" edge="1" parent="1" source="d"><mxGeometry relative="1" as="geometry"><mxPoint x="1" y="1" as="targetPoint"/></mxGeometry></mxCell>
</root></mxGraphModel>`;

describe('importing files drawn in diagrams.net', () => {
  it('maps standard shapes, class stacks, groups, labels and ER ends, and reports what it could not bring in', () => {
    const { content, report } = fromDrawio(`<mxfile><diagram name="Page-1">${SAMPLE}</diagram><diagram name="Page-2"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>`);
    const byId = Object.fromEntries(content.nodes.map((n) => [n.id, n]));
    expect(byId.d.data).toMatchObject({ shape: 'diamond', label: 'Is it raining?', fill: '#fff2cc', stroke: '#d6b656' });
    expect(byId.s.data).toMatchObject({ shape: 'ellipse', label: 'Start' });
    expect(byId.cls.data.shape).toBe('umlClass');
    expect(byId.cls.data.label).toBe('Book\n+ title: String\n+ isbn: String\n--\n+ borrow(): void');
    expect(byId.r1).toBeUndefined();
    // Phase 5 (G-DRAWIO): groups are kept as groups; the shape inside stores its position relative to the group.
    expect(byId.grp.data.shape).toBe('group');
    expect(byId.inner).toMatchObject({ parentId: 'grp', position: { x: 20, y: 10 } });
    // An embedded picture is kept as an image shape (diagrams.net writes `data:image/png,<base64>`).
    expect(byId.pic.data).toMatchObject({ shape: 'image', image: 'data:image/png;base64,abc' });
    expect(byId.star.data.shape).toBe('rectangle');

    const e1 = content.edges.find((e) => e.id === 'e1')!;
    expect(e1).toMatchObject({ source: 's', target: 'd', type: 'step', sourceHandle: 'b', targetHandle: 't' });
    const e2 = content.edges.find((e) => e.id === 'e2')!;
    expect(e2).toMatchObject({ source: 'd', target: 'cls', type: 'straight', label: 'yes' });
    expect(edgeMarkers(e2.data)).toEqual({ start: 'crow-one', end: 'crow-many' });
    expect(content.edges.find((e) => e.id === 'e3')).toBeUndefined();

    expect(report.title).toBe('Page-1');
    expect(report.notes.join(' ')).toMatch(/first page/);
    expect(report.notes.join(' ')).not.toMatch(/Images|flattened/);
    expect(report.notes.join(' ')).toMatch(/mxgraph\.basic\.star/);
    expect(report.notes.join(' ')).toMatch(/1 connector/);
  });

  it('lets a specific shape= win over generic names, and reports the fallback', () => {
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="c" value="Catalogue" style="ellipse;shape=cloud;" vertex="1" parent="1"><mxGeometry width="120" height="70" as="geometry"/></mxCell></root></mxGraphModel>`;
    const { content, report } = fromDrawio(xml);
    expect(content.nodes[0].data.shape).toBe('ellipse');
    expect(report.notes).toEqual(['Shapes of type “cloud” were imported as ellipses.']);
  });

  it('reads compressed pages', () => {
    const encoded = btoa(String.fromCharCode(...deflateSync(strToU8(encodeURIComponent(SAMPLE)))));
    const { content } = fromDrawio(`<mxfile host="app.diagrams.net"><diagram id="x" name="Zipped">${encoded}</diagram></mxfile>`);
    expect(content.nodes.some((n) => n.data.label === 'Is it raining?')).toBe(true);
  });

  it('rejects files that are not diagrams', () => {
    expect(() => fromDrawio('not xml at all <')).toThrow(DrawioImportError);
    expect(() => fromDrawio('<svg></svg>')).toThrow(/not a diagrams.net file/);
    expect(() => fromDrawio('<mxfile><diagram name="x">@@@@</diagram></mxfile>')).toThrow(DrawioImportError);
    expect(() => fromDrawio('<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>')).toThrow(/no shapes/);
  });

  it('turns HTML labels into text with line breaks', () => {
    expect(htmlToText('a<br>b<div>c</div>&amp; d&nbsp;e')).toBe('a\nbc\n& d e');
    expect(htmlToText(null)).toBe('');
  });
});

/** Canvas positions of every node (children store positions relative to their container). */
const canvas = (c: { nodes: Array<{ id: string; position: { x: number; y: number }; parentId?: string }> }) => {
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  return c.nodes.map((n) => canvasPosition(n, byId));
};

const page = (cells: string) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

describe('cells wrapped in <UserObject> / <object>', () => {
  // diagrams.net wraps a cell that has a link, tooltip or custom properties; the wrapper holds the id and label.
  const xml = page(`
    <UserObject label="Alpha" link="https://example.com" id="a"><mxCell style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></UserObject>
    <object label="&lt;b&gt;Beta&lt;/b&gt;" tooltip="Second step" owner="sam" id="b"><mxCell style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="0" width="100" height="50" as="geometry"/></mxCell></object>
    <UserObject label="" id="box"><mxCell style="rounded=0;container=1;" vertex="1" parent="1"><mxGeometry x="400" y="100" width="200" height="120" as="geometry"/></mxCell></UserObject>
    <mxCell id="inner" value="Inner" style="rounded=1;" vertex="1" parent="box"><mxGeometry x="20" y="30" width="80" height="40" as="geometry"/></mxCell>
    <UserObject label="Book" id="cls"><mxCell style="swimlane;fontStyle=1;childLayout=stackLayout;startSize=26;" vertex="1" parent="1"><mxGeometry x="0" y="200" width="160" height="60" as="geometry"/></mxCell></UserObject>
    <UserObject label="+ title: String" id="row"><mxCell style="text;align=left;" vertex="1" parent="cls"><mxGeometry y="26" width="160" height="30" as="geometry"/></mxCell></UserObject>
    <mxCell id="e1" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    <UserObject label="checks" link="https://example.com/rule" id="e2"><mxCell edge="1" source="b" target="inner" parent="1" style="endArrow=block;"><mxGeometry relative="1" as="geometry"/></mxCell></UserObject>
    <mxCell id="e3" edge="1" source="inner" target="row" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`);

  it('takes the id and label from the wrapper, so shapes and connectors are kept', () => {
    const { content, report } = fromDrawio(xml);
    expect(content.nodes.map((n) => [n.id, n.data.label])).toEqual([
      ['a', 'Alpha'],
      ['b', 'Beta'],
      ['box', ''],
      ['inner', 'Inner'],
      ['cls', 'Book\n+ title: String'],
    ]);
    // Phase 5: a container keeps its shapes inside it, at positions relative to it.
    expect(content.nodes.find((n) => n.id === 'inner')).toMatchObject({ parentId: 'box', position: { x: 20, y: 30 } });
    // …and the wrapper's link, tooltip and other attributes are kept (DS-R1).
    expect(content.nodes.find((n) => n.id === 'a')!.data.link).toBe('https://example.com');
    expect(content.nodes.find((n) => n.id === 'b')!.data).toMatchObject({ tooltip: 'Second step', properties: { owner: 'sam' }, bold: true });
    expect(content.edges.map((e) => [e.id, e.source, e.target, e.label])).toEqual([
      ['e1', 'a', 'b', ''],
      ['e2', 'b', 'inner', 'checks'],
      ['e3', 'inner', 'cls', ''],
    ]);
    // DS-R1: this used to assert no notes although the connector's link was dropped. Connectors cannot hold links.
    expect(report.notes).toEqual(['Links, tooltips or custom properties on 1 connector were left out: connectors cannot hold them here.']);
    const state = deserializeDiagram(content);
    expect(state.nodes).toHaveLength(5);
    expect(state.edges).toHaveLength(3);
  });

  it('round-trips through export unchanged', () => {
    const first = fromDrawio(xml).content;
    const again = fromDrawio(toDrawio(first)).content;
    expect(again.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position])).toEqual(first.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position]));
    expect(again.edges.map((e) => [e.id, e.source, e.target, e.label])).toEqual(first.edges.map((e) => [e.id, e.source, e.target, e.label]));
  });
});

describe('swimlanes and containers', () => {
  // These cover the outline fallback (no BPMN kinds); drawio-phase5.test.ts covers the pool and lane mapping.
  const saved = { ...DRAWIO_SWIMLANE_KINDS };
  beforeEach(() => Object.assign(DRAWIO_SWIMLANE_KINDS, { pool: null, lane: null }));
  afterEach(() => Object.assign(DRAWIO_SWIMLANE_KINDS, saved));

  // Phase 5 (G-DRAWIO): a lane holds its shapes (parentId, positions relative to it). These tests cover the outline
  // fallback used while no BPMN lane kind is registered (DRAWIO_SWIMLANE_KINDS); drawio-phase5.test.ts covers the hook.
  it('imports a process lane as a box behind its shapes, not as a class', () => {
    const { content, report } = fromDrawio(
      page(`
      <mxCell id="lane" value="Student" style="swimlane;startSize=20;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="100" y="50" width="400" height="200" as="geometry"/></mxCell>
      <mxCell id="s" value="Submit" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="lane"><mxGeometry x="20" y="40" width="100" height="50" as="geometry"/></mxCell>
      <mxCell id="r" value="Review" style="rhombus;whiteSpace=wrap;" vertex="1" parent="lane"><mxGeometry x="200" y="40" width="100" height="80" as="geometry"/></mxCell>
      <mxCell id="e" edge="1" source="s" target="r" parent="lane"><mxGeometry relative="1" as="geometry"/></mxCell>`),
    );
    expect(content.nodes.map((n) => [n.id, n.data.shape, n.data.label, n.position])).toEqual([
      ['lane', 'rectangle', 'Student', { x: 100, y: 50 }],
      ['s', 'rounded', 'Submit', { x: 20, y: 40 }],
      ['r', 'diamond', 'Review', { x: 200, y: 40 }],
    ]);
    expect(canvas(content).slice(1)).toEqual([
      { x: 120, y: 90 },
      { x: 300, y: 90 },
    ]);
    expect(content.nodes.slice(1).map((n) => n.parentId)).toEqual(['lane', 'lane']);
    expect(content.nodes[0]).toMatchObject({ width: 400, height: 200 });
    // The title sits at the top, where diagrams.net draws the lane's title band.
    expect(content.nodes[0].data.verticalAlign).toBe('top');
    // Transparent, so connectors between the shapes inside stay visible.
    expect(content.nodes[0].data.fill).toBe('transparent');
    expect(content.edges.map((e) => [e.source, e.target])).toEqual([['s', 'r']]);
    expect(report.notes).toEqual(['1 swimlane was imported as an outline that holds its shapes: the title band and the lane colour are not drawn.']);
  });

  it('keeps everything in a pool of lanes, at the same canvas positions, containers first', () => {
    // Pools in diagrams.net use a stack layout for their lanes; that alone must not make them a class.
    const { content } = fromDrawio(
      page(`
      <mxCell id="b" value="Done" style="ellipse;" vertex="1" parent="lane2"><mxGeometry x="60" y="10" width="80" height="40" as="geometry"/></mxCell>
      <mxCell id="pool" value="Admissions" style="swimlane;childLayout=stackLayout;resizeParent=1;horizontal=0;startSize=20;horizontalStack=0;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="500" height="240" as="geometry"/></mxCell>
      <mxCell id="lane1" value="Applicant" style="swimlane;startSize=20;horizontal=0;html=1;" vertex="1" parent="pool"><mxGeometry x="20" width="480" height="120" as="geometry"/></mxCell>
      <mxCell id="lane2" value="Office" style="swimlane;startSize=20;horizontal=0;html=1;" vertex="1" parent="pool"><mxGeometry x="20" y="120" width="480" height="120" as="geometry"/></mxCell>
      <mxCell id="a" value="Apply" style="rounded=1;" vertex="1" parent="lane1"><mxGeometry x="40" y="30" width="100" height="50" as="geometry"/></mxCell>
      <mxCell id="e" edge="1" source="a" target="b" parent="pool"><mxGeometry relative="1" as="geometry"/></mxCell>`),
    );
    expect(content.nodes.map((n, i) => [n.id, n.data.shape, n.data.label, canvas(content)[i], n.parentId])).toEqual([
      ['pool', 'rectangle', 'Admissions', { x: 40, y: 40 }, undefined],
      ['lane1', 'rectangle', 'Applicant', { x: 60, y: 40 }, 'pool'],
      ['a', 'rounded', 'Apply', { x: 100, y: 70 }, 'lane1'],
      ['lane2', 'rectangle', 'Office', { x: 60, y: 160 }, 'pool'],
      ['b', 'ellipse', 'Done', { x: 120, y: 170 }, 'lane2'],
    ]);
    expect(content.edges.map((e) => [e.source, e.target])).toEqual([['a', 'b']]);
  });

  it('keeps a connector the diagram really draws from a shape back to itself', () => {
    const d = deserializeDiagram({
      schemaVersion: 2,
      nodes: [{ id: 'n1', type: 'shape', position: { x: 0, y: 0 }, width: 160, height: 70, data: { shape: 'rounded', label: 'Loop' } }],
      edges: [{ id: 'e1', source: 'n1', target: 'n1', sourceHandle: 'r', targetHandle: 't', type: 'smoothstep' }],
    });
    expect(d.edges).toHaveLength(1);
    const { content, report } = fromDrawio(toDrawio(serializeDiagram(d.nodes, d.edges, d.viewport, d.settings), 'Loop'));
    expect(content.edges.map((e) => [e.source, e.target])).toEqual([['n1', 'n1']]);
    expect(report.notes.join(' ')).not.toMatch(/left out/);
  });

  it('says so when shapes nested inside a class row are left out', () => {
    const { content, report } = fromDrawio(
      page(`
      <mxCell id="cls" value="C" style="swimlane;childLayout=stackLayout;startSize=26;" vertex="1" parent="1"><mxGeometry width="160" height="56" as="geometry"/></mxCell>
      <mxCell id="r" value="r" style="text;" vertex="1" parent="cls"><mxGeometry y="26" width="160" height="30" as="geometry"/></mxCell>
      <mxCell id="hidden" value="hidden" style="rounded=1;" vertex="1" parent="r"><mxGeometry width="40" height="20" as="geometry"/></mxCell>`),
    );
    expect(content.nodes.map((n) => n.data.label)).toEqual(['C\nr']);
    expect(report.notes).toContain('Shapes nested inside the rows of some class or entity boxes were left out.');
  });

  it('still folds a class stack, and never emits a connector from a shape to itself', () => {
    const { content, report } = fromDrawio(
      page(`
      <mxCell id="cls" value="Node" style="swimlane;fontStyle=1;childLayout=stackLayout;startSize=26;" vertex="1" parent="1"><mxGeometry width="160" height="86" as="geometry"/></mxCell>
      <mxCell id="f1" value="+ next: Node" style="text;align=left;" vertex="1" parent="cls"><mxGeometry y="26" width="160" height="30" as="geometry"/></mxCell>
      <mxCell id="f2" value="+ value: int" style="text;align=left;" vertex="1" parent="cls"><mxGeometry y="56" width="160" height="30" as="geometry"/></mxCell>
      <mxCell id="loop" edge="1" source="f1" target="f2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`),
    );
    expect(content.nodes.map((n) => [n.id, n.data.shape, n.data.label])).toEqual([['cls', 'umlClass', 'Node\n+ next: Node\n+ value: int']]);
    expect(content.edges).toEqual([]);
    expect(report.notes).toEqual(['1 connector between rows of the same class or entity was left out.']);
  });
});

describe('ER tables', () => {
  it('reads column text from the row cells and keeps connectors to rows', () => {
    const { content, report } = fromDrawio(
      page(`
      <mxCell id="t" value="Users" style="shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="180" height="90" as="geometry"/></mxCell>
      <mxCell id="r1" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=1;" vertex="1" parent="t"><mxGeometry y="30" width="180" height="30" as="geometry"/></mxCell>
      <mxCell id="c1b" value="id" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;align=left;spacingLeft=6;fontStyle=5;overflow=hidden;whiteSpace=wrap;html=1;" vertex="1" parent="r1"><mxGeometry x="30" width="150" height="30" as="geometry"/></mxCell>
      <mxCell id="c1a" value="PK" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;fontStyle=1;overflow=hidden;whiteSpace=wrap;html=1;" vertex="1" parent="r1"><mxGeometry width="30" height="30" as="geometry"/></mxCell>
      <mxCell id="r2" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;top=0;left=0;right=0;bottom=0;" vertex="1" parent="t"><mxGeometry y="60" width="180" height="30" as="geometry"/></mxCell>
      <mxCell id="c2a" value="" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;html=1;" vertex="1" parent="r2"><mxGeometry width="30" height="30" as="geometry"/></mxCell>
      <mxCell id="c2b" value="email" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;align=left;spacingLeft=6;html=1;" vertex="1" parent="r2"><mxGeometry x="30" width="150" height="30" as="geometry"/></mxCell>
      <mxCell id="o" value="Orders" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="300" y="0" width="100" height="50" as="geometry"/></mxCell>
      <mxCell id="e1" style="edgeStyle=entityRelationEdgeStyle;endArrow=ERmany;startArrow=ERmandOne;" edge="1" source="r1" target="o" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`),
    );
    expect(content.nodes.map((n) => [n.id, n.data.shape, n.data.label])).toEqual([
      ['t', 'erEntity', 'Users\nPK id\nemail'],
      ['o', 'rectangle', 'Orders'],
    ]);
    expect(content.edges.map((e) => [e.source, e.target])).toEqual([['t', 'o']]);
    expect(report.notes.join(' ')).toMatch(/Tables were imported as entities/);
    // Exported, it comes back as the same entity.
    const again = fromDrawio(toDrawio(content)).content;
    expect(again.nodes.map((n) => [n.id, n.data.shape, n.data.label])).toEqual(content.nodes.map((n) => [n.id, n.data.shape, n.data.label]));
  });
});

describe('characters XML cannot hold', () => {
  it('drops forbidden control characters and keeps tabs and carriage returns', () => {
    const original = diagramTemplates.find((t) => t.id === 'flowchart')!.build();
    original.nodes[0].data.label = 'a\u0000\u000Bb\tc\u001F\uFFFE';
    original.nodes[1].data.label = 'x\ry';
    const xml = toDrawio(original, 'Title\u0007 one');
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    expect(xml).toContain('b&#9;c');
    expect(xml).toContain('x&#13;y');
    const { content, report } = fromDrawio(xml);
    expect(report.title).toBe('Title one');
    expect(content.nodes[0].data.label).toBe('ab\tc');
    expect(content.nodes[1].data.label).toBe('x\ry');
  });
});
