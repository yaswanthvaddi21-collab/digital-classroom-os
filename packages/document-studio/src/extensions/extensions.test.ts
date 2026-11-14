// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { documentExtensions } from './index';
import { findMatches, getSearchState, replaceAll, replaceCurrent, setSearch, stepSearch } from './searchReplace';
import { collectHeadings } from './tableOfContents';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const make = (content: JSONContent | string) => {
  editor = new Editor({ extensions: documentExtensions(), content });
  return editor;
};

describe('find and replace', () => {
  it('finds matches across differently formatted text and is case-insensitive by default', () => {
    const e = make('<p>The <strong>Cat</strong>alog lists cats.</p><p>CAT</p>');
    const matches = findMatches(e.state.doc, 'cat', false);
    expect(matches).toHaveLength(3);
    expect(e.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('Cat');
    expect(findMatches(e.state.doc, 'cat', true)).toHaveLength(1);
    expect(findMatches(e.state.doc, '', false)).toEqual([]);
  });

  it('steps through matches and wraps around', () => {
    const e = make('<p>a b a b a</p>');
    setSearch(e, { term: 'a', caseSensitive: false, index: 0 });
    expect(getSearchState(e.state).results).toHaveLength(3);
    stepSearch(e, 1);
    stepSearch(e, 1);
    stepSearch(e, 1);
    expect(getSearchState(e.state).index).toBe(0);
    stepSearch(e, -1);
    expect(getSearchState(e.state).index).toBe(2);
  });

  it('replaces the current match and then all matches, leaving no stale results', () => {
    const e = make('<p>red red red</p>');
    setSearch(e, { term: 'red', caseSensitive: false, index: 0 });
    replaceCurrent(e, 'blue');
    expect(e.getText()).toBe('blue red red');
    expect(getSearchState(e.state).results).toHaveLength(2);
    expect(replaceAll(e, 'green!')).toBe(2);
    expect(e.getText()).toBe('blue green! green!');
    expect(getSearchState(e.state).results).toHaveLength(0);
  });

  it('finds the right text when lower-casing changes length (Turkish İ)', () => {
    const e = make('<p>İstanbul city</p>');
    const [m] = findMatches(e.state.doc, 'city', false);
    expect(e.state.doc.textBetween(m.from, m.to)).toBe('city');
    const [i] = findMatches(e.state.doc, 'i̇stanbul', false);
    expect(e.state.doc.textBetween(i.from, i.to)).toBe('İstanbul');
  });

  it('replaces with an empty string by deleting', () => {
    const e = make('<p>keep drop keep</p>');
    setSearch(e, { term: ' drop', caseSensitive: false, index: 0 });
    replaceAll(e, '');
    expect(e.getText()).toBe('keep keep');
  });
});

describe('table of contents', () => {
  it('collects non-empty headings in order with their levels', () => {
    const e = make('<h1>Intro</h1><p>x</p><h2>Part A</h2><h3></h3><h4>Detail</h4>');
    expect(collectHeadings(e.state.doc).map((h) => [h.level, h.text])).toEqual([
      [1, 'Intro'],
      [2, 'Part A'],
      [4, 'Detail'],
    ]);
  });
});

describe('page break', () => {
  it('survives an HTML round trip and is inserted after the cursor with a following paragraph', () => {
    const e = make('<p>before</p>');
    e.commands.focus('end');
    e.commands.setPageBreak();
    const json = e.getJSON();
    expect(json.content?.map((n) => n.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
    const html = e.getHTML();
    expect(html).toContain('data-type="page-break"');
    e.commands.setContent(html);
    expect(e.getJSON().content?.some((n) => n.type === 'pageBreak')).toBe(true);
  });
});

describe('embedded diagram', () => {
  const attrs = { source: { nodes: [{ id: 'n1', label: 'Start "here" <b>' }], edges: [] }, previewId: 'p1', naturalWidth: 800, naturalHeight: 600, width: 500, height: 375, title: 'My diagram' };
  // Phase 6 (ADR 0013) attributes: null unless set, so a diagram without them is stored as before plus four nulls.
  const phase6 = { align: null, caption: null, alt: null, svgPreviewId: null };
  const stored = { ...attrs, ...phase6 };
  const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const withDiagram = () => make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs }, para('b')] });
  const selectDiagram = (e: Editor) => e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, e.state.doc.child(0).nodeSize)));
  const copySelection = (e: Editor) => (e.view as unknown as { serializeForClipboard: (s: unknown) => { dom: HTMLElement } }).serializeForClipboard(e.state.selection.content()).dom;
  const diagrams = (e: Editor) => (e.getJSON().content ?? []).filter((n) => n.type === 'diagram').map((n) => n.attrs);

  it('keeps every attribute through copy and paste (DOC-2)', () => {
    const e = withDiagram();
    selectDiagram(e);
    const dom = copySelection(e);
    const slice = PMDOMParser.fromSchema(e.schema).parseSlice(dom, { preserveWhitespace: true });
    expect(slice.content.toJSON()).toEqual([{ type: 'diagram', attrs: stored }]);
  });

  it('survives cut and paste through the clipboard HTML (DOC-2)', () => {
    const e = withDiagram();
    selectDiagram(e);
    const html = copySelection(e).innerHTML;
    e.commands.deleteSelection();
    expect(diagrams(e)).toEqual([]);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent); // jsdom has no ClipboardEvent
    expect(diagrams(e)).toEqual([stored]);
  });

  it('pastes malformed clipboard data as an empty diagram instead of failing (DOC-2)', () => {
    const e = make('<p>x</p>');
    e.commands.setContent('<figure data-type="diagram" data-diagram="{not json"></figure><figure data-type="diagram" data-diagram=\'{"width":"wide","title":7,"previewId":""}\'></figure>');
    expect(diagrams(e)).toEqual([
      { source: null, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: '', ...phase6 },
      { source: null, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: '', ...phase6 },
    ]);
  });

  it('stores the same JSON as before: clipboard data never leaks into the document attributes', () => {
    const e = withDiagram();
    expect(Object.keys(diagrams(e)[0]!).sort()).toEqual(Object.keys(stored).sort());
    expect(diagrams(e)[0]).toEqual(stored);
  });

  it('Phase 6: alignment, caption, alt text and the SVG preview id survive copy, cut and paste (ADR 0013)', () => {
    const extra = { align: 'right', caption: 'Figure 1: login', alt: 'Login flow', svgPreviewId: 's1' };
    const e = make({ type: 'doc', content: [para('a'), { type: 'diagram', attrs: { ...attrs, ...extra } }, para('b')] });
    selectDiagram(e);
    const dom = copySelection(e);
    const fig = dom.querySelector('figure')!;
    expect([fig.getAttribute('data-align'), fig.getAttribute('data-caption'), fig.getAttribute('data-alt'), fig.getAttribute('data-svg-preview-id')]).toEqual(['right', 'Figure 1: login', 'Login flow', 's1']);
    expect(fig.getAttribute('aria-label')).toBe('Login flow');
    const slice = PMDOMParser.fromSchema(e.schema).parseSlice(dom, { preserveWhitespace: true });
    expect(slice.content.toJSON()).toEqual([{ type: 'diagram', attrs: { ...attrs, ...extra } }]);
    const html = dom.innerHTML;
    e.commands.deleteSelection();
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    expect(diagrams(e)).toEqual([{ ...attrs, ...extra }]);
  });

  it('Phase 6: the clipboard form of a diagram without the new attributes is exactly as before', () => {
    const e = withDiagram();
    selectDiagram(e);
    const fig = copySelection(e).querySelector('figure')!;
    const data = JSON.parse(fig.getAttribute('data-diagram')!);
    expect(Object.keys(data)).toEqual(['source', 'previewId', 'naturalWidth', 'naturalHeight', 'width', 'height', 'title']);
    expect(data).toEqual(attrs);
    for (const a of ['data-align', 'data-caption', 'data-alt', 'data-svg-preview-id']) expect(fig.hasAttribute(a), a).toBe(false);
    expect(fig.getAttribute('aria-label')).toBe('My diagram');
  });

  it('Phase 6: reads the new attributes from data-* when the copied JSON has none, and ignores unusable values', () => {
    const e = make('<p>x</p>');
    e.commands.setContent(
      `<figure data-type="diagram" data-diagram='{"previewId":"p1"}' data-align="left" data-caption="Cap" data-alt="Alt" data-svg-preview-id="s9"></figure>` +
        `<figure data-type="diagram" data-diagram='{"align":"diagonal","caption":7,"alt":"","svgPreviewId":["x"]}' data-align="up"></figure>`,
    );
    expect(diagrams(e)[0]).toMatchObject({ previewId: 'p1', align: 'left', caption: 'Cap', alt: 'Alt', svgPreviewId: 's9' });
    expect(diagrams(e)[1]).toMatchObject(phase6);
  });

  it('inserts a new diagram after a selected one instead of replacing it (DOC-3)', () => {
    const e = withDiagram();
    selectDiagram(e);
    e.chain().focus().insertDiagram({ source: { nodes: [{ id: 'new' }] }, previewId: 'p2', naturalWidth: 400, naturalHeight: 300, title: 'New' }, 600).run();
    expect(e.getJSON().content!.map((n) => n.type + (n.attrs?.previewId ? ':' + n.attrs.previewId : ''))).toEqual(['paragraph', 'diagram:p1', 'diagram:p2', 'paragraph']);
  });

  it('inserts after selected text instead of replacing it (DOC-3)', () => {
    const e = make({ type: 'doc', content: [para('keep this')] });
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1, 10)));
    e.chain().focus().insertDiagram({ source: {}, previewId: 'p2', naturalWidth: 400, naturalHeight: 300, title: 'New' }, 600).run();
    expect(e.getText()).toContain('keep this');
    expect(diagrams(e)).toHaveLength(1);
  });

  it('inserts at the cursor when nothing is selected', () => {
    const e = make({ type: 'doc', content: [para('a'), para('b')] });
    e.commands.setTextSelection(2);
    e.chain().focus().insertDiagram({ source: {}, previewId: 'p2', naturalWidth: 1200, naturalHeight: 600, title: 'New' }, 600).run();
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(['paragraph', 'diagram', 'paragraph']);
    expect(diagrams(e)[0]).toMatchObject({ width: 600, height: 300 });
  });
});
