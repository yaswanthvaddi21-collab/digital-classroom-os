// @vitest-environment jsdom
/**
 * Phase 4 cross-feature cases (Round 3): features of different groups used together, built with the editor's own
 * commands where the UI does it that way, then saved, copied and pasted, and exported to Word, OpenDocument, plain
 * text and the print page.
 *
 * - an equation inside a table cell
 * - a comment on a heading and inside a list
 * - a text box holding a list and a picture
 * - a two-column section holding a picture and an equation
 * - a styled numbered list on both sides of a section break
 */
import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Packer } from 'docx';
import { strFromU8, unzipSync } from 'fflate';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDocx } from './export/docx';
import { buildOdt } from './export/odt';
import { cleanClone } from './export/print';
import { ExportReport, exportToast } from './export/report';
import { documentToText } from './export/text';
import { writeEquation } from './extensions/equation';
import { documentExtensions } from './extensions';
import { importOdt } from './import/odt';
import { contentSchemaFor } from './migrate';
import { commentsAppendix, type CommentThread } from './review/comments';
import { createEmptyDocument, DEFAULT_PAGE, type DocumentContent } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC';

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});
const make = (content: JSONContent | string) => {
  const e = new Editor({ element: document.createElement('div'), extensions: documentExtensions(), content });
  editors.push(e);
  return e;
};
const t = (text: string): JSONContent => ({ type: 'text', text });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });
const content = (doc: JSONContent, extra: Partial<DocumentContent> = {}): DocumentContent => {
  const c = { ...createEmptyDocument(), doc, ...extra };
  return { ...c, schemaVersion: contentSchemaFor(c) };
};

/** Copy and paste as the browser does it: the editor's HTML into a fresh editor. */
const copyPaste = (e: Editor) => make(e.getHTML()).getJSON();
/** Drops null attributes so documents from different routes compare equal. */
const bare = (n: JSONContent): JSONContent => ({
  ...n,
  ...(n.attrs ? { attrs: Object.fromEntries(Object.entries(n.attrs).filter(([, v]) => v !== null)) } : {}),
  ...(n.content ? { content: n.content.map(bare) } : {}),
});

async function docxParts(c: DocumentContent, assets = new Map<string, Uint8Array>()) {
  const report = new ExportReport();
  const buffer = await Packer.toBuffer(buildDocx(c, 'Cross', assets, report));
  const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return { buffer, report, document: await read('word/document.xml'), numbering: await read('word/numbering.xml'), comments: await read('word/comments.xml') };
}
function odtParts(c: DocumentContent) {
  const report = new ExportReport();
  const bytes = buildOdt(c, 'Cross', new Map(), report, new Date('2026-01-01T00:00:00Z'));
  const files = unzipSync(bytes);
  return { bytes, report, content: strFromU8(files['content.xml']), styles: strFromU8(files['styles.xml']) };
}
/** The <w:tc>, <w:p> … elements of an XML string that contain `text`. */
const elementsWith = (xml: string, tag: string, text: string) => (xml.match(new RegExp(`<${tag}\\b[^>]*>(?:(?!</${tag}>)[\\s\\S])*?</${tag}>`, 'g')) ?? []).filter((x) => x.includes(text));
/** Position just inside the first text node that contains `text`. */
function posOf(e: Editor, text: string): number {
  let at = -1;
  e.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text!.includes(text)) at = pos + n.text!.indexOf(text);
    return at < 0;
  });
  if (at < 0) throw new Error(`no text ${text}`);
  return at;
}

