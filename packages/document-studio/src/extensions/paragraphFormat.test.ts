// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import * as pmView from '@tiptap/pm/view';
import { afterEach, describe, expect, it } from 'vitest';
import { contentSchemaFor, schemaFor } from '../migrate';
import { prepareDocument } from '../safety';
import { createEmptyDocument } from '../types';
import { documentExtensions } from './index';
import { BULLET_STYLES, NUMBER_FORMATS } from './listStyles';
import { applyNamedStyle, cssLineHeight, currentNamedStyle, NAMED_STYLES, type NamedStyleId } from './paragraphFormat';

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});
const make = (content: JSONContent | string) => {
  const e = new Editor({ extensions: documentExtensions(), content });
  editors.push(e);
  return e;
};
const p = (text: string, attrs?: Record<string, unknown>): JSONContent => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] });
const docOf = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const firstAttrs = (e: Editor) => e.getJSON().content![0].attrs!;
/** Puts the cursor inside the n-th top-level block (0-based). */
const cursorIn = (e: Editor, n = 0) => {
  let pos = 0;
  for (let i = 0; i < n; i++) pos += e.state.doc.child(i).nodeSize;
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos + 1)));
};

// ProseMirror's own clipboard parser (exported for tests, not in its typings).
const parseFromClipboard = (pmView as unknown as { __parseFromClipboard: (view: unknown, text: string, html: string, plain: boolean, $context: unknown) => Slice }).__parseFromClipboard;

/** Copies the whole document as the browser would (ProseMirror's clipboard HTML) and pastes it into a new editor. */
function clipboardRoundTrip(e: Editor): JSONContent {
  const { dom } = e.view.serializeForClipboard(new Slice(e.state.doc.content, 0, 0));
  const target = make('<p></p>');
  const slice = parseFromClipboard(target.view, dom.textContent ?? '', dom.innerHTML, false, target.state.doc.resolve(1));
  target.view.dispatch(target.state.tr.replaceSelection(slice));
  const json = target.getJSON();
  // Pasting block lists into the empty paragraph leaves that paragraph after them (ordinary paste behaviour).
  const last = json.content!.at(-1)!;
  if (json.content!.length > 1 && last.type === 'paragraph' && !last.content) json.content!.pop();
  return json;
}

const FORMATTED = docOf(
  p('Title text', { paragraphStyle: 'title' }),
  p('Body', { lineSpacing: 1.15, spaceBefore: 12, spaceAfter: 6, indentLeft: 36, indentRight: 18, indentFirstLine: -18, textAlign: 'justify' }),
  { type: 'heading', attrs: { level: 2, lineSpacing: 2, indentLeft: 72, indentFirstLine: 20 }, content: [{ type: 'text', text: 'Heading' }] },
  p('Figure 1', { paragraphStyle: 'caption' }),
  p('Sub', { paragraphStyle: 'subtitle' }),
);

