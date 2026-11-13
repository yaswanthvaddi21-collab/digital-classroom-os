import type { JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { documentTemplates } from '../templates';
import { createEmptyDocument, type DocumentContent } from '../types';
import { buildDocx, toHalfPoints, toHex } from './docx';
import { wordHighlight } from './docx/colors';
import { cellColumns, columnWidthsPx } from './docx/tables';
import { toLineSpacing } from './docx/units';
import { buildPrintHtml, cssString } from './print';
import { marginBoxSupport } from './printSupport';
import { ExportReport, exportToast } from './report';
import { documentToText } from './text';

// 1×1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const sample: DocumentContent = {
  ...createEmptyDocument(),
  page: { ...createEmptyDocument().page, header: 'Physics Lab', footer: 'Asha R.', pageNumbers: true },
  doc: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'Ohm’s Law' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'red', marks: [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '14pt' } }] },
          { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ],
      },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point A' }] }] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step 1' }] }] }] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Volts' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '5' }] }] }] },
        ],
      },
      { type: 'pageBreak' },
      { type: 'image', attrs: { src: PNG, width: 2000, height: 1000 } },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] },
    ],
  },
};

async function xmlOf(content: DocumentContent, report = new ExportReport()) {
  const buf = await Packer.toBuffer(buildDocx(content, 'Test', new Map(), report));
  const zip = await JSZip.loadAsync(buf);
  return {
    zip,
    document: await zip.file('word/document.xml')!.async('string'),
  };
}

describe('DOCX export', () => {
  it('produces a valid package with text, styles, lists, tables, breaks and images', async () => {
    const { zip, document } = await xmlOf(sample);
    expect(document).toContain('Ohm’s Law');
    expect(document).toContain('w:val="Heading1"');
    expect(document).toContain('w:jc w:val="center"');
    expect(document).toContain('<w:b/>');
    expect(document).toContain('w:color w:val="FF0000"');
    expect(document).toContain('w:sz w:val="28"');
    expect(document).toContain('<w:tbl>');
    expect(document).toContain('Volts');
    expect(document).toContain('w:br w:type="page"');
    expect(document).toContain('<w:numPr>');
    expect(document).toContain('Quoted');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const header = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f));
    const footer = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f));
    expect(await zip.file(header!)!.async('string')).toContain('Physics Lab');
    const footerXml = await zip.file(footer!)!.async('string');
    expect(footerXml).toContain('Asha R.');
    expect(footerXml).toContain('PAGE');
  });

  it('scales oversized images to the text width', async () => {
    const { document } = await xmlOf(sample);
    // A4 with 25.4mm margins leaves 159.2mm ≈ 602px; 602px at 9525 EMU/px.
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(document)![1]);
    expect(cx / 9525).toBeLessThanOrEqual(602);
  });

  it('applies page size and margins in twips', async () => {
    const { document } = await xmlOf(sample);
    expect(document).toMatch(/w:pgSz w:w="11906" w:h="16838"/);
    expect(document).toMatch(/w:top="1440"/);
  });

  it('exports every built-in template without throwing', async () => {
    for (const t of documentTemplates) {
      const { document } = await xmlOf(t.build());
      expect(document.length).toBeGreaterThan(100);
    }
  });

  it('normalises colours and sizes', () => {
    expect(toHex('#abc')).toBe('AABBCC');
    expect(toHex('rgb(255, 0, 16)')).toBe('FF0010');
    expect(toHex('red')).toBe('FF0000');
    expect(toHex('nonsense')).toBeUndefined();
    expect(toHalfPoints('12pt')).toBe(24);
    expect(toHalfPoints('16px')).toBe(24);
  });
});

describe('Print and text export', () => {
  it('builds a print page with page size, margins, header and page counter', () => {
    const html = buildPrintHtml('<p>Hi</p>', sample.page, 'My <Title>');
    expect(html).toContain('size: 210mm 297mm');
    expect(html).toContain('margin: 25.4mm');
    expect(html).toContain('@top-center { content: "Physics Lab"');
    expect(html).toContain('counter(page)');
    expect(html).toContain('<title>My &lt;Title&gt;</title>');
  });

  it('flattens documents to readable text', () => {
    const text = documentToText(sample.doc);
    expect(text).toContain('Ohm’s Law');
    expect(text).toContain('• Point A');
    expect(text).toContain('1. Step 1');
    expect(text).toContain('Volts');
  });
});