describe('an equation inside a table cell', () => {
  const build = () => {
    const e = make({ type: 'doc', content: [p(t('Results'))] });
    e.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    // The cursor is in the first header cell: type there, then move to the first body cell.
    e.chain().insertContent('Mass').run();
    let bodyCell = -1;
    e.state.doc.descendants((n, pos) => {
      if (bodyCell < 0 && n.type.name === 'tableCell') bodyCell = pos;
      return bodyCell < 0;
    });
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, bodyCell + 2)));
    expect(writeEquation(e, 'E = mc^2', false)).toBe(true);
    expect(writeEquation(e, '\\frac{a}{b}', true)).toBe(true);
    return e;
  };

  it('is inserted with the editor commands, and survives save, copy and paste', () => {
    const e = build();
    const json = e.getJSON() as JSONContent;
    const cell = JSON.stringify(json.content![1].content![1].content![0]);
    expect(cell).toContain('"type":"inlineMath"');
    expect(cell).toContain('"type":"blockMath"');
    expect(make(json).getJSON()).toEqual(json);
    expect(bare(copyPaste(e))).toEqual(bare(json));
    expect(contentSchemaFor({ ...createEmptyDocument(), doc: json })).toBe(2);
  });

  it('is a native Word equation inside the cell, in DOCX', async () => {
    const e = build();
    const { document, report } = await docxParts(content(e.getJSON()));
    const cells = elementsWith(document, 'w:tc', 'm:oMath');
    expect(cells).toHaveLength(1);
    expect(cells[0]).toContain('<m:oMath>');
    expect(cells[0]).toContain('<m:oMathPara>');
    expect(cells[0]).toContain('<m:f>'); // the fraction
    expect(report.sentences()).toEqual([]);
  });

  it('is written as its LaTeX in the cell in ODT (reported), in plain text, and drawn in print', () => {
    const e = build();
    const c = content(e.getJSON());
    const odt = odtParts(c);
    const cell = elementsWith(odt.content, 'table:table-cell', 'mc^2');
    expect(cell).toHaveLength(1);
    expect(cell[0]).toContain('$E = mc^2$');
    expect(exportToast('OpenDocument text', odt.report).message).toMatch(/2 equations/);
    expect(documentToText(c.doc)).toContain('$E = mc^2$');
    const html = cleanClone(e.view.dom as HTMLElement, DEFAULT_PAGE);
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelector('td .katex, td [data-type="inline-math"]')).toBeTruthy();
  });
});

describe('a comment on a heading and inside a list', () => {
  const threads: CommentThread[] = [
    { id: 'cHead', author: 'Ada Lovelace', createdAt: '2026-03-01T10:00:00.000Z', text: 'Better title?', resolved: false, replies: [] },
    { id: 'cList', author: 'Ada Lovelace', createdAt: '2026-03-01T10:05:00.000Z', text: 'Source?', resolved: false, replies: [{ id: 'cReply', author: 'Grace Hopper', createdAt: '2026-03-01T11:00:00.000Z', text: 'Added.' }] },
  ];
  const build = () => {
    const e = make({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [t('Introduction')] },
        { type: 'orderedList', attrs: { numberFormat: 'lower-alpha' }, content: [li(p(t('first point'))), li(p(t('second point')))] },
      ],
    });
    e.storage.comment.known = new Set(threads.map((th) => th.id));
    const h = posOf(e, 'Introduction');
    expect(e.commands.addComment('cHead', { from: h, to: h + 'Introduction'.length })).toBe(true);
    const l = posOf(e, 'second point');
    expect(e.commands.addComment('cList', { from: l, to: l + 'second'.length })).toBe(true);
    return e;
  };

  it('keeps both marks through save, copy and paste, and the document is schema 2', () => {
    const e = build();
    const json = e.getJSON() as JSONContent;
    expect(make(json).getJSON()).toEqual(json);
    expect(JSON.stringify(copyPaste(e))).toContain('"commentId":"cList"');
    expect(JSON.stringify(copyPaste(e))).toContain('"commentId":"cHead"');
    expect(content(json, { comments: threads }).schemaVersion).toBe(2);
  });

  it('becomes two Word comments, ranged inside the heading and inside the numbered list paragraph', async () => {
    const e = build();
    const { document, comments } = await docxParts(content(e.getJSON(), { comments: threads }));
    const heading = elementsWith(document, 'w:p', 'Introduction')[0];
    expect(heading).toContain('<w:pStyle w:val="Heading1"/>');
    expect(heading).toMatch(/<w:commentRangeStart w:id="\d+"\/>[\s\S]*Introduction[\s\S]*<w:commentRangeEnd w:id="\d+"\/>/);
    const item = elementsWith(document, 'w:p', 'second')[0];
    expect(item).toContain('<w:numPr>');
    expect(item).toMatch(/<w:commentRangeStart w:id="\d+"\/>[\s\S]*second[\s\S]*<w:commentRangeEnd w:id="\d+"\/>/);
    for (const text of ['Better title?', 'Source?', 'Added.']) expect(comments).toContain(text);
  });

  it('is listed after the text in plain text, and left out of ODT with a note', () => {
    const e = build();
    const c = content(e.getJSON(), { comments: threads });
    const appendix = commentsAppendix(threads, c.doc);
    expect(appendix).toContain('Introduction');
    expect(appendix).toContain('second');
    expect(appendix).toContain('Added.');
    const odt = odtParts(c);
    expect(odt.content).toContain('Introduction');
    expect(exportToast('OpenDocument text', odt.report).message).toMatch(/[Cc]omments/);
  });
});

