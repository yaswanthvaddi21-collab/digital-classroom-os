import type { JSONContent } from '@tiptap/core';
import { cellColumns, columnWidthsPx } from '../docx/tables';
import type { OdtApi, OdtCtx } from './context';
import { checkAttrs } from './support';
import { el, pxToCm } from './xml';

type Slot = { cell: JSONContent; first: boolean } | 'covered' | null;

/**
 * Lays the table out on its grid: each position holds the cell starting there, a continuation of a spanning cell
 * (written as table:covered-table-cell, as ODF requires) or nothing (a short row, padded with an empty cell).
 */
function grid(node: JSONContent): { columns: number; rows: Slot[][] } {
  const { columns, starts } = cellColumns(node);
  const rows: Slot[][] = (node.content ?? []).map(() => Array<Slot>(columns).fill(null));
  (node.content ?? []).forEach((row, r) => {
    (row.content ?? []).forEach((cell, c) => {
      const start = starts[r][c];
      const colspan = Number(cell.attrs?.colspan) || 1;
      const rowspan = Number(cell.attrs?.rowspan) || 1;
      for (let dr = 0; dr < rowspan && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < colspan && start + dc < columns; dc++) {
          rows[r + dr][start + dc] = dr === 0 && dc === 0 ? { cell, first: true } : 'covered';
        }
      }
    });
  });
  return { columns, rows };
}

export function tableBlock(node: JSONContent, ctx: OdtCtx, api: OdtApi): string {
  const { columns, rows } = grid(node);
  if (!columns) return '';
  const name = `Table${++ctx.ids.table}`;
  const stored = columnWidthsPx(node, ctx.contentWidthPx);
  const widths = stored ?? Array<number>(columns).fill(ctx.contentWidthPx / columns);
  const total = widths.reduce((a, b) => a + b, 0);
  const tableStyle = ctx.styles.get(
    'table',
    'Tbl',
    el('style:table-properties', { 'style:width': pxToCm(total), 'table:align': total >= ctx.contentWidthPx - 1 ? 'margins' : 'left', 'fo:margin-top': '0.2cm', 'fo:margin-bottom': '0.2cm' }),
  );
  const cols = widths
    .map((w) => el('table:table-column', { 'table:style-name': ctx.styles.get('table-column', 'Col', el('style:table-column-properties', { 'style:column-width': pxToCm(w) })) }))
    .join('');
  const cellStyle = (header: boolean) =>
    ctx.styles.get(
      'table-cell',
      'Cell',
      el('style:table-cell-properties', { 'fo:padding-top': '0.1cm', 'fo:padding-bottom': '0.1cm', 'fo:padding-left': '0.15cm', 'fo:padding-right': '0.15cm', 'fo:border': '0.5pt solid #c9c9d2', 'fo:background-color': header ? '#f1f1f4' : undefined, 'style:vertical-align': 'top' }),
    );

  const rowXml = (slots: Slot[]) =>
    el(
      'table:table-row',
      {},
      slots
        .map((slot, c) => {
          if (slot === 'covered') return '<table:covered-table-cell/>';
          if (!slot) return el('table:table-cell', { 'table:style-name': cellStyle(false), 'office:value-type': 'string' }, '<text:p text:style-name="Table_20_Contents"/>');
          const cell = slot.cell;
          checkAttrs(cell.type ?? 'tableCell', cell.attrs, ctx);
          const header = cell.type === 'tableHeader';
          const colspan = Math.min(Number(cell.attrs?.colspan) || 1, columns - c);
          const rowspan = Number(cell.attrs?.rowspan) || 1;
          const cellPx = widths.slice(c, c + colspan).reduce((a, b) => a + b, 0);
          const align = typeof cell.attrs?.align === 'string' ? cell.attrs.align : undefined;
          const cellCtx: OdtCtx = { ...ctx, contentWidthPx: Math.max(16, cellPx - 12), inCell: true, paragraphStyle: header ? 'Table_20_Heading' : 'Table_20_Contents', cellAlign: align };
          const body = api.blocks(cell.content, cellCtx);
          return el(
            'table:table-cell',
            {
              'table:style-name': cellStyle(header),
              'office:value-type': 'string',
              'table:number-columns-spanned': colspan > 1 ? colspan : undefined,
              'table:number-rows-spanned': rowspan > 1 ? rowspan : undefined,
            },
            body || el('text:p', { 'text:style-name': cellCtx.paragraphStyle }),
          );
        })
        .join(''),
    );

  // Leading rows made only of header cells repeat on each page, as Word's header rows do.
  const tableRows = node.content ?? [];
  let headerCount = 0;
  while (headerCount < tableRows.length && (tableRows[headerCount].content ?? []).length > 0 && (tableRows[headerCount].content ?? []).every((c) => c.type === 'tableHeader')) headerCount++;
  const head = rows.slice(0, headerCount).map(rowXml).join('');
  const body = rows.slice(headerCount).map(rowXml).join('');
  return el('table:table', { 'table:name': name, 'table:style-name': tableStyle }, cols + (head ? el('table:table-header-rows', {}, head) : '') + body);
}
