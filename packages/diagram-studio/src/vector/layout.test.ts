/** Text measuring and line breaking, path geometry and PDF page planning for the vector exports (pure functions). */
import { describe, expect, it } from 'vitest';
import { flattenPath, pathBounds, pathEnds, pathLength, pointAlong } from './pathGeometry';
import { MAX_PAGE_SIDE, MAX_TILES, PAGE_MARGIN, PAGE_SIZES, planPdf, PT_PER_PX } from './pdf';
import { baselineOffset, ellipsize, labelBox, measureText, pdfFontCanShow, wrapText } from './textLayout';

describe('measureText', () => {
  it('uses Helvetica widths (1/1000 em), bold and monospace', () => {
    // H 722 + e 556 + l 222 + l 222 + o 556 = 2278 units.
    expect(measureText('Hello', { size: 10 })).toBeCloseTo(22.78);
    // Bold: H 722 + e 556 + l 278 + l 278 + o 611 = 2445.
    expect(measureText('Hello', { size: 10, bold: true })).toBeCloseTo(24.45);
    expect(measureText('abc', { size: 10, mono: true })).toBeCloseTo(18);
  });
  it('treats accented letters as their base letter and wide characters as a full em', () => {
    expect(measureText('é', { size: 10 })).toBeCloseTo(measureText('e', { size: 10 }));
    expect(measureText('図', { size: 10 })).toBeCloseTo(10);
  });
});

describe('wrapText', () => {
  const font = { size: 14 };
  it('keeps a short label on one line and always breaks at newlines', () => {
    expect(wrapText('Start', 100, font)).toEqual(['Start']);
    expect(wrapText('One\nTwo', 100, font)).toEqual(['One', 'Two']);
    expect(wrapText('', 100, font)).toEqual(['']);
  });
  it('breaks between words so each line fits', () => {
    const lines = wrapText('Read the number and decide what to do', 100, font);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(measureText(l, font)).toBeLessThanOrEqual(100);
    expect(lines.join(' ')).toBe('Read the number and decide what to do');
  });
  it('splits a word longer than the line (break-word)', () => {
    const lines = wrapText('Supercalifragilisticexpialidocious', 60, font);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Supercalifragilisticexpialidocious');
    for (const l of lines) expect(measureText(l, font)).toBeLessThanOrEqual(60);
  });
  it('shortens a line with an ellipsis', () => {
    expect(ellipsize('short', 200, font)).toBe('short');
    const s = ellipsize('a very long attribute name: Type', 80, { size: 12, mono: true });
    expect(s.endsWith('…')).toBe(true);
    expect(measureText(s, { size: 12, mono: true })).toBeLessThanOrEqual(80);
  });
});

describe('labelBox (the canvas label inset)', () => {
  it('reads one to four CSS values in px and %', () => {
    expect(labelBox({ inset: '6px 10px' }, 160, 70)).toEqual({ x: 10, y: 6, width: 140, height: 58 });
    expect(labelBox({ inset: '22% 18%' }, 100, 200)).toEqual({ x: 18, y: 44, width: 64, height: 112 });
    expect(labelBox({ inset: '22% 8% 10% 8%' }, 100, 100)).toEqual({ x: 8, y: 22, width: 84, height: 68 });
    expect(labelBox({ inset: '0' }, 50, 40)).toEqual({ x: 0, y: 0, width: 50, height: 40 });
  });
  it('honours auto and a fixed height (the actor label below the figure)', () => {
    expect(labelBox({ inset: 'auto 0 0 0', height: 22 }, 70, 110)).toEqual({ x: 0, y: 88, width: 70, height: 22 });
  });
  it('places the baseline like a browser centres text in its line box', () => {
    expect(baselineOffset(14, 17.5)).toBeCloseTo((17.5 - 1.117 * 14) / 2 + 0.905 * 14);
  });
});

describe('pdfFontCanShow', () => {
  it('accepts Latin-1 and the cp1252 marks, and refuses the rest', () => {
    expect(pdfFontCanShow('Café – “quoted” €5…')).toBe(true);
    expect(pdfFontCanShow('Ωmega')).toBe(false);
    expect(pdfFontCanShow('図')).toBe(false);
    expect(pdfFontCanShow('😀')).toBe(false);
  });
});