describe('paragraph format: storage, rendering and round trips', () => {
  it('stores nothing new for unformatted paragraphs (they stay v0.1.0 content)', () => {
    const e = make('<p>Plain</p><h2>Head</h2>');
    expect(schemaFor(e.getJSON())).toBe(1);
    for (const n of e.getJSON().content!) {
      for (const k of ['lineSpacing', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'indentFirstLine', 'paragraphStyle']) expect(n.attrs?.[k] ?? null).toBeNull();
    }
    expect(e.getHTML()).not.toContain('data-');
  });

  it('renders each attribute as CSS the editor and print page use, plus a data attribute', () => {
    const html = make(FORMATTED).getHTML();
    const box = document.createElement('div');
    box.innerHTML = html;
    const [title, body, heading] = Array.from(box.children) as HTMLElement[];
    expect(title.dataset.paragraphStyle).toBe('title');
    expect(cssLineHeight(1.15)).toBeCloseTo(1.4038, 4);
    expect(body.style.lineHeight).toBe(String(cssLineHeight(1.15)));
    expect(body.style.paddingTop).toBe('12pt');
    expect(body.style.marginTop).toMatch(/^0(px)?$/);
    expect(body.style.paddingBottom).toBe('6pt');
    expect(body.style.marginLeft).toBe('36pt');
    expect(body.style.marginRight).toBe('18pt');
    expect(body.style.textIndent).toBe('-18pt');
    expect(body.dataset.indentFirstLine).toBe('-18');
    expect(heading.tagName).toBe('H2');
    expect(heading.style.lineHeight).toBe('2.4414');
  });

  it('survives save and reload (JSON), HTML and the clipboard, attribute for attribute', () => {
    const e = make(FORMATTED);
    const json = e.getJSON();
    expect(make(json).getJSON()).toEqual(json);
    expect(make(e.getHTML()).getJSON()).toEqual(json);
    expect(clipboardRoundTrip(e)).toEqual(json);
  });

  it('ignores spacing and indents in foreign pasted HTML (only its own data attributes are read)', () => {
    const e = make('<p style="margin-left: 40px; line-height: 1.38; margin-top: 0pt; text-indent: 12px">Google Docs text</p>');
    expect(firstAttrs(e)).toMatchObject({ indentLeft: null, lineSpacing: null, spaceBefore: null, indentFirstLine: null });
    expect(schemaFor(e.getJSON())).toBe(1);
  });

  it('rejects values outside the limits when reading them back', () => {
    const e = make('<p data-line-spacing="99" data-space-before="-5" data-indent-left="abc" data-paragraph-style="banner">x</p>');
    expect(firstAttrs(e)).toMatchObject({ lineSpacing: 5, spaceBefore: 0, indentLeft: null, paragraphStyle: null });
  });

  it('holds a pasted or stored hanging indent within the left indent (the first line never leaves the page)', () => {
    const pasted = make('<p data-indent-left="36" data-indent-first-line="-999">x</p><p data-indent-first-line="-20">y</p>');
    expect(pasted.getJSON().content!.map((b) => b.attrs?.indentFirstLine)).toEqual([-36, null]);
    // Stored JSON from elsewhere: kept as stored, but shown (and exported, via formatOf) within the limit.
    const stored = make(docOf(p('z', { indentLeft: 36, indentFirstLine: -999 })));
    expect(firstAttrs(stored).indentFirstLine).toBe(-999);
    expect((stored.view.dom.querySelector('p') as HTMLElement).style.textIndent).toBe('-36pt');
  });

  it('makes the document content schema 2 for every new attribute, and opens it editable', () => {
    for (const [k, v] of Object.entries({ lineSpacing: 1.5, spaceBefore: 6, spaceAfter: 0, indentLeft: 36, indentRight: 36, indentFirstLine: -18, paragraphStyle: 'title' })) {
      const doc = docOf(p('x', { [k]: v }));
      expect(schemaFor(doc), k).toBe(2);
      const content = { ...createEmptyDocument(), doc };
      expect(contentSchemaFor(content), k).toBe(2);
      expect(prepareDocument({ ...content, schemaVersion: 2 }).state, k).toBe('editable');
    }
    // Heading attributes too.
    expect(schemaFor(docOf({ type: 'heading', attrs: { level: 1, indentLeft: 36 }, content: [{ type: 'text', text: 'H' }] }))).toBe(2);
  });
});

