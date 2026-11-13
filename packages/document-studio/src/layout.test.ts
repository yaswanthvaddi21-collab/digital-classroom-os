// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { documentExtensions } from './extensions';
import { sectionAt } from './extensions/sectionBreak';
import { contentSchemaFor as schemaOf } from './migrate';
import { formatNumber, LAYOUT_DEFAULTS, layoutOf } from './pageLayout';
import { prepareDocument } from './safety';
import { readBreakAttrs, resolveSections, splitSections } from './sections';
import { createEmptyDocument, DEFAULT_PAGE, normalizePage, PAPER_MM, type DocumentContent, type PageSettings } from './types';

const contentSchemaFor = (c: DocumentContent) => schemaOf(c as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>);
const p = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const brk = (attrs: Record<string, unknown> = {}): JSONContent => ({ type: 'sectionBreak', attrs: { breakType: 'nextPage', ...attrs } });
const content = (page: Partial<PageSettings> = {}, body: JSONContent[] = [p('Hello')]): DocumentContent => ({
  ...createEmptyDocument(),
  page: { ...DEFAULT_PAGE, ...page },
  doc: { type: 'doc', content: body },
});

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});
const editorWith = (body: JSONContent[]) => {
  const e = new Editor({ extensions: documentExtensions(), content: { type: 'doc', content: body } });
  editors.push(e);
  return e;
};

