// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDocx } from '../export/docx';
import { buildPrintHtml } from '../export/print';
import { ExportReport, exportToast } from '../export/report';
import { documentToText } from '../export/text';
import { documentExtensions } from '../extensions';
import { findMatches } from '../extensions/searchReplace';
import { contentSchemaFor, schemaFor } from '../migrate';
import { prepareDocument } from '../safety';
import { createEmptyDocument, type DocumentContent } from '../types';
import { canCommentOn, commentBlockReason, commentHighlightCss, commentIdsAt, commentRange, getCommentState, setCommentMeta } from './commentMark';
import { commentAnchors, commentsAppendix, commentsProblem, initialsOf, newCommentId, orderThreads, type CommentThread } from './comments';
import { languageProblem } from './language';
import { textStats } from './wordCount';

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML only needs the event to exist.
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {
  clipboardData = null;
} as unknown as typeof globalThis.ClipboardEvent;

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
const make = (content: JSONContent | string) => {
  editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions(), content });
  return editor;
};

const T0 = '2026-03-01T10:00:00.000Z';
const thread = (id: string, over: Partial<CommentThread> = {}): CommentThread => ({ id, author: 'Ada Lovelace', createdAt: T0, text: `About ${id}`, resolved: false, replies: [], ...over });
const text = (t: string, ids: string[] = [], marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: t, marks: [...marks!, ...ids.map((commentId) => ({ type: 'comment', attrs: { commentId } }))] });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const docOf = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const withComments = (doc: JSONContent, comments?: CommentThread[], extra: Partial<DocumentContent> = {}): DocumentContent => ({ ...createEmptyDocument(), doc, ...(comments ? { comments } : {}), ...extra });
const commentIds = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.descendants((n) => void n.marks.forEach((m) => m.type.name === 'comment' && out.push(`${n.text}:${m.attrs.commentId}`)));
  return out;
};

