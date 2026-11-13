/**
 * DOCX for G-INSERT content: equations, shapes, text boxes, and picture alignment and captions.
 *
 * - Equations become Word's own equations (OMML, m:oMath), converted from their LaTeX by docx's latexToMath, so
 *   they stay editable in Word. latexToMath reads the LaTeX that KaTeX does for fractions, scripts, roots, sums,
 *   integrals and other large operators, functions, \left…\right brackets, accents, \overline/\underline, braces,
 *   boxes, fonts (\mathbb, \mathrm…), \text, Greek letters and symbols, and the matrix, cases and aligned
 *   environments. Anything it does not know is written as a picture of the equation, as drawn in the editor, with
 *   the LaTeX as its alternative text (or, when the browser could not draw that picture, as the LaTeX itself).
 *   Each is reported in the export toast. Colours (\color, \textcolor) are left out of Word equations; that is
 *   reported too.
 * - Shapes are written as pictures of the shape (drawn from the same SVG as on screen) and reported.
 * - Text boxes are written as one-cell tables with the box's border, fill and width; a floated box is a floating
 *   table (Word's table positioning, text wrapping round it). Reported, since it is a table in Word.
 * - Picture alignment is the paragraph alignment; a caption is a paragraph in Word's Caption style under the picture.
 */
import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  LineRuleType,
  Math as WordMath,
  Paragraph,
  ShadingType,
  Table,
  TableAnchorType,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  XmlComponent,
  type IParagraphOptions,
  type ParagraphChild,
  RelativeHorizontalPosition,
} from 'docx';
import { latexToMath } from 'docx/math';
import { imageAlign, imageCaption } from '../../extensions/figureImage';
import type { Alignment } from '../../extensions/objectAttrs';
import { readShape, shapeLabel, shapeSvg } from '../../extensions/shapeModel';
import { readTextBox, textBoxWidth } from '../../extensions/textBox';
import { NOTES } from '../report';
import type { Block, Ctx, InlineHandler, NodeHandler } from './context';
import { pxToTwip } from './units';

const ALIGN: Record<Alignment, (typeof AlignmentType)[keyof typeof AlignmentType]> = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };

/** Pictures drawn in the browser before the export (see insertAssets.ts) are kept in ctx.assets under these keys. */
export const shapeAssetKey = (attrs: Record<string, unknown> | undefined) => `shape:${shapeSvg(attrs)}`;
export const equationAssetKey = (latex: string, display: boolean) => `equation:${display ? 'display' : 'inline'}:${latex}`;
/** Pictures are drawn at this many device pixels per CSS pixel, for a sharp print. */
export const PICTURE_SCALE = 2;

/** Width and height of a PNG in pixels (from its IHDR header), or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Whether Word can take this LaTeX as a native equation. */
export function wordEquation(latex: string): WordMath | null {
  try {
    return new WordMath({ children: latexToMath(latex) });
  } catch {
    return null;
  }
}

/** Whether the LaTeX colours some of the equation (\color, \textcolor): Word's converter leaves colours out. */
export const equationHasColour = (latex: string) => /\\(?:color|textcolor)(?![a-zA-Z])/.test(latex);

/** A display equation's own paragraph (m:oMathPara), as Word writes one; docx has no class for it. */
class MathParagraph extends XmlComponent {
  constructor(math: WordMath) {
    super('m:oMathPara');
    this.root.push(math);
  }
}

/** The run(s) of one equation: native, else its picture, else its LaTeX. Reports the last two. */
function equationRuns(latex: string, display: boolean, ctx: Ctx): ParagraphChild[] {
  const math = wordEquation(latex);
  if (math) {
    if (equationHasColour(latex)) NOTES.equationColour(ctx.report);
    return [display ? (new MathParagraph(math) as unknown as ParagraphChild) : math];
  }
  const bytes = ctx.assets.get(equationAssetKey(latex, display));
  const size = bytes && pngSize(bytes);
  if (bytes && size) {
    NOTES.equationPicture(ctx.report);
    let width = size.width / PICTURE_SCALE;
    let height = size.height / PICTURE_SCALE;
    if (width > ctx.contentWidthPx) [width, height] = [ctx.contentWidthPx, (height * ctx.contentWidthPx) / width];
    return [new ImageRun({ type: 'png', data: bytes, transformation: { width: Math.round(width), height: Math.round(height) }, altText: { name: 'equation', description: latex, title: 'Equation' } })];
  }
  NOTES.equationText(ctx.report);
  return [new TextRun({ text: display ? latex : `$${latex}$`, font: 'Cambria Math' })];
}

export const inlineMathHandler: InlineHandler = (node, ctx) => {
  const latex = String(node.attrs?.latex ?? '').trim();
  if (!latex) return [];
  // A link or bold/italic/colour on the equation cannot be carried by an OMML equation (comments are the review
  // exporter's to report): say so rather than drop it silently.
  if ((node.marks ?? []).some((m) => m.type !== 'comment')) NOTES.equationMarks(ctx.report);
  return equationRuns(latex, false, ctx);
};