const docOf = (...content: JSONContent[]): DocumentContent => ({ ...createEmptyDocument(), doc: { type: 'doc', content } });
const para = (text: string, attrs?: Record<string, unknown>, marks?: JSONContent['marks']): JSONContent => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('DOCX fidelity (audit DS-6)', () => {
  it('reads CSS named colours, hsl(), rgb() percentages and 4/8-digit hex', () => {
    expect(toHex('RebeccaPurple')).toBe('663399');
    expect(toHex('hsl(0, 100%, 50%)')).toBe('FF0000');
    expect(toHex('hsl(120 100% 25%)')).toBe('008000');
    expect(toHex('rgb(100%, 0%, 50%)')).toBe('FF0080');
    expect(toHex('rgb(10 20 30)')).toBe('0A141E');
    expect(toHex('#f00a')).toBe('FF0000');
    expect(toHex('#11223344')).toBe('112233');
  });

  it('writes named text colours instead of dropping them', async () => {
    const { document } = await xmlOf(docOf(para('Red', undefined, [{ type: 'textStyle', attrs: { color: 'red' } }])));
    expect(document).toContain('<w:color w:val="FF0000"/>');
  });

  it('writes highlights as Word highlights (not shading), reporting colours Word does not have', async () => {
    const report = new ExportReport();
    const { document } = await xmlOf(
      docOf(
        para('plain', undefined, [{ type: 'highlight', attrs: { color: null } }]),
        para('pastel', undefined, [{ type: 'highlight', attrs: { color: '#bbf7d0' } }]),
        para('again', undefined, [{ type: 'highlight', attrs: { color: '#bbf7d0' } }]),
        para('exact', undefined, [{ type: 'highlight', attrs: { color: '#ffff00' } }]),
      ),
      report,
    );
    expect(document).toContain('<w:highlight w:val="yellow"/>');
    expect(document).toContain('<w:highlight w:val="green"/>');
    expect(document).not.toContain('<w:shd');
    expect(report.count('highlight-colour')).toBe(1);
  });

  it('maps the editor highlight palette to sensible Word highlights', () => {
    expect(wordHighlight('FEF08A').name).toBe('yellow');
    expect(wordHighlight('BBF7D0').name).toBe('green');
    expect(wordHighlight('BAE6FD').name).toBe('cyan');
    expect(wordHighlight('DDD6FE').name).toBe('magenta');
    expect(wordHighlight('FBCFE8').name).toBe('magenta');
    expect(wordHighlight('FED7AA').name).toBe('yellow');
    expect(wordHighlight('E5E7EB').name).toBe('lightGray');
    expect(wordHighlight('00FFFF')).toEqual({ name: 'cyan', exact: true });
  });

  it('aligns list paragraphs and quotes like the editor', async () => {
    const { document } = await xmlOf(
      docOf(
        { type: 'bulletList', content: [{ type: 'listItem', content: [para('Centred item', { textAlign: 'center' })] }] },
        { type: 'blockquote', content: [para('Right quote', { textAlign: 'right' })] },
      ),
    );
    const item = /<w:p>(?:(?!<\/w:p>).)*Centred item/s.exec(document)![0];
    expect(item).toContain('<w:numPr>');
    expect(item).toContain('<w:jc w:val="center"/>');
    expect(/<w:p>(?:(?!<\/w:p>).)*Right quote/s.exec(document)![0]).toContain('<w:jc w:val="right"/>');
  });

  it('matches the editor line height: body text 1.5 lines, and line heights from text style', async () => {
    const { zip, document } = await xmlOf(docOf(para('Double', undefined, [{ type: 'textStyle', attrs: { lineHeight: '2' } }]), para('Fixed', undefined, [{ type: 'textStyle', attrs: { lineHeight: '18pt' } }])));
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('w:line="295"');
    expect(document).toMatch(/<w:spacing w:line="393"\/>(?:(?!<\/w:p>).)*Double/s);
    expect(document).toMatch(/<w:spacing w:line="360" w:lineRule="atLeast"\/>(?:(?!<\/w:p>).)*Fixed/s);
    expect(toLineSpacing('150%')).toEqual({ line: 295 });
    expect(toLineSpacing('normal')).toBeUndefined();
  });

  const cell = (text: string, colwidth: number[] | null, colspan = 1): JSONContent => ({ type: 'tableCell', attrs: { colspan, rowspan: 1, colwidth }, content: [para(text)] });

  it('keeps column widths the user set, as a fixed-layout table', async () => {
    const table = { type: 'table', content: [{ type: 'tableRow', content: [cell('A', [100]), cell('B', [200])] }] };
    const { document } = await xmlOf(docOf(table));
    expect(document).toContain('<w:gridCol w:w="1500"/>');
    expect(document).toContain('<w:gridCol w:w="3000"/>');
    expect(document).toContain('<w:tblW w:type="dxa" w:w="4500"/>');
    expect(document).toContain('<w:tblLayout w:type="fixed"/>');
    expect(document).toContain('<w:tcW w:type="dxa" w:w="1500"/>');
  });

  it('shares the rest of the width among columns without a width, and fits wide tables to the page', () => {
    const row = (...cells: JSONContent[]) => ({ type: 'tableRow', content: cells });
    expect(columnWidthsPx({ type: 'table', content: [row(cell('A', [100]), cell('B', null), cell('C', null))] }, 600)).toEqual([100, 250, 250]);
    expect(columnWidthsPx({ type: 'table', content: [row(cell('A', [800]), cell('B', [400]))] }, 600)).toEqual([400, 200]);
    expect(columnWidthsPx({ type: 'table', content: [row(cell('AB', [100, 50], 2)), row(cell('A', null), cell('B', null))] }, 600)).toEqual([100, 50]);
    expect(columnWidthsPx({ type: 'table', content: [row(cell('A', null), cell('B', null))] }, 600)).toBeNull();
  });

  it('places cells after a rowspan in their own column', async () => {
    const row = (...cells: JSONContent[]) => ({ type: 'tableRow', content: cells });
    const tall = { ...cell('A', [100]), attrs: { colspan: 1, rowspan: 2, colwidth: [100] } };
    const table = { type: 'table', content: [row(tall, cell('B', null), cell('C', [200])), row(cell('B2', null), cell('C2', [200]))] };
    expect(cellColumns(table)).toEqual({ columns: 3, starts: [[0, 1, 2], [1, 2]] });
    expect(columnWidthsPx(table, 600)).toEqual([100, 300, 200]);
    // Spans over several rows and columns, and a covered column at the end of a row.
    const wide = { ...cell('W', null, 2), attrs: { colspan: 2, rowspan: 3, colwidth: null } };
    const lastTall = { ...cell('Z', null), attrs: { colspan: 1, rowspan: 2, colwidth: null } };
    expect(cellColumns({ type: 'table', content: [row(wide, cell('x', null), lastTall), row(cell('y', null)), row(cell('z', null), cell('q', null))] })).toEqual({
      columns: 4,
      starts: [[0, 2, 3], [2], [2, 3]],
    });
    const { document } = await xmlOf(docOf({ type: 'table', content: table.content }));
    // B2 is as wide as the grid column it sits in (the page's text width differs from 600px, so read the grid).
    const grid = [...document.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(grid).toHaveLength(3);
    const b2 = /<w:tc>(?:(?!<\/w:tc>).)*>B2</s.exec(document)![0];
    expect(b2).toContain(`<w:tcW w:type="dxa" w:w="${grid[1]}"/>`);
  });

  it('writes a real table of contents field with the headings as its cached entries', async () => {
    const report = new ExportReport();
    const { document } = await xmlOf(docOf({ type: 'tableOfContents' }, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] }, { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Method' }] }), report);
    expect(document).toContain('TOC \\h \\o &quot;1-4&quot;');
    expect(document).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(document).toMatch(/w:anchor="(_Toc\d+)"(?:(?!<\/w:hyperlink>).)*Introduction/s);
    expect(document).toContain('<w:pStyle w:val="TOC2"/>');
    // The title is not a heading, so Word does not list it in the table itself.
    expect(/<w:p>(?:(?!<\/w:p>).)*>Table of Contents</s.exec(document)![0]).not.toContain('Heading');
    expect(report.count('toc-page-numbers')).toBe(1);
    // States what the file holds, not how Word behaves when it opens it (not checked in Word).
    expect(exportToast('Word document', report).message).toBe(
      'Exported Word document. The table of contents was written without page numbers; they are added when its field is updated in Word.',
    );
  });

  it('writes the same table-of-contents bookmarks on every export (no session-wide counter)', async () => {
    const heading = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
    const content = docOf({ type: 'tableOfContents' }, heading(1, 'Introduction'), heading(2, 'Method'), { type: 'tableOfContents' });
    const first = (await xmlOf(content)).document;
    // Other exports in between used to move the ids on (_Toc13… instead of _Toc1…).
    await xmlOf(docOf({ type: 'tableOfContents' }, heading(1, 'Other')));
    const doc = buildDocx(content);
    const again = (await xmlOf(content)).document;
    expect(again).toBe(first);
    const bookmarks = [...first.matchAll(/<w:bookmarkStart w:name="([^"]+)" w:id="(\d+)"\/>/g)].map((m) => `${m[1]}#${m[2]}`);
    expect(bookmarks).toEqual(['_Toc1#1', '_Toc2#2']);
    // Packing the same Document twice gives the same XML too.
    const packed = async () => (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml')!.async('string');
    expect(await packed()).toBe(await packed());
  });

  it('keeps list numbering instances unique when lists sit in table cells', async () => {
    const list = { type: 'orderedList', content: [{ type: 'listItem', content: [para('x')] }] };
    const table = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [list] }] }] };
    const { document } = await xmlOf(docOf(table, list));
    const instances = [...document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(instances).toHaveLength(2);
    expect(new Set(instances).size).toBe(2);
  });
});

