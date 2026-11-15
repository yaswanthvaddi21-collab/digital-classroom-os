/**
 * Pure table operations (Phase 7 CONTENT): new tables, cell text, rows and columns, header and banding, cell fill and
 * borders, and keeping the column widths and row heights in step with the table's box. Each returns a new table and
 * never changes its input.
 *
 * Merged cells (colSpan/rowSpan) are shown and kept, but this build has no way to merge cells, so the row and column
 * operations are offered only for tables without merged cells (tableHasSpans), where they can never break a span.
 */
import { textStyle } from '../layouts';
import { emptyRichText, type CellBorders, type Color, type Line, type RichTextDoc, type TableCell, type TableElement, type TableRow } from '../types';

/** A cell position. */
export interface CellRef {
  row: number;
  col: number;
}
/** A rectangle of cells (inclusive). */
export interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const MIN_COLUMN_PX = 24;
export const MIN_ROW_PX = 20;
/** Largest table the Insert controls offer (rows × columns). */
export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLUMNS = 12;

const emptyCell = (): TableCell => ({ text: emptyRichText() });

/** The default table style: the theme's accent header, light banding and thin borders. */
export function defaultTableStyle(): TableElement['style'] {
  return {
    headerRow: true,
    bandedRows: true,
    firstColumn: false,
    fill: { theme: 'light1' },
    headerFill: { theme: 'accent1' },
    bandFill: { theme: 'light2' },
    headerTextColor: { theme: 'light1' },
    border: { color: { theme: 'dark2' }, width: 0.75, dash: 'solid' },
    text: textStyle({ fontSize: 14, autofit: 'none', padding: [4, 8, 4, 8] }),
  };
}

/** A new empty table of rows × columns filling `box` evenly. */
export function newTable(id: string, rows: number, columns: number, box: { x: number; y: number; w: number; h: number }): TableElement {
  const r = Math.max(1, Math.min(MAX_TABLE_ROWS, Math.round(rows)));
  const c = Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.round(columns)));
  const colW = Math.max(MIN_COLUMN_PX, Math.floor(box.w / c));
  const rowH = Math.max(MIN_ROW_PX, Math.floor(box.h / r));
  return {
    id,
    type: 'table',
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: colW * c,
    h: rowH * r,
    rotation: 0,
    columns: Array.from({ length: c }, () => colW),
    rows: Array.from({ length: r }, () => ({ height: rowH, cells: Array.from({ length: c }, emptyCell) })),
    style: defaultTableStyle(),
  };
}

export const tableHasSpans = (t: TableElement) => t.rows.some((r) => r.cells.some((c) => c.merged || (c.colSpan ?? 1) > 1 || (c.rowSpan ?? 1) > 1));

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** The table with its box set from its columns and rows (w = column widths, h = row heights). */
export function syncTableBox(t: TableElement): TableElement {
  const w = sum(t.columns);
  const h = sum(t.rows.map((r) => r.height));
  return w === t.w && h === t.h ? t : { ...t, w, h };
}

/**
 * The table fitted to a box it was resized to: column widths and row heights scaled in proportion, so a table that
 * was dragged larger draws larger (and the PPTX export writes the same sizes). Rows never go below MIN_ROW_PX.
 */
export function fitTableToBox(t: TableElement): TableElement {
  const cw = sum(t.columns);
  const rh = sum(t.rows.map((r) => r.height));
  if (cw === t.w && rh === t.h) return t;
  const sx = cw > 0 ? t.w / cw : 1;
  const sy = rh > 0 ? t.h / rh : 1;
  const columns = scaleExact(t.columns, sx, t.w, MIN_COLUMN_PX);
  const heights = scaleExact(t.rows.map((r) => r.height), sy, t.h, MIN_ROW_PX);
  const rows = t.rows.map((r, i) => (r.height === heights[i] ? r : { ...r, height: heights[i] }));
  return syncTableBox({ ...t, columns, rows });
}

/** Whole-pixel sizes scaled by `s` that add up to `total` (the rounding goes to the last one), each at least `min`. */
function scaleExact(sizes: number[], s: number, total: number, min: number): number[] {
  const out = sizes.map((v) => Math.max(min, Math.round(v * s)));
  const diff = Math.round(total) - sum(out);
  if (out.length) out[out.length - 1] = Math.max(min, out[out.length - 1] + diff);
  return out;
}

