import type { JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, type DocumentContent } from '../types';
import { buildDocx } from './docx';
import { equationAssetKey, equationHasColour, pngSize, shapeAssetKey, wordEquation } from './docx/insert';
import { picturesNeeded, prepareInsertPictures } from './insertPictures';
import { ExportReport, exportToast } from './report';
import { documentToText } from './text';

// 1×1 PNG (a real PNG header, so its size can be read).
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
/** A PNG header claiming the given size (what pngSize reads). */
function pngOfSize(width: number, height: number) {
  const bytes = PNG_BYTES.slice();
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const text = (t: string): JSONContent => ({ type: 'text', text: t });
const content = (...body: JSONContent[]): DocumentContent => ({ ...createEmptyDocument(), doc: { type: 'doc', content: body } });

async function documentXml(c: DocumentContent, assets = new Map<string, Uint8Array>(), report = new ExportReport()) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(c, 'T', assets, report)));
  return { xml: await zip.file('word/document.xml')!.async('string'), zip, report };
}

/** A LaTeX command KaTeX draws but Word's equation converter does not know. */
const NOT_IN_WORD = '\\overgroup{AB}';

describe('equations in Word', () => {
  it('are written as native Word equations (OMML): inline in the line, display in its own math paragraph', async () => {
    const { xml, report } = await documentXml(
      content(p(text('Energy '), { type: 'inlineMath', attrs: { latex: 'E = mc^2' } }, text(' holds.')), { type: 'blockMath', attrs: { latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' } }),
    );
    expect(xml).toContain('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"');
    // Inline: an m:oMath among the runs of the paragraph, with the superscript as m:sSup.
    const inlinePara = xml.match(/<w:p>(?:(?!<\/w:p>).)*Energy(?:(?!<\/w:p>).)*<\/w:p>/)![0];
    expect(inlinePara).toContain('<m:oMath>');
    expect(inlinePara).toContain('<m:sSup>');
    expect(inlinePara).not.toContain('<m:oMathPara>');
    // Display: m:oMathPara with a fraction and a radical.
    expect(xml).toMatch(/<m:oMathPara><m:oMath>.*<m:f>.*<m:rad>.*<\/m:oMath><\/m:oMathPara>/);
    expect(report.empty).toBe(true);
    expect(exportToast('Word document', report)).toEqual({ message: 'Exported Word document', kind: 'success' });
  });

  it('LaTeX Word cannot take becomes a picture of the equation, with the LaTeX as its alternative text, and is reported', async () => {
    expect(wordEquation(NOT_IN_WORD)).toBeNull();
    const assets = new Map([[equationAssetKey(NOT_IN_WORD, true), pngOfSize(240, 60)]]);
    const { xml, zip, report } = await documentXml(content({ type: 'blockMath', attrs: { latex: NOT_IN_WORD } }), assets);
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain(`descr="${NOT_IN_WORD.replace(/\\/g, '\\')}"`);
    // Drawn at 2 device pixels per CSS pixel: 120 × 30 CSS pixels = 1143000 × 285750 EMU.
    expect(xml).toContain('cx="1143000" cy="285750"');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 equation Word cannot edit natively was written as a picture.');
  });

  it('colours in an equation are left out of the Word equation, and that is reported', async () => {
    const { xml, report } = await documentXml(content(p({ type: 'inlineMath', attrs: { latex: '\\color{red}{x} + \\textcolor{blue}{y}' } }), p({ type: 'inlineMath', attrs: { latex: 'z^2' } })));
    expect((xml.match(/<m:oMath>/g) ?? []).length).toBe(2);
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 equation lost its colours (Word equations are written in one colour).');
    // \colorbox is not a colour command Word's converter knows: it is not reported as one (it becomes a picture).
    expect(equationHasColour('\\colorbox{yellow}{x}')).toBe(false);
    expect(equationHasColour('\\colors')).toBe(false);
  });

  it('a link or bold on an inline equation cannot go into a Word equation, and that is reported', async () => {
    const eq = { type: 'inlineMath', attrs: { latex: 'y' }, marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://e.com' } }] };
    const { xml, report } = await documentXml(content(p(text('see '), eq)));
    expect(xml).toContain('<m:oMath>');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 equation lost its link or text formatting (Word equations take neither).');
    // Without marks nothing is reported.
    const plain = await documentXml(content(p(text('see '), { type: 'inlineMath', attrs: { latex: 'y' } })));
    expect(plain.report.sentences()).toEqual([]);
  });

  it('without a picture (it could not be drawn) the LaTeX itself is written, and reported', async () => {
    const { xml, report } = await documentXml(content(p({ type: 'inlineMath', attrs: { latex: NOT_IN_WORD } }), p({ type: 'inlineMath', attrs: { latex: '\\frac{' } })));
    expect(xml).toContain(`$${NOT_IN_WORD}$`);
    expect(xml).toContain('Cambria Math');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 2 equations could not be converted and were written as their LaTeX text.');
  });

  it('works inside headings, lists and table cells', async () => {
    const eq = { type: 'inlineMath', attrs: { latex: '\\alpha' } };
    const { xml } = await documentXml(
      content(
        { type: 'heading', attrs: { level: 2 }, content: [text('About '), eq] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(eq)] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'blockMath', attrs: { latex: '\\beta' } }] }] }] },
      ),
    );
    expect(xml.match(/<m:oMath>/g)).toHaveLength(3);
    expect(xml).toContain('α');
    expect(xml).toContain('β');
  });
});

