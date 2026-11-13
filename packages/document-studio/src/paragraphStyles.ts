/**
 * How the named paragraph styles look. One table feeds the editor/print CSS and the Word styles written to DOCX
 * (export/docx/format.ts), so both stay the same. Headings mirror the heading rules in contentCss.ts (a test checks).
 */
export interface StyleLook {
  sizePt: number;
  /** CSS line-height (a multiple of the font size). */
  lineHeight: number;
  bold?: boolean;
  italic?: boolean;
  color: string;
  /** CSS margins, in em of the style's own font size. */
  marginTopEm: number;
  marginBottomEm: number;
}

export const BODY_SIZE_PT = 12;
/** Space above a body paragraph that follows another block (`.dcos-doc > * + *` margin-top 0.6em). */
export const BODY_GAP_PT = 0.6 * BODY_SIZE_PT;
/** Space a body paragraph leaves below itself in Word (docDefaults spacing after 160 twips). */
export const WORD_BODY_AFTER_PT = 8;

export const HEADING_LOOKS: Record<1 | 2 | 3 | 4, StyleLook> = {
  1: { sizePt: 20, lineHeight: 1.25, bold: true, color: '#111114', marginTopEm: 1.1, marginBottomEm: 0.4 },
  2: { sizePt: 15, lineHeight: 1.25, bold: true, color: '#111114', marginTopEm: 1.1, marginBottomEm: 0.4 },
  3: { sizePt: 13, lineHeight: 1.25, bold: true, color: '#111114', marginTopEm: 1.1, marginBottomEm: 0.4 },
  4: { sizePt: 12, lineHeight: 1.25, bold: true, color: '#111114', marginTopEm: 1.1, marginBottomEm: 0.4 },
};

export const PARAGRAPH_STYLE_LOOKS: Record<'title' | 'subtitle' | 'caption', StyleLook> = {
  title: { sizePt: 26, lineHeight: 1.15, color: '#111114', marginTopEm: 0, marginBottomEm: 0.3 },
  subtitle: { sizePt: 15, lineHeight: 1.3, color: '#5b5b66', marginTopEm: 0, marginBottomEm: 0.8 },
  caption: { sizePt: 9, lineHeight: 1.4, italic: true, color: '#5b5b66', marginTopEm: 0.2, marginBottomEm: 0.8 },
};

/** Editor and print CSS for Title, Subtitle and Caption (inserted into documentContentCss). */
export const paragraphStyleCss = Object.entries(PARAGRAPH_STYLE_LOOKS)
  .map(
    ([id, l]) =>
      `.dcos-doc p[data-paragraph-style="${id}"] { font-size: ${l.sizePt}pt; line-height: ${l.lineHeight}; color: ${l.color}; margin: ${l.marginTopEm}em 0 ${l.marginBottomEm}em;${l.bold ? ' font-weight: 700;' : ''}${l.italic ? ' font-style: italic;' : ''} }`,
  )
  .join('\n');
