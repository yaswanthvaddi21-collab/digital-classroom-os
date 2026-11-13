// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, DEFAULT_PAGE, type DocumentContent, type PageSettings } from '../types';
import { buildDocx } from './docx';
import { buildPrintHtml, cleanClone, cssString } from './print';
import { layoutPrintCss, printSections } from './printLayout';
import { ExportReport, exportToast } from './report';
import { documentToText } from './text';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const p = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const brk = (attrs: Record<string, unknown> = {}): JSONContent => ({ type: 'sectionBreak', attrs: { breakType: 'nextPage', ...attrs } });
const doc = (page: Partial<PageSettings> = {}, body: JSONContent[] = [p('Hello')]): DocumentContent => ({
  ...createEmptyDocument(),
  page: { ...DEFAULT_PAGE, ...page },
  doc: { type: 'doc', content: body },
});

async function parts(content: DocumentContent, report = new ExportReport()) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(content, 'T', new Map(), report)));
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  const document = await read('word/document.xml');
  const rels = await read('word/_rels/document.xml.rels');
  /** The XML of the header or footer part a reference points at. */
  const part = async (id: string | undefined) => read(`word/${new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? /Target="([^"]+)"[^>]*Id="${id}"/.exec(rels)?.[1]}`);
  return { zip, document, rels, part, sectPrs: [...(document.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [])].map(String) };
}
const refs = (sectPr: string, kind: 'header' | 'footer') => Object.fromEntries([...sectPr.matchAll(new RegExp(`<w:${kind}Reference w:type="(\\w+)" r:id="(\\w+)"/>`, 'g'))].map((m) => [m[1], m[2]]));
const text = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

