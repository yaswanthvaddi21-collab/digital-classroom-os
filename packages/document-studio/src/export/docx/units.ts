/** Unit and colour conversions shared by the DOCX writers. */
import { NAMED_COLORS } from './colors';

const MM_TO_TWIP = 56.6929;
export const twip = (mm: number) => Math.round(mm * MM_TO_TWIP);
/** CSS pixels (96 per inch) to twips (1440 per inch). */
export const pxToTwip = (px: number) => Math.round(px * 15);

const channel = (v: string) => {
  const n = v.trim().endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v);
  return Math.round(Math.min(255, Math.max(0, n)));
};
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

function hslToHex(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)].map(hex2).join('');
}

/**
 * Normalises CSS colours to the RRGGBB form Word expects: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (numbers
 * or percentages, comma or space separated), hsl()/hsla() and CSS named colours. Transparency is ignored.
 */
export function toHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  const c = color.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,4})$/.exec(c);
  if (m) return m[1].slice(0, 3).split('').map((x) => x + x).join('').toUpperCase();
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(c);
  if (m) return [m[1], m[2], m[3]].map((v) => hex2(channel(v))).join('').toUpperCase();
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(c);
  if (m) return hslToHex(Number(m[1]) % 360, Math.min(1, Number(m[2]) / 100), Math.min(1, Number(m[3]) / 100)).toUpperCase();
  return NAMED_COLORS[c];
}

/** CSS font-size ("14pt", "16px") to Word half-points. */
export function toHalfPoints(size: unknown): number | undefined {
  if (typeof size !== 'string') return undefined;
  const m = /^([\d.]+)\s*(pt|px)?$/.exec(size.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const pt = m[2] === 'px' ? n * 0.75 : n;
  return Math.round(pt * 2);
}

/**
 * Word's "single" line height for Calibri (the document font) is 1.2207 em: ascent + descent + line gap. CSS line
 * heights are multiples of the font size, so a CSS multiple m is Word "multiple" m / 1.2207.
 */
export const CALIBRI_SINGLE = 1.2207;

/**
 * A CSS line-height (unitless "1.5", "150%", "18pt", "24px") as Word paragraph spacing: proportional values become
 * an automatic multiple (240ths of a line); absolute ones an at-least height in twips.
 */
export function toLineSpacing(value: unknown): { line: number; lineRule?: 'atLeast' } | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const m = /^([\d.]+)\s*(%|pt|px)?$/.exec(String(value).trim());
  if (!m || !Number(m[1])) return undefined;
  const n = Number(m[1]);
  if (m[2] === 'pt') return { line: Math.round(n * 20), lineRule: 'atLeast' };
  if (m[2] === 'px') return { line: Math.round(n * 15), lineRule: 'atLeast' };
  const multiple = m[2] === '%' ? n / 100 : n;
  return { line: Math.round((multiple / CALIBRI_SINGLE) * 240) };
}
