// @vitest-environment jsdom
/** Phase 6 (CLIPBOARD): readable clipboard text, the HTML carrier, and document diagrams pasted as shapes. */
import { describe, expect, it } from 'vitest';
import { DIAGRAM_SCHEMA, serializeDiagram, type Connector, type DiagramContent, type DiagramSettings, type ShapeNode } from '../types';
import {
  CLIPBOARD_FORMAT,
  CLIPBOARD_HTML_ATTR,
  CLIPBOARD_MIME,
  clipboardForms,
  clipboardText,
  diagramFromClipboard,
  DOCUMENT_DIAGRAM_NO_DATA,
  documentDiagramsFromHtml,
  NEWER_SHAPES_MESSAGE,
  readClipboardPayload,
  toClipboardPayload,
} from './canvasModel';

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const settings: DiagramSettings = { snapToGrid: true, showGrid: true, autoLayout: 'none' };
const shape = (id: string, x: number, y: number, label = id.toUpperCase(), extra: Partial<ShapeNode> = {}): ShapeNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 50, data: { ...style, shape: 'rectangle', label }, selected: true, ...extra });
const edge = (id: string, source: string, target: string, label?: string): Connector => ({ id, source, target, sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', ...(label ? { label } : {}), data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } });
const payloadOf = (ns: ShapeNode[], es: Connector[] = []) => toClipboardPayload(ns, es, 'ed', 1, settings)!;
const getter = (data: Record<string, string>) => (t: string) => data[t] ?? '';
const figure = (source: unknown, extra = '') =>
  `<figure data-type="diagram" data-diagram="${JSON.stringify({ source, previewId: 'p', naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: 'T' }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"${extra}><img src="data:image/png;base64,AA==" alt="T"></figure>`;
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
};

describe('readable clipboard text', () => {
  it('lists shape labels top to bottom, then left to right, and labelled connectors', () => {
    const p = payloadOf([shape('b', 300, 0, 'Second'), shape('a', 0, 0, 'First'), shape('c', 0, 200, 'Third  line\nwrapped'), shape('d', 0, 400, '')], [edge('e1', 'a', 'b', 'yes'), edge('e2', 'b', 'c')]);
    expect(clipboardText(p)).toBe('First\nSecond\nThird line wrapped\nFirst → Second: yes');
  });

  it('names shapes without text by their number', () => {
    expect(clipboardText(payloadOf([shape('a', 0, 0, ''), shape('b', 0, 0, ' ')]))).toBe('[Diagram: 2 shapes]');
    expect(clipboardText(payloadOf([shape('a', 0, 0, '')]))).toBe('[Diagram: 1 shape]');
  });

  it('gives JSON in its own type, readable text, and HTML that escapes labels and carries the JSON', () => {
    const p = payloadOf([shape('a', 0, 0, '<b>"Tom" & Jerry</b>')]);
    const f = clipboardForms(p);
    expect(JSON.parse(f.json)).toEqual(p);
    expect(f.text).toBe('<b>"Tom" & Jerry</b>');
    expect(f.text).not.toContain(CLIPBOARD_FORMAT);
    expect(f.html).toContain('<p>&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;</p>');
    const doc = new DOMParser().parseFromString(f.html, 'text/html');
    expect(doc.querySelector('b')).toBeNull(); // no markup from a label
    expect(JSON.parse(doc.querySelector(`[${CLIPBOARD_HTML_ATTR}]`)!.getAttribute(CLIPBOARD_HTML_ATTR)!)).toEqual(p);
  });
});

describe('reading copied shapes', () => {
  const p = payloadOf([shape('a', 0, 0)]);
  const f = clipboardForms(p);

  it('reads its own type first, then the HTML carrier, then JSON text from earlier versions', () => {
    expect(readClipboardPayload(getter({ [CLIPBOARD_MIME]: f.json }))!.diagram.nodes[0].data.label).toBe('A');
    expect(readClipboardPayload(getter({ 'text/html': f.html, 'text/plain': f.text }))!.diagram.nodes[0].data.label).toBe('A');
    expect(readClipboardPayload(getter({ 'text/plain': f.json }))!.diagram.nodes[0].data.label).toBe('A');
    expect(readClipboardPayload(getter({ 'text/plain': 'A', 'text/html': '<p>A</p>' }))).toBeNull();
    // A page that merely mentions the attribute name is not shapes.
    expect(readClipboardPayload(getter({ 'text/html': `<p>${CLIPBOARD_HTML_ATTR}</p>` }))).toBeNull();
  });

  it('refuses newer shapes with the existing message, from any form', () => {
    const newer = JSON.stringify({ ...p, schemaVersion: DIAGRAM_SCHEMA + 1 });
    expect(() => readClipboardPayload(getter({ [CLIPBOARD_MIME]: newer }))).toThrow(NEWER_SHAPES_MESSAGE);
    const html = `<div ${CLIPBOARD_HTML_ATTR}="${newer.replace(/"/g, '&quot;')}"></div>`;
    expect(() => readClipboardPayload(getter({ 'text/html': html }))).toThrow(NEWER_SHAPES_MESSAGE);
  });

  it('makes a new diagram from copied shapes, without layer names (the new diagram has none)', () => {
    const withLayer = payloadOf([shape('a', 0, 0, 'A', { layer: 'L1' }), shape('b', 300, 0)], [edge('e', 'a', 'b')]);
    const content = diagramFromClipboard(getter({ [CLIPBOARD_MIME]: JSON.stringify(withLayer) }))!;
    expect(content.nodes.map((n) => n.data.label)).toEqual(['A', 'B']);
    expect(content.nodes.every((n) => !('layer' in n))).toBe(true);
    expect(content.edges).toHaveLength(1);
    expect(content.layers).toBeUndefined();
    expect(diagramFromClipboard(getter({ 'text/plain': 'hello' }))).toBeNull();
    expect(diagramFromClipboard(getter({ [CLIPBOARD_MIME]: JSON.stringify({ ...withLayer, nodes: [], edges: [] }) }))).toBeNull();
  });
});

describe('document diagrams pasted as shapes', () => {
  const src = (ids: string[], x0 = 0): DiagramContent => serializeDiagram(ids.map((id, i) => shape(id, x0 + i * 200, 50)), ids.length > 1 ? [edge('e', ids[0], ids[1])] : [], null, settings);

  it('reads every copied diagram, side by side with unique ids, and never changes the copied data', () => {
    const one = deepFreeze(src(['a', 'b']));
    const two = deepFreeze(src(['a'], 500));
    const r = documentDiagramsFromHtml(`<p>text</p>${figure(one)}<p>x</p>${figure(two)}`)!;
    expect(r.count).toBe(2);
    expect(r.nodes.map((n) => n.data.label)).toEqual(['A', 'B', 'A']);
    expect(new Set(r.nodes.map((n) => n.id)).size).toBe(3);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ source: r.nodes[0].id, target: r.nodes[1].id });
    // The second diagram starts right of the first (first ends at 200 + 100), top-aligned.
    expect(r.nodes[2].position).toEqual({ x: 360, y: 50 });
  });

  it('is null for HTML without a document diagram', () => {
    expect(documentDiagramsFromHtml('<p>hello</p>')).toBeNull();
    expect(documentDiagramsFromHtml('')).toBeNull();
    expect(documentDiagramsFromHtml(null)).toBeNull();
  });

  it('refuses a diagram from a newer version and says when the data is missing', () => {
    expect(() => documentDiagramsFromHtml(figure({ ...src(['a']), schemaVersion: DIAGRAM_SCHEMA + 1 }))).toThrow(NEWER_SHAPES_MESSAGE);
    expect(() => documentDiagramsFromHtml(figure(null))).toThrow(DOCUMENT_DIAGRAM_NO_DATA);
    expect(() => documentDiagramsFromHtml('<figure data-type="diagram" data-diagram="{not json"></figure>')).toThrow(DOCUMENT_DIAGRAM_NO_DATA);
  });
});