describe('DOCX links (audit DS-7)', () => {
  const linked = (href: string) => para('here', undefined, [{ type: 'link', attrs: { href } }]);

  it('writes allowed links and gives scheme-less ones https://', async () => {
    const { zip } = await xmlOf(docOf(linked('https://example.com/a'), linked('example.org/page'), linked('mailto:a@b.co')));
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).toContain('Target="https://example.com/a"');
    expect(rels).toContain('Target="https://example.org/page"');
    expect(rels).toContain('Target="mailto:a@b.co"');
  });

  it('writes javascript: and other disallowed addresses as plain text, and reports them', async () => {
    const report = new ExportReport();
    const { zip, document } = await xmlOf(docOf(linked('javascript:alert(1)'), linked('JaVaScRiPt:alert(2)'), linked('data:text/html,<b>x</b>')), report);
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).not.toMatch(/javascript|data:/i);
    expect(document).not.toContain('<w:hyperlink');
    expect(document).toContain('here');
    expect(report.count('unsafe-link')).toBe(3);
  });
});

describe('DOCX images that cannot be embedded (audit DS-3)', () => {
  it('writes a clear placeholder for pictures not saved for offline use, and counts them', async () => {
    const report = new ExportReport();
    const { document } = await xmlOf(docOf({ type: 'image', attrs: { src: 'https://example.com/cat.png', alt: 'A cat' } }, { type: 'image', attrs: { src: '//cdn.example.com/dog.jpg' } }, { type: 'image', attrs: { src: PNG } }), report);
    expect(document).toContain('[Image not saved for offline use: A cat — https://example.com/cat.png]');
    expect(report.count('remote-image')).toBe(2);
    expect(document).toContain('<w:drawing>');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 2 images were not saved for offline use and were written as placeholders.');
  });

  it('reports images in formats Word cannot show and diagrams without a preview', async () => {
    const report = new ExportReport();
    await xmlOf(docOf({ type: 'image', attrs: { src: 'data:image/webp;base64,AAAA' } }, { type: 'diagram', attrs: { previewId: 'missing', title: 'Cycle' } }), report);
    expect(report.sentences()).toEqual(['1 image in a format Word cannot show was written as a placeholder', '1 diagram has no preview and was written as a placeholder']);
  });
});

