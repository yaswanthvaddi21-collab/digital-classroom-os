import type { JSONContent } from '@tiptap/core';
import { exportHref } from '../../links';
import { NOTES } from '../report';
import { TEXT_INLINE_HANDLERS } from '../text';
import type { OdfProps, OdtApi, OdtCtx, OdtInlineHandler } from './context';
import { ODT_MARK_HANDLERS, textProps } from './marks';
import { ODT_NOTES } from './notes';
import { checkAttrs } from './support';
import { el, odfText } from './xml';

/** Inline nodes other than text. Unknown inline nodes are left out and reported. */
export const ODT_INLINE_HANDLERS: Record<string, OdtInlineHandler> = {
  hardBreak: (_n, _ctx, _base, _api, state) => {
    state.atStart = true;
    return '<text:line-break/>';
  },
  // Register new inline nodes here (one entry per node type).
};

function textRun(n: JSONContent, ctx: OdtCtx, base: OdfProps, state: { atStart: boolean }): string {
  for (const mark of n.marks ?? []) {
    if (!ODT_MARK_HANDLERS[mark.type]) ODT_NOTES.unsupportedMark(ctx.report, mark.type);
    else checkAttrs(mark.type, mark.attrs, ctx, 'mark');
  }
  const body = odfText(n.text ?? '', state);
  if (!body) return '';
  const style = ctx.styles.text(textProps(n.marks, ctx, base));
  let out = style ? el('text:span', { 'text:style-name': style }, body) : body;
  // Inline code uses the standard "Source Text" character style, so word processors (and the importer) know it.
  if (n.marks?.some((m) => m.type === 'code')) out = el('text:span', { 'text:style-name': 'Source_20_Text' }, out);
  const link = n.marks?.find((m) => m.type === 'link');
  if (link?.attrs?.href) {
    // Only addresses the editor allows (no javascript: from a crafted file); others become plain text (audit DS-7).
    const href = exportHref(link.attrs.href);
    if (href) {
      out = el(
        'text:a',
        { 'xlink:type': 'simple', 'xlink:href': href, 'text:style-name': 'Internet_20_link', 'text:visited-style-name': 'Visited_20_Internet_20_Link' },
        out,
      );
    } else ctx.report.once(`link:${String(link.attrs.href)}`, NOTES.unsafeLink);
  }
  return out;
}

export function inlines(nodes: JSONContent[] = [], ctx: OdtCtx, base: OdfProps = {}, api: OdtApi): string {
  const state = { atStart: true };
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += textRun(n, ctx, base, state);
    else if (n.type && ODT_INLINE_HANDLERS[n.type]) out += ODT_INLINE_HANDLERS[n.type](n, ctx, base, api, state);
    else if (n.content?.length) {
      // An inline node with content of its own: keep its text.
      ODT_NOTES.unsupportedNode(ctx.report, String(n.type), true);
      out += inlines(n.content, ctx, base, api);
    } else {
      // An inline atom (an equation …): its plain-text form, as the TXT export writes it, with the run's formatting.
      const text = n.type && TEXT_INLINE_HANDLERS[n.type] ? TEXT_INLINE_HANDLERS[n.type](n, () => '') : '';
      if (text) {
        ODT_NOTES.writtenAsText(ctx.report, String(n.type));
        out += textRun({ type: 'text', text, marks: n.marks }, ctx, base, state);
      } else ODT_NOTES.unsupportedNode(ctx.report, String(n.type), false);
    }
  }
  return out;
}
