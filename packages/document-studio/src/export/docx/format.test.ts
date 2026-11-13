// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { documentContentCss } from '../../contentCss';
import { documentExtensions } from '../../extensions';
import { listStyleCss } from '../../extensions/listStyles';
import { HEADING_LOOKS, PARAGRAPH_STYLE_LOOKS, paragraphStyleCss } from '../../paragraphStyles';
import { createEmptyDocument, type DocumentContent } from '../../types';
import { buildPrintHtml } from '../print';
import { ExportReport } from '../report';
import { documentToText } from '../text';
import { buildDocx } from './index';

const p = (text: string, attrs?: Record<string, unknown>): JSONContent => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] });
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });
const content = (...blocks: JSONContent[]): DocumentContent => ({ ...createEmptyDocument(), doc: { type: 'doc', content: blocks } });

async function parts(c: DocumentContent) {
  const report = new ExportReport();
  const buffer = await Packer.toBuffer(buildDocx(c, 'Format', new Map(), report));
  const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return { buffer, report, document: await read('word/document.xml'), styles: await read('word/styles.xml'), numbering: await read('word/numbering.xml') };
}
/** The <w:p> elements of document.xml whose text contains `text`. */
const paragraphWith = (xml: string, text: string) => {
  const found = (xml.match(/<w:p>.*?<\/w:p>|<w:p [^>]*>.*?<\/w:p>/gs) ?? []).filter((x) => x.includes(`>${text}<`));
  expect(found, `paragraph "${text}"`).toHaveLength(1);
  return found[0];
};
const attr = (xml: string, element: string, name: string) => new RegExp(`<${element}\\b[^>]*\\b${name}="([^"]*)"`).exec(xml)?.[1];
/** One <w:style> of styles.xml by id. */
const styleXml = (xml: string, id: string) => new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>.*?</w:style>`, 's').exec(xml)?.[0] ?? '';

describe('DOCX: paragraph formatting', () => {
  it('writes line spacing, spacing before/after and indents as Word paragraph properties', async () => {
    const { document } = await parts(
      content(
        p('Spaced', { lineSpacing: 1.15, spaceBefore: 12, spaceAfter: 6 }),
        p('Double', { lineSpacing: 2 }),
        p('Hanging', { indentLeft: 36, indentRight: 18, indentFirstLine: -18 }),
        p('FirstLine', { indentFirstLine: 36 }),
        p('Plain'),
      ),
    );
    const spaced = paragraphWith(document, 'Spaced');
    expect(attr(spaced, 'w:spacing', 'w:line')).toBe('276');
    expect(attr(spaced, 'w:spacing', 'w:before')).toBe('240');
    expect(attr(spaced, 'w:spacing', 'w:after')).toBe('120');
    expect(attr(spaced, 'w:spacing', 'w:lineRule') ?? 'auto').toBe('auto');
    expect(attr(paragraphWith(document, 'Double'), 'w:spacing', 'w:line')).toBe('480');
    const hanging = paragraphWith(document, 'Hanging');
    expect(attr(hanging, 'w:ind', 'w:left')).toBe('720');
    expect(attr(hanging, 'w:ind', 'w:right')).toBe('360');
    expect(attr(hanging, 'w:ind', 'w:hanging')).toBe('360');
    expect(attr(paragraphWith(document, 'FirstLine'), 'w:ind', 'w:firstLine')).toBe('720');
    // An unformatted paragraph is written exactly as before (no spacing, indent or style of its own).
    expect(paragraphWith(document, 'Plain')).not.toMatch(/w:spacing|w:ind|w:pStyle/);
  });

  it('lets a stored line spacing replace a line height that came from text style', async () => {
    const { document } = await parts(
      content({ type: 'paragraph', attrs: { lineSpacing: 1.5 }, content: [{ type: 'text', text: 'Mixed', marks: [{ type: 'textStyle', attrs: { lineHeight: '24pt' } }] }] }),
    );
    const x = paragraphWith(document, 'Mixed');
    expect(attr(x, 'w:spacing', 'w:line')).toBe('360');
    expect(x).not.toContain('w:lineRule="atLeast"');
  });

  it('writes formatting on headings, list paragraphs (added to the list indent) and quote paragraphs', async () => {
    const { document } = await parts(
      content(
        { type: 'heading', attrs: { level: 2, lineSpacing: 1, indentLeft: 36 }, content: [{ type: 'text', text: 'Head' }] },
        { type: 'bulletList', content: [li(p('Item', { indentLeft: 18, spaceAfter: 0 }))] },
        { type: 'blockquote', content: [p('Quoted', { indentLeft: 36 })] },
      ),
    );
    const head = paragraphWith(document, 'Head');
    expect(attr(head, 'w:pStyle', 'w:val')).toBe('Heading2');
    expect(attr(head, 'w:spacing', 'w:line')).toBe('240');
    expect(attr(head, 'w:ind', 'w:left')).toBe('720');
    const item = paragraphWith(document, 'Item');
    expect(item).toContain('<w:numPr>');
    expect(attr(item, 'w:ind', 'w:left')).toBe(String(720 + 360));
    expect(attr(item, 'w:ind', 'w:hanging')).toBe(String(360 + 360)); // the bullet stays at 720 − 360
    expect(attr(item, 'w:spacing', 'w:after')).toBe('0');
    const quoted = paragraphWith(document, 'Quoted');
    expect(attr(quoted, 'w:pStyle', 'w:val')).toBe('Quote');
    expect(attr(quoted, 'w:ind', 'w:left')).toBe(String(720 + 720));
  });
});

describe('DOCX: named paragraph styles are real Word styles', () => {
  it('references Title, Subtitle, Caption, Heading 1–4, Quote and Code by style id', async () => {
    const { document } = await parts(
      content(
        p('My title', { paragraphStyle: 'title' }),
        p('My subtitle', { paragraphStyle: 'subtitle' }),
        p('Figure 1', { paragraphStyle: 'caption' }),
        ...[1, 2, 3, 4].map((level) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: `H${level}` }] })),
        { type: 'blockquote', content: [p('A quote')] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'let x = 1;' }] },
      ),
    );
    const styleOf = (text: string) => attr(paragraphWith(document, text), 'w:pStyle', 'w:val');
    expect(styleOf('My title')).toBe('Title');
    expect(styleOf('My subtitle')).toBe('Subtitle');
    expect(styleOf('Figure 1')).toBe('Caption');
    expect([1, 2, 3, 4].map((l) => styleOf(`H${l}`))).toEqual(['Heading1', 'Heading2', 'Heading3', 'Heading4']);
    expect(styleOf('A quote')).toBe('Quote');
    expect(styleOf('let x = 1;')).toBe('Code');
  });

  it('defines every style in styles.xml with the editor look (sizes match the editor CSS)', async () => {
    const { styles } = await parts(content(p('x')));
    for (const id of ['Normal', 'Title', 'Subtitle', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Quote', 'Caption', 'Code']) expect(styleXml(styles, id), id).not.toBe('');
    // Each style id is defined once.
    for (const id of ['Title', 'Subtitle', 'Heading1', 'Quote', 'Caption', 'Code']) expect(styles.match(new RegExp(`w:styleId="${id}"`, 'g'))).toHaveLength(1);

    for (const level of [1, 2, 3, 4] as const) {
      const css = new RegExp(`\\.dcos-doc h${level} \\{ font-size: (\\d+)pt; \\}`).exec(documentContentCss);
      expect(Number(css?.[1]), `h${level} css`).toBe(HEADING_LOOKS[level].sizePt);
      const s = styleXml(styles, `Heading${level}`);
      expect(attr(s, 'w:sz', 'w:val')).toBe(String(HEADING_LOOKS[level].sizePt * 2));
      expect(s).toContain('<w:b/>');
      expect(attr(s, 'w:color', 'w:val')).toBe('111114');
      expect(s).toContain('<w:keepNext/>');
    }
    expect(/\.dcos-doc h1, \.dcos-doc h2, \.dcos-doc h3, \.dcos-doc h4 \{ line-height: 1\.25; font-weight: 700; color: #111114; margin: 1\.1em 0 0\.4em; \}/.test(documentContentCss)).toBe(true);
    // Heading 1: 22pt above in the editor less the 8pt a body paragraph leaves below itself in Word; 8pt after.
    expect(attr(styleXml(styles, 'Heading1'), 'w:spacing', 'w:before')).toBe('280');
    expect(attr(styleXml(styles, 'Heading1'), 'w:spacing', 'w:after')).toBe('160');

    const title = styleXml(styles, 'Title');
    expect(attr(title, 'w:sz', 'w:val')).toBe(String(PARAGRAPH_STYLE_LOOKS.title.sizePt * 2));
    expect(attr(styleXml(styles, 'Subtitle'), 'w:color', 'w:val')).toBe('5B5B66');
    expect(attr(styleXml(styles, 'Subtitle'), 'w:name', 'w:val')).toBe('Subtitle');
    expect(styleXml(styles, 'Caption')).toContain('<w:i/>');
    expect(attr(styleXml(styles, 'Caption'), 'w:sz', 'w:val')).toBe('18');
    expect(attr(styleXml(styles, 'Quote'), 'w:ind', 'w:left')).toBe('720');
    expect(attr(styleXml(styles, 'Code'), 'w:rFonts', 'w:ascii')).toBe('Courier New');
    // The editor CSS for the paragraph styles comes from the same table.
    expect(documentContentCss).toContain(paragraphStyleCss);
    expect(paragraphStyleCss).toContain('.dcos-doc p[data-paragraph-style="title"] { font-size: 26pt;');
  });

  it('is read by an independent parser with the right headings and every paragraph', async () => {
    const { buffer } = await parts(content(p('Report title', { paragraphStyle: 'title' }), { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Intro' }] }, p('Body text', { lineSpacing: 2, indentFirstLine: 36 })));
    const { value } = await mammoth.convertToHtml({ buffer });
    expect(value).toContain('<h1>Intro</h1>');
    expect(value).toContain('Report title');
    expect(value).toContain('<p>Body text</p>');
  });
});

describe('DOCX: list styles', () => {
  it('writes number formats and start numbers as their own numbering definitions', async () => {
    const { document, numbering } = await parts(
      content(
        { type: 'orderedList', attrs: { numberFormat: 'lower-roman', start: 3 }, content: [li(p('Roman'))] },
        { type: 'orderedList', attrs: { numberFormat: 'upper-alpha' }, content: [li(p('Alpha'), { type: 'orderedList', content: [li(p('Nested default'))] })] },
        { type: 'orderedList', content: [li(p('Plain'))] },
      ),
    );
    const abstracts = numbering.match(/<w:abstractNum\b.*?<\/w:abstractNum>/gs) ?? [];
    const level0 = (fmt: string) => abstracts.map((a) => /<w:lvl w:ilvl="0".*?<\/w:lvl>/s.exec(a)?.[0] ?? '').filter((l) => l.includes(`w:val="${fmt}"`));
    const roman = level0('lowerRoman');
    expect(roman.length).toBeGreaterThan(0);
    expect(roman.some((l) => attr(l, 'w:start', 'w:val') === '3')).toBe(true);
    expect(level0('upperLetter').length).toBeGreaterThan(0);
    // Each list's paragraph points at a numbering instance; the nested plain list keeps the default definition.
    for (const t of ['Roman', 'Alpha', 'Nested default', 'Plain']) expect(paragraphWith(document, t)).toContain('<w:numPr>');
    expect(attr(paragraphWith(document, 'Nested default'), 'w:ilvl', 'w:val')).toBe('1');
  });

  it('keeps the start number of a nested list (styled or default): Word starts it where the editor does', async () => {
    const { document, numbering } = await parts(
      content(
        { type: 'orderedList', content: [li(p('outer'), { type: 'orderedList', attrs: { start: 4, numberFormat: 'upper-roman' }, content: [li(p('inner IV'))] })] },
        { type: 'bulletList', content: [li(p('bullet'), { type: 'orderedList', attrs: { start: 7 }, content: [li(p('inner 7'))] })] },
      ),
    );
    // The numbering instance each paragraph uses, at its own level.
    const startOf = (text: string) => {
      const para = paragraphWith(document, text);
      const numId = attr(para, 'w:numId', 'w:val');
      const ilvl = attr(para, 'w:ilvl', 'w:val');
      const num = new RegExp(`<w:num w:numId="${numId}">.*?</w:num>`, 's').exec(numbering)?.[0] ?? '';
      const override = new RegExp(`<w:lvlOverride w:ilvl="${ilvl}">.*?</w:lvlOverride>`, 's').exec(num)?.[0] ?? '';
      const abstract = new RegExp(`<w:abstractNum\\b[^>]*w:abstractNumId="${attr(num, 'w:abstractNumId', 'w:val')}".*?</w:abstractNum>`, 's').exec(numbering)?.[0] ?? '';
      const lvl = new RegExp(`<w:lvl w:ilvl="${ilvl}".*?</w:lvl>`, 's').exec(abstract)?.[0] ?? '';
      return { ilvl, override: attr(override, 'w:startOverride', 'w:val'), start: attr(lvl, 'w:start', 'w:val'), fmt: attr(lvl, 'w:numFmt', 'w:val') };
    };
    expect(startOf('inner IV')).toEqual({ ilvl: '1', override: '4', start: '4', fmt: 'upperRoman' });
    expect(startOf('inner 7')).toMatchObject({ ilvl: '1', override: '7', start: '7' });
    expect(startOf('outer')).toMatchObject({ ilvl: '0', override: '1', start: '1' });
  });

  it('keeps the left and right indents of a continuation paragraph in a list item', async () => {
    const { document } = await parts(content({ type: 'bulletList', content: [li(p('first'), p('second', { indentLeft: 36, indentRight: 36, lineSpacing: 2 }), p('third'))] }));
    const second = paragraphWith(document, 'second');
    expect(attr(second, 'w:ind', 'w:left')).toBe(String(720 + 720));
    expect(attr(second, 'w:ind', 'w:right')).toBe('720');
    expect(attr(second, 'w:spacing', 'w:line')).toBe('480');
    expect(attr(paragraphWith(document, 'third'), 'w:ind', 'w:left')).toBe('720');
  });

  it('writes bullet glyphs', async () => {
    const { numbering } = await parts(
      content(
        { type: 'bulletList', attrs: { bulletStyle: 'square' }, content: [li(p('Sq'))] },
        { type: 'bulletList', attrs: { bulletStyle: 'arrow' }, content: [li(p('Arr'))] },
        { type: 'bulletList', attrs: { bulletStyle: 'dash' }, content: [li(p('Dash'))] },
      ),
    );
    for (const glyph of ['▪', '→', '–']) expect(numbering).toContain(`<w:lvlText w:val="${glyph}"/>`);
  });

  it('leaves default lists on the shared definitions (no new numbering)', async () => {
    const plain = await parts(content({ type: 'bulletList', content: [li(p('a'))] }, { type: 'orderedList', attrs: { start: 4 }, content: [li(p('b'))] }));
    const withAttrsNull = await parts(
      content({ type: 'bulletList', attrs: { bulletStyle: null }, content: [li(p('a'))] }, { type: 'orderedList', attrs: { start: 4, numberFormat: null }, content: [li(p('b'))] }),
    );
    expect(withAttrsNull.numbering).toBe(plain.numbering);
    expect(withAttrsNull.document).toBe(plain.document);
  });
});

describe('plain text and print', () => {
  it('writes list markers in their format, from the start number', () => {
    const text = documentToText({
      type: 'doc',
      content: [
        { type: 'orderedList', attrs: { numberFormat: 'lower-alpha', start: 26 }, content: [li(p('z')), li(p('aa'))] },
        { type: 'orderedList', attrs: { numberFormat: 'upper-roman', start: 4 }, content: [li(p('four')), li(p('five'))] },
        { type: 'bulletList', attrs: { bulletStyle: 'arrow' }, content: [li(p('next'))] },
        { type: 'orderedList', content: [li(p('one'))] },
        { type: 'bulletList', content: [li(p('dot'))] },
        p('Title', { paragraphStyle: 'title', indentLeft: 36 }),
      ],
    });
    expect(text).toBe('z. z\naa. aa\n\nIV. four\nV. five\n\n→ next\n\n1. one\n\n• dot\n\nTitle\n');
  });

  it('prints with the same styles: the print page carries the style CSS and the inline formatting', () => {
    const editor = new Editor({
      extensions: documentExtensions(),
      content: { type: 'doc', content: [p('T', { paragraphStyle: 'title' }), p('Indented', { indentLeft: 36, lineSpacing: 2 }), { type: 'orderedList', attrs: { numberFormat: 'lower-roman' }, content: [li(p('i'))] }] },
    });
    const html = buildPrintHtml(editor.getHTML(), createEmptyDocument().page, 'Print');
    editor.destroy();
    expect(html).toContain(paragraphStyleCss);
    expect(html).toContain(listStyleCss);
    expect(html).toContain('data-paragraph-style="title"');
    expect(html).toContain('<ol data-number-format="lower-roman">');
    expect(html).toMatch(/style="[^"]*margin-left: 36pt/);
    expect(html).toMatch(/line-height: 2\.4414/);
  });
});