describe('shapes in Word', () => {
  const shape = { type: 'shape', attrs: { kind: 'callout', width: 200, height: 120, fill: '#fff7d6', stroke: '#b45309', strokeWidth: 2, text: 'Note', align: 'right' } };

  it('are pictures of the shape at its size and alignment, labelled, and reported', async () => {
    const assets = new Map([[shapeAssetKey(shape.attrs), pngOfSize(400, 240)]]);
    const { xml, report } = await documentXml(content(shape), assets);
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain('descr="Callout: Note"');
    expect(xml).toContain('cx="1905000" cy="1143000"'); // 200 × 120 CSS pixels
    expect(xml).toMatch(/<w:jc w:val="right"\/>.*<w:drawing>/);
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 shape was written as a picture.');
  });

  it('are a labelled placeholder when the picture could not be drawn', async () => {
    const { xml, report } = await documentXml(content(shape));
    expect(xml).toContain('[Shape: Callout: Note]');
    expect(report.sentences()).toEqual(['1 shape could not be drawn and was written as a placeholder']);
  });

  it('the preparer draws each distinct shape once, from its SVG, at its size', async () => {
    const rasterize = vi.fn(async () => PNG_BYTES);
    const c = content(shape, shape, { type: 'shape', attrs: { kind: 'ellipse', width: 50, height: 40 } });
    const assets = new Map<string, Uint8Array>();
    await prepareInsertPictures(c, assets, rasterize);
    expect(rasterize).toHaveBeenCalledTimes(2);
    const calls = rasterize.mock.calls as unknown as Array<[string, number, number]>;
    expect(calls[0][0]).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="120"/);
    expect(calls[0].slice(1)).toEqual([200, 120]);
    expect(assets.has(shapeAssetKey(shape.attrs))).toBe(true);
  });

  it('asks for pictures only of shapes and of equations Word cannot take', () => {
    const needed = picturesNeeded(content(shape, p({ type: 'inlineMath', attrs: { latex: 'x^2' } }), { type: 'blockMath', attrs: { latex: NOT_IN_WORD } }).doc);
    expect([...needed.shapes.keys()]).toEqual([shapeAssetKey(shape.attrs)]);
    expect([...needed.equations.values()]).toEqual([{ latex: NOT_IN_WORD, display: true }]);
  });
});

