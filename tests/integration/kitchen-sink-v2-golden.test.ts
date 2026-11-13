// @vitest-environment jsdom
/**
 * v2 "kitchen sink" golden (Phase 4, Round 3): one document that uses every Phase 4 feature — paragraph formatting
 * and named styles, list styles and start numbers, custom colours and sizes, sections with their own orientation,
 * columns and page numbering, header and footer parts with a different first page, equations (native, coloured,
 * outside Word's subset), shapes, a floating text box holding a list and a picture, picture alignment and captions,
 * comments with replies and a resolved thread, and the document language — and the cross-feature cases (an
 * equation in a table cell, comments on a heading and in a list, a two-column section with a picture and an
 * equation, a styled list after a section break).
 *
 * It is exported to Word and to OpenDocument, compared with committed XML snapshots (golden/docx-v2, golden/odt-v2),
 * checked feature by feature with XML assertions, read back by an independent parser (mammoth) and re-imported.
 * Any change to the export output must be a reviewed snapshot update (`npx vitest run -u`).
 *
 * Pictures drawn by the browser (shapes, equations Word cannot take) are not available here: one shape is given a
 * fixed picture, as the browser preparer would add, and the other shape and the non-Word equation take the reported
 * fallbacks, so both paths are covered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Packer } from 'docx';
import { strFromU8, unzipSync } from 'fflate';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { buildDocx, buildOdt, contentSchemaFor, documentToText, ExportReport, exportToast, importOdt, prepareDocument, type DocumentContent } from '@dcos/document-studio';
import { shapeAssetKey } from '../../packages/document-studio/src/export/docx/insert';

const FIXTURE = join(__dirname, '..', 'golden', 'v2', 'kitchen-sink-v2.json');
const content = JSON.parse(readFileSync(FIXTURE, 'utf8')) as DocumentContent;
const SHAPE_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
const NOW = new Date('2026-03-01T12:00:00.000Z');

const shapes = (content.doc.content ?? []).filter((n) => n.type === 'shape');
const assets = () => new Map([[shapeAssetKey(shapes[0].attrs), SHAPE_PNG]]);

/** Stable ids, one tag per line (as in docx-golden.test.ts). */
function canonical(xml: string) {
  const ids = new Map<string, string>();
  const stable = (v: string) => {
    if (!ids.has(v)) ids.set(v, `ID${ids.size + 1}`);
    return ids.get(v)!;
  };
  return xml
    .replace(/(r:embed|r:id|Id)="(rId[^"]+)"/g, (_, attr, v) => `${attr}="${stable(v)}"`)
    .replace(/(<wp:docPr\b[^>]*\bid=")(\d+)"/g, '$1N"')
    .replace(/(<pic:cNvPr\b[^>]*\bid=")(\d+)"/g, '$1N"')
    .replace(/media\/[^"]+\.(png|jpe?g|gif|bmp)/g, 'media/IMAGE.$1')
    .replace(/></g, '>\n<');
}

async function docx() {
  const report = new ExportReport();
  const buffer = await Packer.toBuffer(buildDocx(content, 'Kitchen sink v2', assets(), report));
  const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  const names = Object.keys(zip.files);
  return { buffer, report, zip, names, read };
}
function odt() {
  const report = new ExportReport();
  const bytes = buildOdt(content, 'Kitchen sink v2', assets(), report, NOW);
  const files = unzipSync(bytes);
  return { bytes, report, files, read: (name: string) => (files[name] ? strFromU8(files[name]) : '') };
}
const count = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;
const paragraphWith = (xml: string, text: string) => (xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g) ?? []).filter((x) => x.includes(text));

describe('v2 kitchen sink', () => {
  it('is a valid schema 2 document this version opens for editing', () => {
    expect(contentSchemaFor(content as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>)).toBe(2);
    expect(prepareDocument(content).state).toBe('editable');
  });

  describe('DOCX', () => {
    it('matches the golden Word XML', async () => {
      const { names, read } = await docx();
      const parts = names.filter((n) => /^word\/(document|numbering|styles|comments|commentsExtended|header\d*|footer\d*)\.xml$|^word\/_rels\/document\.xml\.rels$|^\[Content_Types\]\.xml$/.test(n));
      expect(parts.length).toBeGreaterThan(8);
      for (const part of parts) await expect(canonical(await read(part))).toMatchFileSnapshot(join(__dirname, '..', 'golden', 'docx-v2', 'kitchen-sink', part.replace(/[/[\]]/g, '_')));
    });

    it('writes every feature natively, and reports exactly the approximations', async () => {
      const { read, report } = await docx();
      const document = await read('word/document.xml');
      const styles = await read('word/styles.xml');
      const numbering = await read('word/numbering.xml');
      // Formatting and named styles.
      expect(paragraphWith(document, 'Kitchen sink v2')[0]).toContain('<w:pStyle w:val="Title"/>');
      expect(paragraphWith(document, 'Every Phase 4 feature')[0]).toContain('<w:pStyle w:val="Subtitle"/>');
      expect(paragraphWith(document, 'Line spacing 1.5')[0]).toContain('<w:spacing w:after="120" w:before="240" w:line="360"/>');
      expect(paragraphWith(document, 'A hanging indent')[0]).toContain('<w:ind w:left="720" w:hanging="720"/>');
      expect(paragraphWith(document, 'A caption-styled')[0]).toContain('<w:pStyle w:val="Caption"/>');
      for (const id of ['Title', 'Subtitle', 'Heading1', 'Heading4', 'Quote', 'Caption', 'Code']) expect(styles).toContain(`w:styleId="${id}"`);
      expect(document).toContain('<w:color w:val="0E7490"/>');
      expect(document).toContain('<w:sz w:val="27"/>');
      // List styles: glyphs, formats, start numbers (nested included).
      expect(numbering).toContain('<w:lvlText w:val="▪"/>');
      expect(numbering).toContain('<w:lvlText w:val="–"/>');
      expect(numbering).toContain('<w:numFmt w:val="upperRoman"/>');
      expect(numbering).toContain('<w:numFmt w:val="lowerLetter"/>');
      expect(numbering).toMatch(/<w:startOverride w:val="4"\/>/);
      expect(numbering).toMatch(/<w:lvlOverride w:ilvl="1">\s*<w:startOverride w:val="2"\/>/);
      expect(numbering).toMatch(/<w:startOverride w:val="6"\/>/);
      // Sections: four, with orientation, columns and numbering per section; first page and parts.
      const sectPrs = document.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [];
      expect(sectPrs).toHaveLength(4);
      expect(sectPrs[0]).toContain('<w:titlePg/>');
      expect(sectPrs[0]).toContain('<w:pgNumType w:fmt="lowerRoman"/>');
      expect(sectPrs[1]).toContain('w:orient="landscape"');
      expect(sectPrs[1]).toContain('w:num="2"');
      expect(sectPrs[1]).toContain('<w:pgNumType w:start="1"/>');
      expect(sectPrs[2]).toContain('<w:type w:val="continuous"/>');
      expect(sectPrs[2]).toContain('w:num="3"');
      expect(sectPrs[3]).toContain('<w:pgNumType w:fmt="upperLetter"/>');
      expect(sectPrs[3]).toContain('w:orient="portrait"');
      // Equations: native (inline, display, in a table cell), and the one outside Word's subset as LaTeX text.
      expect(count(document, /<m:oMath>/g)).toBeGreaterThanOrEqual(6);
      expect(document).toMatch(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<m:oMath>(?:(?!<\/w:tc>)[\s\S])*<\/w:tc>/);
      expect(document).toContain('\\overgroup{AB}');
      // Shapes, text box, picture alignment and caption.
      expect(document).toContain('descr="Rounded rectangle: Start here"');
      expect(document).toContain('[Shape: Ellipse: Not drawn]');
      expect(document).toContain('w:tblpXSpec="right"');
      expect(paragraphWith(document, 'Figure 1: A right-aligned picture')[0]).toContain('<w:pStyle w:val="Caption"/>');
      // Comments: three threads (two replies), one resolved; language.
      const comments = await read('word/comments.xml');
      expect(count(comments, /<w:comment /g)).toBe(5);
      expect(await read('word/commentsExtended.xml')).toContain('w15:done="1"');
      expect(styles).toContain('<w:lang w:val="en-GB"/>');
      expect(exportToast('Word document', report).message).toBe(
        "Exported Word document. The table of contents was written without page numbers; they are added when its field is updated in Word. 1 highlight colour was changed to Word's nearest highlight colour. 1 equation lost its colours (Word equations are written in one colour). 1 equation could not be converted and was written as its LaTeX text. 1 shape was written as a picture. 1 shape could not be drawn and was written as a placeholder. 1 text box was written as a one-cell table.",
      );
    });

    it('is read by an independent parser with every paragraph, list item and cell', async () => {
      const { buffer } = await docx();
      const { value } = await mammoth.extractRawText({ buffer: buffer as Buffer });
      for (const text of ['Kitchen sink v2', 'Square bullet', 'Dash bullet, nested', 'The continuation keeps', 'nested from b', 'boxed ii', 'Energy', 'Styled list after the break', 'Three columns', 'Last page.']) expect(value).toContain(text);
    });
  });

  describe('ODT', () => {
    it('matches the golden OpenDocument XML', () => {
      const { files, read } = odt();
      expect(Object.keys(files)[0]).toBe('mimetype');
      for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
        expect(read(part), part).not.toBe('');
      }
      return Promise.all(['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml'].map((part) => expect(read(part).replace(/></g, '>\n<')).toMatchFileSnapshot(join(__dirname, '..', 'golden', 'odt-v2', 'kitchen-sink', part.replace(/\//g, '_')))));
    });

    it('writes the core natively and reports the rest', () => {
      const { read, report } = odt();
      const xml = read('content.xml');
      const styles = read('styles.xml');
      expect(xml).toContain('fo:line-height');
      expect(xml).toContain('style:num-format="I"');
      expect(xml).toContain('text:start-value="4"');
      expect(xml).toContain('text:bullet-char="▪"');
      expect(xml).toContain('$E = mc^2$');
      expect(xml).toContain('<draw:image');
      expect(styles).toContain('style:header-first');
      expect(styles).toContain('fo:language="en"');
      const message = exportToast('OpenDocument text', report).message;
      expect(message).toBe(
        'Exported OpenDocument text. The table of contents was written without page numbers; they are added when it is updated in your word processor. Comments are not supported in ODT files yet and were left out (the commented text was kept). 7 equations are not supported in ODT files yet and were written as text. 2 shapes are not supported in ODT files yet and were written as text. 1 text box is not supported in ODT files yet; its text was kept. 2 section breaks were written as page breaks (sections with their own page layout are not supported in ODT files yet). 1 continuous section break was left out (sections are not supported in ODT files yet).',
      );
    });

    it('imports back with the same text, list formats and page layout', () => {
      const { bytes } = odt();
      const back = importOdt(bytes, 'kitchen.odt');
      const text = documentToText(back.content.doc);
      for (const t of ['Kitchen sink v2', 'Square bullet', 'nested from b', 'Energy', 'Three columns', 'Last page.']) expect(text).toContain(t);
      expect(back.content.page.pageNumberFormat).toBe('lowerRoman');
      expect(back.content.page.headerLeft).toBe('Physics 101');
      expect(back.content.language).toBe('en-GB');
    });
  });
});
