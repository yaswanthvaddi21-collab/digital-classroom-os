/**
 * Slide rich text (the frozen schema-1 Tiptap vocabulary) flattened into paragraphs of styled runs, with every style
 * resolved against the text box style and the theme. Both exports start from this: the PPTX writes each paragraph as
 * one DrawingML <a:p> (drawingml.ts), the PDF lays the runs out in lines (layoutText.ts). Pure.
 */
import { safeHref } from '../render/RichText';
import { resolveColor, resolveFont } from '../themes';
import type { PresentationTheme, RichBlock, RichInline, RichListItem, RichTextDoc, TextAlign, TextStyle } from '../types';

export interface TextRun {
  /** A piece of text, or a line break inside the paragraph (Shift+Enter). */
  kind: 'text' | 'break';
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  /** '#rrggbb' */
  color: string;
  /** Font family name. */
  family: string;
  /** Points. */
  sizePt: number;
  /** A safe absolute link (http, https, mailto). */
  href?: string;
  /** '#rrggbb' highlight. */
  highlight?: string;
}

export interface TextParagraph {
  runs: TextRun[];
  align: TextAlign;
  /** A list paragraph: its marker, nesting level (0 = top) and number (ordered lists). `marker: false` continues an
   *  item's earlier paragraph (indented, without a marker of its own). */
  list?: { kind: 'bullet' | 'number'; level: number; number: number; start: number; marker: boolean };
  /** The style of the paragraph's end (its size, for an empty line). */
  end: Pick<TextRun, 'family' | 'sizePt' | 'color' | 'bold' | 'italic'>;
}

/** Points from a stored font size ('24pt' or a number of points); null when unreadable. */
export function pointsOf(value: unknown): number | null {
  const m = typeof value === 'string' ? /^(\d+(?:\.\d+)?)(pt)?$/.exec(value.trim()) : null;
  const pt = typeof value === 'number' ? value : m ? Number(m[1]) : NaN;
  return Number.isFinite(pt) && pt > 0 && pt < 1000 ? pt : null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Flattens rich text into paragraphs. `scale` multiplies every font size (the shrink-to-fit factor). */
export function richParagraphs(doc: RichTextDoc | undefined, style: TextStyle, theme: PresentationTheme, scale = 1): TextParagraph[] {
  const base = {
    family: resolveFont(style.font, theme),
    sizePt: style.fontSize,
    color: resolveColor(style.color, theme),
    bold: !!style.bold,
    italic: !!style.italic,
  };
  const out: TextParagraph[] = [];
  const runsOf = (nodes: RichInline[] | undefined): TextRun[] => {
    const runs: TextRun[] = [];
    for (const n of nodes ?? []) {
      const r: TextRun = { kind: n.type === 'hardBreak' ? 'break' : 'text', text: n.type === 'text' ? n.text : '', ...base, sizePt: base.sizePt * scale, underline: false, strike: false, sub: false, sup: false };
      if (n.type === 'text') {
        for (const m of n.marks ?? []) {
          switch (m.type) {
            case 'bold':
              r.bold = true;
              break;
            case 'italic':
              r.italic = true;
              break;
            case 'underline':
              r.underline = true;
              break;
            case 'strike':
              r.strike = true;
              break;
            case 'subscript':
              r.sub = true;
              break;
            case 'superscript':
              r.sup = true;
              break;
            case 'link': {
              const href = safeHref(m.attrs?.href);
              if (href) {
                r.href = href;
                r.underline = true;
                r.color = resolveColor({ theme: 'hyperlink' }, theme);
              }
              break;
            }
            case 'highlight': {
              const c = m.attrs?.color;
              r.highlight = typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : '#fef08a';
              break;
            }
            case 'textStyle': {
              const a = m.attrs ?? {};
              if (typeof a.color === 'string' && HEX.test(a.color) && !r.href) r.color = a.color.toLowerCase();
              if (typeof a.fontFamily === 'string' && a.fontFamily.trim()) r.family = a.fontFamily.trim();
              const pt = pointsOf(a.fontSize);
              if (pt) r.sizePt = pt * scale;
              break;
            }
          }
        }
      }
      runs.push(r);
    }
    return runs;
  };
  const paragraph = (p: Extract<RichBlock, { type: 'paragraph' }>, list?: TextParagraph['list']) => {
    const align = (p.attrs?.textAlign ?? style.align) as TextAlign;
    out.push({ runs: runsOf(p.content), align: ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left', ...(list ? { list } : {}), end: { ...base, sizePt: base.sizePt * scale } });
  };
  const walk = (b: RichBlock, level: number) => {
    if (b.type === 'paragraph') return paragraph(b);
    const kind = b.type === 'bulletList' ? 'bullet' : 'number';
    const start = b.type === 'orderedList' && Number.isInteger(b.attrs?.start) ? Math.max(1, b.attrs!.start as number) : 1;
    let n = start;
    for (const item of b.content as RichListItem[]) {
      let first = true;
      for (const c of item.content) {
        if (c.type === 'paragraph') {
          paragraph(c, { kind, level, number: n, start, marker: first });
          first = false;
        } else walk(c, level + 1);
      }
      n++;
    }
  };
  for (const b of doc?.content ?? []) walk(b, 0);
  if (!out.length) out.push({ runs: [], align: style.align, end: { ...base, sizePt: base.sizePt * scale } });
  return out;
}

/** Whether any run's text is not empty. */
export const hasText = (paras: TextParagraph[]) => paras.some((p) => p.runs.some((r) => r.kind === 'text' && r.text.length > 0));

/** The marker drawn before a list paragraph: a bullet per level, or the number. */
export function listMarker(list: NonNullable<TextParagraph['list']>): string {
  if (!list.marker) return '';
  if (list.kind === 'number') return `${list.number}.`;
  return ['•', '–', '•'][list.level % 3];
}