describe('paragraph format commands', () => {
  it('sets and clears line spacing on every selected paragraph and heading, with undo and redo', () => {
    const e = make('<p>a</p><h1>b</h1><p>c</p>');
    e.commands.selectAll();
    e.commands.setLineSpacing(2);
    expect(e.getJSON().content!.map((n) => n.attrs?.lineSpacing)).toEqual([2, 2, 2]);
    e.commands.undo();
    expect(e.getJSON().content!.map((n) => n.attrs?.lineSpacing)).toEqual([null, null, null]);
    e.commands.redo();
    expect(e.getJSON().content!.map((n) => n.attrs?.lineSpacing)).toEqual([2, 2, 2]);
    e.commands.setLineSpacing(null);
    expect(schemaFor(e.getJSON())).toBe(1);
    expect(e.commands.setLineSpacing(Number.NaN)).toBe(false);
  });

  it('sets spacing before and after independently', () => {
    const e = make('<p>a</p>');
    cursorIn(e);
    e.commands.setParagraphSpacing({ before: 12 });
    e.commands.setParagraphSpacing({ after: 300 });
    expect(firstAttrs(e)).toMatchObject({ spaceBefore: 12, spaceAfter: 200 });
    e.commands.setParagraphSpacing({ before: null });
    expect(firstAttrs(e)).toMatchObject({ spaceBefore: null, spaceAfter: 200 });
  });

  it('sets indents; a hanging indent never moves text past the left edge', () => {
    const e = make('<p>a</p>');
    cursorIn(e);
    e.commands.setParagraphIndent({ indentLeft: 36, indentFirstLine: -72 });
    expect(firstAttrs(e)).toMatchObject({ indentLeft: 36, indentFirstLine: -36 });
    e.commands.setParagraphIndent({ indentFirstLine: 18, indentRight: 9 });
    expect(firstAttrs(e)).toMatchObject({ indentLeft: 36, indentFirstLine: 18, indentRight: 9 });
    e.commands.setParagraphIndent({ indentLeft: 0, indentFirstLine: 0, indentRight: 0 });
    expect(firstAttrs(e)).toMatchObject({ indentLeft: null, indentFirstLine: null, indentRight: null });
  });

  it('gives a list paragraph left and right indents but no first-line or hanging indent (its bullet already hangs)', () => {
    const e = make('<ul><li><p>item</p></li></ul>');
    e.commands.setTextSelection(4);
    e.commands.setParagraphIndent({ indentLeft: 18, indentRight: 9, indentFirstLine: 36 });
    const para = (e.getJSON().content![0] as JSONContent).content![0].content![0];
    expect(para.attrs).toMatchObject({ indentLeft: 18, indentRight: 9, indentFirstLine: null });
  });

  it('increase/decrease indent move by half an inch; in a list they demote and promote the item', () => {
    const e = make('<p>a</p>');
    cursorIn(e);
    e.commands.increaseIndent();
    e.commands.increaseIndent();
    expect(firstAttrs(e).indentLeft).toBe(72);
    e.commands.setParagraphIndent({ indentLeft: 50 });
    e.commands.decreaseIndent();
    expect(firstAttrs(e).indentLeft).toBe(36);
    e.commands.decreaseIndent();
    expect(firstAttrs(e).indentLeft).toBeNull();
    expect(e.can().decreaseIndent()).toBe(false);

    const l = make('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    l.commands.setTextSelection(l.state.doc.content.size - 3);
    expect(l.commands.increaseIndent()).toBe(true);
    const outer = l.getJSON().content![0] as JSONContent;
    expect(outer.content).toHaveLength(1);
    expect(outer.content![0].content![1].type).toBe('bulletList');
    l.commands.decreaseIndent();
    expect((l.getJSON().content![0] as JSONContent).content).toHaveLength(2);
  });

  it('keeps line spacing and indents on Enter, but a Title is followed by a Normal paragraph', () => {
    const e = make(docOf(p('Title', { paragraphStyle: 'title', lineSpacing: 1.5, indentLeft: 36 })));
    e.commands.setTextSelection(6);
    e.commands.splitBlock();
    const [a, b] = e.getJSON().content!;
    expect(a.attrs).toMatchObject({ paragraphStyle: 'title' });
    expect(b.attrs).toMatchObject({ paragraphStyle: null, lineSpacing: 1.5, indentLeft: 36 });
  });

  it('Ctrl/Cmd+M and Ctrl/Cmd+Shift+M indent and outdent', () => {
    const e = make('<p>a</p>');
    cursorIn(e);
    const key = (shift: boolean) =>
      e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key: shift ? 'M' : 'm', keyCode: 77, ctrlKey: true, shiftKey: shift })));
    key(false);
    expect(firstAttrs(e).indentLeft).toBe(36);
    key(true);
    expect(firstAttrs(e).indentLeft).toBeNull();
  });
});

