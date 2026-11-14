// @vitest-environment jsdom
/**
 * G-DRAWIO (Phase 5 round 2): diagrams.net export writes every schema-3 field, and import brings each one back.
 * The kitchen-sink diagram and every template must survive toDrawio → fromDrawio exactly; the file must use
 * diagrams.net's own forms (groups, layers, visible="0", UserObject, Array points, exit/entry points) so that
 * diagrams.net itself reads them. Fixture files drawn in diagrams.net's form are in tests/integration/drawio-corpus.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { schema3Reason, schemaFor } from './compat';
import { drawioExportNotes, fromDrawio, toDrawio } from './drawio';
import { endFromStyle, imageFromStyle, imageToStyle, isPropertyName, readLabelPlace, richText } from './drawioFeatures';
import type { DrawioStyle } from './drawioRegistry';
import { parseNativeFile, toNativeFile } from './native';
import { MAX_IMAGE_CHARS, readFontFamily, readImage, readOpacity, readTextAlign, readVerticalAlign } from './shapeStyleFields';
import { diagramTemplates } from './templates';
import { deserializeDiagram, edgeMarkers, serializeDiagram, type DiagramContent, type ShapeData } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const base = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const shape = (kind: ShapeData['shape'], label: string, extra: Partial<ShapeData> = {}): ShapeData => ({ ...base, shape: kind, label, ...extra });
const connector = { color: '#475569', width: 2, dashed: false, arrow: 'end' as const, startMarker: 'none' as const, endMarker: 'arrow' as const };

/** The stored form after opening in the editor and saving. */
const save = (d: DiagramContent) => {
  const s = deserializeDiagram(d);
  return serializeDiagram(s.nodes, s.edges, null, s.settings, s.layers);
};
const roundTrip = (d: DiagramContent) => fromDrawio(toDrawio(d, 'Kitchen sink'));

/** Every schema-3 field the model has, on shapes and connectors, in groups and on layers. */
export function kitchenSink(): DiagramContent {
  return save({
    schemaVersion: 3,
    layers: [
      { id: 'base', name: 'Base', visible: true, locked: false },
      { id: 'answers', name: 'Answers', visible: false, locked: false },
      { id: 'notes', name: 'Teacher notes', visible: true, locked: true },
    ],
    nodes: [
      { id: 'g', position: { x: 300, y: 200 }, width: 400, height: 260, layer: 'base', data: shape('group', '', { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 }) },
      { id: 'g-in', position: { x: 10, y: 10 }, width: 200, height: 120, parentId: 'g', layer: 'base', data: shape('group', '', { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 }) },
      { id: 'child', position: { x: 20, y: 30 }, width: 140, height: 60, parentId: 'g-in', layer: 'base', locked: true, data: shape('rounded', 'In a nested group', { rotation: 15 }) },
      { id: 'hidden', position: { x: 220, y: 150 }, width: 120, height: 60, parentId: 'g', layer: 'base', hidden: true, data: shape('note', 'Secret\nsecond line', { fill: '#fef9c3' }) },
      {
        id: 'linked',
        position: { x: 0, y: 0 },
        width: 160,
        height: 80,
        layer: 'base',
        data: shape('rectangle', 'Linked & "quoted" <b>', {
          link: 'https://example.com/a?b=1&c=2',
          tooltip: 'Tip with "quotes"\nand a new line',
          properties: { subject: 'Physics', 'grade.level': '9', owner_name: 'Ms. Rao & Co' },
          opacity: 60,
          fontFamily: 'Georgia, "Times New Roman", serif',
          textAlign: 'left',
          verticalAlign: 'top',
          bold: true,
        }),
      },
      { id: 'pic', position: { x: 0, y: 140 }, width: 80, height: 80, layer: 'base', data: shape('image', 'Logo', { fill: 'transparent', stroke: 'transparent', strokeWidth: 0, image: PNG }) },
      { id: 'cls', position: { x: 0, y: 300 }, width: 200, height: 130, layer: 'base', data: shape('umlClass', 'Book\n+ title: String\n--\n+ borrow(): void', { fontSize: 13, link: 'mailto:library@example.com' }) },
      { id: 'answer', position: { x: 800, y: 0 }, width: 120, height: 60, layer: 'answers', data: shape('ellipse', '42', { textAlign: 'right', verticalAlign: 'bottom' }) },
      { id: 'note', position: { x: 800, y: 200 }, width: 160, height: 40, layer: 'notes', data: shape('text', 'Ask pairs first', { fill: 'transparent', stroke: 'transparent', strokeWidth: 0, fontSize: 16 }) },
    ],
    edges: [
      {
        id: 'e-bend',
        source: 'linked',
        target: 'child',
        sourceHandle: 'r',
        targetHandle: 't',
        type: 'step',
        label: 'via',
        data: { ...connector, waypoints: [{ x: 250, y: 40 }, { x: 250, y: 120.5 }], labelPosition: 0.25, targetPort: { x: 0.25, y: 0 } },
      },
      { id: 'e-perim', source: 'pic', target: 'answer', sourceHandle: 'r', targetHandle: 'l', type: 'straight', label: '', data: { ...connector, sourcePort: 'perimeter', targetPort: { x: 0, y: 0.5 } } },
      { id: 'e-group', source: 'g', target: 'note', sourceHandle: 'r', targetHandle: 'l', type: 'default', label: 'to group', data: { ...connector, dashed: true, labelPosition: 0.9 } },
      { id: 'e-class', source: 'cls', target: 'hidden', sourceHandle: 'b', targetHandle: 'l', type: 'smoothstep', label: '', data: { ...connector, startMarker: 'diamond-filled', endMarker: 'open-arrow' } },
    ],
    viewport: null,
    settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
  });
}