describe('comment mark', () => {
  it('marks the selection with a thread id, renders data-comment-id and reads it back from HTML', () => {
    const e = make('<p>The quick brown fox</p>');
    e.commands.setTextSelection({ from: 5, to: 10 });
    expect(e.commands.addComment('c1')).toBe(true);
    expect(commentIds(e)).toEqual(['quick:c1']);
    const html = e.getHTML();
    expect(html).toContain('<span class="dcos-comment" data-comment-id="c1">quick</span>');
    // HTML round trip (the clipboard format): the mark and its id come back.
    const again = new Editor({ element: document.createElement('div'), extensions: documentExtensions(), content: html });
    expect(commentIds(again)).toEqual(['quick:c1']);
    again.destroy();
    // JSON round trip (the saved form).
    const json = e.getJSON();
    e.commands.setContent(json);
    expect(commentIds(e)).toEqual(['quick:c1']);
  });

  it('refuses an empty selection or an id that is not safe', () => {
    const e = make('<p>Hello</p>');
    e.commands.setTextSelection(2);
    expect(e.commands.addComment('c1')).toBe(false);
    e.commands.setTextSelection({ from: 1, to: 3 });
    expect(e.commands.addComment('bad id"]')).toBe(false);
    expect(commentIds(e)).toEqual([]);
  });

  it('refuses text that cannot carry a comment (a code block), so no thread is left without text', () => {
    const e = make('<pre><code>let x = 1</code></pre><p>plain</p>');
    e.commands.setTextSelection({ from: 1, to: 6 });
    expect(canCommentOn(e.state, 1, 6)).toBe(false);
    expect(e.commands.addComment('c1')).toBe(false);
    expect(commentIds(e)).toEqual([]);
    // A selection that also covers markable text is fine (only that text is marked).
    const end = e.state.doc.content.size - 1;
    expect(canCommentOn(e.state, 1, end)).toBe(true);
    expect(e.commands.addComment('c2', { from: 1, to: end })).toBe(true);
    expect(commentIds(e)).toEqual(['plain:c2']);
  });

  it('refuses a selection with no text of its own (only an inline equation or a line break)', () => {
    const e = make(docOf(p(text('Area '), { type: 'inlineMath', attrs: { latex: '\\pi r^2' } }, { type: 'hardBreak' }, text(' end'))));
    // "Area " is 1..6, the equation 6..7, the break 7..8.
    e.commands.setNodeSelection(6);
    expect(canCommentOn(e.state, 6, 7)).toBe(false);
    expect(e.commands.addComment('c1')).toBe(false);
    expect(commentBlockReason(e.state)).toMatch(/^A comment needs text to attach to\. An equation/);
    expect(canCommentOn(e.state, 7, 8)).toBe(false);
    expect(e.commands.addComment('c2', { from: 6, to: 8 })).toBe(false);
    let marked = 0;
    e.state.doc.descendants((n) => void (n.marks.some((m) => m.type.name === 'comment') && marked++));
    expect(marked).toBe(0);
    // Text next to the equation is fine, and the thread then has a text range to point at.
    expect(e.commands.addComment('c3', { from: 2, to: 7 })).toBe(true);
    expect(commentRange(e.state.doc, 'c3')).toEqual({ from: 2, to: 6 });
  });

  it('undo after deleting a thread whose text was deleted does not bring back a mark without a thread', () => {
    const e = make('<p>hello world</p>');
    e.storage.comment.known = new Set(['c1']);
    e.chain().addComment('c1', { from: 1, to: 6 }).run();
    e.chain().setTextSelection({ from: 1, to: 7 }).deleteSelection().run();
    expect(commentIds(e)).toEqual([]);
    // The thread is deleted in the panel (removeComment finds no mark), then the text deletion is undone.
    e.storage.comment.known = new Set();
    e.storage.comment.deleted.add('c1');
    expect(e.commands.removeComment('c1')).toBe(false);
    e.commands.undo();
    expect(e.getText()).toBe('hello world');
    expect(commentIds(e)).toEqual([]);
    expect(schemaFor(e.getJSON())).toBe(1);
  });

  it('lets comments overlap, and is not extended by typing at its end', () => {
    const e = make('<p>abcdef</p>');
    e.commands.addComment('c1', { from: 1, to: 5 });
    e.commands.addComment('c2', { from: 3, to: 7 });
    expect(commentIds(e)).toEqual(['ab:c1', 'cd:c1', 'cd:c2', 'ef:c2']);
    e.commands.setTextSelection(7);
    e.commands.insertContent('X');
    expect(e.getText()).toBe('abcdefX');
    expect(commentIds(e).some((s) => s.startsWith('X'))).toBe(false);
  });

  it('undo removes a new comment mark, redo restores it', () => {
    const e = make('<p>Hello world</p>');
    e.chain().addComment('c1', { from: 1, to: 6 }).run();
    expect(commentIds(e)).toEqual(['Hello:c1']);
    e.commands.undo();
    expect(commentIds(e)).toEqual([]);
    e.commands.redo();
    expect(commentIds(e)).toEqual(['Hello:c1']);
  });

  it('removing a thread removes its marks everywhere and is not undone by undo', () => {
    const e = make('<p>one two</p><p>three</p>');
    e.commands.addComment('c1', { from: 1, to: 4 });
    e.commands.addComment('c1', { from: 10, to: 15 });
    e.commands.addComment('c2', { from: 5, to: 8 });
    expect(e.commands.removeComment('c1')).toBe(true);
    expect(commentIds(e)).toEqual(['two:c2']);
    e.commands.undo(); // undoes the c2 mark, not the removal
    expect(commentIds(e)).toEqual([]);
    expect(e.commands.removeComment('nope')).toBe(false);
  });

  it('keeps pasted comment marks of threads this document has, and drops others (pasted from another document)', () => {
    const e = make('<p>Start</p>');
    e.storage.comment.known = new Set(['mine']);
    e.commands.setTextSelection(6);
    e.view.pasteHTML('<p><span data-comment-id="mine">kept</span> and <span data-comment-id="theirs">dropped</span></p>');
    expect(commentIds(e)).toEqual(['kept:mine']);
    expect(e.getText()).toContain('dropped');
  });

  it('tracks the thread at the cursor, and the text selected for a new comment through edits', () => {
    const e = make('<p>Hello world</p>');
    e.commands.addComment('c1', { from: 7, to: 12 });
    e.storage.comment.known = new Set(['c1']);
    e.commands.setTextSelection(9);
    expect(getCommentState(e.state)?.active).toBe('c1');
    expect(commentIdsAt(e.state)).toEqual(['c1']);
    e.commands.setTextSelection(2);
    expect(getCommentState(e.state)?.active).toBeNull();
    setCommentMeta(e.view, { pending: { from: 1, to: 6 } });
    expect(e.view.dom.querySelector('.dcos-comment-pending')?.textContent).toBe('Hello');
    e.commands.insertContentAt(1, '>> ');
    expect(getCommentState(e.state)?.pending).toEqual({ from: 4, to: 9 });
    expect(commentRange(e.state.doc, 'c1')).toEqual({ from: 10, to: 15 });
    expect(commentRange(e.state.doc, 'zz')).toBeNull();
  });

  it('clicking the text of a thread this document has asks to show it; other text does not', () => {
    const e = make(docOf(p(text('plain '), text('noted', ['c1']), text(' stray', ['zz']))));
    e.storage.comment.known = new Set(['c1']);
    let shown = 0;
    const onShow = () => shown++;
    window.addEventListener('dcos:show-comments', onShow);
    const click = (pos: number) => e.view.someProp('handleClick', (f) => f(e.view, pos, new MouseEvent('click')));
    click(2);
    expect(shown).toBe(0);
    click(9);
    expect(shown).toBe(1);
    click(15);
    expect(shown).toBe(1);
    window.removeEventListener('dcos:show-comments', onShow);
  });

  it('opening a document dispatches nothing, so nothing is saved on open', () => {
    let transactions = 0;
    editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions(), content: docOf(p(text('x', ['c1']))) });
    editor.on('transaction', () => transactions++);
    expect(transactions).toBe(0);
  });

  it('highlights open threads with CSS on their spans, and never with an unsafe id', () => {
    const css = commentHighlightCss(['a1', 'b"]{}*{color:red}'], 'a1');
    expect(css).toContain('.dcos-doc span[data-comment-id="a1"]');
    expect(css).not.toContain('color:red');
    expect(commentHighlightCss([], null)).toBe('');
  });
});

