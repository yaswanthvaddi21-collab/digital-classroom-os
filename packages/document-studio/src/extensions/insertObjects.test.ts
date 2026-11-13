// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentSchemaFor, schemaFor } from '../migrate';
import { prepareDocument } from '../safety';
import { createEmptyDocument } from '../types';
import { documentExtensions } from './index';
import { onObjectEditRequest } from './objectRequests';
import { writeEquation } from './equation';
import { deleteNodeAt, updateNodeAt } from './objectCommands';
import { readShape, shapeLabel, shapeSvg, SHAPE_KINDS } from './shape';
import { readTextBox, textBoxStyle } from './textBox';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const make = (content: JSONContent | string) => {
  editor = new Editor({ extensions: documentExtensions(), content });
  return editor;
};
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const text = (t: string): JSONContent => ({ type: 'text', text: t });

/** What a copy and paste does: the document goes out as the editor's HTML and is parsed back. */
function copyPaste(e: Editor): JSONContent {
  const html = e.getHTML();
  const other = new Editor({ extensions: documentExtensions(), content: html });
  const json = other.getJSON();
  other.destroy();
  return json;
}

/** Drops attributes left at null (other features add their own, e.g. paragraph formatting), for comparisons. */
function bare(n: JSONContent | undefined): JSONContent | undefined {
  if (!n) return n;
  const attrs = n.attrs && Object.fromEntries(Object.entries(n.attrs).filter(([, v]) => v !== null));
  return { ...n, ...(attrs && Object.keys(attrs).length ? { attrs } : { attrs: undefined }), ...(n.content ? { content: n.content.map((c) => bare(c)!) } : {}) };
}

const blockNodes = (e: Editor) => (e.getJSON().content ?? []).map((n) => n.type);

describe('equations', () => {
  const content = doc(p(text('Energy '), { type: 'inlineMath', attrs: { latex: 'E = mc^2' } }, text(' holds.')), { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } });

  it('stores inline and display equations as LaTeX and draws them with KaTeX', () => {
    const e = make(content);
    expect(bare(e.getJSON())).toEqual(bare(content));
    const dom = e.view.dom;
    expect(dom.querySelector('[data-type="inline-math"] .katex')).toBeTruthy();
    expect(dom.querySelector('[data-type="block-math"] .katex-display')).toBeTruthy();
  });

  it('survive copy and paste (HTML) with their LaTeX', () => {
    expect(bare(copyPaste(make(content)))).toEqual(bare(content));
  });

  it('copied as plain text keep their LaTeX (the clipboard text/plain), as shapes keep their label', () => {
    const e = make(doc(p(text('Energy '), { type: 'inlineMath', attrs: { latex: 'E = mc^2' } }, text(' holds.')), { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } }, { type: 'shape', attrs: { kind: 'ellipse', text: 'Cell' } }));
    // Tiptap's clipboard text serializer reads the selection (as a copy does).
    e.commands.selectAll();
    const plain = e.view.serializeForClipboard(e.state.selection.content()).text;
    expect(plain).toContain('Energy $E = mc^2$ holds.');
    expect(plain).toContain('$$\\frac{a}{b}$$');
    expect(plain).toContain('[Shape: Ellipse: Cell]');
  });

  it('show invalid LaTeX as text marked as an error, never a half-drawn equation', () => {
    const e = make(doc(p({ type: 'inlineMath', attrs: { latex: '\\frac{' } })));
    const el = e.view.dom.querySelector('[data-type="inline-math"]')!;
    expect(el.classList.contains('inline-math-error')).toBe(true);
    expect(el.textContent).toBe('\\frac{');
  });

  it('never runs links or HTML from LaTeX in a document (KaTeX trust is off)', () => {
    const e = make(doc(p({ type: 'inlineMath', attrs: { latex: '\\href{javascript:alert(1)}{x}\\htmlClass{evil}{y}' } })));
    expect(e.view.dom.querySelector('a')).toBeNull();
    expect(e.view.dom.querySelector('.evil')).toBeNull();
  });

  it('insert, undo and redo', () => {
    const e = make(doc(p(text('x'))));
    e.chain().focus('end').insertContent({ type: 'inlineMath', attrs: { latex: 'x^2' } }).run();
    expect(JSON.stringify(e.getJSON())).toContain('"latex":"x^2"');
    e.commands.undo();
    expect(JSON.stringify(e.getJSON())).not.toContain('inlineMath');
    e.commands.redo();
    expect(JSON.stringify(e.getJSON())).toContain('inlineMath');
  });

  it('inserting an equation while an object is selected puts it after the object instead of replacing it', () => {
    for (const display of [false, true]) {
      const e = make(doc(p(text('before')), { type: 'shape', attrs: { kind: 'rectangle' } }, p(text('after'))));
      const shapePos = e.state.doc.child(0).nodeSize;
      e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, shapePos)));
      expect(writeEquation(e, 'y=1', display)).toBe(true);
      const json = JSON.stringify(e.getJSON());
      expect(json, `display ${display}`).toContain('"type":"shape"');
      expect(json).toContain(display ? '"type":"blockMath"' : '"type":"inlineMath"');
      expect(e.getJSON().content!.findIndex((n) => n.type === 'shape')).toBe(1);
      e.destroy();
      editor = null;
    }
  });

  it('a double-click or Enter on a selected equation asks for the equation dialog', () => {
    const e = make(content);
    const listener = vi.fn();
    onObjectEditRequest(e, listener);
    const blockPos = e.state.doc.child(0).nodeSize;
    const block = e.state.doc.nodeAt(blockPos)!;
    expect(block.type.name).toBe('blockMath');
    e.view.dom.querySelector('[data-type="block-math"] .katex')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(listener).toHaveBeenLastCalledWith({ kind: 'equation', pos: blockPos });
    e.view.dom.querySelector('[data-type="inline-math"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(listener).toHaveBeenLastCalledWith({ kind: 'equation', pos: 8 });
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 8)));
    expect(e.state.selection instanceof NodeSelection && e.state.selection.node.type.name).toBe('inlineMath');
    const handled = e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(handled).toBe(true);
    expect(listener).toHaveBeenLastCalledWith({ kind: 'equation', pos: 8 });
  });

  it('make the document schema 2; text-only documents stay schema 1', () => {
    expect(schemaFor(doc(p(text('plain'))))).toBe(1);
    expect(schemaFor(doc(p({ type: 'inlineMath', attrs: { latex: 'x' } })))).toBe(2);
    expect(schemaFor(doc({ type: 'blockMath', attrs: { latex: 'x' } }))).toBe(2);
  });
});

