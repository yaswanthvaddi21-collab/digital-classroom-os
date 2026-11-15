// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { textStyle } from '../layouts';
import { RICH_EVERYTHING } from '../testFixtures';
import { themeById } from '../themes';
import { richTextFromPlain, type RichTextDoc } from '../types';
import { cellTextBody, lineSpacingPct, linkRels, notesTextBody, paragraphXml, shapeTextBody } from './drawingml';
import { layoutParagraphs, shrinkScale } from './layoutText';
import { helveticaMeasure, pdfFontCanShow, pdfFontOf } from './metrics';
import { listMarker, pointsOf, richParagraphs } from './richRuns';
import { esc } from './xml';

const theme = themeById('classroom')!;
const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(`<root ${A_NS}>${xml}</root>`, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`malformed: ${xml}`);
  return doc;
};

describe('rich text runs', () => {
  it('resolves every mark against the box style and the theme', () => {
    const paras = richParagraphs(RICH_EVERYTHING, textStyle({ fontSize: 20 }), theme);
    const runs = paras[0].runs;
    const by = (text: string) => runs.find((r) => r.text === text)!;
    expect(by('Bold').bold).toBe(true);
    expect(by(' italic').italic).toBe(true);
    expect(by(' underline').underline).toBe(true);
    expect(by(' strike').strike).toBe(true);
    expect(runs.filter((r) => r.text === '2').map((r) => [r.sub, r.sup])).toEqual([[true, false], [false, true]]);
    expect(runs.some((r) => r.kind === 'break')).toBe(true);
    expect(by('a link')).toMatchObject({ href: 'https://example.org/', underline: true, color: theme.colors.hyperlink });
    expect(by(' highlighted').highlight).toBe('#fef08a');
    expect(by(' styled')).toMatchObject({ color: '#dc2626', family: 'Georgia', sizePt: 28 });
    expect(by('Bold')).toMatchObject({ family: 'Arial', sizePt: 20, color: theme.colors.dark1 });
    expect(paras[0].align).toBe('center');
  });

  it('flattens lists with their level, number and start', () => {
    const paras = richParagraphs(RICH_EVERYTHING, textStyle(), theme);
    expect(paras.slice(1).map((p) => [p.runs[0].text, p.list?.kind, p.list?.level, p.list?.number, p.list?.start])).toEqual([
      ['Bullet', 'bullet', 0, 1, 1],
      ['Nested', 'bullet', 1, 1, 1],
      ['Third', 'number', 0, 3, 3],
    ]);
    expect(paras.slice(1).map((p) => listMarker(p.list!))).toEqual(['•', '–', '3.']);
  });

  it('drops unsafe links and unreadable styles', () => {
    const doc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'textStyle', attrs: { color: 'red', fontSize: 'huge' } }] }] }] };
    const r = richParagraphs(doc, textStyle(), theme)[0].runs[0];
    expect(r.href).toBeUndefined();
    expect(r.color).toBe(theme.colors.dark1);
    expect(r.sizePt).toBe(20);
    expect([pointsOf('24pt'), pointsOf('12.5'), pointsOf(18), pointsOf('0pt'), pointsOf('x')]).toEqual([24, 12.5, 18, null, null]);
  });

  it('scales every size for shrink-to-fit', () => {
    const paras = richParagraphs(RICH_EVERYTHING, textStyle({ fontSize: 20 }), theme, 0.5);
    expect(paras[0].runs.find((r) => r.text === ' styled')!.sizePt).toBe(14);
    expect(paras[0].end.sizePt).toBe(10);
  });
});