describe('comment threads and the stored fields', () => {
  it('accepts valid threads and refuses anything this version cannot keep exactly', () => {
    expect(commentsProblem([thread('c1', { replies: [{ id: 'r1', author: '', createdAt: T0, text: 'Yes', editedAt: T0 }] })])).toBeNull();
    expect(commentsProblem([])).toBeNull();
    expect(commentsProblem({})).toMatch(/not a list/);
    expect(commentsProblem([{ ...thread('c1'), mood: 'happy' }])).toMatch(/fields this version does not know \(mood\)/);
    expect(commentsProblem([{ ...thread('c1'), resolved: 'yes' }])).toMatch(/resolved/);
    expect(commentsProblem([{ ...thread('c1'), createdAt: 'yesterday' }])).toMatch(/time/);
    expect(commentsProblem([{ ...thread('bad id') }])).toMatch(/id/);
    expect(commentsProblem([thread('c1'), thread('c1')])).toMatch(/share an id/);
    expect(commentsProblem([thread('c1', { replies: [{ id: 'c1', author: 'x', createdAt: T0, text: '' }] })])).toMatch(/share an id/);
    expect(languageProblem('en-GB')).toBeNull();
    expect(languageProblem(null)).toBeNull();
    expect(languageProblem('english please')).toMatch(/not a language tag/);
  });

  it('a comment mark, stored threads or a language make schema 2; none of them keeps schema 1', () => {
    const plain = docOf(p(text('Hello')));
    expect(schemaFor(plain)).toBe(1);
    expect(contentSchemaFor(withComments(plain) as never)).toBe(1);
    expect(contentSchemaFor(withComments(plain, []) as never)).toBe(1);
    expect(contentSchemaFor({ ...withComments(plain), language: null } as never)).toBe(1);
    const marked = docOf(p(text('Hello', ['c1'])));
    expect(schemaFor(marked)).toBe(2);
    expect(contentSchemaFor(withComments(marked, [thread('c1')]) as never)).toBe(2);
    expect(contentSchemaFor(withComments(plain, [thread('c1')]) as never)).toBe(2);
    expect(contentSchemaFor(withComments(plain, undefined, { language: 'en-GB' }) as never)).toBe(2);
  });

  it('opens a document with comments editable, keeping the threads; invalid threads open protected and untouched', () => {
    const content = { ...withComments(docOf(p(text('Hello', ['c1']))), [thread('c1')], { language: 'fr-FR' }), schemaVersion: 2 };
    const ok = prepareDocument(content);
    expect(ok.state).toBe('editable');
    if (ok.state === 'editable') {
      expect(ok.content.comments).toEqual([thread('c1')]);
      expect(ok.content.language).toBe('fr-FR');
    }
    const raw = { ...content, comments: [{ ...thread('c1'), reactions: ['+1'] }] };
    const snapshot = JSON.stringify(raw);
    const bad = prepareDocument(raw);
    expect(bad).toMatchObject({ state: 'protected', reason: 'invalid' });
    if (bad.state === 'protected') expect(bad.detail).toMatch(/reactions/);
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(prepareDocument({ ...content, language: 42 })).toMatchObject({ state: 'protected' });
  });

  it('orders threads by where their text is; threads whose text was deleted come last', () => {
    const doc = docOf(p(text('b', ['c2']), text(' '), text('a', ['c1'])));
    const { anchored, detached } = orderThreads([thread('c1'), thread('gone'), thread('c2')], doc);
    expect(anchored.map((t) => t.id)).toEqual(['c2', 'c1']);
    expect(detached.map((t) => t.id)).toEqual(['gone']);
    expect(commentAnchors(docOf(p(text('one ', ['c1']), text('two', ['c1'])))).get('c1')).toEqual({ text: 'one two', count: 2 });
  });

  it('makes unique safe ids and initials', () => {
    const id = newCommentId(['x']);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(initialsOf('ada  king lovelace')).toBe('AKL');
    expect(initialsOf('')).toBe('');
  });

  it('lists comments after the text in a plain-text export', () => {
    const doc = docOf(p(text('Intro '), text('key claim', ['c1'])));
    const out = commentsAppendix([thread('c1', { resolved: true, replies: [{ id: 'r1', author: 'Bo', createdAt: T0, text: 'Agreed\nfully' }] }), thread('gone')], doc);
    expect(out).toBe(
      ['Comments', '', '[1] On “key claim” (resolved)', '    Ada Lovelace (2026-03-01): About c1', '    Reply — Bo (2026-03-01): Agreed fully', '', '[2] On deleted text', '    Ada Lovelace (2026-03-01): About gone', ''].join('\n'),
    );
    expect(commentsAppendix([], doc)).toBe('');
    // The body text itself is unchanged by comments.
    expect(documentToText(doc)).toBe('Intro key claim\n');
  });
});

