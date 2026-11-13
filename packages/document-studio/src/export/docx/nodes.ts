import type { JSONContent } from '@tiptap/core';
import { BorderStyle, HeadingLevel, PageBreak, Paragraph, ShadingType, TableOfContents, TextRun } from 'docx';
import { NOTES } from '../report';
import type { Block, Ctx, DocxApi, NodeHandler } from './context';
import { quoteIndent, WORD_STYLE_IDS } from './format'; // G-FORMAT
import { diagramParagraph, imageParagraph } from './images';
import { blockMathHandler, captionBlocks, shapeHandler, textBoxHandler } from './insert'; // G-INSERT
import { inlines } from './inlines';
import { list } from './lists';
import { paragraphLook } from './paragraph';
import { sectionBreakHandler } from './sections'; // G-LAYOUT
import { tableBlock } from './tables';

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

/** "Table of Contents" title, styled as in the editor and kept out of the table itself (it is not a heading). */
const tocTitle = () => new Paragraph({ keepNext: true, spacing: { after: 120 }, children: [new TextRun({ text: 'Table of Contents', bold: true, size: 26 })] });

/**
 * How each block node becomes Word paragraphs and tables. A node type without a handler is unwrapped: its
 * children are converted, so content is never dropped silently.
 */
export const NODE_HANDLERS: Record<string, NodeHandler> = {
  paragraph: (node, ctx, api) => [new Paragraph({ children: api.inlines(node.content, ctx), ...paragraphLook(node) })],
  heading: (node, ctx, api) => {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 4);
    return [new Paragraph({ heading: HEADINGS[level - 1], children: api.inlines(node.content, ctx), ...paragraphLook(node) })];
  },
  bulletList: (node, ctx, api) => list(node, ctx, api, 0, false),
  orderedList: (node, ctx, api) => list(node, ctx, api, 0, true),
  blockquote: (node, ctx, api) => {
    const out: Block[] = [];
    for (const child of node.content ?? []) {
      if (child.type === 'paragraph') {
        out.push(
          new Paragraph({
            style: WORD_STYLE_IDS.quote, // G-FORMAT: the Word "Quote" style (a stored paragraph style wins)
            children: api.inlines(child.content, ctx, { color: '555555' }),
            ...paragraphLook(child),
            indent: quoteIndent(child), // G-FORMAT: the quote's indent plus the paragraph's own
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C7C7D1', space: 12 } },
          }),
        );
      } else {
        out.push(...api.blocks([child], ctx));
      }
    }
    return out;
  },
  codeBlock: (node) => {
    const lines = (node.content ?? []).map((t) => t.text ?? '').join('').split('\n');
    return lines.map(
      (line) =>
        new Paragraph({
          style: WORD_STYLE_IDS.code, // G-FORMAT: the Word "Code" style
          shading: { type: ShadingType.CLEAR, fill: 'F4F4F6', color: 'auto' },
          spacing: { after: 0 },
          children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
        }),
    );
  },
  horizontalRule: () => [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, children: [] })],
  image: (node, ctx) => [imageParagraph(node, ctx), ...captionBlocks(node)], // G-INSERT: caption under the picture
  diagram: (node, ctx) => [diagramParagraph(node, ctx)],
  table: (node, ctx, api) => [tableBlock(node, ctx, api), new Paragraph({})],
  pageBreak: () => [new Paragraph({ children: [new PageBreak()] })],
  // A real Word table of contents (a TOC field over Heading 1–4), written with an entry per heading as its cached
  // result, so it shows before Word updates it; Word fills in the page numbers when it updates the field.
  // Inside a table cell (where Word allows no fields of this kind) the entries are written as plain paragraphs.
  tableOfContents: (_node, ctx) => {
    if (ctx.inCell) {
      return [tocTitle(), ...ctx.headings.map((h) => new Paragraph({ indent: { left: 360 * (h.level - 1) }, spacing: { after: 60 }, children: [new TextRun(h.text)] }))];
    }
    NOTES.tocPageNumbers(ctx.report);
    return [tocTitle(), new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-4' })];
  },
  // @phase4:docx-nodes — register new block nodes here (one entry per node type).
  blockMath: blockMathHandler, // G-INSERT: a Word display equation (see docx/insert.ts)
  shape: shapeHandler, // G-INSERT: a picture of the shape
  textBox: textBoxHandler, // G-INSERT: a one-cell (floating) table
  sectionBreak: sectionBreakHandler, // G-LAYOUT: splits the body into Word sections (see docx/sections.ts)
};

function blocks(nodes: JSONContent[], ctx: Ctx): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const handler = node.type ? NODE_HANDLERS[node.type] : undefined;
    if (handler) out.push(...handler(node, ctx, api));
    else if (node.content) out.push(...blocks(node.content, ctx));
  }
  return out;
}

export const api: DocxApi = {
  blocks,
  inlines: (nodes, ctx, extra) => inlines(nodes, ctx, extra, api),
};
