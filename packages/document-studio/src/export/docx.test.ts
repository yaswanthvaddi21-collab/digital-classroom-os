import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { documentTemplates } from '../templates';
import { createEmptyDocument, type DocumentContent } from '../types';
import { buildDocx, toHalfPoints, toHex } from './docx';
import { buildPrintHtml } from './print';
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

async function xmlOf(content: DocumentContent) {
  const buf = await Packer.toBuffer(buildDocx(content, 'Test'));
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
    expect(toHex('red')).toBeUndefined();
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