describe('DrawingML text', () => {
  it('writes one <a:pPr> per paragraph, whatever its runs (PptxGenJS writes one per run)', () => {
    const links = linkRels();
    const xml = shapeTextBody(richParagraphs(RICH_EVERYTHING, textStyle(), theme), { padding: [6, 10, 6, 10], verticalAlign: 'middle', autofit: 'shrink', fontScale: 0.8, lineSpacing: 1.15 }, links);
    const doc = parse(xml);
    for (const p of doc.getElementsByTagName('a:p')) expect(p.getElementsByTagName('a:pPr')).toHaveLength(1);
    expect(doc.getElementsByTagName('a:p')).toHaveLength(4);
    const body = doc.getElementsByTagName('a:bodyPr')[0];
    // 10 px = 95250 EMU, 6 px = 57150 EMU: margins in the right places.
    expect(['lIns', 'tIns', 'rIns', 'bIns', 'anchor'].map((a) => body.getAttribute(a))).toEqual(['95250', '57150', '95250', '57150', 'ctr']);
    expect(body.getElementsByTagName('a:normAutofit')[0].getAttribute('fontScale')).toBe('80000');
    // Run properties: bold, italic, underline, strike, baseline, highlight, font and a link with a relationship.
    expect(xml).toContain('b="1"');
    expect(xml).toContain('i="1"');
    expect(xml).toContain('u="sng"');
    expect(xml).toContain('strike="sngStrike"');
    expect(xml).toContain('baseline="-25000"');
    expect(xml).toContain('baseline="30000"');
    expect(xml).toContain('<a:highlight><a:srgbClr val="FEF08A"/></a:highlight>');
    expect(xml).toContain('<a:latin typeface="Georgia"/>');
    expect(xml).toContain('<a:hlinkClick r:id="rIdDcosL1"/>');
    expect(links.entries).toEqual([{ id: 'rIdDcosL1', url: 'https://example.org/' }]);
    expect(xml).toContain('<a:br>');
    // Bullets, nesting and numbering.
    const ppr = [...doc.getElementsByTagName('a:pPr')];
    expect(ppr[1].getElementsByTagName('a:buChar')[0].getAttribute('char')).toBe('•');
    expect(ppr[2].getAttribute('lvl')).toBe('1');
    expect(ppr[3].getElementsByTagName('a:buAutoNum')[0].getAttribute('startAt')).toBe('3');
    expect(ppr[0].getElementsByTagName('a:buNone')).toHaveLength(1);
  });

  it('writes element children in schema order (ECMA-376 CT_TextParagraphProperties and CT_TextCharacterProperties)', () => {
    const doc = parse(paragraphXml(richParagraphs(RICH_EVERYTHING, textStyle(), theme)[1], 1.15, linkRels()));
    expect([...doc.getElementsByTagName('a:pPr')[0].children].map((c) => c.tagName)).toEqual(['a:lnSpc', 'a:buFont', 'a:buChar']);
    const rich = parse(paragraphXml(richParagraphs(RICH_EVERYTHING, textStyle(), theme)[0], 1.15, linkRels()));
    const link = [...rich.getElementsByTagName('a:rPr')].find((r) => r.getElementsByTagName('a:hlinkClick').length)!;
    expect([...link.children].map((c) => c.tagName)).toEqual(['a:solidFill', 'a:latin', 'a:ea', 'a:cs', 'a:hlinkClick']);
    const hl = [...rich.getElementsByTagName('a:rPr')].find((r) => r.getElementsByTagName('a:highlight').length)!;
    expect([...hl.children].map((c) => c.tagName)).toEqual(['a:solidFill', 'a:highlight', 'a:latin', 'a:ea', 'a:cs']);
  });

  it('writes autofit, cell and notes bodies', () => {
    const paras = richParagraphs(richTextFromPlain('One\nTwo\nThree'), textStyle(), theme);
    expect(shapeTextBody(paras, { padding: [0, 0, 0, 0], verticalAlign: 'top', autofit: 'resize', lineSpacing: 1 }, null)).toContain('<a:spAutoFit/>');
    expect(shapeTextBody(paras, { padding: [0, 0, 0, 0], verticalAlign: 'bottom', autofit: 'none', lineSpacing: 1 }, null)).toMatch(/anchor="b"><\/a:bodyPr>/);
    expect(shapeTextBody(paras, { padding: [0, 0, 0, 0], verticalAlign: 'top', autofit: 'shrink', fontScale: 1, lineSpacing: 1 }, null)).toContain('<a:normAutofit/>');
    expect(cellTextBody(paras, 1.15, null)).toMatch(/^<a:txBody><a:bodyPr\/><a:lstStyle\/>/);
    // Three-line notes are three paragraphs (PptxGenJS writes one run with line breaks inside <a:t>).
    expect(parse(notesTextBody(paras, null)).getElementsByTagName('a:p')).toHaveLength(3);
  });

  it('escapes text and drops characters XML cannot hold', () => {
    const xml = paragraphXml(richParagraphs(richTextFromPlain('a < b & "c" \u0001'), textStyle(), theme)[0], 1, null);
    expect(xml).toContain('<a:t>a &lt; b &amp; &quot;c&quot; </a:t>');
    expect(esc('x\u0000\u0008y\ud800')).toBe('xy');
  });

  it('maps CSS line height to PowerPoint line spacing (100 % ≈ 1.15 em)', () => {
    expect([lineSpacingPct(1.15), lineSpacingPct(1), lineSpacingPct(2.3)]).toEqual([100000, 86957, 200000]);
  });
});

