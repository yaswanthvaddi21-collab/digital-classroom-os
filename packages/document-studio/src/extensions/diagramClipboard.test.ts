// @vitest-environment jsdom
/** Phase 6 (CLIPBOARD): embedded diagrams and the clipboard (extensions/diagramClipboard.ts). */
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDiagramTextWidth, type DiagramHost, type EmbeddedDiagram } from './diagramEmbed';
import { boundDiagramSize, diagramClipboardKey, holdsShapes, SHAPES_CLIPBOARD_FORMAT, SHAPES_CLIPBOARD_HTML_ATTR, SHAPES_CLIPBOARD_MIME } from './diagramClipboard';
import { documentExtensions } from './index';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  vi.restoreAllMocks();
});

const source = { schemaVersion: 2, nodes: [{ id: 'n1', position: { x: 0, y: 0 }, width: 120, height: 60, data: { label: 'Start' } }], edges: [], viewport: null, settings: {} };
const attrs = { source, previewId: 'p1', naturalWidth: 800, naturalHeight: 600, width: 500, height: 375, title: 'My diagram' };
const phase6 = { align: null, caption: null, alt: null, svgPreviewId: null };
const para = (text?: string): JSONContent => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) });
const shapesJson = JSON.stringify({ format: SHAPES_CLIPBOARD_FORMAT, version: 1, source: 'ed', serial: 1, schemaVersion: 2, nodes: [{ id: 'a', data: { label: 'A' } }], edges: [] });
const carrierHtml = `<div ${SHAPES_CLIPBOARD_HTML_ATTR}="${shapesJson.replace(/"/g, '&quot;')}"><p>A</p></div>`;
const fromShapes: EmbeddedDiagram = { source: { schemaVersion: 2, nodes: [{ id: 'x' }], edges: [] }, previewId: 'shapes-png', naturalWidth: 300, naturalHeight: 150, title: 'Diagram' };

function hostWith(over: Partial<DiagramHost> = {}): DiagramHost {
  return {
    templates: [],
    edit: async () => null,
    pickFromLibrary: async () => null,
    importFile: async () => null,
    loadPreview: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    toDrawio: async () => '',
    ...over,
  };
}
const make = (content: JSONContent, host: DiagramHost | null = null) => {
  // Each step is its own undo step, as at human speed (history groups changes made within 500 ms).
  let now = Date.UTC(2026, 10, 14);
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
  editor = new Editor({ extensions: documentExtensions({ diagramHost: host }), content });
  return editor;
};
const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};
/** A paste event as the browser gives it (jsdom has no ClipboardEvent or DataTransfer). */
function paste(e: Editor, data: Record<string, string>) {
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { types: Object.keys(data), getData: (t: string) => data[t] ?? '', setData: () => {}, clearData: () => {} };
  e.view.dom.dispatchEvent(ev);
  return ev;
}
/** A copy event; returns what the editor put on the clipboard. */
function copy(e: Editor) {
  const store: Record<string, string> = {};
  const ev = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { getData: (t: string) => store[t] ?? '', setData: (t: string, v: string) => void (store[t] = v), clearData: () => {} };
  e.view.dom.dispatchEvent(ev);
  return store;
}
const diagrams = (e: Editor) => {
  const out: Array<Record<string, unknown>> = [];
  e.state.doc.descendants((n) => void (n.type.name === 'diagram' && out.push(n.attrs)));
  return out;
};
const types = (e: Editor) => (e.getJSON().content ?? []).map((n) => n.type);
const selectDiagram = (e: Editor, index = 0) => {
  let pos = -1;
  let i = 0;
  e.state.doc.descendants((n, p) => {
    if (n.type.name === 'diagram' && i++ === index) pos = p;
  });
  e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, pos)));
};
const copiedHtml = (e: Editor) => (e.view as unknown as { serializeForClipboard: (s: unknown) => { dom: HTMLElement; text: string } }).serializeForClipboard(e.state.selection.content());