describe('the kitchen-sink diagram through diagrams.net', () => {
  it('uses every schema-3 field (so this test covers them all)', () => {
    const k = kitchenSink();
    expect(k.schemaVersion).toBe(3);
    const nodeFields = new Set(k.nodes.flatMap((n) => Object.keys(n)));
    const dataFields = new Set(k.nodes.flatMap((n) => Object.keys(n.data)));
    const edgeFields = new Set(k.edges.flatMap((e) => Object.keys(e.data)));
    for (const f of ['parentId', 'locked', 'hidden', 'layer']) expect(nodeFields).toContain(f);
    for (const f of ['rotation', 'link', 'tooltip', 'properties', 'opacity', 'fontFamily', 'textAlign', 'verticalAlign', 'image']) expect(dataFields).toContain(f);
    for (const f of ['waypoints', 'labelPosition', 'sourcePort', 'targetPort']) expect(edgeFields).toContain(f);
  });

  it('comes back exactly: every shape, connector, field and layer', () => {
    const k = kitchenSink();
    expect(drawioExportNotes(k)).toEqual([]);
    const { content, report } = roundTrip(k);
    expect(content.nodes).toEqual(k.nodes);
    expect(content.edges).toEqual(k.edges);
    expect(content.layers).toEqual(k.layers);
    expect(content.schemaVersion).toBe(3);
    // Hidden content is still named on the way back in (DS-R2); nothing else is noted.
    expect(report.notes).toEqual(['1 shape hidden in the file was imported hidden: “Secret”. “Show hidden shapes” in the Layers panel shows it.', 'The layer “Answers” is hidden in the file, so it was imported as a hidden layer.']);
    // And it is a diagram the editor stores as it is.
    expect(save(content)).toEqual({ ...k, viewport: null });
  });

  it('comes back in the order it was stored, also when shapes on different layers are interleaved', () => {
    const d = kitchenSink();
    d.nodes.push(...d.nodes.splice(d.nodes.findIndex((n) => n.id === 'pic'), 1)); // a base-layer shape after the top layer's
    expect(roundTrip(d).content.nodes.map((n) => n.id)).toEqual(d.nodes.map((n) => n.id));
  });

  it('writes diagrams.net’s own forms', () => {
    const doc = new DOMParser().parseFromString(toDrawio(kitchenSink()), 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const cell = (id: string) => {
      const wrapped = Array.from(doc.querySelectorAll('UserObject')).find((u) => u.getAttribute('id') === id);
      return (wrapped?.querySelector('mxCell') ?? doc.querySelector(`mxCell[id="${id}"]`))!;
    };
    // Layers: cells under the root; hidden and locked as diagrams.net stores them.
    expect(Array.from(doc.querySelectorAll('mxCell[parent="0"]')).map((c) => [c.getAttribute('id'), c.getAttribute('value'), c.getAttribute('visible'), c.getAttribute('style')])).toEqual([
      ['base', 'Base', null, null],
      ['answers', 'Answers', '0', null],
      ['notes', 'Teacher notes', null, 'locked=1;'],
    ]);
    // Groups: real group cells, children inside them at relative positions.
    expect(cell('g').getAttribute('style')).toMatch(/^group;/);
    expect(cell('g-in').getAttribute('parent')).toBe('g');
    expect(cell('child').getAttribute('parent')).toBe('g-in');
    expect(cell('child').querySelector('mxGeometry')!.getAttribute('x')).toBe('20');
    expect(cell('answer').getAttribute('parent')).toBe('answers');
    // Hidden, locked, rotation, opacity, font, alignment.
    expect(cell('hidden').getAttribute('visible')).toBe('0');
    expect(cell('child').getAttribute('style')).toMatch(/rotation=15;.*locked=1;/);
    expect(cell('linked').getAttribute('style')).toContain('opacity=60;fontFamily=Georgia, "Times New Roman", serif;align=left;verticalAlign=top;');
    // Links, tooltips and properties on a UserObject, as diagrams.net's Edit Data writes them.
    const uo = Array.from(doc.querySelectorAll('UserObject')).find((u) => u.getAttribute('id') === 'linked')!;
    expect(uo.getAttribute('link')).toBe('https://example.com/a?b=1&c=2');
    expect(uo.getAttribute('tooltip')).toBe('Tip with "quotes"\nand a new line');
    expect([uo.getAttribute('subject'), uo.getAttribute('grade.level'), uo.getAttribute('owner_name')]).toEqual(['Physics', '9', 'Ms. Rao & Co']);
    expect(uo.getAttribute('label')).toBe('Linked &amp; "quoted" &lt;b&gt;');
    // A picture as diagrams.net embeds it (no `;base64`, which would end the style entry).
    expect(cell('pic').getAttribute('style')).toContain(`image=data:image/png,${PNG.split(',')[1]};`);
    // Bend points, label position, connection points.
    const bend = cell('e-bend');
    expect(Array.from(bend.querySelectorAll('Array[as="points"] > mxPoint')).map((p) => [p.getAttribute('x'), p.getAttribute('y')])).toEqual([
      ['250', '40'],
      ['250', '120.5'],
    ]);
    expect(bend.querySelector('mxGeometry')!.getAttribute('x')).toBe('-0.5');
    expect(bend.getAttribute('style')).toMatch(/exitX=1;exitY=0.5;.*entryX=0.25;entryY=0;entryDx=0;entryDy=0;/);
    // A perimeter end is a floating end in diagrams.net: no exit point.
    expect(cell('e-perim').getAttribute('style')).not.toMatch(/exitX/);
    expect(cell('e-perim').getAttribute('style')).toMatch(/entryX=0;entryY=0.5;/);
  });

  it('keeps the kitchen sink through a native file too', () => {
    const k = kitchenSink();
    expect(parseNativeFile(toNativeFile(k, 'K')).content).toEqual(k);
  });

  it('refuses a native file whose presentation fields are damaged, instead of dropping them on load', () => {
    for (const [field, value, reason] of [
      ['opacity', 140, /invalid opacity/],
      ['fontFamily', 'a;b', /invalid font family/],
      ['textAlign', 'justify', /invalid text alignment/],
      ['verticalAlign', 'middle', /invalid vertical text alignment/],
      ['image', 'https://example.com/a.png', /invalid picture/],
    ] as const) {
      const k = kitchenSink();
      (k.nodes.find((n) => n.id === 'linked')!.data as unknown as Record<string, unknown>)[field] = value;
      expect(() => parseNativeFile(toNativeFile(k, 'K'))).toThrow(reason);
    }
  });
});

/** Connector ends as drawn: an import always names both ends (startMarker/endMarker), where a template may use `arrow`. */
const ends = (d: DiagramContent) => d.edges.map((e) => ({ ...e, data: (({ arrow: _a, startMarker: _s, endMarker: _e, ...rest }) => ({ ...rest, ...edgeMarkers(e.data) }))(e.data) }));

/**
 * Nodes in drawing order as a tree: each shape followed by the shapes inside it, siblings in their stored order. An
 * import lists a container's shapes right after it (diagrams.net's order); the order among siblings, which is what
 * decides which of two overlapping shapes is on top, must be unchanged.
 */
const treeOrder = (d: DiagramContent) => {
  const kids = new Map<string | undefined, DiagramContent['nodes']>();
  for (const n of d.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const out: DiagramContent['nodes'] = [];
  const walk = (id: string | undefined) => (kids.get(id) ?? []).forEach((n) => (out.push(n), walk(n.id)));
  walk(undefined);
  return out;
};

describe('every template through diagrams.net', () => {
  // A blank diagram has nothing to import (fromDrawio refuses a file with no shapes).
  it.each(diagramTemplates.filter((t) => t.id !== 'blank').map((t) => [t.id, t] as const))('%s comes back exactly, with no notes', (_, t) => {
    const original = save(t.build());
    expect(drawioExportNotes(original)).toEqual([]);
    const { content, report } = fromDrawio(toDrawio(original, t.name));
    expect(report.notes).toEqual([]);
    expect(treeOrder(content)).toEqual(treeOrder(original));
    expect(content.nodes).toHaveLength(original.nodes.length);
    expect(ends(content)).toEqual(ends(original));
    expect(content.layers).toEqual(original.layers);
  });
});

describe('what a .drawio export still cannot hold', () => {
  it('names custom properties whose names diagrams.net cannot store, and keeps the rest', () => {
    const d = kitchenSink();
    d.nodes.find((n) => n.id === 'linked')!.data.properties = { ok: '1', 'two words': '2', label: '3', '9lives': '4' };
    expect(drawioExportNotes(d)).toEqual([expect.stringMatching(/^3 custom properties were left out: diagrams\.net cannot store their names/)]);
    const back = roundTrip(d).content.nodes.find((n) => n.id === 'linked')!;
    expect(back.data.properties).toEqual({ ok: '1' });
  });

  it('names a shape on another layer than its group (diagrams.net keeps a group on one layer)', () => {
    const d = kitchenSink();
    d.nodes.find((n) => n.id === 'child')!.layer = 'notes';
    expect(drawioExportNotes(d)).toEqual(["1 shape inside a group was written on the layer of its group: in diagrams.net a group's shapes share its layer."]);
    expect(roundTrip(d).content.nodes.find((n) => n.id === 'child')!.layer).toBe('base');
  });

  it('writes a layer whose id is taken by a shape under a fresh id', () => {
    const d = kitchenSink();
    d.layers![1] = { ...d.layers![1], id: 'pic' };
    d.nodes.find((n) => n.id === 'answer')!.layer = 'pic';
    const back = roundTrip(d).content;
    expect(back.layers!.map((l) => l.name)).toEqual(['Base', 'Answers', 'Teacher notes']);
    expect(back.layers![1].id).not.toBe('pic');
    expect(back.nodes.find((n) => n.id === 'answer')!.layer).toBe(back.layers![1].id);
  });
});

describe('the new shape data fields', () => {
  const flow = () => save(diagramTemplates.find((t) => t.id === 'flowchart')!.build());

  it.each([
    ['opacity', 50],
    ['fontFamily', 'Georgia'],
    ['textAlign', 'left'],
    ['verticalAlign', 'bottom'],
    ['image', PNG],
  ] as const)('%s marks a diagram schema 3, and its default (absent) keeps it 2', (field, value) => {
    const d = flow();
    expect(schemaFor(d)).toBe(2);
    (d.nodes[0].data as unknown as Record<string, unknown>)[field] = value;
    expect(schema3Reason(save(d))).toMatch(new RegExp(`data field ${field}`));
    expect(save(d).nodes[0].data[field]).toEqual(value);
  });

  it('ignores invalid values on load, never crashing', () => {
    expect([readOpacity(-1), readOpacity(100), readOpacity(150), readOpacity('50'), readOpacity(NaN), readOpacity(33.333)]).toEqual([undefined, undefined, undefined, undefined, undefined, 33.3]);
    expect([readFontFamily('Georgia; color: red'), readFontFamily('a}b'), readFontFamily(''), readFontFamily('x'.repeat(200)), readFontFamily(' Noto Sans ')]).toEqual([undefined, undefined, undefined, undefined, 'Noto Sans']);
    expect([readTextAlign('center'), readTextAlign('right'), readVerticalAlign('middle'), readVerticalAlign('top')]).toEqual([undefined, 'right', undefined, 'top']);
    expect(readImage(PNG)).toBe(PNG);
    for (const bad of ['https://example.com/x.png', 'javascript:alert(1)', 'data:text/html;base64,PGI+', 'data:image/png;base64,not base64!', 'data:image/png,', `data:image/png;base64,${'A'.repeat(MAX_IMAGE_CHARS)}`, 42])
      expect(readImage(bad)).toBeUndefined();
    const d = flow();
    Object.assign(d.nodes[0].data, { opacity: 'x', fontFamily: '}', textAlign: 'justify', image: 'https://example.com/a.png' });
    expect(save(d).nodes[0].data).toEqual(flow().nodes[0].data);
  });
});

describe('diagrams.net value mappings', () => {
  const st = (s: string): DrawioStyle => {
    const names = new Set<string>();
    const map = new Map<string, string>();
    for (const p of s.split(';').filter(Boolean)) {
      const i = p.indexOf('=');
      if (i < 0) names.add(p);
      else map.set(p.slice(0, i), p.slice(i + 1));
    }
    return { names, map };
  };

  it('reads connection points: side centres as handles, other points as ports, our own tags exactly', () => {
    expect(endFromStyle(st('exitX=0.5;exitY=0;'), 'source')).toEqual({ handle: 't', offset: false });
    expect(endFromStyle(st('exitX=0.9;exitY=0.1;exitDx=3;'), 'source')).toEqual({ handle: 'r', port: { x: 0.9, y: 0.1 }, offset: true });
    expect(endFromStyle(st('entryX=2;entryY=-1;'), 'target')).toEqual({ handle: 't', port: { x: 1, y: 0 }, offset: false });
    expect(endFromStyle(st(''), 'target')).toEqual({ handle: null, offset: false });
    expect(endFromStyle(st('dcosSourcePort=perimeter;dcosSourceHandle=l;'), 'source')).toEqual({ handle: 'l', port: 'perimeter', offset: false });
    expect(endFromStyle(st('exitX=0.5;exitY=0;dcosSourcePort=0.5,0;dcosSourceHandle=b;'), 'source')).toEqual({ handle: 'b', port: { x: 0.5, y: 0 }, offset: false });
  });

  it('reads label positions along the line', () => {
    const g = (attrs: string, inner = '') => new DOMParser().parseFromString(`<mxGeometry ${attrs}>${inner}</mxGeometry>`, 'application/xml').documentElement;
    expect(readLabelPlace(g('relative="1" x="-1"'))).toEqual({ position: 0, offset: false });
    expect(readLabelPlace(g('relative="1"'))).toEqual({ position: undefined, offset: false });
    expect(readLabelPlace(g('relative="1" x="0.5" y="10"'))).toEqual({ position: 0.75, offset: true });
    expect(readLabelPlace(g('relative="1"', '<mxPoint x="5" as="offset"/>'))).toEqual({ position: undefined, offset: true });
  });

  it('converts pictures between diagrams.net styles and data: URLs', () => {
    expect(imageFromStyle('data:image/png,iVBORw0KGgo=')).toEqual({ image: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(imageFromStyle('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E')).toEqual({ image: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E' });
    expect(imageFromStyle('https://example.com/a.png')).toEqual({ problem: 'web' });
    expect(imageFromStyle('data:text/html,<b>')).toEqual({ problem: 'bad' });
    expect(imageToStyle('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png,iVBORw0KGgo=');
    expect(imageToStyle('data:image/svg+xml,a;b')).toBe('data:image/svg+xml,a%3Bb');
  });

  it('sees formatting in HTML labels, and keeps a wholly bold label as bold', () => {
    expect(richText('<b>All</b>')).toMatchObject({ wholeBold: true, inner: 'All', formatted: false });
    expect(richText('a<br>b<div>c</div>')).toMatchObject({ wholeBold: false, formatted: false, images: 0 });
    expect(richText('a <i>b</i>')).toMatchObject({ formatted: true });
    expect(richText('<b>a</b> and <b>b</b>')).toMatchObject({ wholeBold: false, formatted: true });
    expect(richText('x <img src="y.png"> z')).toMatchObject({ formatted: false, images: 1 });
  });

  it('only writes property names that are safe XML attribute names', () => {
    expect(['ok', 'grade.level', '_x', 'a-b'].every(isPropertyName)).toBe(true);
    expect(['', '9a', 'a b', 'a"b', 'a=b', 'x:y', 'label', 'link', 'tooltip', 'id', 'placeholders', 'xmlns'].some(isPropertyName)).toBe(false);
  });

  it('cannot be made to write markup through a value', () => {
    const d = kitchenSink();
    Object.assign(d.nodes.find((n) => n.id === 'linked')!.data, { tooltip: '"/><mxCell id="evil', properties: { k: '"><x a="' } });
    const xml = toDrawio(d);
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
    expect(xml).not.toContain('id="evil"');
    expect(roundTrip(d).content.nodes.find((n) => n.id === 'linked')!.data).toMatchObject({ tooltip: '"/><mxCell id="evil', properties: { k: '"><x a="' } });
  });
});

describe('diagrams.net files: Round 3 import fixes', () => {
  const file = (cells: string) => `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;

  it('an empty lane in a pool is a lane, not a class box', () => {
    const { content, report } = fromDrawio(
      file(
        '<mxCell id="pool" value="Pool" style="swimlane;horizontal=0;html=1;startSize=20;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="600" height="300" as="geometry"/></mxCell>' +
          '<mxCell id="lane1" value="Busy lane" style="swimlane;horizontal=0;html=1;startSize=20;" vertex="1" parent="pool"><mxGeometry x="20" y="0" width="580" height="150" as="geometry"/></mxCell>' +
          '<mxCell id="task" value="Task" style="rounded=1;" vertex="1" parent="lane1"><mxGeometry x="60" y="40" width="120" height="60" as="geometry"/></mxCell>' +
          '<mxCell id="lane2" value="Empty lane" style="swimlane;horizontal=0;html=1;startSize=20;" vertex="1" parent="pool"><mxGeometry x="20" y="150" width="580" height="150" as="geometry"/></mxCell>',
      ),
    );
    const kinds = Object.fromEntries(content.nodes.map((n) => [n.id, [n.data.shape, n.parentId]]));
    expect(kinds).toMatchObject({ pool: ['bpmnPool', undefined], lane1: ['bpmnLane', 'pool'], lane2: ['bpmnLane', 'pool'], task: ['rounded', 'lane1'] });
    expect(content.nodes.find((n) => n.id === 'lane2')!.data.label).toBe('Empty lane');
    expect(report.notes).toEqual([]);
  });

  it('an empty UML class (stack layout) is still a class', () => {
    const { content } = fromDrawio(file('<mxCell id="c" value="Empty" style="swimlane;childLayout=stackLayout;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="160" height="40" as="geometry"/></mxCell>'));
    expect(content.nodes[0].data.shape).toBe('umlClass');
  });

  it('a shape attached to the border of another (relative geometry) is placed where diagrams.net draws it, with a note', () => {
    const { content, report } = fromDrawio(
      file(
        '<mxCell id="a" value="Task" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="80" as="geometry"/></mxCell>' +
          '<mxCell id="ev" value="" style="ellipse;" vertex="1" parent="a"><mxGeometry relative="1" x="1" y="1" width="20" height="20" as="geometry"><mxPoint as="offset" x="-10" y="-10"/></mxGeometry></mxCell>',
      ),
    );
    const ev = content.nodes.find((n) => n.id === 'ev')!;
    expect(ev.parentId).toBe('a');
    expect(ev.position).toEqual({ x: 110, y: 70 });
    expect(report.notes).toEqual(['1 shape attached to the edge of another shape was placed where the file draws it; it moves with that shape but does not stay on its edge when it is resized.']);
  });

  it('names every hidden shape, counting the ones without text', () => {
    const { report } = fromDrawio(
      file(
        '<mxCell id="h1" value="Draft" style="rounded=1;" vertex="1" visible="0" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell>' +
          '<mxCell id="h2" value="" style="rounded=1;" vertex="1" visible="0" parent="1"><mxGeometry x="100" width="80" height="40" as="geometry"/></mxCell>',
      ),
    );
    expect(report.notes).toEqual(['2 shapes hidden in the file were imported hidden: “Draft” and 1 without text. “Show hidden shapes” in the Layers panel shows them.']);
  });

  it('exports BPMN events and gateways with diagrams.net’s BPMN shapes, and reads them back exactly', () => {
    const kinds = ['bpmnStart', 'bpmnIntermediate', 'bpmnEnd', 'bpmnExclusive', 'bpmnParallel', 'bpmnInclusive'] as const;
    const d: DiagramContent = {
      schemaVersion: 3,
      nodes: kinds.map((k, i) => ({ id: k, position: { x: i * 100, y: 0 }, width: 50, height: 50, data: shape(k, k) })),
      edges: [],
      viewport: null,
      settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
    };
    const xml = toDrawio(d, 'BPMN');
    expect(xml).toMatch(/shape=mxgraph\.bpmn\.event;[^"]*outline=standard;[^"]*dcosShape=bpmnStart/);
    expect(xml).toMatch(/outline=end;[^"]*dcosShape=bpmnEnd/);
    expect(xml).toMatch(/gwType=parallel;[^"]*dcosShape=bpmnParallel/);
    expect(xml).toMatch(/gwType=inclusive;[^"]*dcosShape=bpmnInclusive/);
    expect(fromDrawio(xml).content.nodes.map((n) => n.data.shape)).toEqual([...kinds]);
    // A diagrams.net file (no dcosShape) maps by outline and gwType.
    const plain = xml.replace(/dcosShape=[A-Za-z]+;?/g, '');
    expect(fromDrawio(plain).content.nodes.map((n) => n.data.shape)).toEqual([...kinds]);
  });
});