describe('export toasts', () => {
  it('say plainly when nothing was approximated', () => {
    expect(exportToast('Word document')).toEqual({ message: 'Exported Word document', kind: 'success' });
    expect(exportToast('Word document', new ExportReport())).toEqual({ message: 'Exported Word document', kind: 'success' });
  });

  it('count each kind of approximation', () => {
    const r = new ExportReport();
    r.add('eq', '1 equation was written as an image', '{n} equations were written as images');
    r.add('eq', '1 equation was written as an image', '{n} equations were written as images');
    expect(exportToast('Word document', r)).toEqual({ message: 'Exported Word document. 2 equations were written as images.', kind: 'info' });
  });
});

describe('print page safety (audit DS-1)', () => {
  it('escapes header and footer text so it can never end the style element', () => {
    const page = { ...createEmptyDocument().page, header: '</style><img src=x onerror=alert(1)>', footer: 'a "quote" \\ back\nslash' };
    const html = buildPrintHtml('<p>Body</p>', page, 'T');
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
    expect(style).not.toContain('<');
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html).not.toContain('<img');
    expect(style).toContain('"\\3C /style\\3E \\3C img src=x onerror=alert(1)\\3E "');
    expect(cssString('a "q" \\')).toBe('"a \\22 q\\22  \\5C "');
  });

  it('parses back to the original text in a browser CSS parser', () => {
    // CSS hex escapes end at the following space, so the printed header reads exactly as typed.
    const decoded = cssString('x</style>y').slice(1, -1).replace(/\\([0-9A-F]+) /g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    expect(decoded).toBe('x</style>y');
  });
});

