/**
 * G-FORMAT in DOCX: paragraph formatting (spacing, line spacing, indents), the named paragraph styles as real Word
 * styles, and list styles (bullet glyphs, number formats) as numbering definitions.
 *
 * Mapping (stored → Word):
 * - lineSpacing m (Word multiple)       → w:spacing w:line = m × 240, lineRule auto (the editor shows m × 1.2207 em)
 * - spaceBefore / spaceAfter (pt)       → w:spacing w:before / w:after (twips)
 * - indentLeft / indentRight (pt)       → w:ind w:left / w:right; in a list, added to the list level's indent
 *                                         (the number stays put: hanging grows by the same amount)
 * - indentFirstLine (pt, < 0: hanging)  → w:ind w:firstLine / w:hanging
 * - paragraphStyle title/subtitle/caption → w:pStyle Title / Subtitle / Caption
 * - headings, blockquote, code block    → Heading1–4, Quote, Code (styles defined to match the editor)
 */
import type { JSONContent } from '@tiptap/core';
import { AlignmentType, BorderStyle, LevelFormat, ShadingType, type IParagraphOptions, type IParagraphStyleOptions } from 'docx';
import { bulletGlyph, bulletStyleOf, numberFormatOf, type NumberFormat } from '../../extensions/listStyles';
import { formatOf, paragraphStyleOf } from '../../extensions/paragraphFormat';
import { BODY_GAP_PT, HEADING_LOOKS, PARAGRAPH_STYLE_LOOKS, WORD_BODY_AFTER_PT, type StyleLook } from '../../paragraphStyles';
import type { Ctx } from './context';
import type { DocumentContributor, DocumentOptions } from './document';
import { CALIBRI_SINGLE, toHex } from './units';

/** Word style ids of the named styles. */
export const WORD_STYLE_IDS = { title: 'Title', subtitle: 'Subtitle', caption: 'Caption', quote: 'Quote', code: 'Code' } as const;

const tw = (pt: number) => Math.round(pt * 20);
/** Indent of list level n (0-based) in the numbering definitions (lists.ts listLevels). */
const listIndent = (level: number) => 720 * (level + 1);

type Look = { -readonly [K in 'alignment' | 'spacing' | 'indent' | 'style']?: IParagraphOptions[K] };

/**
 * Adds a paragraph's stored formatting to the look paragraph.ts worked out (alignment, line height from text style).
 * A stored line spacing replaces a line height that came from text style, since the paragraph setting is explicit.
 * `listLevel` is set for the numbered paragraph of a list item: its indents add to the list level's own.
 */
export function withParagraphFormat<T extends Look>(look: T, node: JSONContent, listLevel?: number): T {
  const f = formatOf(node.attrs);
  const out: Look = { ...look };
  const spacing: Record<string, unknown> = { ...(look.spacing ?? {}) };
  if (f.lineSpacing !== null) {
    spacing.line = Math.round(f.lineSpacing * 240);
    delete spacing.lineRule;
  }
  if (f.spaceBefore !== null) spacing.before = tw(f.spaceBefore);
  if (f.spaceAfter !== null) spacing.after = tw(f.spaceAfter);
  if (Object.keys(spacing).length) out.spacing = spacing as IParagraphOptions['spacing'];

  if (f.indentLeft !== null || f.indentRight !== null || f.indentFirstLine !== null) {
    const indent: Record<string, number> = {};
    const left = tw(f.indentLeft ?? 0);
    if (listLevel !== undefined) {
      // The number stays where the list level puts it (left − hanging) and the text moves by the paragraph's indent,
      // as in the editor, where the marker sits outside the item and the paragraph's margin moves only the text.
      // (List paragraphs take no first-line or hanging indent of their own: see paragraphFormat.ts.)
      indent.left = listIndent(listLevel) + left;
      indent.hanging = 360 + left;
    } else {
      if (f.indentLeft !== null) indent.left = left;
      if (f.indentFirstLine !== null && f.indentFirstLine > 0) indent.firstLine = tw(f.indentFirstLine);
      if (f.indentFirstLine !== null && f.indentFirstLine < 0) indent.hanging = tw(-f.indentFirstLine);
    }
    if (f.indentRight !== null) indent.right = tw(f.indentRight);
    out.indent = indent;
  }

  const style = node.type === 'paragraph' ? paragraphStyleOf(node.attrs) : null;
  if (style) out.style = WORD_STYLE_IDS[style];
  return out as T;
}

/**
 * The indent of a continuation paragraph in a list item (second and later paragraphs): it lines up with the item's
 * text (the list level's indent) plus its own left indent, and keeps its own right indent, as the editor shows it.
 */
export function listContinuationIndent(node: JSONContent, level: number): NonNullable<IParagraphOptions['indent']> {
  const f = formatOf(node.attrs);
  const indent: Record<string, number> = { left: listIndent(level) + tw(f.indentLeft ?? 0) };
  if (f.indentRight !== null) indent.right = tw(f.indentRight);
  return indent;
}

/** The indent of a paragraph inside a quote: the quote's own (720 twips) plus the paragraph's. */
export function quoteIndent(node: JSONContent): NonNullable<IParagraphOptions['indent']> {
  const f = formatOf(node.attrs);
  const indent: Record<string, number> = { left: 720 + tw(f.indentLeft ?? 0) };
  if (f.indentRight !== null) indent.right = tw(f.indentRight);
  if (f.indentFirstLine !== null && f.indentFirstLine > 0) indent.firstLine = tw(f.indentFirstLine);
  if (f.indentFirstLine !== null && f.indentFirstLine < 0) indent.hanging = tw(-f.indentFirstLine);
  return indent;
}

