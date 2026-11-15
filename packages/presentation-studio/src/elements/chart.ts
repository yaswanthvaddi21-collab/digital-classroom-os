/**
 * The hand-written chart renderer (Phase 7 CONTENT, ADR 0014): bar, column, line, pie and doughnut charts laid out as
 * a list of plain drawing primitives, in slide pixels inside the chart's box. The same primitives are drawn by the
 * editor, the thumbnails and the slide show (ChartSvg) and written as SVG markup for the PDF export (chartSvgMarkup),
 * so every place shows the same chart. Pure: no DOM, text widths are estimated from the font size.
 */
import { cssFontFamily, resolveColor, resolveFont } from '../themes';
import type { ChartElement, ChartType, Color, LegendPosition, PresentationTheme, ThemeColorSlot } from '../types';

export type ChartPrimitive =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; role?: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; role?: string }
  | { kind: 'path'; d: string; fill: string; stroke: string; width: number; role?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; width: number; role?: string }
  | { kind: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; fill: string; bold?: boolean; role?: string };

export interface ChartGraphic {
  width: number;
  height: number;
  /** The CSS font family every text uses. */
  fontFamily: string;
  items: ChartPrimitive[];
}

const PT = 96 / 72;
const ACCENTS: ThemeColorSlot[] = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

export const CHART_TYPE_NAMES: Readonly<Record<ChartType, string>> = { column: 'Column', bar: 'Bar', line: 'Line', pie: 'Pie', doughnut: 'Doughnut' };
export const LEGEND_NAMES: Readonly<Record<LegendPosition, string>> = { none: 'None', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };

/** The theme accent a series or slice at `index` takes when it has no colour of its own (cycling after six). */
export const defaultChartColor = (index: number): Color => ({ theme: ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length] });

/** Whether a chart draws one colour per category (pie, doughnut) rather than one per series. */
export const isRoundChart = (type: ChartType) => type === 'pie' || type === 'doughnut';

/** The colour of series `i`. */
export const seriesColor = (el: ChartElement, i: number, theme: PresentationTheme) => resolveColor(el.series[i]?.color ?? defaultChartColor(i), theme);
/** The colour of slice (category) `i` of a pie or doughnut. */
export const sliceColor = (el: ChartElement, i: number, theme: PresentationTheme) => resolveColor(el.categoryColors?.[i] ?? defaultChartColor(i), theme);

/** A number as a short label: at most two decimals, thousands grouped. */
export function formatValue(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  const [int, dec] = Math.abs(rounded).toFixed(2).replace(/\.?0+$/, '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '−' : ''}${grouped}${dec ? `.${dec}` : ''}`;
}

/** Estimated width of a text in px (average glyph ≈ 0.55 em): enough to keep labels apart without measuring. */
export const textWidth = (text: string, sizePx: number) => text.length * sizePx * 0.55;

/**
 * "Nice" axis bounds and step for values from `min` to `max` (0 always included, as PowerPoint does for these charts):
 * steps of 1, 2, 2.5 or 5 × 10^n, about five of them.
 */
export function niceScale(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, ticks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-12) ?? 10 * mag);
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  return { min: lo, max: hi, step };
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** The value range a bar/column/line chart shows (stacked charts add positives and negatives separately). */
function valueRange(el: ChartElement): { min: number; max: number } {
  let min = 0;
  let max = 0;
  const stacked = el.stacked && el.chartType !== 'line';
  if (stacked) {
    el.categories.forEach((_, c) => {
      let pos = 0;
      let neg = 0;
      for (const s of el.series) {
        const v = s.values[c];
        if (!finite(v)) continue;
        if (v >= 0) pos += v;
        else neg += v;
      }
      max = Math.max(max, pos);
      min = Math.min(min, neg);
    });
  } else {
    for (const s of el.series) for (const v of s.values.slice(0, el.categories.length)) if (finite(v)) (max = Math.max(max, v)), (min = Math.min(min, v));
  }
  return { min, max };
}

interface Legend {
  entries: Array<{ label: string; color: string }>;
}