describe('shapes', () => {
  it('insertShape adds each kind with sensible defaults and selects it', () => {
    for (const kind of SHAPE_KINDS) {
      const e = make(doc(p(text('Before'))));
      e.chain().focus('end').insertShape(kind).run();
      const sel = e.state.selection;
      expect(sel instanceof NodeSelection && sel.node.type.name).toBe('shape');
      expect((sel as NodeSelection).node.attrs.kind).toBe(kind);
      e.destroy();
      editor = null;
    }
  });

  it('go after the paragraph the cursor is in, never splitting its text; an empty paragraph is replaced', () => {
    const e = make(doc(p(text('Hello world')), p(text('Next'))));
    e.commands.setTextSelection(4);
    e.commands.insertShape('rect');
    expect(blockNodes(e)).toEqual(['paragraph', 'shape', 'paragraph']);
    expect(e.state.doc.child(0).textContent).toBe('Hello world');
    e.commands.setTextSelection(4);
    e.commands.insertTextBox();
    expect(blockNodes(e)).toEqual(['paragraph', 'textBox', 'shape', 'paragraph']);
    expect(e.state.selection.$from.node(1).type.name).toBe('textBox');
    const f = make(doc(p(text('a')), p()));
    f.commands.setTextSelection(4);
    f.commands.insertShape('ellipse');
    expect(blockNodes(f)[1]).toBe('shape');
  });

  it('keep every attribute through save, copy and paste, undo and redo', () => {
    const shape = { type: 'shape', attrs: { kind: 'callout', width: 220, height: 130, fill: '#fde68a', stroke: '#92400e', strokeWidth: 3, text: 'Remember\nunits', align: 'right' } };
    const e = make(doc(p(text('a')), shape));
    expect(e.getJSON().content?.[1]).toEqual(shape);
    expect(copyPaste(e).content?.[1]).toEqual(shape);
    updateNodeAt(e, e.state.doc.child(0).nodeSize, 'shape', { fill: '#000000' });
    expect(e.getJSON().content?.[1].attrs?.fill).toBe('#000000');
    expect(e.state.selection instanceof NodeSelection).toBe(true);
    e.commands.undo();
    expect(e.getJSON().content?.[1].attrs?.fill).toBe('#fde68a');
    deleteNodeAt(e, e.state.doc.child(0).nodeSize, 'shape');
    expect(blockNodes(e)).not.toContain('shape');
  });

  it('never lets stored attributes add markup to the SVG', () => {
    const svg = shapeSvg({ kind: 'rect', fill: '"/><script>alert(1)</script>', stroke: 'url(javascript:x)', text: '<img src=x onerror=alert(1)>', width: 'NaN', height: 1e9 });
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('javascript');
    expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const s = readShape({ kind: 'hexagon', width: -5, height: 1e9, strokeWidth: 99 });
    expect(s).toMatchObject({ kind: 'rect', width: 12, height: 2000, strokeWidth: 12 });
  });

  it('labels shapes for screen readers and exports', () => {
    expect(shapeLabel({ kind: 'callout', text: ' Hi\nthere ' })).toBe('Callout: Hi there');
    expect(shapeLabel({ kind: 'line', text: 'ignored' })).toBe('Line');
  });

  it('make the document schema 2', () => {
    expect(schemaFor(doc({ type: 'shape', attrs: { kind: 'rect' } }))).toBe(2);
  });
});

