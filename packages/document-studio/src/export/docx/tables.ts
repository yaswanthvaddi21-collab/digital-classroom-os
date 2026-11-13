import type { JSONContent } from '@tiptap/core';
import { Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, WidthType } from 'docx';
import type { Block, Ctx, DocxApi } from './context';
import { pxToTwip } from './units';

/** Smallest width the editor gives a column without a stored width (CSS min-width 2em at 12pt), in pixels. */
const MIN_COLUMN_PX = 32;

/**
 * Where each cell starts, by row: its first grid column. Cells that a cell above covers with its rowspan are not in
 * the row's content, so a row after one is shifted along past them (as the editor's TableMap places it).
 * `columns` is the width of the grid.
 */
export function cellColumns(node: JSONContent): { columns: number; starts: number[][] } {
  const remaining: number[] = [];
  let columns = 0;
  const starts = (node.content ?? []).map((row) => {
    const covered = remaining.map((n) => n > 0);
    for (let c = 0; c < remaining.length; c++) if (remaining[c] > 0) remaining[c]--;
    let col = 0;
    const rowStarts = (row.content ?? []).map((cell) => {
      while (covered[col]) col++;
      const start = col;
      const span = Number(cell.attrs?.colspan) || 1;
      const rowspan = Number(cell.attrs?.rowspan) || 1;
      for (let i = 0; i < span; i++) remaining[start + i] = rowspan - 1;
      col += span;
      return start;
    });
    columns = Math.max(columns, col, covered.lastIndexOf(true) + 1);
    return rowStarts;
  });
  return { columns, starts };
}

/**
 * Column widths in pixels, as the editor lays the table out. The editor stores a width per column only after the
 * user resizes one (cell attribute `colwidth`, one entry per spanned column), read here from the first row that
 * gives each column one. Returns null when no column has a width (Word then shares the width equally, as the
 * editor does). Columns without a width share what is left of the text width; a table wider than the text width
 * is scaled down to it, as Word would otherwise run it into the margin.
 */
export function columnWidthsPx(node: JSONContent, textWidthPx: number): number[] | null {
  const rows = node.content ?? [];
  const { columns, starts } = cellColumns(node);
  if (!columns) return null;
  const widths: Array<number | null> = Array(columns).fill(null);
  rows.forEach((row, r) => {
    (row.content ?? []).forEach((cell, c) => {
      const col = starts[r][c];
      const span = Number(cell.attrs?.colspan) || 1;
      const cw = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as unknown[]) : [];
      for (let i = 0; i < span; i++) {
        const w = Number(cw[i]);
        if (col + i < columns && widths[col + i] === null && Number.isFinite(w) && w > 0) widths[col + i] = w;
      }
    });
  });
  if (widths.every((w) => w === null)) return null;
  const known = widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const unknown = widths.filter((w) => w === null).length;
  const share = unknown ? Math.max(MIN_COLUMN_PX, (textWidthPx - known) / unknown) : 0;
  const filled = widths.map((w) => w ?? share);
  const total = filled.reduce((a, b) => a + b, 0);
  // Fully sized tables keep their width (they may be narrower than the page); others fill the text width.
  const target = unknown ? textWidthPx : Math.min(total, textWidthPx);
  return filled.map((w) => (w * target) / total);
}

export function tableBlock(node: JSONContent, ctx: Ctx, api: DocxApi): Table {
  const widths = columnWidthsPx(node, ctx.contentWidthPx);
  const { starts } = cellColumns(node);
  const rows = (node.content ?? []).map((row, r) => {
    return new TableRow({
      tableHeader: (row.content ?? []).every((c) => c.type === 'tableHeader'),
      children: (row.content ?? []).map((cell, c) => {
        const span = Number(cell.attrs?.colspan) || 1;
        const col = starts[r][c];
        const cellPx = widths ? widths.slice(col, col + span).reduce((a, b) => a + b, 0) : ctx.contentWidthPx / Math.max(1, row.content?.length ?? 1);
        const isHeader = cell.type === 'tableHeader';
        const cellCtx: Ctx = { ...ctx, contentWidthPx: cellPx, inCell: true };
        const blocks: Block[] = api.blocks(cell.content ?? [], cellCtx);
        // Lists in cells take numbering instances from the same sequence as the rest of the document.
        ctx.listInstance = cellCtx.listInstance;
        const children = blocks.filter((b): b is Paragraph | Table => b instanceof Paragraph || b instanceof Table);
        // Nested tables are kept; Word requires every cell to end with a paragraph.
        if (children.at(-1) instanceof Table) children.push(new Paragraph({}));
        return new TableCell({
          columnSpan: span,
          rowSpan: Number(cell.attrs?.rowspan) || 1,
          width: widths ? { size: pxToTwip(cellPx), type: WidthType.DXA } : undefined,
          shading: isHeader ? { type: ShadingType.CLEAR, fill: 'F1F1F4', color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: children.length ? children : [new Paragraph({})],
        });
      }),
    });
  });
  if (!widths) return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  const twips = widths.map(pxToTwip);
  return new Table({
    rows,
    columnWidths: twips,
    width: { size: twips.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
  });
}
