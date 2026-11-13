import type { JSONContent } from '@tiptap/core';
import { FORMAT_ATTR_NAMES, formatOf } from '../../extensions/paragraphFormat';
import { toLineSpacing } from '../docx/units';
import type { OdfProps, OdtParagraphContributor } from './context';
import { round } from './xml';

const ALIGN: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'justify' };

/**
 * Paragraph properties from a block node's attributes. Each contributor reads what it knows; they run for
 * paragraphs, headings and list paragraphs. Register new paragraph attributes here.
 */
export const ODT_PARAGRAPH_CONTRIBUTORS: Record<string, OdtParagraphContributor> = {
  textAlign: (props, node) => {
    const align = ALIGN[String(node.attrs?.textAlign ?? '')];
    if (align) props['fo:text-align'] = align;
  },
  // Line height is a text-style attribute in the editor; the largest in a paragraph applies (as in the DOCX export).
  lineHeight: (props, node) => {
    let best: ReturnType<typeof toLineSpacing>;
    for (const child of node.content ?? []) {
      for (const mark of child.marks ?? []) {
        if (mark.type !== 'textStyle') continue;
        const spacing = toLineSpacing(mark.attrs?.lineHeight);
        if (spacing && (!best || spacing.line > best.line)) best = spacing;
      }
    }
    if (!best) return;
    if (best.lineRule) props['style:line-height-at-least'] = `${round(best.line / 20, 2)}pt`;
    else props['fo:line-height'] = `${Math.round((best.line / 240) * 100)}%`;
  },
  // G-FORMAT paragraph formatting (points; line spacing as a multiple of single, which is ODF's 100%). A stored line
  // spacing replaces a line height from text style, as in the DOCX export.
  paragraphFormat: (props, node) => {
    const f = formatOf(node.attrs);
    const pt = (v: number) => `${v}pt`;
    if (f.lineSpacing !== null) {
      delete props['style:line-height-at-least'];
      props['fo:line-height'] = `${round(f.lineSpacing * 100, 2)}%`;
    }
    if (f.spaceBefore !== null) props['fo:margin-top'] = pt(f.spaceBefore);
    if (f.spaceAfter !== null) props['fo:margin-bottom'] = pt(f.spaceAfter);
    if (f.indentLeft !== null) props['fo:margin-left'] = pt(f.indentLeft);
    if (f.indentRight !== null) props['fo:margin-right'] = pt(f.indentRight);
    if (f.indentFirstLine !== null) props['fo:text-indent'] = pt(f.indentFirstLine);
  },
};

const FORMAT_ATTRS: string[] = FORMAT_ATTR_NAMES;

/** Node attributes the ODT export writes (others with a value are reported as left out). */
export const ODT_HANDLED_ATTRS: Record<string, string[]> = {
  paragraph: ['textAlign', ...FORMAT_ATTRS, 'paragraphStyle'],
  heading: ['level', 'textAlign', ...FORMAT_ATTRS],
  orderedList: ['start', 'type', 'numberFormat'],
  bulletList: ['bulletStyle'],
  tableCell: ['colspan', 'rowspan', 'colwidth', 'align'],
  tableHeader: ['colspan', 'rowspan', 'colwidth', 'align'],
  image: ['src', 'alt', 'title', 'width', 'height', 'align', 'caption'],
  sectionBreak: ['breakType', 'orientation', 'columns', 'columnSpacing', 'numberFormat', 'numberStart'],
  diagram: ['source', 'previewId', 'naturalWidth', 'naturalHeight', 'width', 'height', 'title'],
  codeBlock: ['language'],
  link: ['href', 'target', 'rel', 'class', 'title'],
  textStyle: ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'lineHeight'],
  highlight: ['color'],
  // Register the attributes new handlers write here.
};

export function paragraphProps(node: JSONContent, ctx: Parameters<OdtParagraphContributor>[2], extra: OdfProps = {}): OdfProps {
  const props: OdfProps = { ...extra };
  for (const contribute of Object.values(ODT_PARAGRAPH_CONTRIBUTORS)) contribute(props, node, ctx);
  return props;
}