describe('named paragraph styles', () => {
  it('applies every style in the Styles list and reads it back at the cursor', () => {
    for (const { id } of NAMED_STYLES) {
      const e = make('<p>Text</p>');
      cursorIn(e);
      applyNamedStyle(e, id);
      expect(currentNamedStyle(e), id).toBe(id);
    }
  });

  it('stores Title/Subtitle/Caption on the paragraph and the rest as the v0.1.0 nodes', () => {
    const stored = (id: NamedStyleId) => {
      const e = make('<p>Text</p>');
      cursorIn(e);
      applyNamedStyle(e, id);
      return e.getJSON().content![0];
    };
    expect(stored('title')).toMatchObject({ type: 'paragraph', attrs: { paragraphStyle: 'title' } });
    expect(stored('h3')).toMatchObject({ type: 'heading', attrs: { level: 3 } });
    expect(stored('quote')).toMatchObject({ type: 'blockquote', content: [{ type: 'paragraph' }] });
    expect(stored('code')).toMatchObject({ type: 'codeBlock' });
    // Headings, Quote and Code are v0.1.0 content: still schema 1.
    for (const id of ['h1', 'quote', 'code', 'normal'] as const) expect(schemaFor({ type: 'doc', content: [stored(id)] }), id).toBe(1);
  });

  it('switches between styles: Quote back to Normal leaves the quote, Title to Heading drops the paragraph style', () => {
    const e = make('<p>Text</p>');
    cursorIn(e);
    applyNamedStyle(e, 'quote');
    applyNamedStyle(e, 'normal');
    expect(e.getJSON().content![0]).toMatchObject({ type: 'paragraph' });
    applyNamedStyle(e, 'title');
    applyNamedStyle(e, 'h1');
    expect(e.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(e.getJSON().content![0].attrs).not.toHaveProperty('paragraphStyle');
    applyNamedStyle(e, 'subtitle');
    expect(e.getJSON().content![0]).toMatchObject({ type: 'paragraph', attrs: { paragraphStyle: 'subtitle' } });
  });
});

describe('list styles in the editor', () => {
  it('sets a bullet glyph and a number format on the list at the cursor, keeping nested lists their own', () => {
    const e = make('<ul><li><p>one</p><ul><li><p>inner</p></li></ul></li></ul>');
    e.commands.setTextSelection(4);
    e.commands.setBulletStyle('square');
    const outer = e.getJSON().content![0] as JSONContent;
    expect(outer.attrs?.bulletStyle).toBe('square');
    expect(outer.content![0].content![1].attrs?.bulletStyle).toBeNull();
    expect(e.getHTML()).toContain('<ul data-bullet-style="square">');
  });

  it('turns a paragraph into a list with the chosen format, sets the start number, and undoes in one step', () => {
    const e = make('<p>step</p>');
    cursorIn(e);
    e.commands.setNumberFormat('upper-roman');
    expect(e.getJSON().content![0]).toMatchObject({ type: 'orderedList', attrs: { numberFormat: 'upper-roman', start: 1 } });
    e.commands.setListStart(4);
    expect(e.getJSON().content![0].attrs).toMatchObject({ start: 4 });
    expect(e.getHTML()).toContain('start="4"');
    e.commands.undo();
    e.commands.undo();
    expect(e.getJSON().content![0].type).toBe('paragraph');
    expect(e.commands.setListStart(3)).toBe(false); // not in a numbered list
  });

  it('round-trips every style through JSON, HTML and the clipboard, and marks schema 2', () => {
    const doc = docOf(
      ...BULLET_STYLES.map((b) => ({ type: 'bulletList', attrs: { bulletStyle: b.id }, content: [{ type: 'listItem', content: [p(b.id)] }] })),
      ...NUMBER_FORMATS.map((f, i) => ({ type: 'orderedList', attrs: { numberFormat: f.id, start: i + 2, type: null }, content: [{ type: 'listItem', content: [p(f.id)] }] })),
    );
    const e = make(doc);
    const json = e.getJSON();
    expect(make(e.getHTML()).getJSON()).toEqual(json);
    expect(clipboardRoundTrip(e)).toEqual(json);
    expect(schemaFor(json)).toBe(2);
    // The start number alone is v0.1.0 content.
    expect(schemaFor(docOf({ type: 'orderedList', attrs: { start: 5 }, content: [{ type: 'listItem', content: [p('x')] }] }))).toBe(1);
  });
});
