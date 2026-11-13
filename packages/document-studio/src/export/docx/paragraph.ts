import type { JSONContent } from '@tiptap/core';
import { AlignmentType, LineRuleType, type IParagraphOptions } from 'docx';
import { withParagraphFormat } from './format'; // G-FORMAT
import { toLineSpacing } from './units';

export const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
export const alignOf = (node: JSONContent) => ALIGN[String(node.attrs?.textAlign ?? '')];

/**
 * Line spacing a paragraph shows in the editor. Line height there comes from text style (a run attribute, e.g. from
 * pasted text); Word has it per paragraph, so the largest in the paragraph is used, as the browser lays it out.
 */
export function lineSpacingOf(node: JSONContent): IParagraphOptions['spacing'] | undefined {
  let best: ReturnType<typeof toLineSpacing>;
  for (const child of node.content ?? []) {
    for (const mark of child.marks ?? []) {
      if (mark.type !== 'textStyle') continue;
      const spacing = toLineSpacing(mark.attrs?.lineHeight);
      if (spacing && (!best || spacing.line > best.line)) best = spacing;
    }
  }
  if (!best) return undefined;
  return best.lineRule ? { line: best.line, lineRule: LineRuleType.AT_LEAST } : { line: best.line };
}

/** The paragraph-level formatting shared by paragraphs, headings and list items. */
export const paragraphLook = (node: JSONContent, listLevel?: number): Pick<IParagraphOptions, 'alignment' | 'spacing' | 'indent' | 'style'> => {
  const look: { alignment?: IParagraphOptions['alignment']; spacing?: IParagraphOptions['spacing'] } = {};
  const alignment = alignOf(node);
  if (alignment) look.alignment = alignment;
  const spacing = lineSpacingOf(node);
  if (spacing) look.spacing = spacing;
  // @phase4:format-paragraph (G-FORMAT): stored spacing, line spacing, indents and named paragraph styles.
  return withParagraphFormat(look, node, listLevel);
};