function mapCells(t: TableElement, range: CellRange | null, change: (c: TableCell, ref: CellRef) => TableCell): TableElement {
  let changed = false;
  const rows = t.rows.map((row, r) => {
    let rowChanged = false;
    const cells = row.cells.map((cell, c) => {
      if (range && (r < range.r0 || r > range.r1 || c < range.c0 || c > range.c1)) return cell;
      const next = change(cell, { row: r, col: c });
      if (next !== cell) rowChanged = true;
      return next;
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...row, cells };
  });
  return changed ? { ...t, rows } : t;
}

export function setCellText(t: TableElement, at: CellRef, text: RichTextDoc): TableElement {
  return mapCells(t, { r0: at.row, c0: at.col, r1: at.row, c1: at.col }, (c) => (c.text === text ? c : { ...c, text }));
}

/** Sets (or, with null, clears back to the table style's) fill of the cells in `range` (all cells when null). */
export function setCellFill(t: TableElement, range: CellRange | null, fill: Color | null): TableElement {
  return mapCells(t, range, (c) => {
    if (fill === null) {
      if (c.fill === undefined) return c;
      const { fill: _drop, ...rest } = c;
      void _drop;
      return rest;
    }
    return JSON.stringify(c.fill) === JSON.stringify(fill) ? c : { ...c, fill };
  });
}

export type BorderMode = 'all' | 'outside' | 'inside' | 'none';
export const BORDER_MODE_NAMES: Readonly<Record<BorderMode, string>> = { all: 'All borders', outside: 'Outside borders', inside: 'Inside borders', none: 'No borders' };

/**
 * Borders of the cells in `range` (all cells when null): every edge ('all'), only the edges around the range
 * ('outside', inner edges left as they are), only the edges between its cells ('inside'), or none.
 */
export function setCellBorders(t: TableElement, range: CellRange | null, mode: BorderMode, line: Line): TableElement {
  const R = range ?? { r0: 0, c0: 0, r1: t.rows.length - 1, c1: t.columns.length - 1 };
  return mapCells(t, R, (c, { row, col }) => {
    const b: CellBorders = { ...(c.borders ?? {}) };
    const edge = { top: row === R.r0, bottom: row === R.r1, left: col === R.c0, right: col === R.c1 };
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const outer = edge[side];
      if (mode === 'all') b[side] = { ...line };
      else if (mode === 'none') b[side] = null;
      else if (mode === 'outside' && outer) b[side] = { ...line };
      else if (mode === 'inside' && !outer) b[side] = { ...line };
    }
    return JSON.stringify(b) === JSON.stringify(c.borders ?? {}) ? c : { ...c, borders: b };
  });
}

export function setTableStyle(t: TableElement, change: Partial<TableElement['style']>): TableElement {
  const style = { ...t.style, ...change };
  return Object.keys(change).every((k) => JSON.stringify(style[k as keyof typeof style]) === JSON.stringify(t.style[k as keyof typeof style])) ? t : { ...t, style };
}

/** Inserts an empty row before index `at` (0 = first, rows.length = after the last), as tall as its neighbour. */
export function insertRow(t: TableElement, at: number): TableElement {
  if (tableHasSpans(t)) return t;
  const i = Math.max(0, Math.min(at, t.rows.length));
  const like = t.rows[Math.min(i, t.rows.length - 1)] ?? t.rows[0];
  const row: TableRow = { height: like?.height ?? MIN_ROW_PX * 2, cells: t.columns.map(emptyCell) };
  return syncTableBox({ ...t, rows: [...t.rows.slice(0, i), row, ...t.rows.slice(i)] });
}

/** Removes row `at` (never the last remaining row). */
export function deleteRow(t: TableElement, at: number): TableElement {
  if (tableHasSpans(t) || t.rows.length <= 1 || at < 0 || at >= t.rows.length) return t;
  return syncTableBox({ ...t, rows: t.rows.filter((_, i) => i !== at) });
}