describe('shapes copied in Diagram Studio paste as an embedded diagram', () => {
  it('detects every form Diagram Studio writes, and nothing else', () => {
    const g = (d: Record<string, string>) => (t: string) => d[t] ?? '';
    expect(holdsShapes(g({ [SHAPES_CLIPBOARD_MIME]: shapesJson }))).toBe(true);
    expect(holdsShapes(g({ 'text/html': carrierHtml, 'text/plain': 'A' }))).toBe(true);
    expect(holdsShapes(g({ 'text/plain': shapesJson }))).toBe(true);
    expect(holdsShapes(g({ 'text/plain': `I wrote "${SHAPES_CLIPBOARD_FORMAT}" in my notes` }))).toBe(false);
    expect(holdsShapes(g({ 'text/html': `<p>${SHAPES_CLIPBOARD_HTML_ATTR}</p>` }))).toBe(false);
    expect(holdsShapes(g({ 'text/plain': '{"format":"other","nodes":[],"edges":[]}' }))).toBe(false);
  });

  for (const [name, data] of [
    ['its own clipboard type (readable text beside it)', { [SHAPES_CLIPBOARD_MIME]: shapesJson, 'text/plain': 'A', 'text/html': carrierHtml }],
    ['the HTML carrier (Safari)', { 'text/html': carrierHtml, 'text/plain': 'A' }],
    ['JSON text from an earlier version', { 'text/plain': shapesJson }],
  ] as const) {
    it(`from ${name}: one diagram at the cursor, never the JSON, cursor after it`, async () => {
      const diagramFromShapes = vi.fn(async (get: (t: string) => string) => (holdsShapes(get) ? fromShapes : null));
      const e = make({ type: 'doc', content: [para('one'), para('two')] }, hostWith({ diagramFromShapes }));
      e.commands.setTextSelection(4); // end of "one"
      const ev = paste(e, data);
      expect(ev.defaultPrevented).toBe(true);
      await flush();
      expect(diagramFromShapes).toHaveBeenCalledTimes(1);
      expect(types(e)).toEqual(['paragraph', 'diagram', 'paragraph']);
      expect(diagrams(e)).toEqual([{ ...fromShapes, width: 300, height: 150, ...phase6 }]);
      expect(JSON.stringify(e.getJSON())).not.toContain(SHAPES_CLIPBOARD_FORMAT);
      expect(e.state.selection).toBeInstanceOf(TextSelection);
      expect(e.state.selection.$from.parent.textContent).toBe('two');
    });
  }

  it('a second paste adds another copy, and each is one undo step', async () => {
    const e = make({ type: 'doc', content: [para('one')] }, hostWith({ diagramFromShapes: async () => fromShapes }));
    e.commands.setTextSelection(4);
    paste(e, { [SHAPES_CLIPBOARD_MIME]: shapesJson });
    await flush();
    paste(e, { [SHAPES_CLIPBOARD_MIME]: shapesJson });
    await flush();
    expect(diagrams(e)).toHaveLength(2);
    e.commands.undo();
    expect(diagrams(e)).toHaveLength(1);
    e.commands.undo();
    expect(diagrams(e)).toHaveLength(0);
    expect(e.getText()).toBe('one');
    e.commands.redo();
    expect(diagrams(e)).toHaveLength(1);
  });

  it('goes where the paste happened even when the document changed while the diagram was drawn', async () => {
    let finish: (d: EmbeddedDiagram) => void = () => {};
    const e = make({ type: 'doc', content: [para('one'), para('two')] }, hostWith({ diagramFromShapes: () => new Promise((r) => (finish = r)) }));
    e.commands.setTextSelection(4);
    paste(e, { [SHAPES_CLIPBOARD_MIME]: shapesJson });
    e.view.dispatch(e.state.tr.insertText('Start: ', 1));
    finish(fromShapes);
    await flush();
    expect(((e.getJSON().content ?? []) as JSONContent[]).map((n) => (n.type === 'diagram' ? 'diagram' : n.content?.[0]?.text))).toEqual(['Start: one', 'diagram', 'two']);
  });

  it('nothing is pasted when the host cannot use the shapes (it tells the user why)', async () => {
    const e = make({ type: 'doc', content: [para('one')] }, hostWith({ diagramFromShapes: async () => null }));
    e.commands.setTextSelection(4);
    paste(e, { 'text/plain': shapesJson });
    await flush();
    expect(types(e)).toEqual(['paragraph']);
    expect(e.getText()).toBe('one');
    expect(diagramClipboardKey.getState(e.state)!.pending).toEqual([]);
  });

  it('without diagram support the readable text is pasted, never the JSON', () => {
    const e = make({ type: 'doc', content: [para('one')] }, null);
    e.commands.setTextSelection(4);
    paste(e, { 'text/plain': shapesJson });
    expect(e.getText()).toBe('one');
    paste(e, { [SHAPES_CLIPBOARD_MIME]: shapesJson, 'text/plain': 'A', 'text/html': carrierHtml });
    expect(e.getText()).toContain('A');
    expect(e.getText()).not.toContain(SHAPES_CLIPBOARD_FORMAT);
  });

  it('a read-only document pastes nothing', async () => {
    const diagramFromShapes = vi.fn(async () => fromShapes);
    const e = make({ type: 'doc', content: [para('one')] }, hostWith({ diagramFromShapes }));
    e.setEditable(false);
    paste(e, { [SHAPES_CLIPBOARD_MIME]: shapesJson });
    await flush();
    expect(diagramFromShapes).not.toHaveBeenCalled();
    expect(diagrams(e)).toHaveLength(0);
  });
});

