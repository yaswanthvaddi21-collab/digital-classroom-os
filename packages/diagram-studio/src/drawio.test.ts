// @vitest-environment jsdom
import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DrawioImportError, fromDrawio, htmlToText, toDrawio } from './drawio';
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
    expect(byId.grp).toBeUndefined();
    expect(byId.inner.position).toEqual({ x: 120, y: 310 });
    expect(byId.star.data.shape).toBe('rectangle');

    const e1 = content.edges.find((e) => e.id === 'e1')!;
    expect(e1).toMatchObject({ source: 's', target: 'd', type: 'step', sourceHandle: 'b', targetHandle: 't' });
    const e2 = content.edges.find((e) => e.id === 'e2')!;
    expect(e2).toMatchObject({ source: 'd', target: 'cls', type: 'straight', label: 'yes' });
    expect(edgeMarkers(e2.data)).toEqual({ start: 'crow-one', end: 'crow-many' });
    expect(content.edges.find((e) => e.id === 'e3')).toBeUndefined();

    expect(report.title).toBe('Page-1');
    expect(report.notes.join(' ')).toMatch(/first page/);
    expect(report.notes.join(' ')).toMatch(/Images/);
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
