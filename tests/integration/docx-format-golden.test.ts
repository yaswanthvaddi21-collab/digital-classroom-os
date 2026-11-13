/**
 * DOCX golden for the Phase 4 formatting features (G-FORMAT): named styles, line and paragraph spacing, indents,
 * custom colours and sizes, bullet glyphs and number formats. The fixture is a schema 2 document; its Word XML is
 * compared against a committed snapshot (update with `npx vitest run -u` after reviewing the change), and the file is
 * re-read by an independent parser (mammoth).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Packer } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { buildDocx, contentSchemaFor, prepareDocument, type DocumentContent } from '@dcos/document-studio';

/** As in docx-golden.test.ts: removes the values that differ on every export, then pretty-prints. */
function canonical(xml: string) {
  const ids = new Map<string, string>();
  const stable = (v: string) => {
    if (!ids.has(v)) ids.set(v, `ID${ids.size + 1}`);
    return ids.get(v)!;
  };
  return xml.replace(/(r:embed|r:id|Id)="(rId[^"]+)"/g, (_, attr, v) => `${attr}="${stable(v)}"`).replace(/></g, '>\n<');
}

const DIR = join(__dirname, '..', 'golden', 'docx-format');
const fixture = JSON.parse(readFileSync(join(DIR, 'format.fixture.json'), 'utf8')) as DocumentContent;

describe('DOCX export of the formatting fixture', () => {
  it('is a schema 2 document this version opens for editing', () => {
    expect(contentSchemaFor(fixture as never)).toBe(2);
    expect(prepareDocument(fixture).state).toBe('editable');
  });

  it('matches the golden Word XML', async () => {
    const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(fixture, 'Format fixture')));
    for (const part of ['word/document.xml', 'word/numbering.xml', 'word/styles.xml']) {
      await expect(canonical(await zip.file(part)!.async('string'))).toMatchFileSnapshot(join(DIR, part.replace(/[/[\]]/g, '_')));
    }
  });

  it('is readable by an independent parser, with every paragraph and list item', async () => {
    const { value: html } = await mammoth.convertToHtml({ buffer: await Packer.toBuffer(buildDocx(fixture, 'Format fixture')) });
    for (const text of ['Format fixture', 'Every G-FORMAT feature', 'Line spacing 1.15, 6pt before, 12pt after.', 'Hanging indent, as in a reference list.', 'A quotation.', 'Figure 1. A caption.', 'Roman from iii', 'Number 1'])
      expect(html).toContain(text);
    expect(html).toContain('<h1>Spacing</h1>');
    expect((html.match(/<li>/g) ?? []).length).toBe(9);
  });
});
