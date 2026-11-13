// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../export/docx';
import { buildOdt } from '../export/odt';
import { validateDoc } from '../safety';
import { documentTemplates } from '../templates';
import { createEmptyDocument, type DocumentContent } from '../types';
import { MAX_UNPACKED_BYTES, unpack } from './common';
import { importDocx } from './docx';
import { importDocumentFile, importSummary } from './index';

// 2×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC';
const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const cell = (type: 'tableCell' | 'tableHeader', text: string, attrs: Record<string, unknown> = {}): JSONContent => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs }, content: [p(t(text))] });

const docxBytes = async (content: DocumentContent, title = 'Doc') => new Uint8Array(await Packer.toBuffer(buildDocx(content, title)));

/** Walks a document body. */
function all(doc: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}
const textOf = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const marked = (doc: JSONContent, mark: string) => all(doc, 'text').filter((n) => n.marks?.some((m) => m.type === mark)).map((n) => n.text);

const SOURCE: DocumentContent = {
  ...createEmptyDocument(),
  page: { ...createEmptyDocument().page, size: 'Letter', orientation: 'landscape', margins: { top: 30, right: 20, bottom: 22, left: 18 }, header: 'Course 101', footer: 'Draft', pageNumbers: true },
  doc: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [t('Imported title')] },
      { type: 'tableOfContents' },
      p(t('Plain '), t('bold', [{ type: 'bold' }]), t(' '), t('italic', [{ type: 'italic' }]), t(' '), t('under', [{ type: 'underline' }]), t(' '), t('struck', [{ type: 'strike' }]), t(' H'), t('2', [{ type: 'subscript' }]), t('O x'), t('2', [{ type: 'superscript' }])),
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [t('Right aligned with a '), t('link', [{ type: 'link', attrs: { href: 'https://example.com/x' } }])] },
      { type: 'heading', attrs: { level: 2, textAlign: null }, content: [t('Second level')] },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [
          { type: 'listItem', content: [p(t('One')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Nested'))] }] }] },
          { type: 'listItem', content: [p(t('Two'))] },
        ],
      },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'H1'), cell('tableHeader', 'H2')] },
          { type: 'tableRow', content: [cell('tableCell', 'Tall', { rowspan: 2 }), cell('tableCell', 'B2')] },
          { type: 'tableRow', content: [cell('tableCell', 'B3')] },
          { type: 'tableRow', content: [cell('tableCell', 'Wide', { colspan: 2 })] },
        ],
      },
      { type: 'image', attrs: { src: PNG, alt: 'Two pixels', width: 2, height: 1 } },
      { type: 'pageBreak' },
      p(t('After the break')),
    ],
  },
};