describe('page layout settings', () => {
  it('stay content schema 1 at their defaults, so v0.1.0 can still open the document', () => {
    expect(contentSchemaFor(content())).toBe(1);
    expect(contentSchemaFor(createEmptyDocument())).toBe(1);
    // Every new field is stored with its default by this build.
    for (const [key, value] of Object.entries(LAYOUT_DEFAULTS)) expect(DEFAULT_PAGE[key as keyof PageSettings]).toEqual(value);
  });

  it.each<[string, Partial<PageSettings>]>([
    ['A3 paper', { size: 'A3' }],
    ['A5 paper', { size: 'A5' }],
    ['Legal paper', { size: 'Legal' }],
    ['two columns', { columns: 2 }],
    ['column spacing', { columnSpacing: 8 }],
    ['roman page numbers', { pageNumberFormat: 'lowerRoman' }],
    ['a first page number', { pageNumberStart: 5 }],
    ['page number on the right', { pageNumberAlign: 'right' }],
    ['page number text', { pageNumberText: 'number' }],
    ['left header', { headerLeft: 'Course' }],
    ['right header', { headerRight: 'Name' }],
    ['left footer', { footerLeft: 'x' }],
    ['right footer', { footerRight: 'y' }],
    ['a different first page', { firstPage: { header: { left: '', center: '', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false } }],
  ])('%s makes the document schema 2', (_name, page) => {
    expect(contentSchemaFor(content(page))).toBe(2);
  });

  it('a section break makes the document schema 2', () => {
    expect(contentSchemaFor(content({}, [p('a'), brk(), p('b')]))).toBe(2);
    expect(contentSchemaFor(content({}, [p('a'), brk({ breakType: 'continuous' }), p('b')]))).toBe(2);
  });

  it('accepts every value the Layout controls can produce, and the new paper sizes open editable', () => {
    for (const size of Object.keys(PAPER_MM)) {
      const r = prepareDocument(content({ size: size as PageSettings['size'], columns: 3, columnSpacing: 0, pageNumberFormat: 'upperLetter', pageNumberStart: 0, pageNumberAlign: 'left', pageNumberText: 'page', headerLeft: 'a', footerRight: 'b', firstPage: { header: { left: 'x', center: '', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: true } }));
      expect(r.state, size).toBe('editable');
    }
    expect(PAPER_MM.A3).toEqual({ width: 297, height: 420 });
    expect(PAPER_MM.A5).toEqual({ width: 148, height: 210 });
    expect(PAPER_MM.Legal).toEqual({ width: 215.9, height: 355.6 });
  });

  it.each<[string, Record<string, unknown>]>([
    ['4 columns', { columns: 4 }],
    ['fractional columns', { columns: 1.5 }],
    ['negative spacing', { columnSpacing: -1 }],
    ['unknown number format', { pageNumberFormat: 'chicago' }],
    ['fractional start', { pageNumberStart: 1.5 }],
    ['negative start', { pageNumberStart: -1 }],
    ['unknown position', { pageNumberAlign: 'middle' }],
    ['unknown number text', { pageNumberText: 'words' }],
    ['header part not text', { headerLeft: 3 }],
    ['first page not an object', { firstPage: 'yes' }],
    ['first page unknown field', { firstPage: { header: {}, footer: {}, pageNumbers: false, even: true } }],
    ['first page part unknown field', { firstPage: { header: { top: 'x' }, footer: {}, pageNumbers: false } }],
    ['first page number not on/off', { firstPage: { header: {}, footer: {}, pageNumbers: 'yes' } }],
  ])('a stored page with %s opens in the protected view, unchanged', (_name, extra) => {
    const raw = { schemaVersion: 2, doc: { type: 'doc', content: [p('x')] }, page: { ...DEFAULT_PAGE, ...extra }, mode: 'simple' };
    const before = JSON.stringify(raw);
    const r = prepareDocument(raw);
    expect(r.state).toBe('protected');
    expect(JSON.stringify(raw)).toBe(before);
    expect(normalizePage(raw.page).problems.length).toBeGreaterThan(0);
  });

  it('reads stored layout fields with defaults for anything missing', () => {
    expect(layoutOf({})).toEqual(LAYOUT_DEFAULTS);
    expect(layoutOf({ columns: 2, firstPage: { header: { left: 'T' } } as never })).toEqual({
      ...LAYOUT_DEFAULTS,
      columns: 2,
      firstPage: { header: { left: 'T', center: '', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false },
    });
  });

  it('formats page numbers as Word and CSS do', () => {
    expect([1, 4, 9, 14, 40, 1999].map((n) => formatNumber(n, 'lowerRoman'))).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'mcmxcix']);
    expect(formatNumber(12, 'upperRoman')).toBe('XII');
    expect([1, 26, 27].map((n) => formatNumber(n, 'lowerLetter'))).toEqual(['a', 'z', 'aa']);
    expect(formatNumber(3, 'upperLetter')).toBe('C');
    expect(formatNumber(7, 'decimal')).toBe('7');
  });
});

describe('sections', () => {
  it('the first section takes the page settings; each break sets what follows and inherits what it leaves unset', () => {
    const page: PageSettings = { ...DEFAULT_PAGE, orientation: 'portrait', columns: 2, pageNumberFormat: 'lowerRoman', pageNumberStart: 3 };
    const s = resolveSections(page, [
      { breakType: 'nextPage', orientation: 'landscape', numberFormat: 'decimal', numberStart: 1 },
      { breakType: 'continuous', columns: 1, orientation: 'portrait', numberStart: 9 },
      { breakType: 'nextPage' },
    ]);
    expect(s.map((x) => [x.breakType, x.orientation, x.columns, x.numberFormat, x.numberStart])).toEqual([
      [null, 'portrait', 2, 'lowerRoman', 3],
      ['nextPage', 'landscape', 2, 'decimal', 1],
      // A continuous section changes only columns: its orientation and numbering continue.
      ['continuous', 'landscape', 1, 'decimal', null],
      ['nextPage', 'landscape', 1, 'decimal', null],
    ]);
  });

  it('ignores stored values it cannot use (they count as "same as before")', () => {
    expect(readBreakAttrs({ breakType: 'odd', orientation: 'up', columns: 9, columnSpacing: -2, numberFormat: 'x', numberStart: 2.5 })).toEqual({
      breakType: 'nextPage',
      orientation: null,
      columns: null,
      columnSpacing: null,
      numberFormat: null,
      numberStart: null,
    });
  });

  it('splits a body at its top-level breaks only', () => {
    const quote: JSONContent = { type: 'blockquote', content: [p('q'), brk()] };
    const parts = splitSections({ type: 'doc', content: [p('a'), quote, brk({ columns: 2 }), p('b')] }, DEFAULT_PAGE);
    expect(parts.map((x) => x.blocks.length)).toEqual([2, 1]);
    expect(parts[1].section.columns).toBe(2);
  });
});

describe('section break node', () => {
  it('splits the paragraph at the cursor and starts the new section with the text after it', () => {
    const e = editorWith([p('Front matter. Body text.')]);
    e.commands.setTextSelection(15); // after "Front matter. "
    e.commands.insertSectionBreak({ breakType: 'nextPage', orientation: 'landscape' });
    const json = (e.getJSON() as JSONContent);
    expect(json.content!.map((n) => n.type)).toEqual(['paragraph', 'sectionBreak', 'paragraph']);
    expect(json.content![0].content![0].text).toBe('Front matter. ');
    expect(json.content![2].content![0].text).toBe('Body text.');
    expect(json.content![1].attrs).toMatchObject({ breakType: 'nextPage', orientation: 'landscape', columns: null });
    expect(sectionAt(e.state).index).toBe(1);
    expect(contentSchemaFor({ ...createEmptyDocument(), doc: json })).toBe(2);
  });

  it('is inserted at the top level after a table or list, never inside it', () => {
    const e = editorWith([{ type: 'bulletList', content: [{ type: 'listItem', content: [p('item')] }] }, p('after')]);
    e.commands.setTextSelection(4);
    e.commands.insertSectionBreak({ breakType: 'continuous', columns: 2 });
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(['bulletList', 'sectionBreak', 'paragraph']);
    expect((e.getJSON() as JSONContent).content![2].content![0].text).toBe('after');
  });

  it('adds an empty paragraph to type into when inserted at the end', () => {
    const e = editorWith([p('end')]);
    e.commands.setTextSelection(4);
    e.commands.insertSectionBreak();
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(['paragraph', 'sectionBreak', 'paragraph']);
    expect(e.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(e.state.selection.from).toBe(e.state.doc.content.size - 1);
  });

  it('keeps every attribute through save and reload, copy and paste (HTML) and undo', () => {
    const attrs = { breakType: 'continuous', orientation: 'landscape', columns: 3, columnSpacing: 6.5, numberFormat: 'upperRoman', numberStart: 4 };
    const e = editorWith([p('a'), { type: 'sectionBreak', attrs }, p('b')]);
    // Save and reload.
    const reloaded = editorWith(e.getJSON().content!);
    expect(reloaded.getJSON().content![1].attrs).toEqual(attrs);
    // Clipboard HTML.
    const html = e.getHTML();
    expect(html).toContain('data-type="section-break"');
    const pasted = editorWith([p('x')]);
    pasted.commands.setContent(html);
    expect(pasted.getJSON().content![1]).toEqual({ type: 'sectionBreak', attrs });
    // Inherit (null) values are not written to the HTML and read back as null.
    const plain = editorWith([p('a'), brk(), p('b')]);
    const back = editorWith([p('x')]);
    back.commands.setContent(plain.getHTML());
    expect((back.getJSON() as JSONContent).content![1].attrs).toEqual({ breakType: 'nextPage', orientation: null, columns: null, columnSpacing: null, numberFormat: null, numberStart: null });
    // Undo and redo of a change to the break.
    e.commands.updateSectionBreak(3, { columns: 1 });
    expect(e.getJSON().content![1].attrs!.columns).toBe(1);
    e.commands.undo();
    expect(e.getJSON().content![1].attrs!.columns).toBe(3);
    e.commands.redo();
    expect(e.getJSON().content![1].attrs!.columns).toBe(1);
  });

  it('undo removes an inserted break in one step', () => {
    const e = editorWith([p('one two')]);
    e.commands.setTextSelection(4);
    e.commands.insertSectionBreak();
    expect(e.getJSON().content!.some((n) => n.type === 'sectionBreak')).toBe(true);
    e.commands.undo();
    expect((e.getJSON() as JSONContent).content!.map((n) => [n.type, n.content?.[0]?.text])).toEqual([['paragraph', 'one two']]);
  });

  it('labels each break on screen and marks one that has no effect', () => {
    const e = editorWith([p('a'), brk({ orientation: 'landscape', columns: 2, numberStart: 1, numberFormat: 'lowerRoman' }), p('b'), { type: 'blockquote', content: [p('q'), brk()] }]);
    const el = document.createElement('div');
    document.body.appendChild(el);
    e.mount(el);
    const breaks = el.querySelectorAll('[data-type="section-break"]');
    expect(breaks[0].getAttribute('data-label')).toBe('Section break — section 2: Next page · Landscape · 2 columns · numbering restarts at 1 · numbers i, ii, iii');
    expect(breaks[0].getAttribute('role')).toBe('separator');
    expect(breaks[1].classList.contains('is-nested')).toBe(true);
    expect(breaks[1].getAttribute('data-label')).toMatch(/no effect inside a table, list or quote/);
    el.remove();
  });

  it('a selected break belongs to the section it starts', () => {
    const e = editorWith([p('a'), brk(), p('b')]);
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 3)));
    expect(sectionAt(e.state).index).toBe(1);
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 2)));
    expect(sectionAt(e.state).index).toBe(0);
  });
});