describe('print support (audit DS-5)', () => {
  it('knows which browsers print the header, footer and page numbers', () => {
    expect(marginBoxSupport('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe('yes');
    expect(marginBoxSupport('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0')).toBe('no');
    expect(marginBoxSupport('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('no');
    expect(marginBoxSupport('Mozilla/5.0 (Macintosh; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('no');
    expect(marginBoxSupport('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1')).toBe('no');
    expect(marginBoxSupport('')).toBe('unknown');
  });
});

describe('text export never drops content silently (TD-13)', () => {
  it('marks images and lists the table of contents', () => {
    const text = documentToText({
      type: 'doc',
      content: [
        { type: 'tableOfContents' },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Intro' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Detail' }] },
        { type: 'image', attrs: { src: PNG, alt: 'Circuit' } },
        { type: 'image', attrs: { src: PNG } },
      ],
    });
    expect(text).toContain('Table of Contents\nIntro\n   Detail\n');
    expect(text).toContain('[Image: Circuit]');
    expect(text).toContain('[Image]');
  });

  it('keeps images, diagrams, lists and the table of contents inside table cells, one row per line', () => {
    const cell = (...content: JSONContent[]) => ({ type: 'tableCell', content });
    const text = documentToText({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H' }] },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell(para('a'), { type: 'image', attrs: { src: PNG, alt: 'CELLIMG' } }), cell({ type: 'tableOfContents' })] },
            {
              type: 'tableRow',
              content: [
                cell({ type: 'diagram', attrs: { title: 'Flow' } }),
                cell({ type: 'bulletList', content: [{ type: 'listItem', content: [para('one')] }, { type: 'listItem', content: [para('two')] }] }),
              ],
            },
            { type: 'tableRow', content: [cell(para('x  y')), cell({ type: 'paragraph', content: [{ type: 'text', text: 'p' }, { type: 'hardBreak' }, { type: 'text', text: 'q' }] })] },
          ],
        },
      ],
    });
    expect(text).toBe('H\n\na [Image: CELLIMG]\tTable of Contents H\n[Diagram: Flow]\t• one • two\nx  y\tp q\n');
  });
});
