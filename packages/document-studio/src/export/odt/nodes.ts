import type { JSONContent } from '@tiptap/core';
import { paragraphStyleOf } from '../../extensions/paragraphFormat';
import { documentToText } from '../text';
import type { OdfProps, OdtApi, OdtCtx, OdtNodeHandler } from './context';
import { diagramBlock, imageBlock } from './images';
import { inlines } from './inlines';
import { listBlock } from './lists';
import { ODT_NOTES } from './notes';
import { paragraphProps } from './paragraph';
import { ODT_PARAGRAPH_STYLES } from './styles';
import { checkAttrs } from './support';
import { tableBlock } from './tables';
import { el, esc, odfText } from './xml';

const tocTitle = 'Table of Contents';

/**
 * How each block node becomes OpenDocument text. A node type without a handler is unwrapped (its children are
 * converted) or, when it has no content, written in its plain-text form (the TXT export's, e.g. an equation's LaTeX)
 * or left out when it has none; in every case the export toast says so.
 */
export const ODT_NODE_HANDLERS: Record<string, OdtNodeHandler> = {
  paragraph: (node, ctx, api) => api.paragraph(node, ctx),
  heading: (node, ctx, api) => {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 4);
    return api.paragraph(node, ctx, { element: 'text:h', parent: `Heading_20_${level}`, level });
  },
  bulletList: (node, ctx, api) => listBlock(node, ctx, api),
  orderedList: (node, ctx, api) => listBlock(node, ctx, api),
  // Quote paragraphs in the standard "Quotations" style. The whole quote is an ODF section ("Quotation N"), so two
  // quotes in a row stay two quotes and a list or heading inside one stays inside when the file is read back.
  // A list item may hold no section (ODF 1.3, text:list-item), so a quote there is its paragraphs only.
  blockquote: (node, ctx, api) => {
    const id = ctx.inListItem ? 0 : ++ctx.ids.quote; // numbered in document order (an outer quote before its inner one)
    const body = (node.content ?? []).map((child) => (child.type === 'paragraph' ? api.paragraph(child, ctx, { parent: 'Quotations' }) : api.blocks([child], ctx))).join('');
    return id ? el('text:section', { 'text:name': `Quotation ${id}` }, body) : body;
  },
  // One paragraph per line in the standard "Preformatted Text" style; spaces and tabs are kept exactly (see odfText).
  // A section ("Code N") around the lines keeps two code blocks in a row apart, as for quotes.
  codeBlock: (node, ctx) => {
    const text = (node.content ?? []).map((t) => t.text ?? '').join('');
    const lines = text
      .split('\n')
      .map((line) => el('text:p', { 'text:style-name': 'Preformatted_20_Text' }, odfText(line, { atStart: true })))
      .join('');
    return ctx.inListItem ? lines : el('text:section', { 'text:name': `Code ${++ctx.ids.code}` }, lines);
  },
  horizontalRule: () => el('text:p', { 'text:style-name': 'Horizontal_20_Line' }),
  image: (node, ctx) => imageBlock(node, ctx),
  diagram: (node, ctx) => diagramBlock(node, ctx),
  table: (node, ctx, api) => tableBlock(node, ctx, api),
  // An empty paragraph that ends the page (the importer reads it back as a page break).
  pageBreak: (_node, ctx) => el('text:p', { 'text:style-name': ctx.styles.paragraph(ctx.paragraphStyle, { 'fo:break-after': 'page' }) }),
  // A real table of contents (an index over Heading 1–4), with an entry per heading as its current content.
  // Page numbers are filled in when the index is updated; inside a table cell the entries are plain paragraphs.
  tableOfContents: (_node, ctx) => {
    const entries = ctx.headings.map((h) => el('text:p', { 'text:style-name': `Contents_20_${h.level}` }, esc(h.text))).join('');
    const title = el('text:p', { 'text:style-name': 'Contents_20_Heading' }, tocTitle);
    if (ctx.inCell) return title + entries;
    ODT_NOTES.tocPageNumbers(ctx.report);
    const id = ++ctx.ids.toc;
    const templates = [1, 2, 3, 4]
      .map((level) =>
        el(
          'text:table-of-content-entry-template',
          { 'text:outline-level': level, 'text:style-name': `Contents_20_${level}` },
          '<text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/>',
        ),
      )
      .join('');
    return el(
      'text:table-of-content',
      { 'text:name': `Table of Contents${id}`, 'text:protected': 'true' },
      el(
        'text:table-of-content-source',
        { 'text:outline-level': 4, 'text:use-index-marks': 'false' },
        el('text:index-title-template', { 'text:style-name': 'Contents_20_Heading' }, tocTitle) + templates,
      ) + el('text:index-body', {}, el('text:index-title', { 'text:name': `Table of Contents${id}_Head` }, title) + entries),
    );
  },
  // G-LAYOUT section breaks: a next-page break still starts a new page; sections themselves are not written yet.
  sectionBreak: (node, ctx) => {
    if (node.attrs?.breakType === 'continuous') {
      ODT_NOTES.sectionContinuous(ctx.report);
      return '';
    }
    ODT_NOTES.sectionAsPageBreak(ctx.report);
    return el('text:p', { 'text:style-name': ctx.styles.paragraph(ctx.paragraphStyle, { 'fo:break-after': 'page' }) });
  },
  // Register new block nodes here (one entry per node type); Round 3 wires in the nodes other features add.
};