function legendOf(el: ChartElement, theme: PresentationTheme): Legend {
  if (isRoundChart(el.chartType)) return { entries: el.categories.map((label, i) => ({ label, color: sliceColor(el, i, theme) })) };
  return { entries: el.series.map((s, i) => ({ label: s.name, color: seriesColor(el, i, theme) })) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Lays out a chart in its own box (0,0 to el.w × el.h). */
export function layoutChart(el: ChartElement, theme: PresentationTheme): ChartGraphic {
  const W = Math.max(1, el.w);
  const H = Math.max(1, el.h);
  const fontPx = Math.max(6, el.fontSize * PT);
  const text = resolveColor(el.textColor, theme);
  const grid = mix(text, resolveColor({ theme: 'light1' }, theme), 0.82);
  const axis = mix(text, resolveColor({ theme: 'light1' }, theme), 0.55);
  const items: ChartPrimitive[] = [];
  const pad = Math.min(12, Math.max(4, Math.min(W, H) * 0.04));
  let area = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };

  // Title.
  if (el.showTitle && el.title.trim()) {
    const size = fontPx * 1.3;
    items.push({ kind: 'text', x: W / 2, y: area.y + size * 0.85, text: el.title.trim(), size, anchor: 'middle', fill: text, bold: true, role: 'title' });
    area = { ...area, y: area.y + size * 1.4, h: area.h - size * 1.4 };
  }

  // Legend.
  const legend = legendOf(el, theme);
  if (el.legend !== 'none' && legend.entries.length) {
    const sw = fontPx * 0.8;
    const gap = fontPx * 0.4;
    const entryW = (label: string) => sw + gap + textWidth(label, fontPx) + fontPx;
    if (el.legend === 'top' || el.legend === 'bottom') {
      const total = legend.entries.reduce((a, e) => a + entryW(e.label), 0) - fontPx;
      const rowH = fontPx * 1.6;
      const y = el.legend === 'top' ? area.y : area.y + area.h - rowH;
      let x = Math.max(area.x, W / 2 - total / 2);
      for (const e of legend.entries) {
        items.push({ kind: 'rect', x, y: y + (rowH - sw) / 2, w: sw, h: sw, fill: e.color, role: 'legend' });
        items.push({ kind: 'text', x: x + sw + gap, y: y + rowH / 2 + fontPx * 0.35, text: e.label, size: fontPx, anchor: 'start', fill: text, role: 'legend' });
        x += entryW(e.label);
      }
      area = el.legend === 'top' ? { ...area, y: area.y + rowH, h: area.h - rowH } : { ...area, h: area.h - rowH };
    } else {
      const colW = Math.min(area.w * 0.4, Math.max(...legend.entries.map((e) => entryW(e.label))));
      const rowH = fontPx * 1.5;
      const x = el.legend === 'left' ? area.x : area.x + area.w - colW + fontPx;
      let y = area.y + Math.max(0, (area.h - rowH * legend.entries.length) / 2);
      for (const e of legend.entries) {
        items.push({ kind: 'rect', x, y: y + (rowH - sw) / 2, w: sw, h: sw, fill: e.color, role: 'legend' });
        items.push({ kind: 'text', x: x + sw + gap, y: y + rowH / 2 + fontPx * 0.35, text: e.label, size: fontPx, anchor: 'start', fill: text, role: 'legend' });
        y += rowH;
      }
      area = el.legend === 'left' ? { ...area, x: area.x + colW, w: area.w - colW } : { ...area, w: area.w - colW };
    }
  }

  const hasData = el.categories.length > 0 && el.series.some((s) => s.values.slice(0, el.categories.length).some(finite));
  if (!hasData || area.w < 8 || area.h < 8) {
    items.push({ kind: 'text', x: W / 2, y: area.y + area.h / 2, text: 'No data', size: fontPx, anchor: 'middle', fill: axis, role: 'empty' });
    return { width: W, height: H, fontFamily: cssFontFamily(resolveFont(el.font, theme)), items };
  }

  if (isRoundChart(el.chartType)) roundChart(el, theme, area, fontPx, text, items);
  else axisChart(el, theme, area, fontPx, text, grid, axis, items);
  return { width: W, height: H, fontFamily: cssFontFamily(resolveFont(el.font, theme)), items };
}

type Area = { x: number; y: number; w: number; h: number };

function axisChart(el: ChartElement, theme: PresentationTheme, area: Area, fontPx: number, text: string, grid: string, axis: string, items: ChartPrimitive[]) {
  const horizontal = el.chartType === 'bar';
  const range = valueRange(el);
  const scale = niceScale(range.min, range.max);
  const tickLabels: number[] = [];
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) tickLabels.push(Math.round(v / scale.step) * scale.step);
  const n = el.categories.length;
  const labelSize = fontPx;
  const valueLabelW = Math.max(...tickLabels.map((v) => textWidth(formatValue(v), labelSize))) + fontPx * 0.5;
  const catLabelW = Math.max(...el.categories.map((c) => textWidth(c, labelSize))) + fontPx * 0.5;

  // Plot box, leaving room for the axis labels.
  const plot = horizontal
    ? { x: area.x + Math.min(area.w * 0.4, catLabelW), y: area.y + fontPx * 0.5, w: 0, h: 0 }
    : { x: area.x + Math.min(area.w * 0.3, valueLabelW), y: area.y + fontPx * 0.5, w: 0, h: 0 };
  plot.w = Math.max(1, area.x + area.w - plot.x - fontPx * 0.5);
  plot.h = Math.max(1, area.y + area.h - plot.y - fontPx * 1.6);

  const span = scale.max - scale.min || 1;
  // Value → position along the value axis.
  const vpos = (v: number) => (horizontal ? plot.x + ((v - scale.min) / span) * plot.w : plot.y + plot.h - ((v - scale.min) / span) * plot.h);

  // Gridlines and value labels.
  for (const v of tickLabels) {
    const p = vpos(v);
    if (horizontal) {
      items.push({ kind: 'line', x1: r2(p), y1: plot.y, x2: r2(p), y2: plot.y + plot.h, stroke: v === 0 ? axis : grid, width: 1, role: 'grid' });
      items.push({ kind: 'text', x: r2(p), y: plot.y + plot.h + fontPx * 1.2, text: formatValue(v), size: labelSize, anchor: 'middle', fill: text, role: 'axis' });
    } else {
      items.push({ kind: 'line', x1: plot.x, y1: r2(p), x2: plot.x + plot.w, y2: r2(p), stroke: v === 0 ? axis : grid, width: 1, role: 'grid' });
      items.push({ kind: 'text', x: plot.x - fontPx * 0.4, y: r2(p + labelSize * 0.35), text: formatValue(v), size: labelSize, anchor: 'end', fill: text, role: 'axis' });
    }
  }

  // Category slots and labels.
  const slot = (horizontal ? plot.h : plot.w) / n;
  el.categories.forEach((c, i) => {
    const mid = (horizontal ? plot.y : plot.x) + slot * (i + 0.5);
    // Labels that would overlap are thinned out (every k-th is drawn).
    const every = horizontal ? Math.max(1, Math.ceil((labelSize * 1.2) / slot)) : Math.max(1, Math.ceil(textWidth(c, labelSize) / slot));
    if (i % every) return;
    if (horizontal) items.push({ kind: 'text', x: plot.x - fontPx * 0.4, y: r2(mid + labelSize * 0.35), text: c, size: labelSize, anchor: 'end', fill: text, role: 'category' });
    else items.push({ kind: 'text', x: r2(mid), y: plot.y + plot.h + fontPx * 1.2, text: c, size: labelSize, anchor: 'middle', fill: text, role: 'category' });
  });

  const zero = vpos(Math.max(scale.min, Math.min(0, scale.max)));
  const series = el.series;
  if (el.chartType === 'line') {
    series.forEach((s, si) => {
      const color = seriesColor(el, si, theme);
      let d = '';
      let open = false;
      const pts: Array<[number, number, number]> = [];
      el.categories.forEach((_, i) => {
        const v = s.values[i];
        if (!finite(v)) {
          open = false;
          return;
        }
        const x = plot.x + slot * (i + 0.5);
        const y = vpos(v);
        d += `${open ? 'L' : 'M'}${r2(x)},${r2(y)} `;
        open = true;
        pts.push([x, y, v]);
      });
      if (d) items.push({ kind: 'path', d: d.trim(), fill: 'none', stroke: color, width: Math.max(1.5, fontPx * 0.18), role: `series-${si}` });
      for (const [x, y, v] of pts) {
        items.push({ kind: 'circle', cx: r2(x), cy: r2(y), r: Math.max(2, fontPx * 0.22), fill: color, stroke: color, width: 1, role: `series-${si}` });
        if (el.showValues) items.push({ kind: 'text', x: r2(x), y: r2(y - fontPx * 0.6), text: formatValue(v), size: labelSize * 0.9, anchor: 'middle', fill: text, role: 'value' });
      }
    });
    return;
  }

  // Bars (column: vertical, bar: horizontal).
  const groupW = slot * 0.7;
  const stacked = !!el.stacked && series.length > 1;
  const barW = stacked ? groupW : groupW / Math.max(1, series.length);
  el.categories.forEach((_, i) => {
    const start = (horizontal ? plot.y : plot.x) + slot * i + (slot - groupW) / 2;
    let pos = 0;
    let neg = 0;
    series.forEach((s, si) => {
      const v = s.values[i];
      if (!finite(v)) return;
      const color = seriesColor(el, si, theme);
      let from: number;
      let to: number;
      if (stacked) {
        const base = v >= 0 ? pos : neg;
        from = vpos(base);
        to = vpos(base + v);
        if (v >= 0) pos += v;
        else neg += v;
      } else {
        from = zero;
        to = vpos(v);
      }
      const offset = stacked ? start : start + barW * si;
      const a = Math.min(from, to);
      const len = Math.abs(to - from);
      const rect = horizontal ? { x: r2(a), y: r2(offset), w: r2(len), h: r2(barW) } : { x: r2(offset), y: r2(a), w: r2(barW), h: r2(len) };
      items.push({ kind: 'rect', ...rect, fill: color, role: `series-${si}` });
      if (el.showValues) {
        const label = formatValue(v);
        if (horizontal) items.push({ kind: 'text', x: r2(stacked ? a + len / 2 : v >= 0 ? to + fontPx * 0.3 : to - fontPx * 0.3), y: r2(offset + barW / 2 + labelSize * 0.3), text: label, size: labelSize * 0.9, anchor: stacked ? 'middle' : v >= 0 ? 'start' : 'end', fill: text, role: 'value' });
        else items.push({ kind: 'text', x: r2(offset + barW / 2), y: r2(stacked ? a + len / 2 + labelSize * 0.3 : v >= 0 ? to - fontPx * 0.3 : to + fontPx * 1.0), text: label, size: labelSize * 0.9, anchor: 'middle', fill: text, role: 'value' });
      }
    });
  });
}