export const blockMathHandler: NodeHandler = (node, ctx) => {
  const latex = String(node.attrs?.latex ?? '').trim();
  if (!latex) return [];
  return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: equationRuns(latex, true, ctx) })];
};

export const shapeHandler: NodeHandler = (node, ctx) => {
  const s = readShape(node.attrs);
  const bytes = ctx.assets.get(shapeAssetKey(node.attrs));
  const label = shapeLabel(node.attrs);
  if (!bytes) {
    NOTES.shapePlaceholder(ctx.report);
    return [new Paragraph({ alignment: ALIGN[s.align], children: [new TextRun({ text: `[Shape: ${label}]`, italics: true, color: '888888' })] })];
  }
  NOTES.shapePicture(ctx.report);
  let { width, height } = s;
  if (width > ctx.contentWidthPx) [width, height] = [ctx.contentWidthPx, Math.round((height * ctx.contentWidthPx) / width)];
  return [
    new Paragraph({
      alignment: ALIGN[s.align],
      children: [new ImageRun({ type: 'png', data: bytes, transformation: { width, height }, altText: { name: 'shape', description: label, title: label } })],
    }),
  ];
};

/** Inner padding of a text box in Word (twips), close to the editor's 0.5em × 0.75em at 12pt. */
const BOX_MARGIN = { top: 120, bottom: 120, left: 180, right: 180 };
/** Space between a floated box and the text round it (twips): the editor's 1em. */
const FLOAT_GAP = 240;

export const textBoxHandler: NodeHandler = (node, ctx, api) => {
  const b = readTextBox(node.attrs);
  const widthPx = Math.min(textBoxWidth(b) ?? ctx.contentWidthPx, ctx.contentWidthPx);
  const cellCtx: Ctx = { ...ctx, contentWidthPx: Math.max(40, widthPx - 24), inCell: true };
  const blocks: Block[] = api.blocks(node.content ?? [], cellCtx);
  // Lists inside take numbering instances from the same sequence as the rest of the document.
  ctx.listInstance = cellCtx.listInstance;
  const children = blocks.filter((x): x is Paragraph | Table => x instanceof Paragraph || x instanceof Table);
  // Word requires every cell to end with a paragraph.
  if (!children.length || children.at(-1) instanceof Table) children.push(new Paragraph({}));
  const hasBorder = b.borderColor !== 'none' && b.borderWidth > 0;
  // Border sizes are in eighths of a point: 1 CSS pixel is 0.75pt.
  const border = hasBorder ? { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(b.borderWidth * 6)), color: b.borderColor.slice(1).toUpperCase() } : { style: BorderStyle.NONE, size: 0, color: 'auto' };
  const twips = pxToTwip(widthPx);
  const floated = b.float !== 'inline' && !ctx.inCell;
  NOTES.textBoxTable(ctx.report);
  const table = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            width: { size: twips, type: WidthType.DXA },
            margins: BOX_MARGIN,
            shading: b.fill === 'none' ? undefined : { type: ShadingType.CLEAR, fill: b.fill.slice(1).toUpperCase(), color: 'auto' },
          }),
        ],
      }),
    ],
    width: { size: twips, type: WidthType.DXA },
    columnWidths: [twips],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    float: floated
      ? {
          horizontalAnchor: TableAnchorType.MARGIN,
          relativeHorizontalPosition: b.float === 'left' ? RelativeHorizontalPosition.LEFT : RelativeHorizontalPosition.RIGHT,
          verticalAnchor: TableAnchorType.TEXT,
          leftFromText: b.float === 'right' ? FLOAT_GAP : 0,
          rightFromText: b.float === 'left' ? FLOAT_GAP : 0,
          topFromText: 60,
          bottomFromText: 120,
        }
      : undefined,
  });
  // A paragraph after the table keeps it apart from a following table (Word would join them) and, for a floated
  // box, is where it is anchored. It is kept to almost no height.
  return [table, new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT }, children: [] })];
};

/** Paragraph options of a picture: its alignment, kept with its caption. */
export function pictureLook(node: JSONContent): Pick<IParagraphOptions, 'alignment' | 'keepNext'> {
  return { alignment: ALIGN[imageAlign(node.attrs)], ...(imageCaption(node.attrs) ? { keepNext: true } : {}) };
}

/** The caption under a picture: a paragraph in Word's Caption style, aligned with the picture. */
export function captionBlocks(node: JSONContent): Paragraph[] {
  const caption = imageCaption(node.attrs);
  if (!caption) return [];
  return [
    new Paragraph({
      style: 'Caption',
      alignment: ALIGN[imageAlign(node.attrs)],
      spacing: { before: 60, after: 200 },
      children: [new TextRun({ text: caption, italics: true, size: 20, color: '4B4B55' })],
    }),
  ];
}