describe('path geometry', () => {
  it('flattens React Flow paths (lines and rounded corners)', () => {
    const d = 'M195 305L 105,305Q 100,305 100,310L100 415';
    const [poly] = flattenPath(d);
    expect(poly[0]).toEqual({ x: 195, y: 305 });
    expect(poly[poly.length - 1]).toEqual({ x: 100, y: 415 });
    expect(pathBounds(d)).toEqual({ minX: 100, minY: 305, maxX: 195, maxY: 415 });
  });
  it('finds the point a fraction along and the direction at each end', () => {
    expect(pathLength('M0 0L100 0')).toBe(100);
    expect(pointAlong('M0 0L100 0L100 100', 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAlong('M0 0L100 0L100 100', 0.75)).toEqual({ x: 100, y: 50 });
    const ends = pathEnds('M0 0L100 0L100 100')!;
    expect(ends.start).toEqual({ x: 0, y: 0 });
    expect(ends.startAngle).toBe(0);
    expect(ends.end).toEqual({ x: 100, y: 100 });
    expect(ends.endAngle).toBe(90);
  });
  it('handles cubic curves, relative commands and closing', () => {
    const ends = pathEnds('M0,0 C50,0 50,100 100,100')!;
    expect(ends.endAngle).toBeCloseTo(0, 0);
    expect(pathBounds('m10 10 h20 v20 z')).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 30 });
  });
});

describe('planPdf', () => {
  it('fits the page to the diagram at 0.75 pt per pixel', () => {
    const p = planPdf(800, 600);
    expect(p).toMatchObject({ pageWidth: 600, pageHeight: 450, scale: PT_PER_PX, cols: 1, rows: 1, notes: [] });
    expect(p.pages).toEqual([{ x: 0, y: 0 }]);
  });
  it('scales a diagram larger than the biggest PDF page and says so', () => {
    const p = planPdf(40_000, 1_000);
    expect(p.pageWidth).toBeCloseTo(MAX_PAGE_SIDE);
    expect(p.notes[0]).toMatch(/scaled to 48%/);
  });
  it('fits a large diagram on one A4 page, landscape for a wide diagram, and says how much it shrank', () => {
    const p = planPdf(2000, 1000, { page: 'a4' });
    expect(p.pageWidth).toBeCloseTo(PAGE_SIZES.a4.height);
    expect(p.pageHeight).toBeCloseTo(PAGE_SIZES.a4.width);
    expect(p.scale).toBeCloseTo((PAGE_SIZES.a4.height - 2 * PAGE_MARGIN) / 2000);
    expect(p.pages).toHaveLength(1);
    expect(p.notes[0]).toMatch(/scaled to \d+% to fit one A4 landscape page/);
  });
  it('does not enlarge a small diagram, and centres it', () => {
    const p = planPdf(200, 100, { page: 'letter', orientation: 'portrait' });
    expect(p.scale).toBe(PT_PER_PX);
    expect(p.pageWidth).toBe(612);
    expect(p.pages[0].x).toBeCloseTo((612 - 150) / 2);
    expect(p.notes).toEqual([]);
  });
  it('splits a large diagram across pages at actual size, each page showing its own part', () => {
    const availW = PAGE_SIZES.a4.width - 2 * PAGE_MARGIN;
    const availH = PAGE_SIZES.a4.height - 2 * PAGE_MARGIN;
    const width = ((availW * 2.5) / PT_PER_PX) | 0;
    const height = ((availH * 1.5) / PT_PER_PX) | 0;
    const p = planPdf(width, height, { page: 'a4', orientation: 'portrait', mode: 'actual-size' }, { x: -40, y: -40 });
    expect(p).toMatchObject({ cols: 3, rows: 2, scale: PT_PER_PX });
    expect(p.pages).toHaveLength(6);
    expect(p.pages[0]).toMatchObject({ x: PAGE_MARGIN, y: PAGE_MARGIN, clip: { x: PAGE_MARGIN, y: PAGE_MARGIN, width: availW, height: availH } });
    expect(p.pages[1].x).toBeCloseTo(PAGE_MARGIN - availW);
    expect(p.pages[3].y).toBeCloseTo(PAGE_MARGIN - availH);
    expect(p.pages[4].region!.x).toBeCloseTo(-40 + availW / PT_PER_PX);
    expect(p.pages[4].region!.y).toBeCloseTo(-40 + availH / PT_PER_PX);
    expect(p.notes[0]).toBe('It was split across 6 A4 portrait pages (3 across, 2 down) at actual size.');
  });
  it('keeps a diagram that fits one page at actual size on one centred page', () => {
    const p = planPdf(300, 200, { page: 'a4', mode: 'actual-size' });
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].clip).toBeUndefined();
    expect(p.notes).toEqual([]);
  });
  it('refuses an absurd number of pages with a sentence that says what to choose instead', () => {
    expect(() => planPdf(60_000, 60_000, { page: 'a4', mode: 'actual-size' })).toThrow(new RegExp(`more than ${MAX_TILES}.*Fit to one page`));
  });
});