describe('a text box holding a list and a picture', () => {
  const build = () => {
    const e = make({
      type: 'doc',
      content: [p(t('Intro')), { type: 'bulletList', attrs: { bulletStyle: 'square' }, content: [li(p(t('boxed one'))), li(p(t('boxed two')))] }, { type: 'image', attrs: { src: PNG, alt: 'chart', width: 40, height: 20 } }, p(t('After'))],
    });
    // Select from the list's text into the paragraph after the picture, then Insert ▸ Text box: the selected blocks
    // (list, picture, paragraph) go into the box.
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, posOf(e, 'boxed one'), posOf(e, 'After') + 2)));
    expect(e.commands.insertTextBox()).toBe(true);
    return e;
  };

  it('wraps the selected list and picture with the editor command, and keeps them through copy and paste', () => {
    const e = build();
    const json = e.getJSON() as JSONContent;
    const box = json.content!.find((n) => n.type === 'textBox')!;
    expect(box.content!.map((n) => n.type)).toEqual(['bulletList', 'image', 'paragraph']);
    expect(box.content![0].attrs?.bulletStyle).toBe('square');
    expect(bare(copyPaste(e))).toEqual(bare(json));
  });

  it('is one table cell in DOCX holding the numbered (square bullet) list paragraphs and the picture', async () => {
    const e = build();
    const { document, numbering, report } = await docxParts(content(e.getJSON()));
    const cells = elementsWith(document, 'w:tc', 'boxed one');
    expect(cells).toHaveLength(1);
    expect(cells[0]).toContain('boxed two');
    expect((cells[0].match(/<w:numPr>/g) ?? []).length).toBe(2);
    expect(cells[0]).toContain('<w:drawing>');
    expect(numbering).toContain('<w:lvlText w:val="▪"/>');
    expect(exportToast('Word document', report).message).toContain('1 text box was written as a one-cell table');
  });

  it('keeps the list and the picture in ODT, plain text and print', () => {
    const e = build();
    const c = content(e.getJSON());
    const odt = odtParts(c);
    expect(odt.content).toContain('boxed one');
    expect(odt.content).toContain('<draw:image');
    expect(documentToText(c.doc)).toMatch(/boxed one[\s\S]*boxed two[\s\S]*\[Image: chart\]/);
    const root = document.createElement('div');
    root.innerHTML = cleanClone(e.view.dom as HTMLElement, DEFAULT_PAGE);
    const box = root.querySelector('[data-type="text-box"]')!;
    expect(box.querySelector('ul li')).toBeTruthy();
    expect(box.querySelector('img')).toBeTruthy();
  });
});

describe('a two-column section holding a picture and an equation', () => {
  const build = () => {
    const e = make({ type: 'doc', content: [p(t('Cover text')), p(t('Columns start here')), { type: 'image', attrs: { src: PNG, alt: 'wide', width: 600, height: 300 } }, { type: 'blockMath', attrs: { latex: 'a^2 + b^2 = c^2' } }] });
    // Cursor at the start of the second paragraph, then Layout ▸ Breaks ▸ Section break (continuous), 2 columns.
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, e.state.doc.child(0).nodeSize + 1)));
    expect(e.commands.insertSectionBreak({ breakType: 'continuous' })).toBe(true);
    let breakPos = -1;
    e.state.doc.forEach((n, pos) => {
      if (n.type.name === 'sectionBreak') breakPos = pos;
    });
    expect(e.commands.updateSectionBreak(breakPos, { columns: 2, columnSpacing: 10 })).toBe(true);
    return e;
  };

  it('is a Word section with two columns whose picture fits one column, with the native equation', async () => {
    const e = build();
    const { document } = await docxParts(content(e.getJSON()));
    const sectPrs = document.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrs).toHaveLength(2);
    expect(sectPrs[1]).toContain('<w:cols w:space="567" w:num="2" w:equalWidth="true"/>');
    expect(sectPrs[1]).toContain('<w:type w:val="continuous"/>');
    // The second section (after the first sectPr) holds the picture and the equation.
    const second = document.split(sectPrs[0]!)[1];
    expect(second).toContain('<m:oMathPara>');
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(second)![1]);
    // One column of A4 with 25.4 mm margins and 10 mm spacing: (210 − 50.8 − 10) / 2 = 74.6 mm.
    expect(cx / 36000).toBeLessThanOrEqual(74.6 + 0.5);
    expect(cx / 36000).toBeGreaterThan(70);
  });

  it('prints as a two-column block holding the picture and the equation', () => {
    const e = build();
    const root = document.createElement('div');
    root.innerHTML = cleanClone(e.view.dom as HTMLElement, DEFAULT_PAGE);
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.dcos-print-section'));
    expect(sections).toHaveLength(2);
    expect(sections[1].getAttribute('style')).toContain('column-count: 2');
    expect(sections[1].querySelector('img')).toBeTruthy();
    expect(sections[1].querySelector('[data-type="block-math"], .katex-display, .katex')).toBeTruthy();
  });

  it('writes columns to ODT only where it can (page-level), and reports the section', () => {
    const e = build();
    const odt = odtParts(content(e.getJSON()));
    expect(odt.content).toContain('<draw:image');
    expect(odt.content).toContain('$$a^2 + b^2 = c^2$$');
    expect(odt.report.sentences().join(' ')).toMatch(/section/i);
  });
});

