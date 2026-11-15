/**
 * Text measuring for the exports. The PDF uses jsPDF's standard fonts (Helvetica, Times, Courier), so its text is laid
 * out with those fonts' own metrics (jsPDF's getStringUnitWidth, see pdf.ts). The PPTX's 'shrink text on overflow'
 * scale is worked out with the browser's own font metrics (a canvas), as the editor does, and falls back to Helvetica
 * metrics where there is no canvas (tests).
 */

/** A font to measure with: the family name from the slide (Arial, Georgia…), the size in px and the style. */
export interface FontSpec {
  family: string;
  sizePx: number;
  bold?: boolean;
  italic?: boolean;
}

/** Width of `text` in px. */
export type Measure = (text: string, font: FontSpec) => number;

/** The PDF standard font a slide font is drawn with. Serif families use Times, monospaced ones Courier. */
export type PdfFont = 'helvetica' | 'times' | 'courier';
export function pdfFontOf(family: string): PdfFont {
  if (/courier|mono|consolas|menlo/i.test(family)) return 'courier';
  if (/georgia|times|garamond|cambria|palatino|book antiqua|serif/i.test(family) && !/sans/i.test(family)) return 'times';
  return 'helvetica';
}

/** Whether a font family is drawn in the PDF with a font of different shape (anything but Arial/Helvetica, Times, Courier). */
export const pdfSubstitutes = (family: string) => !/^(arial|helvetica|times new roman|times|courier new|courier)$/i.test(family.trim());

/** Helvetica advance widths in 1/1000 em for ASCII 32–126 (Adobe's Helvetica AFM; Arial has the same widths). */
// prettier-ignore
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
/** Helvetica-Bold advance widths for ASCII 32–126. */
// prettier-ignore
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\ud800-\udbff][\udc00-\udfff]/;

function charWidth(ch: string, table: number[]): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return table[code - 32];
  if (WIDE.test(ch)) return 1000;
  const base = ch.normalize('NFD')[0];
  const b = base.charCodeAt(0);
  if (base !== ch && b >= 32 && b <= 126) return table[b - 32];
  return 556;
}

/** Width in px with Helvetica metrics (Courier: 0.6 em per character). Deterministic; used where there is no canvas. */
export const helveticaMeasure: Measure = (text, font) => {
  if (pdfFontOf(font.family) === 'courier') return [...text].length * 0.6 * font.sizePx;
  const table = font.bold ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const ch of text) w += charWidth(ch, table);
  return (w / 1000) * font.sizePx;
};

/** The browser's own widths (the fonts the editor draws with), or Helvetica metrics without a canvas. */
export function browserMeasure(): Measure {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    if (typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return helveticaMeasure;
  const c = ctx;
  return (text, font) => {
    const generic = pdfFontOf(font.family) === 'courier' ? 'monospace' : pdfFontOf(font.family) === 'times' ? 'serif' : 'sans-serif';
    c.font = `${font.italic ? 'italic ' : ''}${font.bold ? '700 ' : ''}${font.sizePx}px "${font.family.replace(/["\\]/g, '')}", ${generic}`;
    const w = c.measureText(text).width;
    return Number.isFinite(w) && w >= 0 ? w : helveticaMeasure(text, font);
  };
}

/** Characters jsPDF's standard fonts (WinAnsi encoding) can show: Latin-1 plus the typographic marks of cp1252. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function pdfFontCanShow(text: string): boolean {
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch.length > 1 || (c > 0xff && !WIN_ANSI_EXTRA.has(ch)) || (c >= 0x80 && c < 0xa0)) return false;
  }
  return true;
}