describe('text layout', () => {
  const measure = helveticaMeasure;
  it('wraps words to the width, breaks overlong words and aligns lines', () => {
    const style = textStyle({ fontSize: 12, align: 'left' });
    const paras = richParagraphs(richTextFromPlain('The quick brown fox jumps over the lazy dog'), style, theme);
    const narrow = layoutParagraphs(paras, 100, 1.2, measure);
    expect(narrow.lines.length).toBeGreaterThan(2);
    for (const line of narrow.lines) for (const f of line.fragments) expect(f.x + measure(f.text.trimEnd(), { family: 'Arial', sizePx: f.sizePx })).toBeLessThanOrEqual(100.5);
    expect(narrow.lines.map((l) => l.fragments.map((f) => f.text).join('')).join(' ').replace(/\s+/g, ' ').trim()).toBe('The quick brown fox jumps over the lazy dog');
    const long = layoutParagraphs(richParagraphs(richTextFromPlain('Supercalifragilisticexpialidocious'), style, theme), 60, 1.2, measure);
    expect(long.lines.length).toBeGreaterThan(1);
    const centred = layoutParagraphs(richParagraphs(richTextFromPlain('Hi'), textStyle({ fontSize: 12, align: 'center' }), theme), 200, 1.2, measure);
    const f = centred.lines[0].fragments[0];
    expect(f.x + f.width / 2).toBeCloseTo(100, 0);
    // Line height = size × spacing (16 px × 1.2).
    expect(centred.height).toBeCloseTo(19.2, 5);
  });

  it('indents lists and draws their markers', () => {
    const layout = layoutParagraphs(richParagraphs(RICH_EVERYTHING, textStyle({ fontSize: 12 }), theme), 400, 1.2, measure);
    const markers = layout.lines.flatMap((l) => l.fragments).filter((f) => ['•', '–', '3.'].includes(f.text));
    expect(markers.map((m) => m.text)).toEqual(['•', '–', '3.']);
    const bullet = layout.lines.find((l) => l.fragments.some((f) => f.text === 'Bullet'))!.fragments.find((f) => f.text === 'Bullet')!;
    const nested = layout.lines.find((l) => l.fragments.some((f) => f.text === 'Nested'))!.fragments.find((f) => f.text === 'Nested')!;
    expect(nested.x).toBeGreaterThan(bullet.x);
  });

  it('finds the shrink scale at which text fits its box', () => {
    const style = textStyle({ fontSize: 40, autofit: 'shrink', lineSpacing: 1.2 });
    const doc = richTextFromPlain('A long title that cannot fit in a small box at forty points');
    expect(shrinkScale(doc, style, theme, 900, 400, measure)).toBe(1);
    const s = shrinkScale(doc, style, theme, 200, 80, measure);
    expect(s).toBeLessThan(1);
    expect(layoutParagraphs(richParagraphs(doc, style, theme, s), 200, 1.2, measure).height).toBeLessThanOrEqual(80.5);
    expect(shrinkScale(doc, style, theme, 10, 2, measure)).toBe(0.25);
  });
});

describe('PDF fonts', () => {
  it('maps slide fonts to the PDF standard fonts and knows what they can show', () => {
    expect(['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas'].map(pdfFontOf)).toEqual(['helvetica', 'helvetica', 'times', 'times', 'courier', 'courier']);
    expect(pdfFontCanShow('Café – “quotes” €')).toBe(true);
    expect(pdfFontCanShow('Ελληνικά')).toBe(false);
    expect(pdfFontCanShow('日本')).toBe(false);
  });
});
