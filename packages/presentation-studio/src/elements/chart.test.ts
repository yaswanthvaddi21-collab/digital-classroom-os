import { describe, expect, it } from 'vitest';
import { themeById } from '../themes';
import type { ChartElement, ChartType } from '../types';
import { chartSvgMarkup, contrastOn, defaultChartColor, formatValue, layoutChart, mix, niceScale, seriesColor, sliceColor, type ChartPrimitive } from './chart';
import { newChart } from './defaults';

const theme = themeById('classroom')!;
const chart = (type: ChartType, over: Partial<ChartElement> = {}): ChartElement => ({ ...newChart('c1', type, { x: 0, y: 0, w: 600, h: 360 }), ...over });
const byRole = (items: ChartPrimitive[], role: string) => items.filter((p) => p.role === role);
const rects = (items: ChartPrimitive[], prefix: string) => items.filter((p): p is Extract<ChartPrimitive, { kind: 'rect' }> => p.kind === 'rect' && !!p.role?.startsWith(prefix));

describe('chart helpers', () => {
  it('formats values with at most two decimals, grouped thousands and a real minus sign', () => {
    expect(formatValue(0)).toBe('0');
    expect(formatValue(12.5)).toBe('12.5');
    expect(formatValue(3.14159)).toBe('3.14');
    expect(formatValue(1234567)).toBe('1,234,567');
    expect(formatValue(-42.1)).toBe('−42.1');
  });

  it('picks nice axis bounds that include zero', () => {
    expect(niceScale(0, 81)).toEqual({ min: 0, max: 100, step: 20 });
    expect(niceScale(-12, 30)).toEqual({ min: -20, max: 30, step: 10 });
    expect(niceScale(5, 5).min).toBe(0);
    const s = niceScale(0, 0);
    expect(s.max).toBeGreaterThan(s.min);
  });

  it('colours series and slices from the theme accents unless they have their own', () => {
    expect(defaultChartColor(0)).toEqual({ theme: 'accent1' });
    expect(defaultChartColor(7)).toEqual({ theme: 'accent2' });
    const c = chart('column', { series: [{ name: 'A', values: [1], color: '#123456' }, { name: 'B', values: [2] }], categories: ['x'] });
    expect(seriesColor(c, 0, theme)).toBe('#123456');
    expect(seriesColor(c, 1, theme)).toBe(theme.colors.accent2);
    const p = chart('pie', { categoryColors: [{ theme: 'accent4' }] });
    expect(sliceColor(p, 0, theme)).toBe(theme.colors.accent4);
    expect(sliceColor(p, 1, theme)).toBe(theme.colors.accent2);
  });

  it('mixes colours and picks readable text on a colour', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(contrastOn('#ffffff')).toBe('#000000');
    expect(contrastOn('#1f2937')).toBe('#ffffff');
  });
});