describe('copying a diagram for other apps', () => {
  it('gives "[Diagram: title]" as text and the preview picture inside the figure once it is read', async () => {
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs: { ...attrs, caption: 'Figure 1' } }, para('b')] }, hostWith());
    selectDiagram(e);
    await flush();
    const store = copy(e);
    expect(store['text/plain']).toBe('[Diagram: My diagram]');
    const fig = new DOMParser().parseFromString(store['text/html'], 'text/html').querySelector('figure[data-type="diagram"]')!;
    expect(fig.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(fig.querySelector('img')!.getAttribute('alt')).toBe('My diagram');
    expect(fig.querySelector('figcaption')!.textContent).toBe('Figure 1');
    // This app still reads the diagram from its data, and the picture is not stored in the document.
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML(store['text/html'], new Event('paste') as ClipboardEvent);
    expect(diagrams(e)).toHaveLength(2);
    expect(diagrams(e)[1]).toEqual({ ...attrs, ...phase6, caption: 'Figure 1' });
    expect(JSON.stringify(e.getJSON())).not.toContain('data:image');
    expect(e.getHTML()).not.toContain('<img');
  });

  it('text around a diagram keeps its text, with the diagram named in place', () => {
    const e = make({ type: 'doc', content: [para('before'), { type: 'diagram', attrs: { ...attrs, title: '' } }, para('after')] });
    e.commands.selectAll();
    expect(copiedHtml(e).text).toBe('before\n\n[Diagram: Untitled]\n\nafter');
  });

  it('copies without a picture when the preview cannot be read', async () => {
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] }, hostWith({ loadPreview: async () => undefined }));
    selectDiagram(e);
    await flush();
    const { dom, text } = copiedHtml(e);
    expect(text).toBe('[Diagram: My diagram]');
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('figure')!.getAttribute('data-diagram')).toContain('"previewId":"p1"');
  });
});