describe('DOCX import', () => {
  it('reads what the DOCX export writes: headings, marks, alignment, lists, tables, links, pictures, page breaks, the table of contents and the page', async () => {
    const result = await importDocx(await docxBytes(SOURCE, 'Round trip'), 'file.docx');
    const doc = result.content.doc;
    expect(validateDoc(doc)).toBeNull();
    expect(result.title).toBe('Round trip');
    expect(all(doc, 'heading').map((h) => [h.attrs?.level, h.attrs?.textAlign, textOf(h)])).toEqual([
      [1, 'center', 'Imported title'],
      [2, null, 'Second level'],
    ]);
    // Word's table of contents (its cached entries and title) becomes the editor's own.
    expect(all(doc, 'tableOfContents')).toHaveLength(1);
    expect(textOf(doc)).not.toContain('Table of Contents');
    expect(marked(doc, 'bold')).toEqual(['bold']);
    expect(marked(doc, 'italic')).toEqual(['italic']);
    expect(marked(doc, 'underline')).toEqual(['under']);
    expect(marked(doc, 'strike')).toEqual(['struck']);
    expect(marked(doc, 'subscript')).toEqual(['2']);
    expect(marked(doc, 'superscript')).toEqual(['2']);
    const right = all(doc, 'paragraph').find((n) => textOf(n).startsWith('Right aligned'));
    expect(right?.attrs?.textAlign).toBe('right');
    expect(all(doc, 'text').find((n) => n.text === 'link')?.marks?.find((m) => m.type === 'link')?.attrs?.href).toBe('https://example.com/x');
    const ol = all(doc, 'orderedList');
    expect(ol).toHaveLength(1);
    expect(all(ol[0], 'bulletList').map(textOf)).toEqual(['Nested']);
    const table = all(doc, 'table')[0];
    expect(table.content!.map((r) => r.content!.map((c) => [c.type, textOf(c), c.attrs?.colspan, c.attrs?.rowspan]))).toEqual([
      [
        ['tableHeader', 'H1', 1, 1],
        ['tableHeader', 'H2', 1, 1],
      ],
      [
        ['tableCell', 'Tall', 1, 2],
        ['tableCell', 'B2', 1, 1],
      ],
      [['tableCell', 'B3', 1, 1]],
      [['tableCell', 'Wide', 2, 1]],
    ]);
    const img = all(doc, 'image')[0];
    expect(img.attrs).toMatchObject({ alt: 'Two pixels', width: 2, height: 1 });
    expect(String(img.attrs?.src)).toMatch(/^data:image\/png;base64,/);
    // The page break stays between the picture and the paragraph after it.
    const top = doc.content!.map((n) => n.type);
    expect(top.indexOf('pageBreak')).toBeGreaterThan(top.indexOf('image'));
    expect(textOf(doc.content![top.indexOf('pageBreak') + 1])).toBe('After the break');
    expect(result.content.page).toMatchObject({ size: 'Letter', orientation: 'landscape', margins: { top: 30, right: 20, bottom: 22, left: 18 }, header: 'Course 101', footer: 'Draft', pageNumbers: true });
    expect(result.content.schemaVersion).toBe(1);
  });

  it.each(documentTemplates.map((tpl) => [tpl.id, tpl] as const))('imports the %s template exported to Word with all of its text', async (_, tpl) => {
    const content = tpl.build();
    const result = await importDocx(await docxBytes(content), `${tpl.id}.docx`);
    expect(validateDoc(result.content.doc)).toBeNull();
    const words = (s: string) => s.replace(/\s+/g, ' ').trim();
    // Every paragraph and heading of the template is in the import (the table of contents is rebuilt, not copied).
    for (const block of [...all(content.doc, 'paragraph'), ...all(content.doc, 'heading')].map(textOf).filter(Boolean)) {
      expect(words(textOf(result.content.doc))).toContain(words(block));
    }
    expect(all(result.content.doc, 'heading')).toHaveLength(all(content.doc, 'heading').length);
    expect(all(result.content.doc, 'table')).toHaveLength(all(content.doc, 'table').length);
    expect(all(result.content.doc, 'tableOfContents')).toHaveLength(all(content.doc, 'tableOfContents').length);
    expect(result.content.page.header).toBe(content.page.header);
    expect(result.content.page.pageNumbers).toBe(content.page.pageNumbers);
  });

  it('reports what it could not import', async () => {
    const bytes = minimalDocx(
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Georgia"/><w:color w:val="FF0000"/><w:sz w:val="32"/></w:rPr><w:t>Coloured</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">See </w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>this</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>` +
        `<w:p><m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></w:p>` +
        `<w:p><w:ins w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Inserted</w:t></w:r></w:ins><w:del w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Deleted</w:delText></w:r></w:del></w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>Deep heading</w:t></w:r></w:p>` +
        `<w:p><w:r>${drawing('rIdEmf', 'Logo')}</w:r></w:p>`,
      { emf: true, styles: true },
    );
    const result = await importDocx(bytes, 'notes.docx');
    const doc = result.content.doc;
    expect(validateDoc(doc)).toBeNull();
    expect(all(doc, 'paragraph').find((n) => textOf(n) === 'Coloured')?.attrs?.textAlign).toBe('center');
    expect(textOf(doc)).toContain('Inserted');
    expect(textOf(doc)).not.toContain('Deleted');
    expect(all(doc, 'heading').map((h) => [h.attrs?.level, textOf(h)])).toEqual([[4, 'Deep heading']]);
    expect(textOf(doc)).toContain('[Picture not imported: Logo — EMF format]');
    const { message, notes } = importSummary(result.title, result.report);
    expect(message).toBe('Imported “notes”.');
    expect(notes).toEqual([
      '1 comment was not imported.',
      '1 equation was not imported.',
      'Tracked changes were accepted (insertions kept, deletions removed).',
      'Fonts, text sizes and text colours were not imported.',
      '1 heading below level 4 was imported as a level 4 heading.',
      '1 picture in a format browsers cannot show was replaced by a note.',
    ]);
  });

  it('imports footnotes as numbered notes at the end', async () => {
    const bytes = minimalDocx(`<w:p><w:r><w:t>Claim</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`, { footnotes: true });
    const result = await importDocx(bytes, 'fn.docx');
    const doc = result.content.doc;
    expect(textOf(doc)).toContain('Notes');
    expect(textOf(doc)).toContain('The source.');
    expect(textOf(doc)).not.toContain('↑');
    expect(result.report.sentences()).toContain('1 footnote or endnote was imported as a numbered note at the end');
  });

  it('keeps named paragraph styles, picture alignment and captions, and the document language', async () => {
    const content: DocumentContent = {
      ...createEmptyDocument(),
      language: 'en-GB',
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { paragraphStyle: 'title' }, content: [t('A title')] },
          { type: 'paragraph', attrs: { paragraphStyle: 'subtitle' }, content: [t('A subtitle')] },
          { type: 'image', attrs: { src: PNG, alt: 'Right picture', width: 2, height: 1, align: 'right', caption: 'Figure 1. On the right' } },
          { type: 'image', attrs: { src: PNG, alt: 'Plain picture', width: 2, height: 1 } },
          p(t('Between')),
          { type: 'paragraph', attrs: { paragraphStyle: 'caption' }, content: [t('A caption paragraph of its own')] },
        ],
      },
    };
    const result = await importDocx(await docxBytes(content), 'styles.docx');
    const doc = result.content.doc;
    expect(all(doc, 'paragraph').map((n) => [n.attrs?.paragraphStyle ?? null, textOf(n)]).filter(([, x]) => x)).toEqual([
      ['title', 'A title'],
      ['subtitle', 'A subtitle'],
      [null, 'Between'],
      ['caption', 'A caption paragraph of its own'],
    ]);
    expect(all(doc, 'image').map((n) => [n.attrs?.alt, n.attrs?.align ?? null, n.attrs?.caption ?? null])).toEqual([
      ['Right picture', 'right', 'Figure 1. On the right'],
      ['Plain picture', null, null],
    ]);
    // Pictures come in as pictures, with no empty paragraph left in front of them.
    expect(doc.content!.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'image', 'image', 'paragraph', 'paragraph']);
    expect(result.content.language).toBe('en-GB');
    expect(result.content.schemaVersion).toBe(2);
    // A file with no language of its own gives a document without one.
    expect((await importDocx(await docxBytes(createEmptyDocument()))).content.language).toBeUndefined();
  });

  it('a left-aligned picture stays left, as does a picture in a Word paragraph with no alignment (Word\'s default)', async () => {
    const own: DocumentContent = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'image', attrs: { src: PNG, alt: 'Left picture', width: 2, height: 1, align: 'left' } }] } };
    const back = (await importDocx(await docxBytes(own), 'left.docx')).content.doc;
    expect(all(back, 'image').map((n) => n.attrs?.align ?? null)).toEqual(['left']);
    // A Word file whose picture paragraph has no w:jc: Word shows it on the left, so it is imported on the left.
    const { Document, ImageRun, Paragraph } = await import('docx');
    const png = Uint8Array.from(atob(PNG.split(',')[1]), (c) => c.charCodeAt(0));
    const word = new Document({ sections: [{ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: 2, height: 1 } })] })] }] });
    const foreign = (await importDocx(new Uint8Array(await Packer.toBuffer(word)), 'word.docx')).content.doc;
    expect(all(foreign, 'image').map((n) => n.attrs?.align ?? null)).toEqual(['left']);
  });

  it('a page break in the middle of a paragraph splits it there, keeping the words apart', async () => {
    const { Document, PageBreak, Paragraph, TextRun } = await import('docx');
    const word = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('End of page one.'), new PageBreak(), new TextRun('Start of page two.')] })] }] });
    const doc = (await importDocx(new Uint8Array(await Packer.toBuffer(word)), 'break.docx')).content.doc;
    expect(doc.content!.map((n) => [n.type, textOf(n)])).toEqual([
      ['paragraph', 'End of page one.'],
      ['pageBreak', ''],
      ['paragraph', 'Start of page two.'],
    ]);
  });

  it('a hyperlink whose relationship is missing keeps its text instead of failing the import', async () => {
    const base = unzipSync(await docxBytes({ ...createEmptyDocument(), doc: { type: 'doc', content: [p(t('x'))] } }));
    const xml = strFromU8(base['word/document.xml']).replace(/<w:body>[\s\S]*?(<w:sectPr)/, '<w:body><w:p><w:hyperlink r:id="rIdMissing"><w:r><w:t>orphan link</w:t></w:r></w:hyperlink></w:p>$1');
    base['word/document.xml'] = strToU8(xml);
    const r = await importDocx(zipSync(base), 'broken');
    expect(textOf(r.content.doc)).toBe('orphan link');
    expect(marked(r.content.doc, 'link')).toEqual([]);
  });

  it('links the editor allows stay links; others become text, and only those are reported', async () => {
    const base = unzipSync(await docxBytes({ ...createEmptyDocument(), doc: { type: 'doc', content: [p(t('x'))] } }));
    base['word/document.xml'] = strToU8(
      strFromU8(base['word/document.xml']).replace(
        /<w:body>[\s\S]*?(<w:sectPr)/,
        '<w:body><w:p><w:hyperlink r:id="rA"><w:r><w:t>web</w:t></w:r></w:hyperlink><w:hyperlink r:id="rB"><w:r><w:t>script</w:t></w:r></w:hyperlink></w:p>$1',
      ),
    );
    base['word/_rels/document.xml.rels'] = strToU8(
      strFromU8(base['word/_rels/document.xml.rels']).replace(
        '</Relationships>',
        '<Relationship Id="rA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/><Relationship Id="rB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>',
      ),
    );
    const r = await importDocx(zipSync(base), 'links');
    expect(marked(r.content.doc, 'link')).toEqual(['web']);
    expect(r.report.sentences()).toContain('1 link with an unsupported address was imported as plain text');
  });

  it('reports Word page numbering, first-page parts, left/right header parts and list starts it does not import', async () => {
    const source: DocumentContent = {
      ...createEmptyDocument(),
      page: { ...createEmptyDocument().page, headerLeft: 'L', header: 'C', pageNumbers: true, pageNumberFormat: 'lowerRoman', pageNumberStart: 3, firstPage: { header: { left: '', center: 'Cover', right: '' }, footer: { left: '', center: '', right: '' }, pageNumbers: false } },
      doc: { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 4 }, content: [{ type: 'listItem', content: [p(t('four'))] }] }] },
    };
    const r = await importDocx(await docxBytes(source), 'layout');
    expect(r.report.sentences()).toEqual(
      expect.arrayContaining([
        'The page number format and starting number were not imported',
        'The different first-page header and footer were not imported',
        'Header and footer text placed left, centre and right was imported as one centred line',
        'List numbering formats and start numbers were not imported (lists are numbered 1, 2, 3)',
      ]),
    );
    // A plain document reports none of these.
    const plain = await importDocx(await docxBytes({ ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'orderedList', content: [{ type: 'listItem', content: [p(t('one'))] }] }] } }), 'plain');
    expect(plain.report.sentences()).toEqual([]);
  });

  it('refuses a file that would unpack to more than the limit, before reading it', async () => {
    const big = zipSync({ 'word/document.xml': new Uint8Array(3 * 1024 * 1024) });
    expect(big.length).toBeLessThan(64 * 1024);
    expect(() => unpack(big, 'not a zip', 2 * 1024 * 1024)).toThrow('This file unpacks to more than 2 MB, which is too large to import');
    expect(Object.keys(unpack(big, 'not a zip'))).toEqual(['word/document.xml']);
    expect(() => unpack(new Uint8Array([1, 2, 3]), 'not a zip')).toThrow('not a zip');
    expect(MAX_UNPACKED_BYTES).toBe(512 * 1024 * 1024);
  });

  it('refuses files that are not Word documents, with a readable reason', async () => {
    await expect(importDocx(new Uint8Array([0xd0, 0xcf, 0x11]))).rejects.toThrow(/not a Word \.docx file/);
    await expect(importDocx(zipSync({ 'other.txt': strToU8('x') }))).rejects.toThrow(/word\/document\.xml is missing/);
  });
});

describe('importDocumentFile', () => {
  it('recognises the format from the file itself', async () => {
    const content = documentTemplates.find((x) => x.id === 'essay')!.build();
    const fromWord = await importDocumentFile('renamed.odt', await docxBytes(content, 'Essay'));
    expect(fromWord.format).toBe('docx');
    const fromOdt = await importDocumentFile('renamed.docx', buildOdt(content, 'Essay'));
    expect(fromOdt.format).toBe('odt');
    await expect(importDocumentFile('old.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/older Word \(\.doc\) file/);
    await expect(importDocumentFile('x.txt', strToU8('hello'))).rejects.toThrow(/not a Word \(\.docx\) or OpenDocument/);
    await expect(importDocumentFile('x.zip', zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow(/not a Word \(\.docx\) or OpenDocument/);
  });
});

// ── A hand-written .docx with features the app's own export never writes ──────────────────────────────────────

function drawing(rid: string, descr: string) {
  return (
    `<w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Picture 1" descr="${descr}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="p"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

function minimalDocx(body: string, opts: { emf?: boolean; styles?: boolean; footnotes?: boolean } = {}): Uint8Array {
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const rels = [
    opts.emf ? '<Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.emf"/>' : '',
    opts.styles ? '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' : '',
    opts.footnotes ? '<Relationship Id="rIdFn" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' : '',
  ].join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="emf" ContentType="image/x-emf"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${ns}><w:body>${body}</w:body></w:document>`),
  };
  if (opts.emf) files['word/media/image1.emf'] = new Uint8Array([1, 0, 0, 0, 108, 0, 0, 0]);
  if (opts.styles) {
    files['word/styles.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:styles ${ns}><w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/></w:style></w:styles>`,
    );
  }
  if (opts.footnotes) {
    files['word/footnotes.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${ns}><w:footnote w:id="1"><w:p><w:r><w:t>The source.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    );
  }
  return zipSync(files);
}