/**
 * A block node without a handler and without content of its own (an equation, a shape …): its plain-text form, as
 * the TXT export writes it (e.g. an equation's LaTeX), one paragraph per line; page breaks are kept. Empty when the
 * node has no text form.
 */
function asText(node: JSONContent, ctx: OdtCtx): string {
  const text = documentToText({ type: 'doc', content: [node] }).replace(/\n+$/, '');
  if (!text.trim()) return '';
  const grey = { 'fo:color': '#555555' };
  return text
    .split('\n')
    .map((line) => {
      const pieces = line.split('\f');
      return pieces
        .map((piece, i) => {
          const breakAfter = i < pieces.length - 1;
          if (!piece.trim() && !breakAfter) return '';
          const style = ctx.styles.paragraph(ctx.paragraphStyle, breakAfter ? { 'fo:break-after': 'page' } : {}, grey);
          return el('text:p', { 'text:style-name': style }, odfText(piece, { atStart: true }));
        })
        .join('');
    })
    .join('');
}

function blocks(nodes: JSONContent[] = [], ctx: OdtCtx): string {
  let out = '';
  for (const node of nodes) {
    const handler = node.type ? ODT_NODE_HANDLERS[node.type] : undefined;
    if (handler) {
      if (node.type !== 'paragraph' && node.type !== 'heading') checkAttrs(node.type!, node.attrs, ctx);
      out += handler(node, ctx, api);
    } else if (node.content?.length) {
      ODT_NOTES.unsupportedNode(ctx.report, String(node.type), true);
      out += blocks(node.content, ctx);
    } else {
      const text = asText(node, ctx);
      if (text) ODT_NOTES.writtenAsText(ctx.report, String(node.type));
      else ODT_NOTES.unsupportedNode(ctx.report, String(node.type), false);
      out += text;
    }
  }
  return out;
}

function paragraph(node: JSONContent, ctx: OdtCtx, opts: Parameters<OdtApi['paragraph']>[2] = {}): string {
  checkAttrs(node.type ?? 'paragraph', node.attrs, ctx);
  const element = opts.element ?? 'text:p';
  const props: OdfProps = paragraphProps(node, ctx, opts.paragraph);
  if (!props['fo:text-align'] && ctx.cellAlign && /^(left|center|right|justify)$/.test(ctx.cellAlign)) props['fo:text-align'] = ctx.cellAlign;
  // Title, Subtitle and Caption (G-FORMAT) are named styles in ODF too.
  const named = node.type === 'paragraph' ? paragraphStyleOf(node.attrs) : null;
  // The first paragraph starts the page style, and with it the page numbering, when the first page has its own number.
  const start = ctx.pageNumberStart;
  if (start !== undefined) {
    ctx.pageNumberStart = undefined;
    props['style:page-number'] = String(start);
  }
  const style = ctx.styles.paragraph(opts.parent ?? (named ? ODT_PARAGRAPH_STYLES[named] : ctx.paragraphStyle), props, {}, start !== undefined ? { 'style:master-page-name': 'Standard' } : {});
  return el(element, { 'text:style-name': style, 'text:outline-level': element === 'text:h' ? opts.level ?? 1 : undefined }, inlines(node.content, ctx, opts.base, api));
}

export const api: OdtApi = {
  blocks,
  inlines: (nodes, ctx, base) => inlines(nodes, ctx, base, api),
  paragraph,
};
