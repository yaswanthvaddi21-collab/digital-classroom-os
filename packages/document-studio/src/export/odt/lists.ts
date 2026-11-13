import type { JSONContent } from '@tiptap/core';
import { bulletGlyph, bulletStyleOf, numberFormatOf, type NumberFormat } from '../../extensions/listStyles';
import type { OdtApi, OdtCtx } from './context';
import { el, round } from './xml';

const BULLETS = ['•', '◦', '▪'];
const FORMATS = ['1', 'a', 'i'];
const LEVELS = 10;
/** G-FORMAT number formats as ODF number formats. */
const NUM_FORMATS: Record<NumberFormat, string> = { decimal: '1', 'lower-alpha': 'a', 'upper-alpha': 'A', 'lower-roman': 'i', 'upper-roman': 'I' };

/** One list's kind at a depth: 'b' and its bullet glyph, or the number format (1/a/A/i/I), as the editor shows it. */
function kindOf(list: JSONContent, depth: number): string {
  if (list.type === 'bulletList') {
    const style = bulletStyleOf(list.attrs?.bulletStyle);
    return `b${style ? bulletGlyph(style) : BULLETS[depth % 3]}`;
  }
  const format = numberFormatOf(list.attrs?.numberFormat);
  if (format) return NUM_FORMATS[format];
  const type = String(list.attrs?.type ?? '');
  return /^[1aAiI]$/.test(type) ? type : FORMATS[depth % 3];
}

/**
 * The list kind at each depth. An ODF list has one style for all its levels, so lists nested at the same depth share
 * one: when they differ, the first one's is used and the export toast says so.
 */
function levelKinds(node: JSONContent, ctx: OdtCtx): string[] {
  const kinds: string[] = [];
  let differing = 0;
  const walk = (list: JSONContent, depth: number) => {
    if (depth >= LEVELS) return;
    const kind = kindOf(list, depth);
    if (kinds[depth] === undefined) kinds[depth] = kind;
    else if (kinds[depth] !== kind) differing++;
    for (const item of list.content ?? []) for (const child of item.content ?? []) if (child.type === 'bulletList' || child.type === 'orderedList') walk(child, depth + 1);
  };
  walk(node, 0);
  if (differing) {
    ctx.report.add(
      'odt-list-style',
      "1 nested list's bullet or number style was written as that of the first list at its level (ODT lists share one style per level)",
      "{n} nested lists' bullet or number styles were written as those of the first lists at their levels (ODT lists share one style per level)",
      differing,
    );
  }
  // Deeper levels continue the outer kind's pattern.
  const top = node.type === 'bulletList';
  for (let d = 0; d < LEVELS; d++) kinds[d] ??= top ? `b${BULLETS[d % 3]}` : FORMATS[d % 3];
  return kinds;
}

/** A list style for these kinds (one per distinct combination). */
function listStyle(kinds: string[], ctx: OdtCtx): string {
  return ctx.styles.raw(`list:${kinds.join('|')}`, () => {
    const name = `L${++ctx.ids.list}`;
    const levels = kinds
      .map((kind, d) => {
        const indent = round(0.635 * (d + 2), 3);
        const props = el(
          'style:list-level-properties',
          { 'text:list-level-position-and-space-mode': 'label-alignment' },
          el('style:list-level-label-alignment', { 'text:label-followed-by': 'listtab', 'text:list-tab-stop-position': `${indent}cm`, 'fo:text-indent': '-0.635cm', 'fo:margin-left': `${indent}cm` }),
        );
        return kind.startsWith('b')
          ? el('text:list-level-style-bullet', { 'text:level': d + 1, 'text:bullet-char': kind.slice(1) }, props)
          : el('text:list-level-style-number', { 'text:level': d + 1, 'style:num-suffix': '.', 'style:num-format': kind }, props);
      })
      .join('');
    return { name, xml: el('text:list-style', { 'style:name': name }, levels) };
  });
}

export function listBlock(node: JSONContent, ctx: OdtCtx, api: OdtApi): string {
  const after: string[] = [];
  const xml = listXml(node, ctx, api, 0, listStyle(levelKinds(node, ctx), ctx), after);
  if (after.length) {
    ctx.report.add('odt-list-blocks', '1 table inside a list was written after the list, as lists in ODT files cannot hold tables', '{n} tables inside lists were written after their lists, as lists in ODT files cannot hold tables', after.length);
  }
  return xml + after.join('');
}

function listXml(node: JSONContent, ctx: OdtCtx, api: OdtApi, depth: number, style: string | null, after: string[]): string {
  const ordered = node.type === 'orderedList';
  const start = ordered ? Math.max(1, Number(node.attrs?.start) || 1) : 1;
  const items = (node.content ?? []).map((item, i) => {
    let body = '';
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        body += listXml(child, ctx, api, depth + 1, null, after);
        continue;
      }
      // ODF list items hold paragraphs, headings and lists (ODF 1.3, text:list-item): tables and indexes go after the list.
      if (child.type === 'table' || child.type === 'tableOfContents') after.push(api.blocks([child], ctx));
      else if (child.type === 'paragraph') body += api.paragraph(child, ctx);
      else {
        const was = ctx.inListItem;
        ctx.inListItem = true;
        body += api.blocks([child], ctx);
        ctx.inListItem = was;
      }
    }
    return el('text:list-item', { 'text:start-value': i === 0 && start !== 1 ? start : undefined }, body || '<text:p/>');
  });
  return el('text:list', { 'text:style-name': style ?? undefined }, items.join(''));
}