describe('pasting a copied diagram', () => {
  it('a second Ctrl+V adds another copy instead of replacing the one just pasted', () => {
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] });
    selectDiagram(e);
    const html = copiedHtml(e).dom.innerHTML;
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    expect(e.state.selection).not.toBeInstanceOf(NodeSelection);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    expect(diagrams(e)).toHaveLength(3);
    for (const d of diagrams(e)) expect(d).toEqual({ ...attrs, ...phase6 });
    e.commands.undo();
    expect(diagrams(e)).toHaveLength(2);
  });

  it('keeps every attribute in a table cell, a list item and a text box, and undo/redo work there', () => {
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] });
    selectDiagram(e);
    const html = copiedHtml(e).dom.innerHTML;
    for (const [where, content] of [
      ['tableCell', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('cell')] }, { type: 'tableCell', content: [para()] }] }] }],
      ['listItem', { type: 'bulletList', content: [{ type: 'listItem', content: [para('item')] }] }],
      ['textBox', { type: 'textBox', content: [para('box')] }],
    ] as const) {
      e.commands.setContent({ type: 'doc', content: [content as unknown as JSONContent, para('end')] });
      let at = -1;
      e.state.doc.descendants((n, p) => {
        if (at < 0 && n.isTextblock && n.textContent && n.textContent !== 'end') at = p + 1 + n.content.size;
      });
      e.commands.setTextSelection(at);
      e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
      const parents: string[] = [];
      e.state.doc.descendants((n, _p, parent) => void (n.type.name === 'diagram' && parents.push(parent!.type.name)));
      expect(parents, where).toEqual([where]);
      expect(diagrams(e), where).toEqual([{ ...attrs, ...phase6 }]);
      e.commands.undo();
      expect(diagrams(e), where).toHaveLength(0);
      e.commands.redo();
      expect(diagrams(e), where).toEqual([{ ...attrs, ...phase6 }]);
    }
  });

  it('bounds sizes read from pasted data', () => {
    expect(boundDiagramSize({ naturalWidth: 800, naturalHeight: 600, width: 500, height: 375 })).toEqual({});
    expect(boundDiagramSize({ naturalWidth: 1e9, naturalHeight: 600, width: 1e9, height: 5 })).toEqual({ naturalWidth: 400, naturalHeight: 300, width: 4000, height: 3000 });
    expect(boundDiagramSize({ naturalWidth: 10000, naturalHeight: 10, width: 300, height: 0.3 })).toEqual({ naturalWidth: 400, naturalHeight: 300, height: 225 });
    expect(boundDiagramSize({ naturalWidth: 400, naturalHeight: 300, width: 2, height: 1 })).toEqual({ width: 40, height: 30 });
    expect(boundDiagramSize({ naturalWidth: 400, naturalHeight: 300, width: 400, height: 999 })).toEqual({ height: 300 });
    const e = make({ type: 'doc', content: [para('x')] });
    e.commands.setTextSelection(2);
    const html = `<figure data-type="diagram" data-diagram='${JSON.stringify({ ...attrs, naturalWidth: 1e12, naturalHeight: 3, width: 9e9, height: 1 })}'></figure>`;
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    expect(diagrams(e)[0]).toMatchObject({ naturalWidth: 400, naturalHeight: 300, width: 4000, height: 3000, previewId: 'p1', source });
  });

  it('fits a diagram pasted into a narrower container (a table cell), keeping its aspect ratio', async () => {
    // The editor is 800 px wide on screen and the cell 200 px: a quarter of the page's 800 px text width.
    const widths = { cell: 200, page: 800 };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'TD' ? widths.cell : this.classList.contains('ProseMirror') ? widths.page : 0;
    });
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] });
    setDiagramTextWidth(e, 800);
    selectDiagram(e);
    const html = copiedHtml(e).dom.innerHTML;
    e.commands.setContent({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('cell')] }] }] }, para('end')] });
    e.commands.setTextSelection(7);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    await flush();
    expect(diagrams(e)[0]).toMatchObject({ width: 200, height: 150, naturalWidth: 800, naturalHeight: 600 });
    // The fit is part of the paste: one undo removes the diagram.
    e.commands.undo();
    expect(diagrams(e)).toHaveLength(0);
  });

  // Round 3 (verifier, CLIPBOARD): the stored size must not depend on the window's width.
  it('on a narrow screen (a phone) a paste stores the same size as on a desktop', async () => {
    const widths = { cell: 89, page: 356 };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'TD' ? widths.cell : this.classList.contains('ProseMirror') ? widths.page : 0;
    });
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] });
    setDiagramTextWidth(e, 800);
    selectDiagram(e);
    const html = copiedHtml(e).dom.innerHTML;
    // At the top level the stored width is kept: CSS shows it narrower, exports use the stored width.
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    await flush();
    expect(diagrams(e).map((d) => [d.width, d.height])).toEqual([
      [500, 375],
      [500, 375],
    ]);
    // In a cell a quarter of the editor's width: a quarter of the page's text width, as on a desktop.
    e.commands.setContent({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('cell')] }] }] }, para('end')] });
    e.commands.setTextSelection(7);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    await flush();
    expect(diagrams(e)[0]).toMatchObject({ width: 200, height: 150 });
  });

  // Round 3: a pasted diagram whose preview is gone is drawn again by its view (diagramNode.test.tsx), not by this
  // plugin as well, so it is drawn and stored once.
  it('leaves a lost preview to the diagram\'s view: the plugin itself draws nothing', async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const renderPreview = vi.fn(async () => ({ png, width: 800, height: 400 }));
    const storePreview = vi.fn(async () => 'redrawn');
    const e = make({ type: 'doc', content: [para('x')] }, hostWith({ renderPreview, storePreview, loadPreview: vi.fn(async () => undefined) }));
    e.commands.setTextSelection(2);
    e.view.pasteHTML(`<figure data-type="diagram" data-diagram='${JSON.stringify({ ...attrs, previewId: 'gone' })}'></figure>`, new Event('paste') as ClipboardEvent);
    await flush(10);
    expect(diagrams(e)[0]).toMatchObject({ previewId: 'gone', source });
    expect(renderPreview).not.toHaveBeenCalled();
  });
});