describe('a styled numbered list on both sides of a section break', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'orderedList', attrs: { numberFormat: 'upper-roman' }, content: [li(p(t('Part one'))), li(p(t('Part two')))] },
      { type: 'sectionBreak', attrs: { breakType: 'nextPage', orientation: 'landscape' } },
      { type: 'orderedList', attrs: { numberFormat: 'upper-roman', start: 3 }, content: [li(p(t('Part three')), { type: 'sectionBreak', attrs: { breakType: 'nextPage' } })] },
    ],
  };

  it('keeps the format on both sides in DOCX, continues at III after the break, and reports the break inside the list', async () => {
    const { document, numbering, report } = await docxParts(content(doc));
    const sectPrs = document.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrs).toHaveLength(2);
    expect(sectPrs[1]).toContain('w:orient="landscape"');
    const numOf = (text: string) => /<w:numId w:val="(\d+)"\/>/.exec(elementsWith(document, 'w:p', text)[0])![1];
    const absOf = (numId: string) => new RegExp(`<w:num w:numId="${numId}">\\s*<w:abstractNumId w:val="(\\d+)"/>`).exec(numbering)![1];
    const lvl0 = (numId: string) => new RegExp(`<w:abstractNum\\b[^>]*w:abstractNumId="${absOf(numId)}"[\\s\\S]*?<w:lvl w:ilvl="0"[\\s\\S]*?</w:lvl>`).exec(numbering)![0];
    expect(lvl0(numOf('Part one'))).toContain('<w:numFmt w:val="upperRoman"/>');
    expect(lvl0(numOf('Part three'))).toContain('<w:numFmt w:val="upperRoman"/>');
    expect(lvl0(numOf('Part three'))).toContain('<w:start w:val="3"/>');
    // Part one and Part two are one list (one numbering instance); Part three is its own.
    expect(numOf('Part one')).toBe(numOf('Part two'));
    expect(numOf('Part three')).not.toBe(numOf('Part one'));
    expect(exportToast('Word document', report).message).toContain('1 section break inside a table, list or quote was left out');
    // An independent reader finds every item.
    const { value } = await mammoth.extractRawText({ buffer: (await docxParts(content(doc))).buffer as Buffer });
    for (const text of ['Part one', 'Part two', 'Part three']) expect(value).toContain(text);
  });

  it('numbers I, II … III in plain text and keeps the list format in ODT across the page break', () => {
    expect(documentToText(doc)).toMatch(/I\. Part one[\s\S]*II\. Part two[\s\S]*\[Section break: next page\][\s\S]*III\. Part three/);
    const odt = odtParts(content(doc));
    // Both lists use the upper-roman list style (one style, shared); the second starts at 3.
    const odtLists = odt.content.match(/<text:list text:style-name="([^"]+)">/g) ?? [];
    expect(odtLists).toHaveLength(2);
    const style = /text:style-name="([^"]+)"/.exec(odtLists[0]!)![1];
    expect(new RegExp(`<text:list-style style:name="${style}">\\s*<text:list-level-style-number text:level="1"[^>]*style:num-format="I"`).test(odt.content)).toBe(true);
    expect(odt.content).toContain('text:start-value="3"');
    const back = importOdt(odt.bytes, 'x.odt').content.doc;
    const lists = back.content!.filter((n) => n.type === 'orderedList');
    expect(lists.map((l) => [l.attrs?.numberFormat, l.attrs?.start])).toEqual([
      ['upper-roman', 1],
      ['upper-roman', 3],
    ]);
  });

  it('a list item can be made a section start only outside the list (the editor inserts the break after the list)', () => {
    const e = make({ type: 'doc', content: [{ type: 'orderedList', attrs: { numberFormat: 'upper-roman' }, content: [li(p(t('Only item')))] }] });
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, posOf(e, 'item'))));
    expect(e.commands.insertSectionBreak({ breakType: 'nextPage' })).toBe(true);
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(['orderedList', 'sectionBreak', 'paragraph']);
  });
});
