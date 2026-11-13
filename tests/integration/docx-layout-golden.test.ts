/**
 * DOCX golden for page layout (Phase 4, G-LAYOUT): a document with a different first page, header and footer parts,
 * roman then restarted decimal then letter page numbers, a landscape section, a continuous two-column section and a
 * section back in portrait. Its Word XML (body with every w:sectPr, headers, footers) is compared with committed
 * snapshots, and an independent parser (mammoth) must still read every paragraph.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Packer } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { buildDocx, contentSchemaFor, prepareDocument, type DocumentContent } from '@dcos/document-studio';

const DIR = join(__dirname, '..', 'golden', 'docx-layout');
const content = JSON.parse(readFileSync(join(DIR, 'sections.json'), 'utf8')) as DocumentContent;

/** Stable ids, one tag per line (as in docx-golden.test.ts). */
function canonical(xml: string) {
  const ids = new Map<string, string>();
  const stable = (v: string) => {
    if (!ids.has(v)) ids.set(v, `ID${ids.size + 1}`);
    return ids.get(v)!;
  };
  return xml.replace(/(r:embed|r:id|Id)="(rId[^"]+)"/g, (_, attr, v) => `${attr}="${stable(v)}"`).replace(/></g, '>\n<');
}

async function exportParts() {
  const buffer = await Packer.toBuffer(buildDocx(content, 'Layout'));
  const zip = await JSZip.loadAsync(buffer);
  const parts: Record<string, string> = {};
  for (const name of Object.keys(zip.files).filter((n) => n === 'word/document.xml' || n === 'word/_rels/document.xml.rels' || /^word\/(header|footer)\d*\.xml$/.test(n))) {
    parts[name] = canonical(await zip.file(name)!.async('string'));
  }
  return { buffer, parts };
}

describe('DOCX page layout golden', () => {
  it('the fixture is a valid, editable schema 2 document', () => {
    expect(prepareDocument(content).state).toBe('editable');
    expect(contentSchemaFor(content as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>)).toBe(2);
  });

  it('matches the golden Word XML', async () => {
    const { parts } = await exportParts();
    expect(Object.keys(parts).filter((n) => /header|footer/.test(n)).length).toBeGreaterThanOrEqual(8);
    for (const [part, xml] of Object.entries(parts)) await expect(xml).toMatchFileSnapshot(join(DIR, 'sections', part.replace(/[/[\]]/g, '_')));
  });

  it('has four sections in order, and an independent parser reads every paragraph', async () => {
    const { buffer, parts } = await exportParts();
    const sectPrs = parts['word/document.xml'].match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrs.map((s) => /<w:type w:val="(\w+)"/.exec(s)?.[1] ?? 'first')).toEqual(['first', 'nextPage', 'continuous', 'nextPage']);
    expect(sectPrs.map((s) => /w:orient="(\w+)"/.exec(s)?.[1])).toEqual(['portrait', 'landscape', 'landscape', 'portrait']);
    expect(sectPrs.map((s) => /<w:pgNumType[^>]*\/>/.exec(s)?.[0])).toEqual(['<w:pgNumType w:fmt="lowerRoman"/>', '<w:pgNumType w:start="1"/>', '<w:pgNumType/>', '<w:pgNumType w:fmt="upperLetter"/>']);
    expect(sectPrs.map((s) => /w:num="(\d)"/.exec(s)?.[1] ?? '1')).toEqual(['1', '1', '2', '1']);
    const { value } = await mammoth.extractRawText({ buffer });
    for (const text of ["Ohm's Law", 'Title page', 'Preface, numbered ii', 'Results (landscape)', 'Page 1 of the body.', 'Two columns, on the same page.', 'A point in a column', 'Appendix', 'Portrait again, numbering continues as letters.'])
      expect(value).toContain(text);
  });
});
