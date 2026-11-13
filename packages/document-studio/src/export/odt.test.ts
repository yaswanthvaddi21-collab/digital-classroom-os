// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { finishDoc } from '../import/common';
import { importOdt } from '../import/odt';
import { documentTemplates } from '../templates';
import { createEmptyDocument, DEFAULT_PAGE, normalizePage, type DocumentContent } from '../types';
import { buildOdt, buildOdtParts, ODT_HANDLED_ATTRS, ODT_MIME } from './odt';
import { languageProps } from './odt/styles';
import { ExportReport, exportToast } from './report';

// 2×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC';

const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const doc = (...content: JSONContent[]): DocumentContent => ({ ...createEmptyDocument(), doc: { type: 'doc', content } });

const xmlOf = (content: DocumentContent, report = new ExportReport()) => buildOdtParts(content, 'Test', new Map(), report, new Date('2026-01-02T03:04:05Z')).parts;
const parse = (xml: string) => {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  expect(d.getElementsByTagName('parsererror').length).toBe(0);
  return d;
};

/** Everything the ODT export and import share: the round trip must give back the same document. */
const RICH: JSONContent[] = [
  { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [t('Report title')] },
  p(
    t('Plain, '),
    t('bold', [{ type: 'bold' }]),
    t(' '),
    t('italic', [{ type: 'italic' }]),
    t(' '),
    t('underlined', [{ type: 'underline' }]),
    t(' '),
    t('struck', [{ type: 'strike' }]),
    t(' H'),
    t('2', [{ type: 'subscript' }]),
    t('O x'),
    t('2', [{ type: 'superscript' }]),
    t(' '),
    t('red Georgia 14pt', [{ type: 'textStyle', attrs: { color: '#ff0000', fontFamily: 'Georgia', fontSize: '14pt' } }]),
    t(' '),
    t('marked', [{ type: 'highlight', attrs: { color: '#fef08a' } }]),
    t(' '),
    t('code()', [{ type: 'code' }]),
    t(' and a '),
    t('link', [{ type: 'link', attrs: { href: 'https://example.com/a?b=1&c=2' } }]),
    t('.'),
  ),
  { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [t('Two  spaces,\ta tab and '), { type: 'hardBreak' }, t('  a new line starting with spaces.')] },
  { type: 'heading', attrs: { level: 2, textAlign: null }, content: [t('Lists')] },
  {
    type: 'orderedList',
    attrs: { start: 3, type: null },
    content: [
      { type: 'listItem', content: [p(t('Three')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Nested bullet'))] }] }] },
      { type: 'listItem', content: [p(t('Four'))] },
    ],
  },
  { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Bullet'))] }] },
  {
    type: 'table',
    content: [
      { type: 'tableRow', content: ['Name', 'Value'].map((x) => ({ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t(x))] })) },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 2, colwidth: null }, content: [p(t('Tall'))] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t('B2'))] },
        ],
      },
      { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t('B3'))] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [p(t('Wide'))] }] },
    ],
  },
  { type: 'image', attrs: { src: PNG, alt: 'Two pixels', title: 'A picture', width: 120, height: 60 } },
  { type: 'pageBreak' },
  { type: 'tableOfContents' },
  { type: 'codeBlock', attrs: { language: null }, content: [t('if (a)  {\n\treturn b;\n}')] },
  { type: 'blockquote', content: [p(t('Quoted one')), p(t('Quoted two'))] },
  { type: 'horizontalRule' },
  { type: 'paragraph' },
  p(t('Last paragraph & <angle> "quotes"')),
];

