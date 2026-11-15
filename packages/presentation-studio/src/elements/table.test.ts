import { describe, expect, it } from 'vitest';
import { elementProblem } from '../safety';
import { plainTextOf, richTextFromPlain, type TableElement } from '../types';
import {
  anchorOf,
  cellAt,
  cellBox,
  deleteColumn,
  deleteRow,
  fitTableToBox,
  growRow,
  insertColumn,
  insertRow,
  newTable,
  nextCell,
  rangeOf,
  setCellBorders,
  setCellFill,
  setCellText,
  setRowHeights,
  setTableStyle,
  syncTableBox,
  tableHasSpans,
} from './table';

const t3 = () => newTable('t', 3, 3, { x: 10, y: 20, w: 300, h: 120 });
const texts = (t: TableElement) => t.rows.map((r) => r.cells.map((c) => plainTextOf(c.text)));
const frozen = <T,>(v: T): T => {
  const deep = (o: unknown) => {
    if (o && typeof o === 'object') {
      Object.freeze(o);
      Object.values(o).forEach(deep);
    }
  };
  deep(v);
  return v;
};

describe('tables', () => {
  it('makes a valid table of the asked size whose box is its columns and rows', () => {
    const t = t3();
    expect(elementProblem(t)).toBeNull();
    expect(t.columns).toEqual([100, 100, 100]);
    expect(t.rows.map((r) => r.height)).toEqual([40, 40, 40]);
    expect([t.w, t.h]).toEqual([300, 120]);
    expect(t.style.headerRow).toBe(true);
    // Sizes are kept within the limits the Insert controls offer.
    expect(newTable('x', 99, 99, { x: 0, y: 0, w: 900, h: 500 }).columns).toHaveLength(12);
  });

  it('sets cell text without changing anything else, and never changes its input', () => {
    const t = frozen(t3());
    const u = setCellText(t, { row: 1, col: 2 }, richTextFromPlain('x'));
    expect(texts(u)[1]).toEqual(['', '', 'x']);
    expect(u.rows[0]).toBe(t.rows[0]);
    expect(setCellText(u, { row: 1, col: 2 }, u.rows[1].cells[2].text)).toBe(u);
  });

  it('inserts and deletes rows and columns, keeping the box in step', () => {
    let t = setCellText(t3(), { row: 0, col: 0 }, richTextFromPlain('A'));
    t = insertRow(t, 0);
    expect(texts(t)[1][0]).toBe('A');
    expect(t.h).toBe(160);
    t = insertColumn(t, 1);
    expect(t.columns).toHaveLength(4);
    expect(t.w).toBe(400);
    expect(t.rows.every((r) => r.cells.length === 4)).toBe(true);
    t = deleteRow(t, 0);
    t = deleteColumn(t, 1);
    expect(texts(t)[0][0]).toBe('A');
    expect([t.w, t.h, t.columns.length, t.rows.length]).toEqual([300, 120, 3, 3]);
    expect(elementProblem(t)).toBeNull();
  });

  it('never deletes the last row or column', () => {
    const one = newTable('t', 1, 1, { x: 0, y: 0, w: 100, h: 40 });
    expect(deleteRow(one, 0)).toBe(one);
    expect(deleteColumn(one, 0)).toBe(one);
  });

  it('leaves tables with merged cells alone (no row or column operation can break a span)', () => {
    const t = t3();
    const merged: TableElement = { ...t, rows: t.rows.map((r, i) => (i === 0 ? { ...r, cells: [{ ...r.cells[0], colSpan: 2 }, { ...r.cells[1], merged: true }, r.cells[2]] } : r)) };
    expect(tableHasSpans(merged)).toBe(true);
    expect(tableHasSpans(t)).toBe(false);
    for (const op of [insertRow, deleteRow, insertColumn, deleteColumn]) expect(op(merged, 1)).toBe(merged);
    // The covered cell belongs to the cell that spans it; Tab skips it.
    expect(anchorOf(merged, { row: 0, col: 1 })).toEqual({ row: 0, col: 0 });
    expect(nextCell(merged, { row: 0, col: 0 })).toEqual({ row: 0, col: 2 });
    expect(cellBox(merged, { row: 0, col: 0 }).w).toBe(200);
    expect(cellAt(merged, 150, 10)).toEqual({ row: 0, col: 0 });
  });

  it('fills the selected cells, or clears them back to the table style', () => {
    const t = setCellFill(t3(), rangeOf({ row: 0, col: 0 }, { row: 1, col: 1 }), { theme: 'accent2' });
    expect(t.rows.flatMap((r) => r.cells.map((c) => !!c.fill))).toEqual([true, true, false, true, true, false, false, false, false]);
    const all = setCellFill(t, null, null);
    expect(all.rows.every((r) => r.cells.every((c) => c.fill === undefined))).toBe(true);
  });

  it('sets all, outside, inside or no borders on a range', () => {
    const line = { color: '#000000', width: 1, dash: 'solid' as const };
    const r = rangeOf({ row: 0, col: 0 }, { row: 1, col: 1 });
    const outside = setCellBorders(t3(), r, 'outside', line);
    expect(outside.rows[0].cells[0].borders).toEqual({ top: line, left: line });
    expect(outside.rows[1].cells[1].borders).toEqual({ bottom: line, right: line });
    expect(outside.rows[2].cells[2].borders).toBeUndefined();
    const inside = setCellBorders(t3(), r, 'inside', line);
    expect(inside.rows[0].cells[0].borders).toEqual({ right: line, bottom: line });
    const none = setCellBorders(t3(), null, 'none', line);
    expect(none.rows[2].cells[2].borders).toEqual({ top: null, right: null, bottom: null, left: null });
    const all = setCellBorders(t3(), null, 'all', line);
    expect(Object.keys(all.rows[1].cells[1].borders!)).toHaveLength(4);
    expect(elementProblem(all)).toBeNull();
  });

  it('changes the table style only when something differs', () => {
    const t = t3();
    expect(setTableStyle(t, { headerRow: true })).toBe(t);
    expect(setTableStyle(t, { bandedRows: false }).style.bandedRows).toBe(false);
  });

  it('fits columns and rows to a resized box, in whole pixels that add up to it', () => {
    const t = { ...t3(), w: 451, h: 61 };
    const f = fitTableToBox(t);
    expect(f.columns.reduce((a, b) => a + b, 0)).toBe(451);
    expect(f.w).toBe(451);
    // Rows never go below the minimum: the box follows them.
    expect(f.rows.every((r) => r.height >= 20)).toBe(true);
    expect(f.h).toBe(f.rows.reduce((a, r) => a + r.height, 0));
    const same = t3();
    expect(fitTableToBox(same)).toBe(same);
  });

  it('grows rows for their text and takes measured heights (never by a pixel of noise)', () => {
    const t = t3();
    expect(growRow(t, 1, 39)).toBe(t);
    const g = growRow(t, 1, 70.2);
    expect(g.rows[1].height).toBe(71);
    expect(g.h).toBe(151);
    expect(setRowHeights(t, [40.5, 40, 41])).toBe(t);
    expect(setRowHeights(t, [40, 90, 40]).h).toBe(170);
    expect(syncTableBox(t)).toBe(t);
  });

  it('finds the cell at a point and the next cell for Tab and Shift+Tab', () => {
    const t = t3();
    expect(cellAt(t, 250, 50)).toEqual({ row: 1, col: 2 });
    expect(cellAt(t, 301, 50)).toBeNull();
    expect(nextCell(t, { row: 0, col: 2 })).toEqual({ row: 1, col: 0 });
    expect(nextCell(t, { row: 2, col: 2 })).toBeNull();
    expect(nextCell(t, { row: 0, col: 0 }, true)).toBeNull();
    expect(cellBox(t, { row: 2, col: 1 })).toEqual({ x: 100, y: 80, w: 100, h: 40 });
  });
});