describe('DOCX page layout', () => {
  it('writes the new paper sizes in twips (portrait dimensions plus the orientation flag)', async () => {
    const sizes: Array<[PageSettings['size'], string]> = [
      ['A3', 'w:w="16838" w:h="23811"'],
      ['A5', 'w:w="8391" w:h="11906"'],
      ['Legal', 'w:w="12240" w:h="20160"'],
    ];
    for (const [size, attrs] of sizes) {
      const { sectPrs } = await parts(doc({ size }));
      expect(sectPrs[0], size).toContain(`<w:pgSz ${attrs} w:orient="portrait"/>`);
    }
    const { sectPrs } = await parts(doc({ size: 'A5', orientation: 'landscape' }));
    // docx writes landscape pages wide (w > h) with the flag, as Word does.
    expect(sectPrs[0]).toContain('<w:pgSz w:w="11906" w:h="8391" w:orient="landscape"/>');
  });

  it('a document without layout settings keeps its single section as before', async () => {
    const { sectPrs } = await parts(doc({ footer: 'f' }));
    expect(sectPrs).toHaveLength(1);
    expect(sectPrs[0]).not.toContain('w:cols');
    expect(sectPrs[0]).not.toContain('w:titlePg');
    expect(sectPrs[0]).toContain('<w:pgNumType/>');
  });

  it('writes real sections: break type, orientation, columns and page numbering per section', async () => {
    const { document, sectPrs } = await parts(
      doc({ pageNumberFormat: 'lowerRoman' }, [
        p('Front'),
        brk({ orientation: 'landscape', columns: 2, columnSpacing: 10, numberFormat: 'decimal', numberStart: 1 }),
        p('Body'),
        brk({ breakType: 'continuous', columns: 1 }),
        p('Wide'),
        brk({ orientation: 'portrait' }),
        p('End'),
      ]),
    );
    expect(sectPrs).toHaveLength(4);
    // Section 1 (ends with the first sectPr): portrait, roman numbers from 1.
    expect(sectPrs[0]).toContain('w:orient="portrait"');
    expect(sectPrs[0]).toContain('<w:pgNumType w:fmt="lowerRoman"/>');
    expect(sectPrs[0]).not.toContain('<w:type');
    // Section 2: a new page, landscape, two columns 10 mm apart, decimal restarting at 1.
    expect(sectPrs[1]).toContain('<w:type w:val="nextPage"/>');
    expect(sectPrs[1]).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    expect(sectPrs[1]).toContain('<w:cols w:space="567" w:num="2" w:equalWidth="true"/>');
    expect(sectPrs[1]).toContain('<w:pgNumType w:start="1"/>');
    // Section 3: continuous; keeps landscape and the numbering; one column.
    expect(sectPrs[2]).toContain('<w:type w:val="continuous"/>');
    expect(sectPrs[2]).toContain('w:orient="landscape"');
    expect(sectPrs[2]).not.toContain('w:cols');
    expect(sectPrs[2]).toContain('<w:pgNumType/>');
    // Section 4: back to portrait, continuing the numbers.
    expect(sectPrs[3]).toContain('<w:type w:val="nextPage"/>');
    expect(sectPrs[3]).toContain('w:orient="portrait"');
    expect(sectPrs[3]).toContain('<w:pgNumType/>');
    // The body text is in order, nothing dropped.
    expect(text(document)).toBe('FrontBodyWideEnd');
  });

  it('writes the first section columns and fits pictures to the column', async () => {
    const { document, sectPrs } = await parts(doc({ columns: 2, columnSpacing: 12.7 }, [{ type: 'image', attrs: { src: PNG, width: 2000, height: 1000 } }]));
    expect(sectPrs).toHaveLength(1);
    expect(sectPrs[0]).toMatch(/<w:cols [^>]*w:num="2"/);
    expect(sectPrs[0]).toContain('w:space="720"');
    // A4 text width 159.2 mm → columns of 73.25 mm ≈ 277 px; the picture is scaled to it (EMU = px × 9525).
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(document)?.[1]);
    expect(cx).toBe(277 * 9525);
  });

  it('writes the page number format and start of the first section', async () => {
    const { sectPrs } = await parts(doc({ pageNumberFormat: 'upperLetter', pageNumberStart: 4 }));
    expect(sectPrs[0]).toContain('<w:pgNumType w:start="4" w:fmt="upperLetter"/>');
  });

  it('places header and footer parts with centre and right tab stops, and the page number where chosen', async () => {
    const { sectPrs, part } = await parts(doc({ header: 'Lab 3', headerLeft: 'Physics', headerRight: 'Asha', footer: '', footerLeft: 'Draft', pageNumbers: true, pageNumberAlign: 'right', pageNumberText: 'page' }));
    const header = await part(refs(sectPrs[0], 'header').default);
    expect(header).toContain('<w:tab w:val="center" w:pos="4513"/>');
    expect(header).toContain('<w:tab w:val="right" w:pos="9026"/>');
    expect(text(header)).toBe('PhysicsLab 3Asha');
    expect((header.match(/<w:tab\/>/g) ?? []).length).toBe(2);
    const footer = await part(refs(sectPrs[0], 'footer').default);
    expect(text(footer)).toBe('DraftPage ');
    expect(footer).toContain('PAGE');
    expect(footer).not.toContain('NUMPAGES');
  });

  it('a different first page gets its own header and footer (empty ones stay empty)', async () => {
    const { sectPrs, part } = await parts(
      doc({ header: 'Running head', footer: 'Footer', pageNumbers: true, firstPage: { header: { left: '', center: 'Title page', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false } }),
    );
    expect(sectPrs[0]).toContain('<w:titlePg/>');
    const h = refs(sectPrs[0], 'header');
    const f = refs(sectPrs[0], 'footer');
    expect(Object.keys(h).sort()).toEqual(['default', 'first']);
    expect(text(await part(h.first))).toBe('Title page');
    expect(text(await part(h.default))).toBe('Running head');
    expect(text(await part(f.first))).toBe('');
    expect(await part(f.first)).not.toContain('PAGE');
    expect(await part(f.default)).toContain('NUMPAGES');
  });

  it('headers in a landscape section use that section\'s text width', async () => {
    const { sectPrs, part } = await parts(doc({ headerLeft: 'L', headerRight: 'R' }, [p('a'), brk({ orientation: 'landscape' }), p('b')]));
    expect(await part(refs(sectPrs[0], 'header').default)).toContain('w:pos="9026"');
    expect(await part(refs(sectPrs[1], 'header').default)).toContain('<w:tab w:val="center" w:pos="6979"/><w:tab w:val="right" w:pos="13958"/>');
  });

  it('a document that starts with a section break gets no blank first page: the next section starts it', async () => {
    const { document, sectPrs } = await parts(doc({ pageNumbers: true }, [brk({ numberStart: 5, orientation: 'landscape' }), p('body')]));
    expect(sectPrs).toHaveLength(1);
    expect(sectPrs[0]).toContain('<w:pgNumType w:start="5"/>');
    expect(sectPrs[0]).toContain('w:orient="landscape"');
    expect(sectPrs[0]).not.toContain('<w:type');
    expect(text(document)).toBe('body');
  });

  it('two section breaks at the start: the dropped empty section keeps its page-number restart', async () => {
    // Print shows page 3 here (the restart carries on until the next one), so Word must start at 3 too, not 1.
    const { document, sectPrs } = await parts(doc({ pageNumbers: true }, [brk({ numberStart: 3 }), brk({ orientation: 'landscape' }), p('body')]));
    expect(sectPrs).toHaveLength(1);
    expect(sectPrs[0]).toContain('<w:pgNumType w:start="3"/>');
    expect(sectPrs[0]).toContain('w:orient="landscape"');
    expect(text(document)).toBe('body');
    // A later break's own restart wins over a dropped one's.
    const own = await parts(doc({ pageNumbers: true }, [brk({ numberStart: 3 }), brk({ numberStart: 8 }), p('body')]));
    expect(own.sectPrs).toHaveLength(1);
    expect(own.sectPrs[0]).toContain('<w:pgNumType w:start="8"/>');
  });

  it('an empty section between two next-page breaks is left out, as in print, and keeps its restart', async () => {
    const { document, sectPrs } = await parts(doc({ pageNumbers: true }, [p('a'), brk({ numberStart: 10 }), brk({ orientation: 'landscape' }), p('b')]));
    // Two sections, not three: no blank page between "a" and "b".
    expect(sectPrs).toHaveLength(2);
    expect(sectPrs[1]).toContain('<w:pgNumType w:start="10"/>');
    expect(sectPrs[1]).toContain('w:orient="landscape"');
    expect(text(document)).toBe('ab');
  });

  it('a section break inside a quote or table is left out and reported', async () => {
    const report = new ExportReport();
    const cell = { type: 'tableCell', content: [p('c'), brk()] };
    const { sectPrs, document } = await parts(doc({}, [p('a'), { type: 'blockquote', content: [p('q'), brk()] }, { type: 'table', content: [{ type: 'tableRow', content: [cell] }] }]), report);
    expect(sectPrs).toHaveLength(1);
    expect(text(document)).toBe('aqc');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 2 section breaks inside tables, lists or quotes were left out.');
  });
});