function roundChart(el: ChartElement, theme: PresentationTheme, area: Area, fontPx: number, text: string, items: ChartPrimitive[]) {
  const values = el.categories.map((_, i) => el.series[0]?.values[i]);
  const total = values.reduce<number>((a, v) => a + (finite(v) && v > 0 ? v : 0), 0);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const r = Math.max(1, Math.min(area.w, area.h) / 2 - fontPx * 0.4);
  const inner = el.chartType === 'doughnut' ? r * 0.5 : 0;
  if (!(total > 0)) {
    items.push({ kind: 'text', x: cx, y: cy, text: 'No data', size: fontPx, anchor: 'middle', fill: text, role: 'empty' });
    return;
  }
  const bg = resolveColor({ theme: 'light1' }, theme);
  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (!finite(v) || v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const color = sliceColor(el, i, theme);
    const pt = (rad: number, a: number) => `${r2(cx + rad * Math.cos(a))},${r2(cy + rad * Math.sin(a))}`;
    let d: string;
    if (sweep >= Math.PI * 2 - 1e-6) {
      // One slice: a full circle (an arc cannot start and end at the same point).
      d = `M${pt(r, a0)} A${r2(r)},${r2(r)} 0 1 1 ${pt(r, a0 + Math.PI)} A${r2(r)},${r2(r)} 0 1 1 ${pt(r, a0)} Z`;
      if (inner) d += ` M${pt(inner, a0)} A${r2(inner)},${r2(inner)} 0 1 0 ${pt(inner, a0 + Math.PI)} A${r2(inner)},${r2(inner)} 0 1 0 ${pt(inner, a0)} Z`;
    } else {
      const large = sweep > Math.PI ? 1 : 0;
      d = inner
        ? `M${pt(r, a0)} A${r2(r)},${r2(r)} 0 ${large} 1 ${pt(r, a1)} L${pt(inner, a1)} A${r2(inner)},${r2(inner)} 0 ${large} 0 ${pt(inner, a0)} Z`
        : `M${r2(cx)},${r2(cy)} L${pt(r, a0)} A${r2(r)},${r2(r)} 0 ${large} 1 ${pt(r, a1)} Z`;
    }
    items.push({ kind: 'path', d, fill: color, stroke: bg, width: 1, role: `slice-${i}` });
    if (el.showValues) {
      const mid = (a0 + a1) / 2;
      const lr = inner ? (r + inner) / 2 : r * 0.62;
      items.push({ kind: 'text', x: r2(cx + lr * Math.cos(mid)), y: r2(cy + lr * Math.sin(mid) + fontPx * 0.35), text: formatValue(v), size: fontPx * 0.9, anchor: 'middle', fill: contrastOn(color), role: 'value' });
    }
  });
}

/** '#rrggbb' a fraction `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Black or white, whichever reads better on `hex`. */
export function contrastOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#000000' : '#ffffff';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A chart as standalone SVG markup (in its own box, width × height px), for the PDF export (svg2pdf) and anything else
 * that needs the chart outside React. The markup holds only rect, line, path, circle and text: nothing svg2pdf
 * cannot draw.
 */
export function chartSvgMarkup(el: ChartElement, theme: PresentationTheme): string {
  const g = layoutChart(el, theme);
  const body = g.items
    .map((p) => {
      switch (p.kind) {
        case 'rect':
          return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill}"/>`;
        case 'line':
          return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.stroke}" stroke-width="${p.width}"/>`;
        case 'path':
          return `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linejoin="round"/>`;
        case 'circle':
          return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.width}"/>`;
        case 'text':
          return `<text x="${p.x}" y="${p.y}" font-size="${r2(p.size)}" text-anchor="${p.anchor}" fill="${p.fill}"${p.bold ? ' font-weight="bold"' : ''}>${esc(p.text)}</text>`;
      }
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(g.width)}" height="${r2(g.height)}" viewBox="0 0 ${r2(g.width)} ${r2(g.height)}" font-family="${esc(g.fontFamily)}">${body}</svg>`;
}