describe('find options and word count', () => {
  it('whole words skips matches inside longer words, in any script', () => {
    const e = make('<p>cat catalog Cat scat cat_s cat.</p><p>naïve naïveté</p>');
    expect(findMatches(e.state.doc, 'cat', false)).toHaveLength(6);
    expect(findMatches(e.state.doc, 'cat', false, true).map((m) => e.state.doc.textBetween(m.from, m.to))).toEqual(['cat', 'Cat', 'cat']);
    expect(findMatches(e.state.doc, 'cat', true, true)).toHaveLength(2);
    expect(findMatches(e.state.doc, 'naïve', false, true)).toHaveLength(1);
    // A term ending in punctuation only needs a boundary where it has a letter.
    expect(findMatches(e.state.doc, 'cat.', false, true)).toHaveLength(1);
  });

  it('counts words, characters with and without spaces, paragraphs, and a selection', () => {
    const e = make('<h1>Title here</h1><p>One two three</p><p></p><ul><li><p>item</p></li></ul><table><tbody><tr><td><p>cell text</p></td></tr></tbody></table>');
    const all = textStats(e.state.doc);
    expect(all).toEqual({ words: 8, characters: 'Title hereOne two threeitemcell text'.length, charactersNoSpaces: 'TitlehereOnetwothreeitemcelltext'.length, paragraphs: 4 });
    // "two thre" selected inside the second paragraph.
    let from = 0;
    e.state.doc.descendants((n, pos) => {
      if (n.isText && n.text!.startsWith('One')) from = pos + 4;
    });
    expect(textStats(e.state.doc, from, from + 8)).toEqual({ words: 2, characters: 8, charactersNoSpaces: 7, paragraphs: 1 });
    expect(textStats(e.state.doc, 5, 5)).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0 });
  });
});