describe('text boxes', () => {
  it('inserts an empty box with the cursor inside, or puts the selected paragraphs in one', () => {
    const e = make(doc(p(text('one')), p(text('two'))));
    e.chain().focus('end').insertTextBox().run();
    expect(e.state.selection.$from.node(1).type.name).toBe('textBox');
    e.commands.insertContent('inside');
    expect(JSON.stringify(e.getJSON())).toContain('"text":"inside"');

    const f = make(doc(p(text('one')), p(text('two')), p(text('three'))));
    f.commands.setTextSelection({ from: 2, to: 9 });
    f.commands.insertTextBox();
    expect(f.getJSON().content?.[0]).toMatchObject({ type: 'textBox', content: [p(text('one')), p(text('two'))] });
  });

  it('holds rich content and keeps its attributes through copy and paste', () => {
    const box = {
      type: 'textBox',
      attrs: { float: 'right', width: 260, fill: '#f1f5f9', borderColor: '#334155', borderWidth: 2 },
      content: [{ type: 'heading', attrs: { level: 3, textAlign: null }, content: [text('Note')] }, { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('item'))] }] }],
    };
    const e = make(doc(box, p(text('Body'))));
    const dom = e.view.dom.querySelector<HTMLElement>('[data-type="text-box"]')!;
    expect(dom.classList.contains('dcos-textbox-right')).toBe(true);
    expect(dom.style.width).toBe('260px');
    const pasted = copyPaste(e).content?.[0];
    expect(pasted?.attrs).toEqual(box.attrs);
    expect(pasted?.content?.[1].type).toBe('bulletList');
  });

  it('builds its style from checked values only', () => {
    expect(textBoxStyle({ fill: 'red; background-image: url(x)', borderColor: '#123', width: 'calc(1px)' })).toBe('background: transparent; border: 1px solid #112233');
    expect(readTextBox({ float: 'top', width: 10 })).toMatchObject({ float: 'inline', width: 60 });
    expect(textBoxStyle({ float: 'left' })).toContain('width: 240px');
  });

  it('make the document schema 2', () => {
    expect(schemaFor(doc({ type: 'textBox', content: [p(text('x'))] }))).toBe(2);
  });
});

describe('picture alignment and captions', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const img = (attrs: Record<string, unknown> = {}) => ({ type: 'image', attrs: { src: PNG, alt: 'Cell', title: null, width: 120, height: 80, align: null, caption: null, ...attrs } });

  it('keeps pictures without them exactly as before (schema 1)', () => {
    const e = make(doc(img()));
    expect(e.getJSON().content?.[0]).toEqual(img());
    expect(schemaFor(e.getJSON())).toBe(1);
    expect(contentSchemaFor({ ...createEmptyDocument(), doc: e.getJSON() })).toBe(1);
  });

  it('shows the alignment and caption in a figure, and updates them', () => {
    const e = make(doc(img({ align: 'right', caption: 'Figure 1. A cell' })));
    const figure = e.view.dom.querySelector<HTMLElement>('figure.dcos-figure')!;
    expect(figure.dataset.align).toBe('right');
    expect(figure.querySelector('figcaption')?.textContent).toBe('Figure 1. A cell');
    expect(figure.querySelector('img')).toBeTruthy();
    updateNodeAt(e, 0, 'image', { caption: null, align: 'left' });
    const after = e.view.dom.querySelector<HTMLElement>('figure.dcos-figure')!;
    expect(after.dataset.align).toBe('left');
    expect(after.querySelector('figcaption')).toBeNull();
  });

  it('keep alignment and caption through copy and paste, and mark the document schema 2', () => {
    const e = make(doc(img({ align: 'left', caption: 'Diagram of a cell' })));
    expect(copyPaste(e).content?.[0]).toEqual(img({ align: 'left', caption: 'Diagram of a cell' }));
    expect(schemaFor(e.getJSON())).toBe(2);
  });

  it('a stored document with alignment or a caption opens editable (they are known attributes)', () => {
    const prepared = prepareDocument({ ...createEmptyDocument(), schemaVersion: 2, doc: doc(img({ align: 'center', caption: 'x' })) });
    expect(prepared.state).toBe('editable');
  });
});

describe('every new node opens editable and is kept as stored', () => {
  it('equations, shapes and text boxes', () => {
    const body = doc(
      p({ type: 'inlineMath', attrs: { latex: 'x' } }),
      { type: 'blockMath', attrs: { latex: 'y' } },
      { type: 'shape', attrs: { kind: 'arrow', width: 100, height: 50, fill: '#ffffff', stroke: '#000000', strokeWidth: 1, text: 'go', align: 'left' } },
      { type: 'textBox', attrs: { float: 'inline', width: null, fill: 'none', borderColor: '#64748b', borderWidth: 1 }, content: [p(text('boxed'))] },
    );
    const prepared = prepareDocument({ ...createEmptyDocument(), schemaVersion: 2, doc: body });
    expect(prepared.state).toBe('editable');
    const e = make(body);
    expect(bare(e.getJSON())).toEqual(bare(body));
    // The cursor can be placed inside a text box.
    e.view.dispatch(e.state.tr.setSelection(TextSelection.near(e.state.doc.resolve(e.state.doc.content.size - 3))));
    expect(e.state.selection.$from.node(1).type.name).toBe('textBox');
  });
});