/** Inserts an empty column before index `at`, as wide as its neighbour. */
export function insertColumn(t: TableElement, at: number): TableElement {
  if (tableHasSpans(t)) return t;
  const i = Math.max(0, Math.min(at, t.columns.length));
  const width = t.columns[Math.min(i, t.columns.length - 1)] ?? MIN_COLUMN_PX * 4;
  return syncTableBox({
    ...t,
    columns: [...t.columns.slice(0, i), width, ...t.columns.slice(i)],
    rows: t.rows.map((r) => ({ ...r, cells: [...r.cells.slice(0, i), emptyCell(), ...r.cells.slice(i)] })),
  });
}

/** Removes column `at` (never the last remaining column). */
export function deleteColumn(t: TableElement, at: number): TableElement {
  if (tableHasSpans(t) || t.columns.length <= 1 || at < 0 || at >= t.columns.length) return t;
  return syncTableBox({ ...t, columns: t.columns.filter((_, i) => i !== at), rows: t.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== at) })) });
}

/** Makes row `at` at least `height` px tall (text that grew while typing); the table's box follows. */
export function growRow(t: TableElement, at: number, height: number): TableElement {
  const row = t.rows[at];
  if (!row || height <= row.height + 0.5) return t;
  const rows = t.rows.slice();
  rows[at] = { ...row, height: Math.ceil(height) };
  return syncTableBox({ ...t, rows });
}

/** Sets row heights measured from the drawn table (rows that are taller than stored because of their text). */
export function setRowHeights(t: TableElement, heights: number[]): TableElement {
  let changed = false;
  const rows = t.rows.map((r, i) => {
    const h = heights[i];
    if (h === undefined || !(h > 0) || Math.abs(h - r.height) <= 1) return r;
    changed = true;
    return { ...r, height: Math.max(MIN_ROW_PX, Math.round(h)) };
  });
  return changed ? syncTableBox({ ...t, rows }) : t;
}

/** The box of a cell inside the table (table px), from the column widths and row heights. */
export function cellBox(t: TableElement, at: CellRef): { x: number; y: number; w: number; h: number } {
  const cell = t.rows[at.row]?.cells[at.col];
  const cs = cell?.colSpan ?? 1;
  const rs = cell?.rowSpan ?? 1;
  return {
    x: sum(t.columns.slice(0, at.col)),
    y: sum(t.rows.slice(0, at.row).map((r) => r.height)),
    w: sum(t.columns.slice(at.col, at.col + cs)),
    h: sum(t.rows.slice(at.row, at.row + rs).map((r) => r.height)),
  };
}

/** The cell at a point inside the table (table px), or null outside it. Covered cells give the cell that covers them. */
export function cellAt(t: TableElement, x: number, y: number): CellRef | null {
  if (x < 0 || y < 0) return null;
  let col = -1;
  for (let i = 0, acc = 0; i < t.columns.length; i++) {
    acc += t.columns[i];
    if (x < acc) {
      col = i;
      break;
    }
  }
  let row = -1;
  for (let i = 0, acc = 0; i < t.rows.length; i++) {
    acc += t.rows[i].height;
    if (y < acc) {
      row = i;
      break;
    }
  }
  if (row < 0 || col < 0) return null;
  return anchorOf(t, { row, col });
}

/** The visible cell that covers `at` (itself unless it is merged into another). */
export function anchorOf(t: TableElement, at: CellRef): CellRef {
  if (!t.rows[at.row]?.cells[at.col]?.merged) return at;
  for (let r = at.row; r >= 0; r--)
    for (let c = at.col; c >= 0; c--) {
      const cell = t.rows[r].cells[c];
      if (!cell.merged && r + (cell.rowSpan ?? 1) > at.row && c + (cell.colSpan ?? 1) > at.col) return { row: r, col: c };
    }
  return at;
}

/** The next visible cell in reading order (Tab), or null after the last. Shift+Tab goes back (null before the first). */
export function nextCell(t: TableElement, at: CellRef, back = false): CellRef | null {
  const cols = t.columns.length;
  let i = at.row * cols + at.col;
  const end = t.rows.length * cols;
  for (;;) {
    i += back ? -1 : 1;
    if (i < 0 || i >= end) return null;
    const ref = { row: Math.floor(i / cols), col: i % cols };
    if (!t.rows[ref.row].cells[ref.col].merged) return ref;
  }
}

export const rangeOf = (a: CellRef, b: CellRef = a): CellRange => ({ r0: Math.min(a.row, b.row), c0: Math.min(a.col, b.col), r1: Math.max(a.row, b.row), c1: Math.max(a.col, b.col) });