describe('print page layout', () => {
  it('adds nothing for a document without layout settings', () => {
    expect(layoutPrintCss(DEFAULT_PAGE)).toBe('');
    expect(buildPrintHtml('<p>x</p>', { ...DEFAULT_PAGE, header: 'H' }, 'T')).not.toContain('@top-left');
  });

  it('fills all six margin boxes, with the number formatted and placed as chosen, and the first page on its own', () => {
    const css = layoutPrintCss({
      ...DEFAULT_PAGE,
      header: 'C',
      headerLeft: 'L',
      footerRight: 'R',
      pageNumbers: true,
      pageNumberAlign: 'left',
      pageNumberFormat: 'upperRoman',
      pageNumberStart: 5,
      firstPage: { header: { left: '', center: 'Cover', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false },
    });
    expect(css).toContain('@top-left { content: "L";');
    expect(css).toContain('@top-center { content: "C";');
    expect(css).toContain('@top-right { content: none;');
    expect(css).toContain('@bottom-left { content: "Page " counter(page, upper-roman) " of " counter(pages);');
    expect(css).toContain('@bottom-right { content: "R";');
    const first = css.slice(css.indexOf('@page :first'));
    expect(first).toContain('counter-set: page 5;');
    expect(first).toContain('@top-center { content: "Cover";');
    expect(first).toContain('@bottom-left { content: none;');
  });

  it('quotes header and footer parts safely (no way out of the style element)', () => {
    const html = buildPrintHtml('<p>x</p>', { ...DEFAULT_PAGE, headerLeft: '</style><img src=x onerror=alert(1)>', footerRight: 'a"b\\c' }, 'T');
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html).not.toContain('<img');
    expect(html).toContain(cssString('a"b\\c'));
  });

  const editorDom = (body: string) => {
    const el = document.createElement('div');
    el.className = 'ProseMirror dcos-doc';
    el.setAttribute('contenteditable', 'true');
    el.innerHTML = body;
    return el;
  };

  it('wraps sections for columns and named pages, removing the break markers', () => {
    const page: PageSettings = { ...DEFAULT_PAGE, columns: 2, columnSpacing: 8 };
    const html = cleanClone(
      editorDom(
        '<p>a</p><div data-type="section-break" class="dcos-section-break" data-break="nextPage" data-orientation="landscape" data-columns="1" data-number-start="1" data-number-format="lower-roman-invalid"></div><p>b</p><div data-type="section-break" data-break="continuous" data-columns="3"></div><p>c</p><blockquote><p>q</p><div data-type="section-break" data-break="nextPage"></div></blockquote>',
      ),
      page,
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelectorAll('[data-type="section-break"]')).toHaveLength(0);
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.dcos-print-section'));
    expect(sections.map((s) => s.textContent)).toEqual(['a', 'b', 'cq']);
    expect(sections[0].getAttribute('style')).toBe('column-count: 2; column-gap: 8mm');
    expect(sections[1].getAttribute('style')).toBe('break-before: page; page: dcos-g1');
    expect(sections[2].getAttribute('style')).toBe('column-count: 3; column-gap: 8mm; page: dcos-g1');
    const css = root.querySelector('style')!.textContent!;
    // The landscape group is a named page; its numbers restart through their own counter, preset on page 1.
    expect(css).toContain('@page dcos-g1 { size: 297mm 210mm; counter-increment: page 1 dcos-n1 1;');
    expect(css).toContain('@bottom-center { content: "Page " counter(dcos-n1, decimal) " of " counter(pages);');
    expect(css).toContain('@page :first { counter-increment: page 1 dcos-n1 0; }');
  });

  it('a document that starts with a section break: its first page keeps the restart number (named page :first)', () => {
    const page: PageSettings = { ...DEFAULT_PAGE, pageNumbers: true };
    const html = cleanClone(editorDom('<div data-type="section-break" data-break="nextPage" data-number-start="5"></div><p>body</p>'), page);
    const root = document.createElement('div');
    root.innerHTML = html;
    // The empty first section is dropped, so page 1 is the named page of section 2...
    expect(Array.from(root.querySelectorAll('.dcos-print-section')).map((s) => s.textContent)).toEqual(['body']);
    const css = root.querySelector('style')!.textContent!;
    // ...whose own rule would outrank `@page :first`, so it carries the preset itself: page 1 shows 5.
    expect(css).toContain('@page dcos-g1:first { counter-increment: page 1 dcos-n1 5;');
  });

  it('leaves a one-section, one-column document as it is', () => {
    const root = editorDom('<p>a</p><p>b</p>');
    printSections(root, DEFAULT_PAGE);
    expect(root.innerHTML).toBe('<p>a</p><p>b</p>');
  });
});

describe('text export', () => {
  it('marks section breaks; a next-page break also starts a new page', () => {
    const out = documentToText({ type: 'doc', content: [p('a'), brk(), p('b'), brk({ breakType: 'continuous' }), p('c')] });
    expect(out).toBe('a\n\n[Section break: next page]\n\f\nb\n\n[Section break: continuous]\n\nc\n');
  });
});