describe('layoutChart', () => {
  it('column: one bar per category and series, side by side, inside the box, with axis and category labels', () => {
    const c = chart('column');
    const g = layoutChart(c, theme);
    const bars = rects(g.items, 'series-');
    expect(bars).toHaveLength(c.categories.length * c.series.length);
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(c.w);
      expect(b.y + b.h).toBeLessThanOrEqual(c.h);
    }
    // Taller value, taller bar (Class A week 4 = 81 is the largest).
    const a = rects(g.items, 'series-0');
    expect(a[3].h).toBeGreaterThan(a[0].h);
    expect(byRole(g.items, 'category').map((t) => t.kind === 'text' && t.text)).toEqual(c.categories);
    expect(byRole(g.items, 'title')).toHaveLength(1);
    expect(byRole(g.items, 'legend').filter((p) => p.kind === 'text').map((t) => t.kind === 'text' && t.text)).toEqual(['Class A', 'Class B']);
  });

  it('bar: horizontal bars, categories down the side', () => {
    const g = layoutChart(chart('bar'), theme);
    const a = rects(g.items, 'series-0');
    expect(a[3].w).toBeGreaterThan(a[0].w);
    // Horizontal: the bars of one category share their y band, growing along x from the same start.
    expect(new Set(a.map((b) => b.x)).size).toBe(1);
  });

  it('stacked columns sit on top of each other; negative values go below the zero line', () => {
    const c = chart('column', { stacked: true, categories: ['a', 'b'], series: [{ name: 'S1', values: [10, -5] }, { name: 'S2', values: [20, -5] }] });
    const g = layoutChart(c, theme);
    const [s1a, s1b] = rects(g.items, 'series-0');
    const [s2a, s2b] = rects(g.items, 'series-1');
    expect(s2a.y + s2a.h).toBeCloseTo(s1a.y, 1);
    expect(s1a.x).toBe(s2a.x);
    // Negatives stack downwards from the zero line.
    expect(s2b.y).toBeCloseTo(s1b.y + s1b.h, 1);
  });

  it('line: one path per series with a marker per value; a missing value breaks the line', () => {
    const c = chart('line', { categories: ['a', 'b', 'c', 'd'], series: [{ name: 'L', values: [1, null, 3, 4] }] });
    const g = layoutChart(c, theme);
    const path = g.items.find((p) => p.kind === 'path' && p.role === 'series-0');
    expect(path && path.kind === 'path' && path.d.match(/M/g)).toHaveLength(2);
    expect(g.items.filter((p) => p.kind === 'circle')).toHaveLength(3);
  });

  it('pie and doughnut: one slice per positive value of the first series, with value labels when asked', () => {
    const p = layoutChart(chart('pie', { showValues: true }), theme);
    expect(p.items.filter((i) => i.role?.startsWith('slice-'))).toHaveLength(4);
    expect(byRole(p.items, 'value')).toHaveLength(4);
    const d = layoutChart(chart('doughnut', { categories: ['only'], series: [{ name: 'S', values: [5] }] }), theme);
    const ring = d.items.find((i) => i.role === 'slice-0');
    // A single slice is a full ring (two arcs out, two in), not an empty arc.
    expect(ring?.kind === 'path' && ring.d.match(/A/g)).toHaveLength(4);
    const legend = byRole(p.items, 'legend').filter((i) => i.kind === 'text');
    expect(legend.map((t) => t.kind === 'text' && t.text)).toEqual(['Group A', 'Group B', 'Group C', 'Group D']);
  });

  it('says "No data" for a chart without values, and leaves out the title and legend when they are off', () => {
    const g = layoutChart(chart('column', { showTitle: false, legend: 'none', series: [{ name: 'S', values: [null, null, null, null] }] }), theme);
    expect(byRole(g.items, 'empty')).toHaveLength(1);
    expect(byRole(g.items, 'title')).toHaveLength(0);
    expect(byRole(g.items, 'legend')).toHaveLength(0);
  });

  it('puts the legend where it is asked: left and right take width, top and bottom take height', () => {
    for (const legend of ['top', 'bottom', 'left', 'right'] as const) {
      const g = layoutChart(chart('column', { legend }), theme);
      const swatches = g.items.filter((p) => p.kind === 'rect' && p.role === 'legend') as Array<{ x: number; y: number }>;
      expect(swatches).toHaveLength(2);
      if (legend === 'left') expect(swatches[0].x).toBeLessThan(100);
      if (legend === 'right') expect(swatches[0].x).toBeGreaterThan(400);
      if (legend === 'top') expect(swatches[0].y).toBeLessThan(100);
      if (legend === 'bottom') expect(swatches[0].y).toBeGreaterThan(250);
    }
  });
});

describe('chartSvgMarkup', () => {
  it('is standalone SVG with only shapes svg2pdf draws, and escapes text', () => {
    const svg = chartSvgMarkup(chart('column', { title: 'Marks <&> "growth"' }), theme);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"')).toBe(true);
    expect(svg).toContain('Marks &lt;&amp;&gt; &quot;growth&quot;');
    expect(svg).not.toMatch(/foreignObject|<image|<style/);
    const tags = new Set(Array.from(svg.matchAll(/<([a-z]+)/g), (m) => m[1]));
    expect([...tags].sort()).toEqual(['line', 'rect', 'svg', 'text']);
    for (const type of ['line', 'pie', 'doughnut', 'bar'] as const) expect(chartSvgMarkup(chart(type), theme)).toMatch(/^<svg[^>]+>.*<\/svg>$/);
  });
});
