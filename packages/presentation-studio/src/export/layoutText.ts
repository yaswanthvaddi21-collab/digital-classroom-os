/**
 * Line layout of rich text for the PDF (SVG text lines) and for the 'shrink text on overflow' scale written into
 * both exports. Pure: widths come from an injected Measure (jsPDF's own font metrics in the PDF, the browser's in the
 * PPTX scale). Follows the slide renderer's CSS: line height = font size × line spacing, half-leading above and below,
 * lists indented by 1.2 em (bullets) or 1.4 em (numbers) per level.
 */
import type { PresentationTheme, RichTextDoc, TextStyle } from '../types';
import type { Measure } from './metrics';
import { listMarker, richParagraphs, type TextParagraph, type TextRun } from './richRuns';

const PT = 96 / 72;

export interface TextFragment {
  /** Left edge in px from the text area's left. */
  x: number;
  width: number;
  text: string;
  run: TextRun;
  /** Baseline shift in px (negative = up), for superscript and subscript. */
  shift: number;
  /** Drawn size in px. */
  sizePx: number;
}

export interface TextLine {
  /** Top of the line box, from the text area's top. */
  top: number;
  height: number;
  /** Baseline, from the text area's top. */
  baseline: number;
  fragments: TextFragment[];
}

export interface TextLayout {
  lines: TextLine[];
  height: number;
}

const sizeOf = (r: TextRun) => r.sizePt * PT;
const drawnSize = (r: TextRun) => sizeOf(r) * (r.sub || r.sup ? 0.75 : 1);
const fontOf = (r: TextRun) => ({ family: r.family, sizePx: drawnSize(r), bold: r.bold, italic: r.italic });

/** Splits text into words and the spaces after them, keeping every character. */
function tokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Lays out paragraphs in a text area `width` px wide. */
export function layoutParagraphs(paras: TextParagraph[], width: number, lineSpacing: number, measure: Measure): TextLayout {
  const lines: TextLine[] = [];
  let y = 0;
  const avail = Math.max(1, width);
  for (const p of paras) {
    const first = p.runs.find((r) => r.kind === 'text') ?? p.end;
    const em = first.sizePt * PT;
    const indent = p.list ? (p.list.level + 1) * (p.list.kind === 'number' ? 1.4 : 1.2) * em : 0;
    const lineWidth = Math.max(1, avail - indent);
    type Piece = { text: string; run: TextRun; width: number };
    // Each line: its pieces (merged per run later).
    let current: Piece[] = [];
    let used = 0;
    const paraLines: Piece[][] = [];
    const flush = () => {
      // Trailing spaces do not take room at the end of a line.
      const last = current[current.length - 1];
      if (last) {
        const trimmed = last.text.replace(/\s+$/, '');
        if (trimmed !== last.text) {
          const w = trimmed ? measure(trimmed, fontOf(last.run)) : 0;
          used -= last.width - w;
          current[current.length - 1] = { ...last, text: trimmed, width: w };
        }
      }
      paraLines.push(current);
      current = [];
      used = 0;
    };
    for (const r of p.runs) {
      if (r.kind === 'break') {
        current.push({ text: '', run: r, width: 0 });
        flush();
        continue;
      }
      for (const tok of tokens(r.text)) {
        const w = measure(tok, fontOf(r));
        const visible = measure(tok.replace(/\s+$/, ''), fontOf(r));
        if (used + visible <= lineWidth + 0.01 || used === 0) {
          if (visible > lineWidth && used === 0) {
            // A word longer than the line is broken between characters.
            let piece = '';
            for (const ch of tok) {
              const next = piece + ch;
              if (piece && measure(next.trimEnd(), fontOf(r)) > lineWidth) {
                current.push({ text: piece, run: r, width: measure(piece, fontOf(r)) });
                flush();
                piece = ch;
              } else piece = next;
            }
            if (piece) {
              const pw = measure(piece, fontOf(r));
              current.push({ text: piece, run: r, width: pw });
              used += pw;
            }
            continue;
          }
          current.push({ text: tok, run: r, width: w });
          used += w;
        } else {
          flush();
          current.push({ text: tok, run: r, width: w });
          used += w;
        }
      }
    }
    if (current.length || !paraLines.length) flush();
    paraLines.forEach((pieces, li) => {
      const runs = pieces.filter((x) => x.run.kind === 'text');
      const maxSize = runs.length ? Math.max(...runs.map((x) => sizeOf(x.run))) : p.end.sizePt * PT;
      const height = maxSize * lineSpacing;
      const baseline = y + (height - maxSize) / 2 + maxSize * 0.8;
      const total = pieces.reduce((a, x) => a + x.width, 0);
      const offset = p.align === 'center' ? (lineWidth - total) / 2 : p.align === 'right' ? lineWidth - total : 0;
      let x = indent + Math.max(0, offset);
      const fragments: TextFragment[] = [];
      if (li === 0 && p.list?.marker) {
        const marker = listMarker(p.list);
        const mRun: TextRun = { ...(runs[0]?.run ?? { kind: 'text', text: '', underline: false, strike: false, sub: false, sup: false, ...p.end }), underline: false, strike: false, href: undefined, highlight: undefined, sub: false, sup: false };
        const mw = measure(marker, fontOf(mRun));
        const markerX = indent - (p.list.kind === 'number' ? 1.4 : 1.2) * em * 0.85;
        fragments.push({ x: Math.max(0, markerX), width: mw, text: marker, run: mRun, shift: 0, sizePx: drawnSize(mRun) });
      }
      for (const piece of pieces) {
        if (piece.run.kind === 'text' && piece.text) {
          const shift = piece.run.sup ? -sizeOf(piece.run) * 0.35 : piece.run.sub ? sizeOf(piece.run) * 0.15 : 0;
          // Neighbouring pieces of one run are drawn as one string.
          const prev = fragments[fragments.length - 1];
          if (prev && prev.run === piece.run && Math.abs(prev.x + prev.width - x) < 0.01) {
            prev.text += piece.text;
            prev.width += piece.width;
          } else fragments.push({ x, width: piece.width, text: piece.text, run: piece.run, shift, sizePx: drawnSize(piece.run) });
        }
        x += piece.width;
      }
      lines.push({ top: y, height, baseline, fragments });
      y += height;
    });
  }
  return { lines, height: y };
}

/**
 * The 'shrink text on overflow' scale (at most 1, at least 0.25) at which the text fits a box `width` × `height` px
 * (the text area, inside the padding): the font sizes are scaled and the text laid out again, as PowerPoint's
 * normAutofit fontScale does.
 */
export function shrinkScale(doc: RichTextDoc | undefined, style: TextStyle, theme: PresentationTheme, width: number, height: number, measure: Measure): number {
  if (!(height > 0)) return 1;
  let s = 1;
  for (let i = 0; i < 40; i++) {
    const h = layoutParagraphs(richParagraphs(doc, style, theme, s), width, style.lineSpacing, measure).height;
    if (h <= height + 0.5 || s <= 0.25) break;
    s = Math.max(0.25, Math.round((s - 0.025) * 1000) / 1000);
  }
  return s;
}
