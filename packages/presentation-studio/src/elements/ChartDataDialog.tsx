import { Button, Dialog, Select } from '@dcos/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ChartElement, ChartSeries, Color, PresentationTheme } from '../types';
import { defaultChartColor, isRoundChart } from './chart';
import { colorKey, colorOptions, parseColorKey } from './colors';

export interface ChartData {
  categories: string[];
  series: ChartSeries[];
  categoryColors?: Color[];
}

/** A value typed in a data cell: '' = no value; anything else must be a number (comma or point as decimal mark). */
export function parseCell(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return { ok: true, value: null };
  const n = Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

const cellText = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/**
 * The chart's data as a grid (categories down, series across), as in PowerPoint's data sheet: names and values can be
 * typed, series and categories added and removed, and each series (each slice for pie and doughnut charts) given a
 * theme or standard colour. Saved as one change; Cancel changes nothing.
 */
export function ChartDataDialog({ chart, theme, onSave, onClose }: { chart: ChartElement; theme: PresentationTheme; onSave: (data: ChartData) => void; onClose: () => void }) {
  const round = isRoundChart(chart.chartType);
  const [categories, setCategories] = useState(() => chart.categories.slice());
  const [names, setNames] = useState(() => chart.series.map((s) => s.name));
  const [colors, setColors] = useState<Array<Color | undefined>>(() => chart.series.map((s) => s.color));
  const [catColors, setCatColors] = useState<Array<Color | undefined>>(() => chart.categories.map((_, i) => chart.categoryColors?.[i]));
  const [grid, setGrid] = useState<string[][]>(() => chart.categories.map((_, r) => chart.series.map((s) => cellText(s.values[r]))));
  const [error, setError] = useState<string | null>(null);
  const options = colorOptions(theme);

  const setCell = (r: number, c: number, v: string) => setGrid((g) => g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const addSeries = () => {
    setNames((n) => [...n, `Series ${n.length + 1}`]);
    setColors((c) => [...c, undefined]);
    setGrid((g) => g.map((row) => [...row, '']));
  };
  const removeSeries = (c: number) => {
    setNames((n) => n.filter((_, i) => i !== c));
    setColors((x) => x.filter((_, i) => i !== c));
    setGrid((g) => g.map((row) => row.filter((_, i) => i !== c)));
  };
  const addCategory = () => {
    setCategories((c) => [...c, `Category ${c.length + 1}`]);
    setCatColors((c) => [...c, undefined]);
    setGrid((g) => [...g, names.map(() => '')]);
  };
  const removeCategory = (r: number) => {
    setCategories((c) => c.filter((_, i) => i !== r));
    setCatColors((c) => c.filter((_, i) => i !== r));
    setGrid((g) => g.filter((_, i) => i !== r));
  };

  const save = () => {
    const series: ChartSeries[] = [];
    for (let c = 0; c < names.length; c++) {
      const values: Array<number | null> = [];
      for (let r = 0; r < categories.length; r++) {
        const p = parseCell(grid[r]?.[c] ?? '');
        if (!p.ok) {
          setError(`“${grid[r][c]}” (${categories[r] || `row ${r + 1}`}, ${names[c] || `series ${c + 1}`}) is not a number.`);
          return;
        }
        values.push(p.value);
      }
      series.push({ name: names[c], values, ...(colors[c] ? { color: colors[c] } : {}) });
    }
    if (!series.length) return setError('A chart needs at least one series.');
    if (!categories.length) return setError('A chart needs at least one category.');
    const kept = catColors.slice(0, categories.length);
    const data: ChartData = { categories: categories.slice(), series };
    if (kept.some(Boolean)) data.categoryColors = kept.map((c, i) => c ?? defaultChartColor(i));
    else if (chart.categoryColors) data.categoryColors = undefined;
    onSave(data);
  };

  const colorSelect = (label: string, value: Color | undefined, fallback: Color, onPick: (c: Color | undefined) => void) => (
    <Select aria-label={label} value={value ? colorKey(value) : ''} onChange={(e) => onPick(parseColorKey(e.target.value) ?? undefined)} className="h-7 w-28 py-0 text-xs">
      <option value="">Automatic ({options.find((o) => o.key === colorKey(fallback))?.label ?? 'theme'})</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </Select>
  );

  const input = 'h-7 w-full min-w-0 rounded-md border border-border bg-surface px-1.5 text-xs text-fg outline-none focus-visible:border-accent';
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Edit chart data"
      description={round ? 'Each row is one slice; only the first series is drawn in a pie or doughnut chart.' : 'Each row is a category; each column is a series. Leave a cell empty for no value.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save data
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" aria-label="Chart data">
          <thead>
            <tr>
              <th scope="col" className="p-1 text-left font-medium text-muted">
                Category
              </th>
              {names.map((n, c) => (
                <th key={c} scope="col" className="min-w-28 p-1 align-top">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <input aria-label={`Name of series ${c + 1}`} className={input} value={n} onChange={(e) => setNames((x) => x.map((v, i) => (i === c ? e.target.value : v)))} />
                      <button type="button" aria-label={`Remove series ${n || c + 1}`} title="Remove series" disabled={names.length <= 1} onClick={() => removeSeries(c)} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {!round && colorSelect(`Colour of series ${n || c + 1}`, colors[c], defaultChartColor(c), (v) => setColors((x) => x.map((y, i) => (i === c ? v : y))))}
                  </div>
                </th>
              ))}
              {round && (
                <th scope="col" className="p-1 text-left font-medium text-muted">
                  Slice colour
                </th>
              )}
              <th className="w-8 p-1" />
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, r) => (
              <tr key={r}>
                <td className="p-1">
                  <input aria-label={`Category ${r + 1}`} className={input} value={cat} onChange={(e) => setCategories((x) => x.map((v, i) => (i === r ? e.target.value : v)))} />
                </td>
                {names.map((n, c) => (
                  <td key={c} className="p-1">
                    <input
                      aria-label={`${n || `Series ${c + 1}`}, ${cat || `category ${r + 1}`}`}
                      inputMode="decimal"
                      className={`${input} text-right tabular-nums`}
                      value={grid[r]?.[c] ?? ''}
                      onChange={(e) => {
                        setError(null);
                        setCell(r, c, e.target.value);
                      }}
                    />
                  </td>
                ))}
                {round && <td className="p-1">{colorSelect(`Colour of ${cat || `slice ${r + 1}`}`, catColors[r], defaultChartColor(r), (v) => setCatColors((x) => x.map((y, i) => (i === r ? v : y))))}</td>}
                <td className="p-1">
                  <button type="button" aria-label={`Remove category ${cat || r + 1}`} title="Remove category" disabled={categories.length <= 1} onClick={() => removeCategory(r)} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus size={14} />} onClick={addCategory}>
          Add category
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={addSeries}>
          Add series
        </Button>
      </div>
    </Dialog>
  );
}