async function docxParts(content: DocumentContent, report = new ExportReport()) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(content, 'T', new Map(), report)));
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? null;
  return { document: (await read('word/document.xml'))!, comments: await read('word/comments.xml'), extended: await read('word/commentsExtended.xml'), styles: (await read('word/styles.xml'))!, rels: (await read('word/_rels/document.xml.rels'))!, report };
}
const between = (xml: string, start: string, end: string) => xml.slice(xml.indexOf(start), xml.indexOf(end) + end.length);

describe('DOCX: comments are real Word comments', () => {
  it('writes the comment with author, initials, date and text, and its range around the commented runs', async () => {
    const content = withComments(docOf(p(text('Before '), text('commented', ['c1'], [{ type: 'bold' }]), text(' after'))), [thread('c1', { text: 'Line one\nLine two' })]);
    const { document, comments, rels, report } = await docxParts(content);
    expect(rels).toContain('comments.xml');
    expect(comments).toContain('w:id="0"');
    expect(comments).toContain('w:author="Ada Lovelace"');
    expect(comments).toContain('w:initials="AL"');
    expect(comments).toContain('w:date="2026-03-01T10:00:00.000Z"');
    expect(comments).toContain('<w:t xml:space="preserve">Line one</w:t>');
    expect(comments).toContain('<w:t xml:space="preserve">Line two</w:t>');
    const range = between(document, '<w:commentRangeStart w:id="0"/>', '<w:commentRangeEnd w:id="0"/>');
    expect(range).toContain('commented');
    expect(range).toContain('<w:b/>');
    expect(range).not.toContain('Before');
    expect(range).not.toContain('after');
    expect(document).toMatch(/<w:commentRangeEnd w:id="0"\/><w:r>(<w:rPr>.*?<\/w:rPr>)?<w:commentReference w:id="0"\/><\/w:r>/);
    expect(report.empty).toBe(true);
  });

  it('a comment over several paragraphs, a link and a table cell is one Word comment; overlapping comments nest', async () => {
    const doc = docOf(
      p(text('first ', ['c1']), text('link', ['c1'], [{ type: 'link', attrs: { href: 'https://example.com' } }])),
      p(text('second', ['c1', 'c2'])),
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p(text('cell', ['c2']))] }] }] },
    );
    const { document, comments } = await docxParts(withComments(doc, [thread('c2'), thread('c1')]));
    // Word ids follow the text: c1 first.
    expect(comments!.indexOf('About c1')).toBeLessThan(comments!.indexOf('About c2'));
    for (const id of [0, 1]) {
      expect(document.split(`<w:commentRangeStart w:id="${id}"/>`)).toHaveLength(2);
      expect(document.split(`<w:commentRangeEnd w:id="${id}"/>`)).toHaveLength(2);
      expect(document.split(`<w:commentReference w:id="${id}"/>`)).toHaveLength(2);
    }
    const c1 = between(document, '<w:commentRangeStart w:id="0"/>', '<w:commentRangeEnd w:id="0"/>');
    expect(c1).toContain('w:hyperlink');
    expect(c1).toContain('second');
    expect(c1).not.toContain('cell');
    const c2 = between(document, '<w:commentRangeStart w:id="1"/>', '<w:commentRangeEnd w:id="1"/>');
    expect(c2).toContain('second');
    expect(c2).toContain('<w:tc>');
    expect(c2).toContain('cell');
  });

  it('writes replies as a Word thread and the resolved state (commentsExtended.xml)', async () => {
    const content = withComments(docOf(p(text('a', ['c1']), text(' b ', []), text('c', ['c2']))), [
      thread('c1', { resolved: true, replies: [{ id: 'r1', author: 'Bo Diddley', createdAt: '2026-03-02T09:00:00.000Z', text: 'Done' }] }),
      thread('c2'),
    ]);
    const { comments, extended } = await docxParts(content);
    expect(comments).toContain('w:author="Bo Diddley"');
    expect(comments).toContain('w:initials="BD"');
    expect(extended).not.toBeNull();
    // c1 is w:id 0 (paraId 00000001), its reply w:id 1 (00000002), c2 w:id 2 (00000003).
    expect(extended).toContain('<w15:commentEx w15:paraId="00000001" w15:done="1"/>');
    expect(extended).toContain('<w15:commentEx w15:paraId="00000002" w15:paraIdParent="00000001" w15:done="1"/>');
    expect(extended).toContain('<w15:commentEx w15:paraId="00000003" w15:done="0"/>');
    expect(comments).toContain('w14:paraId="00000002"');
  });

  it('says so when a resolved comment cannot be marked resolved (no replies in the document)', async () => {
    const { extended, report } = await docxParts(withComments(docOf(p(text('a', ['c1']))), [thread('c1', { resolved: true })]));
    expect(extended).toBeNull();
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 resolved comment was written as an open comment.');
  });

  it('leaves out comments on deleted text and marks without a thread, and says so', async () => {
    const content = withComments(docOf(p(text('kept', ['c1']), text(' stray', ['nothread']))), [thread('c1'), thread('gone'), thread('gone2')]);
    const { document, comments, report } = await docxParts(content);
    expect(comments!.match(/<w:comment /g)).toHaveLength(1);
    expect(document).not.toContain('w:id="1"/>');
    expect(document).toContain('stray');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 2 comments on deleted text were left out.');
  });

  it('documents without comments get no comments part (existing exports are unchanged)', async () => {
    const { comments, rels, document } = await docxParts(withComments(docOf(p(text('Hello')))));
    expect(comments).toBeNull();
    expect(rels).not.toContain('comments.xml');
    expect(document).not.toContain('commentRange');
  });
});

describe('DOCX: document language', () => {
  it('writes the language as the default proofing language', async () => {
    const { styles } = await docxParts(withComments(docOf(p(text('Colour'))), undefined, { language: 'en-GB' }));
    expect(between(styles, '<w:docDefaults>', '</w:docDefaults>')).toContain('<w:lang w:val="en-GB"/>');
    const ja = await docxParts(withComments(docOf(p(text('x'))), undefined, { language: 'ja-JP' }));
    expect(ja.styles).toContain('<w:lang w:eastAsia="ja-JP"/>');
    const none = await docxParts(withComments(docOf(p(text('x')))));
    expect(none.styles).not.toContain('<w:lang');
  });
});

describe('print', () => {
  it('prints commented text without any comment highlight', () => {
    const html = buildPrintHtml('<p><span class="dcos-comment" data-comment-id="c1">x</span></p>', createEmptyDocument().page, 'T');
    expect(html).toContain('.dcos-doc .dcos-comment, .dcos-doc .dcos-comment-pending { background: none !important; border: none !important; }');
  });
});