// ---- Named styles ------------------------------------------------------------------------------------------------

/**
 * A style look as Word style properties. The editor's spacing collapses like web margins (the larger of two
 * neighbouring margins), while Word adds a paragraph's space after to the next one's space before; the values are
 * chosen so the gap next to a body paragraph matches the editor: before = top margin − the body's space after,
 * after = the larger of the bottom margin and a following body paragraph's top margin.
 */
export function wordStyleOf(l: StyleLook, heading = false) {
  const run: Record<string, unknown> = { size: l.sizePt * 2, color: toHex(l.color) };
  if (l.bold) run.bold = true;
  if (l.italic) run.italics = true;
  return {
    run,
    paragraph: {
      ...(heading ? { keepNext: true, keepLines: true } : {}),
      spacing: {
        before: tw(Math.max(0, l.marginTopEm * l.sizePt - WORD_BODY_AFTER_PT)),
        after: tw(Math.max(l.marginBottomEm * l.sizePt, BODY_GAP_PT)),
        line: Math.round((l.lineHeight / CALIBRI_SINGLE) * 240),
      },
    },
  };
}

const extraStyles = (): IParagraphStyleOptions[] => [
  { id: WORD_STYLE_IDS.subtitle, name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true, uiPriority: 11, ...wordStyleOf(PARAGRAPH_STYLE_LOOKS.subtitle) },
  {
    id: WORD_STYLE_IDS.quote,
    name: 'Quote',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    uiPriority: 29,
    run: { color: '555555' },
    paragraph: { indent: { left: 720 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C7C7D1', space: 12 } } },
  },
  {
    id: WORD_STYLE_IDS.code,
    name: 'Code',
    basedOn: 'Normal',
    quickFormat: true,
    run: { font: 'Courier New', size: 20 },
    paragraph: { spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: 'F4F4F6', color: 'auto' } },
  },
];

/** Defines Title, Subtitle, Heading 1–4, Quote, Caption and Code in styles.xml, looking as they do in the editor. */
export const namedStylesContributor: DocumentContributor = (options: DocumentOptions) => {
  const styles = { ...(options.styles ?? {}) } as { -readonly [K in keyof NonNullable<DocumentOptions['styles']>]: NonNullable<DocumentOptions['styles']>[K] };
  styles.default = {
    ...(styles.default ?? {}),
    title: wordStyleOf(PARAGRAPH_STYLE_LOOKS.title),
    heading1: wordStyleOf(HEADING_LOOKS[1], true),
    heading2: wordStyleOf(HEADING_LOOKS[2], true),
    heading3: wordStyleOf(HEADING_LOOKS[3], true),
    heading4: wordStyleOf(HEADING_LOOKS[4], true),
    caption: wordStyleOf(PARAGRAPH_STYLE_LOOKS.caption),
  };
  styles.paragraphStyles = [...(styles.paragraphStyles ?? []), ...extraStyles()];
  options.styles = styles;
};

// ---- List styles -------------------------------------------------------------------------------------------------

const WORD_NUMBER_FORMAT: Record<NumberFormat, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
  decimal: LevelFormat.DECIMAL,
  'lower-alpha': LevelFormat.LOWER_LETTER,
  'upper-alpha': LevelFormat.UPPER_LETTER,
  'lower-roman': LevelFormat.LOWER_ROMAN,
  'upper-roman': LevelFormat.UPPER_ROMAN,
};

type Level = { level: number; start: number; format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: string; alignment: (typeof AlignmentType)[keyof typeof AlignmentType]; style: { paragraph: { indent: { left: number; hanging: number } } } };
const styledLevels = new WeakMap<Ctx, Map<string, Level[]>>();

const levels = (format: Level['format'], text: (level: number) => string, start: number): Level[] =>
  Array.from({ length: 9 }, (_, level) => ({ level, start: level === 0 ? start : 1, format, text: text(level), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: listIndent(level), hanging: 360 } } } }));

/**
 * The numbering definition of a list with a bullet style or number format (null for a default list, which keeps
 * the shared definitions). Every level uses the chosen glyph or format: a list nested in it is converted with its
 * own definition, so a level is only used by a list that has this style.
 */
export function styledListReference(node: JSONContent, ordered: boolean, start: number, ctx: Ctx): string | null {
  let reference: string;
  let make: () => Level[];
  if (ordered) {
    const format = numberFormatOf(node.attrs?.numberFormat);
    if (!format) return null;
    reference = `dcos-ordered-${format}${start !== 1 ? `-from-${start}` : ''}`;
    make = () => levels(WORD_NUMBER_FORMAT[format], (level) => `%${level + 1}.`, start);
  } else {
    const style = bulletStyleOf(node.attrs?.bulletStyle);
    if (!style) return null;
    reference = `dcos-bullet-${style}`;
    make = () => levels(LevelFormat.BULLET, () => bulletGlyph(style), 1);
  }
  let map = styledLevels.get(ctx);
  if (!map) styledLevels.set(ctx, (map = new Map()));
  if (!map.has(reference)) map.set(reference, make());
  return reference;
}

/** The numbering definitions styled lists used (added to the document's numbering config). */
export function styledNumbering(ctx: Ctx) {
  return [...(styledLevels.get(ctx) ?? new Map<string, Level[]>()).entries()].map(([reference, lv]) => ({ reference, levels: lv }));
}