describe('text boxes in Word', () => {
  const box = (attrs: Record<string, unknown>, inner: JSONContent[] = [p(text('Boxed text'))]): JSONContent => ({ type: 'textBox', attrs: { float: 'inline', width: null, fill: 'none', borderColor: '#64748b', borderWidth: 1, ...attrs }, content: inner });

  it('are one-cell tables with the border, fill and width, and reported', async () => {
    const { xml, report } = await documentXml(content(box({ width: 300, fill: '#f1f5f9', borderColor: '#334155', borderWidth: 2 }), p(text('After'))));
    const table = xml.match(/<w:tbl>.*?<\/w:tbl>/)![0];
    expect(table.match(/<w:tc>/g)).toHaveLength(1);
    expect(table).toContain('Boxed text');
    expect(table).toContain('<w:tblW w:type="dxa" w:w="4500"/>'); // 300 px
    expect(table).toContain('w:fill="F1F5F9"');
    expect(table).toMatch(/<w:top w:val="single" w:color="334155" w:sz="12"\/>/);
    expect(table).toContain('<w:tblLayout w:type="fixed"/>');
    expect(table).not.toContain('w:tblpPr');
    expect(exportToast('Word document', report).message).toBe('Exported Word document. 1 text box was written as a one-cell table.');
  });

  it('floated boxes are floating tables on the left or right with space to the text', async () => {
    const { xml } = await documentXml(content(box({ float: 'right' }), p(text('Wraps round'))));
    expect(xml).toMatch(/<w:tblpPr [^>]*w:tblpXSpec="right"/);
    expect(xml).toMatch(/<w:tblpPr [^>]*w:leftFromText="240"/);
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="3600"/>'); // the 240 px default width of a floated box
    const left = (await documentXml(content(box({ float: 'left' })))).xml;
    expect(left).toMatch(/<w:tblpPr [^>]*w:tblpXSpec="left"/);
  });

  it('keep rich content (headings, lists, pictures, equations) and no border when there is none', async () => {
    const { xml } = await documentXml(
      content(
        box({ borderColor: 'none' }, [
          { type: 'heading', attrs: { level: 3 }, content: [text('Key idea')] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('first'))] }] },
          { type: 'image', attrs: { src: PNG, width: 40, height: 40 } },
          { type: 'blockMath', attrs: { latex: 'a^2+b^2=c^2' } },
        ]),
      ),
    );
    const table = xml.match(/<w:tbl>.*?<\/w:tbl>/)![0];
    expect(table).toContain('Key idea');
    expect(table).toContain('<w:numPr>');
    expect(table).toContain('<w:drawing>');
    expect(table).toContain('<m:oMathPara>');
    expect(table).toMatch(/<w:top w:val="none"/);
  });
});

describe('picture alignment and captions in Word', () => {
  const img = (attrs: Record<string, unknown>) => ({ type: 'image', attrs: { src: PNG, alt: 'Cell', width: 100, height: 80, ...attrs } });

  it('align the picture paragraph and add a Caption-style paragraph under it, kept together', async () => {
    const { xml } = await documentXml(content(img({ align: 'left', caption: 'Figure 1. A plant cell' })));
    expect(xml).toMatch(/<w:p><w:pPr><w:keepNext\/><w:jc w:val="left"\/><\/w:pPr><w:r><w:drawing>/);
    expect(xml).toMatch(/<w:pStyle w:val="Caption"\/>.*<w:jc w:val="left"\/>.*Figure 1\. A plant cell/);
  });

  it('pictures without alignment stay centred, as before, with no caption paragraph', async () => {
    const { xml } = await documentXml(content(img({})));
    expect(xml).toMatch(/<w:p><w:pPr><w:jc w:val="center"\/><\/w:pPr><w:r><w:drawing>/);
    expect(xml).not.toContain('Caption');
    expect((await documentXml(content(img({ align: 'right' })))).xml).toContain('<w:jc w:val="right"/>');
  });
});

describe('plain text', () => {
  it('keeps equations as LaTeX, names shapes, keeps text box content and captions', () => {
    const out = documentToText({
      type: 'doc',
      content: [
        p(text('Energy '), { type: 'inlineMath', attrs: { latex: 'E=mc^2' } }, text('.')),
        { type: 'blockMath', attrs: { latex: '\\int_0^1 x\\,dx' } },
        { type: 'shape', attrs: { kind: 'arrow', text: 'Next' } },
        { type: 'textBox', attrs: { float: 'left' }, content: [p(text('Inside the box'))] },
        { type: 'image', attrs: { src: PNG, alt: 'Cell', caption: 'Figure 1. A cell' } },
      ],
    });
    expect(out).toBe('Energy $E=mc^2$.\n\n$$\\int_0^1 x\\,dx$$\n\n[Shape: Arrow: Next]\n\nInside the box\n\n[Image: Cell]\nFigure 1. A cell\n');
  });
});

describe('unchanged documents', () => {
  it('pngSize reads PNG headers and refuses other bytes', () => {
    expect(pngSize(pngOfSize(30, 20))).toEqual({ width: 30, height: 20 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
