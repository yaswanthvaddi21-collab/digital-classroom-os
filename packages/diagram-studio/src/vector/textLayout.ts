/**
 * Text measuring and line breaking for the vector exports (SVG and PDF). Pure and deterministic: widths come from
 * the metrics of Helvetica / Arial (the two are metric-compatible) and Courier, the fonts the exports name, rather
 * than from the browser. So the same diagram always breaks its labels the same way, in a test, in Chromium and in
 * Safari, and the PDF (whose built-in fonts are exactly Helvetica and Courier) fits its text precisely.
 *
 * The canvas itself draws labels in Inter, which is slightly wider; a label that only just fits on one line on the
 * canvas can fit on one line here too, but never the other way round by more than a word. Documented in
 * docs/adr/0012 (exports) and the export notes.
 */

/** Font families written into exported SVG. Viewers without Helvetica use Arial, then their own sans-serif. */
export const SANS_FAMILY = 'Helvetica, Arial, sans-serif';
/** Monospace: the canvas's fonts first; every one of them is close to Courier's 0.6 em per character. */
export const MONO_FAMILY = "ui-monospace, Menlo, Consolas, 'Courier New', Courier, monospace";

/** Helvetica advance widths in 1/1000 em for ASCII 32–126 (Adobe's Helvetica AFM; Arial has the same widths). */
// prettier-ignore
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space ! " # $ % & ' ( ) * + , - . /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0-9 : ; < = > ?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ A-O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P-Z [ \ ] ^ _
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` a-o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // p-z { | } ~
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

/** Wide characters (CJK, Hangul, full-width forms, emoji) take a full em. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\ud800-\udbff][\udc00-\udfff]/;

export interface FontSpec {
  size: number;
  bold?: boolean;
  mono?: boolean;
}

function charWidth(ch: string, table: number[]): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return table[code - 32];
  if (ch === '\t') return table[0] * 4;
  if (WIDE.test(ch)) return 1000;
  // Accented Latin letters are as wide as their base letter (é as e, Ç as C).
  const base = ch.normalize('NFD')[0];
  const b = base.charCodeAt(0);
  if (base !== ch && b >= 32 && b <= 126) return table[b - 32];
  return 556;
}

/** Width of `text` in pixels. */
export function measureText(text: string, font: FontSpec): number {
  if (font.mono) return [...text].length * 0.6 * font.size;
  const table = font.bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of text) units += charWidth(ch, table);
  return (units / 1000) * font.size;
}

/**
 * Breaks a label into lines that fit `maxWidth`, like the canvas's CSS (`white-space: pre-wrap; word-break:
 * break-word`): newlines always break, lines break between words, and a word longer than the line is split.
 */
export function wrapText(text: string, maxWidth: number, font: FontSpec): string[] {
  const lines: string[] = [];
  const fits = (s: string) => measureText(s.trimEnd(), font) <= maxWidth;
  for (const paragraph of text.split('\n')) {
    if (maxWidth <= 0) {
      lines.push(paragraph);
      continue;
    }
    // Words keep their trailing spaces; a space at the end of a line hangs (does not count toward its width).
    const tokens = paragraph.match(/\S+\s*|\s+/g) ?? [''];
    let line = '';
    /** Starts a line with `token`, splitting a word longer than the line at its characters (break-word). */
    const place = (token: string) => {
      const word = token.trimEnd();
      if (fits(word)) {
        line = token;
        return;
      }
      let part = '';
      for (const ch of word) {
        if (part && !fits(part + ch)) {
          lines.push(part);
          part = '';
        }
        part += ch;
      }
      line = part + token.slice(word.length);
    };
    for (const token of tokens) {
      if (line === '') place(token);
      else if (fits(line + token)) line += token;
      else {
        lines.push(line.trimEnd());
        line = '';
        place(token);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Shortens `text` with an ellipsis so it fits `maxWidth` (CSS `text-overflow: ellipsis`). */
export function ellipsize(text: string, maxWidth: number, font: FontSpec): string {
  if (measureText(text, font) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && measureText(`${chars.join('')}…`, font) > maxWidth) chars.pop();
  return chars.length ? `${chars.join('')}…` : '';
}

/**
 * Where the baseline of a line sits below the top of its line box, for a CSS line height. Uses Arial's ascent and
 * descent (0.905 / 0.212 em), the way a browser centres the glyphs in the line box. SVG text is positioned by its
 * baseline, and not every viewer honours `dominant-baseline`, so the exports compute it.
 */
export function baselineOffset(fontSize: number, lineHeight: number): number {
  return (lineHeight - 1.117 * fontSize) / 2 + 0.905 * fontSize;
}

/** A box inside a shape: where its label goes. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One CSS length (px, %, a bare number, or `auto`), relative to `of` for percentages. */
function cssLength(v: string | number | undefined, of: number): number | null {
  if (v === undefined || v === 'auto') return null;
  if (typeof v === 'number') return v;
  const s = v.trim();
  if (s === 'auto') return null;
  if (s.endsWith('%')) return (parseFloat(s) / 100) * of;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The label box of a shape from its CSS label inset (shapeRegistry `labelInset`, for example `'22% 18%'` or
 * `{ inset: 'auto 0 0 0', height: 22 }`), the way the canvas positions `.dcos-shape-label` absolutely.
 */
export function labelBox(style: Record<string, unknown>, w: number, h: number): Box {
  const parts = typeof style.inset === 'string' ? style.inset.trim().split(/\s+/) : typeof style.inset === 'number' ? [String(style.inset)] : ['0'];
  const [t, r = t, b = t, l = r] = parts;
  const pick = (key: string, fallback: string) => (style[key] as string | number | undefined) ?? fallback;
  const top = cssLength(pick('top', t), h);
  const right = cssLength(pick('right', r), w);
  const bottom = cssLength(pick('bottom', b), h);
  const left = cssLength(pick('left', l), w);
  const fixedW = cssLength(style.width as string | number | undefined, w);
  const fixedH = cssLength(style.height as string | number | undefined, h);
  const resolve = (start: number | null, end: number | null, size: number | null, total: number): [number, number] => {
    if (size !== null) {
      if (start !== null) return [start, size];
      if (end !== null) return [total - end - size, size];
      return [0, size];
    }
    const s = start ?? 0;
    const e = end ?? 0;
    return [s, Math.max(0, total - s - e)];
  };
  const [x, width] = resolve(left, right, fixedW, w);
  const [y, height] = resolve(top, bottom, fixedH, h);
  // Padding (shorthand, then the single sides) shrinks the area the text is laid out in.
  const pad = typeof style.padding === 'string' ? style.padding.trim().split(/\s+/) : style.padding !== undefined ? [String(style.padding)] : ['0'];
  const [pt, pr = pt, pb = pt, pl = pr] = pad;
  const p = (key: string, fallback: string, of: number) => cssLength((style[key] as string | number | undefined) ?? fallback, of) ?? 0;
  // Percent padding is relative to the containing block's width, on every side (CSS).
  const padTop = p('paddingTop', pt, w);
  const padRight = p('paddingRight', pr, w);
  const padBottom = p('paddingBottom', pb, w);
  const padLeft = p('paddingLeft', pl, w);
  return { x: x + padLeft, y: y + padTop, width: Math.max(0, width - padLeft - padRight), height: Math.max(0, height - padTop - padBottom) };
}

/** Characters jsPDF's built-in fonts (WinAnsi encoding) can show: Latin-1 plus the typographic marks of cp1252. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function pdfFontCanShow(text: string): boolean {
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch.length > 1 || (c > 0xff && !WIN_ANSI_EXTRA.has(ch)) || (c >= 0x80 && c < 0xa0)) return false;
  }
  return true;
}