/** Phase 4 content the ODT export and import also share (G-FORMAT paragraph and list formatting, G-INSERT pictures). */
const FORMATTED: DocumentContent = {
  ...doc(
    { type: 'paragraph', attrs: { paragraphStyle: 'title' }, content: [t('A title')] },
    { type: 'paragraph', attrs: { paragraphStyle: 'subtitle' }, content: [t('A subtitle')] },
    { type: 'heading', attrs: { level: 2, spaceBefore: 24 }, content: [t('Spaced heading')] },
    { type: 'paragraph', attrs: { lineSpacing: 2, indentFirstLine: 36 }, content: [t('Double spaced, first line indented.')] },
    { type: 'paragraph', attrs: { indentLeft: 36, indentRight: 18, indentFirstLine: -36, spaceBefore: 6, spaceAfter: 12 }, content: [t('Hanging indent, as in a reference list.')] },
    { type: 'paragraph', attrs: { lineSpacing: 1.15 }, content: [t('1.15 lines')] },
    {
      type: 'bulletList',
      attrs: { bulletStyle: 'arrow' },
      content: [{ type: 'listItem', content: [p(t('Arrow')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Default nested'))] }] }] }],
    },
    { type: 'orderedList', attrs: { start: 2, type: null, numberFormat: 'upper-roman' }, content: [{ type: 'listItem', content: [p(t('Roman two'))] }] },
    { type: 'image', attrs: { src: PNG, alt: 'Right', width: 2, height: 1, align: 'right', caption: 'Figure 1. On the right' } },
    { type: 'image', attrs: { src: PNG, alt: 'Left', width: 2, height: 1, align: 'left' } },
    p(t('Between')),
    { type: 'paragraph', attrs: { paragraphStyle: 'caption' }, content: [t('A caption on its own')] },
  ),
  language: 'en-GB',
};

const RICH_DOC: DocumentContent = {
  ...doc(...RICH),
  page: { size: 'Letter', orientation: 'landscape', margins: { top: 30, right: 20, bottom: 22, left: 18 }, header: 'Course 101', footer: 'Draft', pageNumbers: true },
};

describe('ODT export', () => {
  it('writes a valid OpenDocument package: uncompressed mimetype first, then well-formed parts listed in the manifest', () => {
    const bytes = buildOdt(RICH_DOC, 'Rich');
    // The first local file header is "mimetype", stored (method 0), with the media type as its data (ODF 1.3 §3.3).
    expect(String.fromCharCode(...bytes.slice(30, 38))).toBe('mimetype');
    expect(bytes[8] | (bytes[9] << 8)).toBe(0);
    expect(String.fromCharCode(...bytes.slice(38, 38 + ODT_MIME.length))).toBe(ODT_MIME);
    const files = unzipSync(bytes);
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) parse(strFromU8(files[part]));
    const manifest = strFromU8(files['META-INF/manifest.xml']);
    const pictures = Object.keys(files).filter((f) => f.startsWith('Pictures/'));
    expect(pictures).toEqual(['Pictures/0001.png']);
    for (const f of ['content.xml', 'styles.xml', 'meta.xml', ...pictures]) expect(manifest).toContain(`manifest:full-path="${f}"`);
  });

  it('writes headings, marks, lists, tables, pictures, links, page breaks and the table of contents as ODF elements', () => {
    const report = new ExportReport();
    const parts = xmlOf(RICH_DOC, report);
    const c = parse(parts['content.xml']);
    const text = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
    const table = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
    const h = c.getElementsByTagNameNS(text, 'h');
    expect([...h].map((e) => [e.getAttributeNS(text, 'outline-level'), e.textContent])).toEqual([
      ['1', 'Report title'],
      ['2', 'Lists'],
    ]);
    const xml = parts['content.xml'];
    expect(xml).toContain('fo:font-weight="bold"');
    expect(xml).toContain('fo:font-style="italic"');
    expect(xml).toContain('style:text-underline-style="solid"');
    expect(xml).toContain('style:text-line-through-style="solid"');
    expect(xml).toContain('style:text-position="sub 58%"');
    expect(xml).toContain('style:text-position="super 58%"');
    expect(xml).toContain('fo:color="#ff0000"');
    expect(xml).toContain('fo:font-family="Georgia"');
    expect(xml).toContain('fo:font-size="14pt"');
    expect(xml).toContain('fo:background-color="#fef08a"');
    expect(xml).toContain('<text:span text:style-name="Source_20_Text">code()</text:span>');
    expect(xml).toContain('xlink:href="https://example.com/a?b=1&amp;c=2"');
    expect(xml).toContain('fo:text-align="center"');
    expect(xml).toContain('fo:text-align="justify"');
    // White space is kept exactly: ODF collapses plain spaces.
    expect(xml).toContain('Two <text:s/>spaces,<text:tab/>a tab and <text:line-break/><text:s text:c="2"/>a new line');
    expect(xml).toContain('<text:list-item text:start-value="3">');
    expect(xml).toMatch(/<text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1">/);
    expect(xml).toMatch(/<text:list-level-style-bullet text:level="2" text:bullet-char="◦">/);
    // Merged cells: covered cells where spans reach, as ODF requires; the header row repeats on each page.
    expect(c.getElementsByTagNameNS(table, 'table-header-rows')).toHaveLength(1);
    expect(xml).toContain('table:number-rows-spanned="2"');
    expect(xml).toContain('table:number-columns-spanned="2"');
    expect(c.getElementsByTagNameNS(table, 'covered-table-cell')).toHaveLength(2);
    expect(xml).toMatch(/<draw:frame [^>]*svg:width="3\.175cm" svg:height="1\.5875cm"[^>]*><draw:image xlink:href="Pictures\/0001\.png"[^>]*\/><svg:title>Two pixels<\/svg:title><svg:desc>A picture<\/svg:desc><\/draw:frame>/);
    expect(xml).toContain('fo:break-after="page"');
    expect(c.getElementsByTagNameNS(text, 'table-of-content')).toHaveLength(1);
    expect(xml).toContain('<text:p text:style-name="Contents_20_1">Report title</text:p><text:p text:style-name="Contents_20_2">Lists</text:p>');
    expect(xml).toContain('<text:p text:style-name="Preformatted_20_Text">if (a) <text:s/>{</text:p><text:p text:style-name="Preformatted_20_Text"><text:tab/>return b;</text:p>');
    expect(xml).toContain('Last paragraph &amp; &lt;angle&gt; &quot;quotes&quot;');
    expect(report.sentences()).toEqual(['The table of contents was written without page numbers; they are added when it is updated in your word processor']);
  });

  it('writes the page size, orientation, margins, header, footer and page numbers', () => {
    const styles = xmlOf(RICH_DOC)['styles.xml'];
    // Letter landscape; the header and footer take the inner half of the top and bottom margins.
    expect(styles).toContain('fo:page-width="27.94cm" fo:page-height="21.59cm" style:print-orientation="landscape"');
    expect(styles).toContain('fo:margin-top="1.5cm" fo:margin-bottom="1.1cm" fo:margin-left="1.8cm" fo:margin-right="2cm"');
    expect(styles).toContain('<style:header><text:p text:style-name="Header">Course 101</text:p></style:header>');
    expect(styles).toContain('Draft <text:s text:c="3"/>Page <text:page-number text:select-page="current">1</text:page-number> of <text:page-count>1</text:page-count>');
    const plain = xmlOf(doc(p(t('x'))))['styles.xml'];
    expect(plain).toContain('fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait"');
    expect(plain).not.toContain('<style:header>');
  });

  it('writes and reads back the Layout tab page settings: header and footer parts, page numbers, first page, columns', () => {
    const page = {
      ...DEFAULT_PAGE,
      header: 'Centre head',
      headerLeft: 'Course 101',
      headerRight: 'A. Student',
      footer: '',
      footerLeft: 'Draft',
      pageNumbers: true,
      pageNumberAlign: 'right',
      pageNumberText: 'page',
      pageNumberFormat: 'lowerRoman',
      pageNumberStart: 3,
      columns: 2,
      columnSpacing: 10,
      firstPage: { header: { left: '', center: 'Title page', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false },
    } as DocumentContent['page'];
    const content: DocumentContent = { ...doc({ type: 'heading', attrs: { level: 1 }, content: [t('Start')] }, p(t('Body'))), page };
    const report = new ExportReport();
    const parts = xmlOf(content, report);
    expect(report.sentences()).toEqual([]);
    const styles = parts['styles.xml'];
    expect(styles).toContain('<style:header><text:p text:style-name="MP1">Course 101<text:tab/>Centre head<text:tab/>A. Student</text:p></style:header>');
    expect(styles).toContain('<style:header-first><text:p text:style-name="Header">Title page</text:p></style:header-first>');
    expect(styles).toContain('<style:footer><text:p text:style-name="MP2">Draft<text:tab/><text:tab/>Page <text:page-number style:num-format="i" text:select-page="current">1</text:page-number></text:p></style:footer>');
    expect(styles).toContain('<style:footer-first><text:p text:style-name="Footer"/></style:footer-first>');
    expect(styles).toContain('style:num-format="i"');
    expect(styles).toContain('<style:columns fo:column-count="2" fo:column-gap="1cm"/>');
    expect(styles).toMatch(/<style:style style:name="MP1" style:family="paragraph" style:parent-style-name="Header"><style:paragraph-properties fo:text-align="start"><style:tab-stops><style:tab-stop style:position="7.960cm" style:type="center"\/><style:tab-stop style:position="15.920cm" style:type="right"\/>/);
    // ODF numbers pages from a paragraph: the first one starts the page style at page 3.
    expect(parts['content.xml']).toMatch(/<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Heading_20_1" style:master-page-name="Standard"><style:paragraph-properties style:page-number="3"\/>/);

    const result = importOdt(buildOdt(content, 'Layout'));
    expect(result.content.page).toEqual(normalizePage(page).page);
    expect(result.content.doc).toEqual(finishDoc(content.doc));
    expect(result.report.sentences()).toEqual([]);
  });

  it('says when the starting page number cannot be written (the document does not start with a paragraph)', () => {
    const report = new ExportReport();
    xmlOf({ ...doc({ type: 'horizontalRule' }, p(t('x'))), page: { ...DEFAULT_PAGE, pageNumberStart: 5 } as DocumentContent['page'] }, report);
    expect(report.sentences()).toEqual(['The starting page number was left out: in ODT files it is set on the first paragraph, and this document starts with something else']);
  });

  it('reports page settings and document fields it does not write', () => {
    const report = new ExportReport();
    const page = { ...DEFAULT_PAGE, futureSetting: 'on' } as unknown as DocumentContent['page'];
    xmlOf({ ...doc(p(t('x'))), page }, report);
    expect(report.sentences()).toEqual(['The page setting “futureSetting” is not supported in ODT files yet and was left out']);
  });

  it('is the same file every time for the same document', () => {
    const at = new Date('2026-01-02T03:04:05Z');
    expect(buildOdt(RICH_DOC, 'Rich', new Map(), new ExportReport(), at)).toEqual(buildOdt(RICH_DOC, 'Rich', new Map(), new ExportReport(), at));
  });

  it('reports what it cannot write instead of dropping it silently', () => {
    const report = new ExportReport();
    const xml = xmlOf(
      doc(
        { type: 'mysteryBlock', content: [p(t('kept text'))] },
        { type: 'mysteryAtom' },
        p(t('a'), { type: 'mysteryInline' }, t('b', [{ type: 'mysteryMark' }])),
        { type: 'image', attrs: { src: 'https://example.org/x.png', alt: 'Web' } },
        { type: 'image', attrs: { src: 'data:image/x-emf;base64,AAAA', alt: 'Old' } },
        { type: 'diagram', attrs: { title: 'Flow', previewId: 'missing' } },
        p(t('evil', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
        { type: 'paragraph', attrs: { textAlign: null, futureSpacing: 12 }, content: [t('x')] },
      ),
      report,
    )['content.xml'];
    expect(xml).toContain('kept text');
    expect(xml).toContain('[Image not saved for offline use: Web — https://example.org/x.png]');
    expect(xml).toContain('[Image: Old — format not supported in ODT files]');
    expect(xml).toContain('[Diagram: Flow — preview not available]');
    expect(xml).not.toContain('javascript:');
    expect(exportToast('OpenDocument text', report).message).toBe(
      'Exported OpenDocument text. 1 “mysteryBlock” item is not supported in ODT files yet; its text was kept. 1 “mysteryAtom” item is not supported in ODT files yet and was left out. ' +
        '1 “mysteryInline” item is not supported in ODT files yet and was left out. “mysteryMark” formatting is not supported in ODT files yet and was left out. ' +
        '1 image was not saved for offline use and was written as a placeholder. 1 image in a format ODT files cannot hold was written as a placeholder. ' +
        '1 diagram has no preview and was written as a placeholder. 1 link with an unsupported address was written as plain text. ' +
        'The “futureSpacing” setting of paragraph items is not supported in ODT files yet and was left out.',
    );
  });

  it('reports attributes it does not write, so a setting a later feature adds is never lost silently', () => {
    const handled = ODT_HANDLED_ATTRS.image;
    // Pretend the export does not know image titles yet: an image with a title is then reported, one without is not.
    ODT_HANDLED_ATTRS.image = handled.filter((a) => a !== 'title');
    try {
      const report = new ExportReport();
      xmlOf(doc({ type: 'image', attrs: { src: PNG, alt: 'x', title: null } }), report);
      expect(report.empty).toBe(true);
      xmlOf(doc({ type: 'image', attrs: { src: PNG, alt: 'x', title: 'Shown on hover' } }, { type: 'image', attrs: { src: PNG, title: 'Again' } }), report);
      expect(report.sentences()).toEqual(['The “title” setting of image items is not supported in ODT files yet and was left out']);
    } finally {
      ODT_HANDLED_ATTRS.image = handled;
    }
  });

  it('writes and reads back paragraph formatting, named styles, list styles, picture alignment and captions, and the language', () => {
    const report = new ExportReport();
    const parts = xmlOf(FORMATTED, report);
    const xml = parts['content.xml'];
    expect(report.sentences()).toEqual([]);
    expect(xml).toMatch(/<style:paragraph-properties fo:line-height="200%" fo:text-indent="36pt"\/>/);
    expect(xml).toMatch(/<style:paragraph-properties fo:margin-bottom="12pt" fo:margin-left="36pt" fo:margin-right="18pt" fo:margin-top="6pt" fo:text-indent="-36pt"\/>/);
    expect(xml).toMatch(/style:parent-style-name="Heading_20_2"><style:paragraph-properties fo:margin-top="24pt"\/>/);
    expect(xml).toContain('<text:p text:style-name="Title">A title</text:p>');
    expect(xml).toContain('<text:p text:style-name="Subtitle">A subtitle</text:p>');
    expect(xml).toMatch(/<text:list-level-style-bullet text:level="1" text:bullet-char="→">/);
    expect(xml).toMatch(/<text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="I">/);
    expect(xml).toMatch(/style:parent-style-name="Caption"><style:paragraph-properties fo:text-align="right"\/><\/style:style>/);
    expect(xml).toContain('>Figure 1. On the right</text:p>');
    const styles = parts['styles.xml'];
    expect(styles).toMatch(/<style:text-properties fo:country="GB" fo:font-size="12pt" fo:language="en" /);
    for (const name of ['Title', 'Subtitle', 'Caption']) expect(styles).toContain(`<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard"`);

    const result = importOdt(buildOdt(FORMATTED, 'Formatted'));
    expect(result.content.doc).toEqual(finishDoc(FORMATTED.doc));
    expect(result.content.language).toBe('en-GB');
    expect(result.content.schemaVersion).toBe(2);
    expect(result.report.sentences()).toEqual([]);
  });

  it('writes the language of Asian and right-to-left scripts in their own properties, and none when the document has none', () => {
    expect(languageProps('ja-JP')).toEqual({ 'style:language-asian': 'ja', 'style:country-asian': 'JP' });
    expect(languageProps('ar-SA')).toEqual({ 'style:language-complex': 'ar', 'style:country-complex': 'SA' });
    expect(languageProps('sr-Latn-RS')).toEqual({ 'fo:language': 'sr', 'fo:country': 'RS', 'fo:script': 'Latn' });
    expect(languageProps(undefined)).toEqual({});
    expect(languageProps('not a tag')).toEqual({});
    expect(importOdt(buildOdt({ ...doc(p(t('x'))), language: 'ja-JP' })).content.language).toBe('ja-JP');
    expect(xmlOf(doc(p(t('x'))))['styles.xml']).not.toContain('language');
    expect(importOdt(buildOdt(doc(p(t('x'))))).content.language).toBeUndefined();
  });

  it('writes equations and shapes as text, section breaks as page breaks, and names them in the toast', () => {
    const report = new ExportReport();
    const content: DocumentContent = {
      ...doc(
        p(t('Area '), { type: 'inlineMath', attrs: { latex: '\\pi r^2' } }, t(' and '), t('noted', [{ type: 'comment', attrs: { commentId: 'c1' } }])),
        { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } },
        { type: 'shape', attrs: { kind: 'ellipse', text: 'Start' } },
        { type: 'textBox', attrs: { float: 'right' }, content: [p(t('Inside the box'))] },
        { type: 'sectionBreak', attrs: { breakType: 'nextPage' } },
        { type: 'sectionBreak', attrs: { breakType: 'continuous' } },
        p(t('End')),
      ),
      comments: [{ id: 'c1', author: 'A', createdAt: '2026-01-01T00:00:00.000Z', text: 'Check', resolved: false, replies: [] }],
    } as DocumentContent;
    const xml = xmlOf(content, report)['content.xml'];
    expect(xml).toContain('Area $\\pi r^2$ and');
    expect(xml).toContain('$$\\frac{a}{b}$$');
    expect(xml).toContain('[Shape: ');
    expect(xml).toContain('Inside the box');
    expect(xml.match(/fo:break-after="page"/g)).toHaveLength(1);
    expect(exportToast('OpenDocument text', report).message).toBe(
      'Exported OpenDocument text. 2 equations are not supported in ODT files yet and were written as text. ' +
        'Comments are not supported in ODT files yet and were left out (the commented text was kept). ' +
        '1 shape is not supported in ODT files yet and was written as text. 1 text box is not supported in ODT files yet; its text was kept. ' +
        '1 section break was written as a page break (sections with their own page layout are not supported in ODT files yet). ' +
        '1 continuous section break was left out (sections are not supported in ODT files yet).',
    );
  });

  it.each(documentTemplates.map((tpl) => [tpl.id, tpl] as const))('exports the %s template to a valid package without approximations', (_, tpl) => {
    const report = new ExportReport();
    const files = unzipSync(buildOdt(tpl.build(), tpl.name, new Map(), report));
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) parse(strFromU8(files[part]));
    expect(report.sentences().filter((s) => !s.startsWith('The table of contents'))).toEqual([]);
  });
});

describe('ODT import', () => {
  it('reads back everything the ODT export writes: the round trip gives the same document', () => {
    const bytes = buildOdt(RICH_DOC, 'Rich report');
    const result = importOdt(bytes, 'whatever.odt');
    expect(result.title).toBe('Rich report');
    expect(result.content.doc).toEqual(finishDoc(RICH_DOC.doc));
    expect(result.content.page).toEqual(normalizePage(RICH_DOC.page).page);
    expect(result.report.sentences()).toEqual([]);
  });

  it('keeps neighbouring quotes and code blocks apart, a list inside a quote, and a heading inside a list item', () => {
    const quote = (...content: JSONContent[]): JSONContent => ({ type: 'blockquote', content });
    const code = (text: string): JSONContent => ({ type: 'codeBlock', attrs: { language: null }, content: [t(text)] });
    const bullets = (...items: string[]): JSONContent => ({ type: 'bulletList', content: items.map((x) => ({ type: 'listItem', content: [p(t(x))] })) });
    const content = doc(
      quote(p(t('First quote'))),
      quote(p(t('Second quote'))),
      code('let a = 1'),
      code('let b = 2'),
      quote(p(t('Quote with a list')), bullets('one', 'two'), p(t('after the list'))),
      quote(p(t('Outer')), quote(p(t('Inner')))),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Item')), { type: 'heading', attrs: { level: 3, textAlign: null }, content: [t('Heading in an item')] }, quote(p(t('Quote in an item')))] }] },
      p(t('End')),
    );
    const xml = xmlOf(content)['content.xml'];
    const d = parse(xml);
    // Each quote and code block is its own ODF section, except inside a list item, where ODF allows no sections.
    const names = Array.from(d.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'section')).map((e) => e.getAttribute('text:name'));
    expect(names).toEqual(['Quotation 1', 'Quotation 2', 'Code 1', 'Code 2', 'Quotation 3', 'Quotation 4', 'Quotation 5']);
    for (const item of Array.from(d.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'list-item'))) {
      expect(item.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'section')).toHaveLength(0);
    }
    const result = importOdt(buildOdt(content, 'Blocks'));
    const back = result.content.doc.content!;
    expect(back.map((n) => n.type)).toEqual(['blockquote', 'blockquote', 'codeBlock', 'codeBlock', 'blockquote', 'blockquote', 'bulletList', 'paragraph']);
    expect(result.content.doc).toEqual(finishDoc(content.doc));
  });

  it('reads back the column widths of a table whose columns were sized (equal columns stay unsized)', () => {
    const cell = (text: string, colwidth: number[] | null, colspan = 1): JSONContent => ({ type: 'tableCell', attrs: { colspan, rowspan: 1, colwidth }, content: [p(t(text))] });
    const row = (...cells: JSONContent[]): JSONContent => ({ type: 'tableRow', content: cells });
    const sized = doc({ type: 'table', content: [row(cell('a', [120]), cell('b', [300]), cell('c', [90])), row(cell('wide', [120, 300], 2), cell('f', [90]))] });
    const back = importOdt(buildOdt(sized, 'Sized')).content.doc;
    expect(back).toEqual(finishDoc(sized.doc));
    // A table nobody resized is written with equal columns and must come back without widths, as it was.
    const plain = doc({ type: 'table', content: [row(cell('a', null), cell('b', null))] });
    expect(importOdt(buildOdt(plain, 'Plain')).content.doc).toEqual(finishDoc(plain.doc));
  });

  it.each(documentTemplates.map((tpl) => [tpl.id, tpl] as const))('round-trips the %s template exactly', (_, tpl) => {
    const content = tpl.build();
    const result = importOdt(buildOdt(content, tpl.name));
    expect(result.content.doc).toEqual(finishDoc(content.doc));
    expect(result.content.page).toEqual(content.page);
    expect(result.content.schemaVersion).toBe(1);
  });

  it('reads formatting the way other word processors store it: styles based on Title or Caption, lengths in cm, list glyphs', () => {
    const ns = Object.entries({ office: 'office:1.0', style: 'style:1.0', text: 'text:1.0', fo: 'xsl-fo-compatible:1.0' })
      .map(([k, v]) => ` xmlns:${k}="urn:oasis:names:tc:opendocument:xmlns:${v}"`)
      .join('');
    const styles =
      `<office:document-styles${ns}><office:styles>` +
      '<style:default-style style:family="paragraph"><style:text-properties fo:language="de" fo:country="DE"/></style:default-style>' +
      '<style:style style:name="Title" style:family="paragraph"/><style:style style:name="Caption" style:family="paragraph"/>' +
      '<style:style style:name="Figure" style:family="paragraph" style:parent-style-name="Caption"/>' +
      '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph"><style:paragraph-properties fo:margin-left="2cm" fo:line-height="115%"/></style:style>' +
      '</office:styles></office:document-styles>';
    const content =
      `<office:document-content${ns}><office:automatic-styles>` +
      '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-left="1.27cm" fo:text-indent="-1.27cm" fo:line-height="200%" fo:margin-top="0cm"/></style:style>' +
      '<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="–"/><text:list-level-style-bullet text:level="2" text:bullet-char="◦"/></text:list-style>' +
      '<text:list-style style:name="L2"><text:list-level-style-number text:level="1" style:num-format="a"/></text:list-style>' +
      '</office:automatic-styles><office:body><office:text>' +
      '<text:p text:style-name="Title">Report</text:p>' +
      '<text:p text:style-name="Text_20_body">Named style spacing is not direct formatting.</text:p>' +
      '<text:p text:style-name="P1">Reference with a hanging indent.</text:p>' +
      '<text:p text:style-name="Figure">Figure 1: a caption style based on Caption</text:p>' +
      '<text:list text:style-name="L1"><text:list-item><text:p>Dash</text:p><text:list><text:list-item><text:p>Default</text:p></text:list-item></text:list></text:list-item></text:list>' +
      '<text:list text:style-name="L2"><text:list-item><text:p>Letter</text:p></text:list-item></text:list>' +
      '</office:text></office:body></office:document-content>';
    const bytes = zipSync({ mimetype: strToU8(ODT_MIME), 'content.xml': strToU8(content), 'styles.xml': strToU8(styles) });
    const result = importOdt(bytes, 'other.odt');
    const blocks = result.content.doc.content!;
    const attrsOf = (n: JSONContent) => Object.fromEntries(Object.entries(n.attrs ?? {}).filter(([, v]) => v !== null));
    expect(blocks.map((n) => [n.type, attrsOf(n)])).toEqual([
      ['paragraph', { paragraphStyle: 'title' }],
      ['paragraph', {}],
      ['paragraph', { lineSpacing: 2, spaceBefore: 0, indentLeft: 36, indentFirstLine: -36 }],
      ['paragraph', { paragraphStyle: 'caption' }],
      ['bulletList', { bulletStyle: 'dash' }],
      ['orderedList', { start: 1, numberFormat: 'lower-alpha' }],
    ]);
    expect(attrsOf(blocks[4].content![0].content![1])).toEqual({});
    expect(result.content.language).toBe('de-DE');
  });

  it('reads headers and footers the way other word processors lay them out, and a title page with a page style of its own', () => {
    const ns = Object.entries({ office: 'office:1.0', style: 'style:1.0', text: 'text:1.0', fo: 'xsl-fo-compatible:1.0' })
      .map(([k, v]) => ` xmlns:${k}="urn:oasis:names:tc:opendocument:xmlns:${v}"`)
      .join('');
    const styles =
      `<office:document-styles${ns}><office:styles>` +
      '<style:style style:name="Header" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/></style:style>' +
      '<style:style style:name="Footer" style:family="paragraph"/><style:style style:name="Right" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/></style:style>' +
      '<style:style style:name="First" style:family="paragraph" style:master-page-name="First_20_Page"/>' +
      '</office:styles><office:automatic-styles>' +
      '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:num-format="I" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout>' +
      '</office:automatic-styles><office:master-styles>' +
      '<style:master-page style:name="Standard" style:page-layout-name="pm1">' +
      '<style:header><text:p text:style-name="Header">My essay</text:p></style:header>' +
      '<style:footer><text:p text:style-name="Right"><text:page-number text:select-page="current">2</text:page-number></text:p></style:footer></style:master-page>' +
      '<style:master-page style:name="First_20_Page" style:page-layout-name="pm1" style:next-style-name="Standard"><style:footer><text:p text:style-name="Footer">Submitted 2026</text:p></style:footer></style:master-page>' +
      '</office:master-styles></office:document-styles>';
    const content = `<office:document-content${ns}><office:body><office:text><text:p text:style-name="First">Cover</text:p><text:p>Body</text:p></office:text></office:body></office:document-content>`;
    const result = importOdt(zipSync({ mimetype: strToU8(ODT_MIME), 'content.xml': strToU8(content), 'styles.xml': strToU8(styles) }), 'essay.odt');
    expect(result.content.page).toMatchObject({
      header: '',
      headerLeft: 'My essay',
      footer: '',
      pageNumbers: true,
      pageNumberAlign: 'right',
      pageNumberText: 'number',
      pageNumberFormat: 'upperRoman',
      firstPage: { header: { left: '', center: '', right: '' }, footer: { left: 'Submitted 2026', center: '', right: '' }, pageNumbers: false },
    });
    expect(result.report.sentences()).toEqual([]);
  });

  it('refuses files that are not OpenDocument text, with a readable reason', () => {
    expect(() => importOdt(new Uint8Array([1, 2, 3]))).toThrow(/not an OpenDocument file/);
  });
});
