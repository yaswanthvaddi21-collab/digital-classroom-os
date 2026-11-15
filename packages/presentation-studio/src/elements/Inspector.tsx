import { Button, cn, Select } from '@dcos/ui';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  CHART_TYPES,
  SHAPE_PRESETS,
  type Arrowhead,
  type ChartElement,
  type Color,
  type DiagramElement,
  type Fill,
  type ImageElement,
  type Line,
  type LineDash,
  type PresentationTheme,
  type ShapeElement,
  type SlideElement,
  type TableElement,
  type TextElement,
} from '../types';
import { CHART_TYPE_NAMES, isRoundChart, LEGEND_NAMES } from './chart';
import { colorKey, colorOptions, parseColorKey } from './colors';
import { SHAPE_NAMES } from './defaults';
import { BORDER_MODE_NAMES, deleteColumn, fitTableToBox, deleteRow, insertColumn, insertRow, rangeOf, setCellBorders, setCellFill, setTableStyle, tableHasSpans, type BorderMode, type CellRange } from './table';
import type { ContentTools } from './useContentTools';

const TYPE_TITLES: Record<SlideElement['type'], string> = { text: 'Text box', image: 'Picture', shape: 'Shape', table: 'Table', chart: 'Chart', diagram: 'Diagram' };
const DASH_NAMES: Record<LineDash, string> = { solid: 'Solid', dash: 'Dashed', dot: 'Dotted', dashDot: 'Dash-dot' };
const ARROW_NAMES: Record<Arrowhead, string> = { none: 'None', arrow: 'Arrow', triangle: 'Triangle', oval: 'Dot' };
const LINE_WIDTHS = [0.5, 0.75, 1, 1.5, 2, 3, 4.5, 6];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

/** A labelled row of the inspector. */
function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="shrink-0 text-xs text-muted">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border px-3 py-2.5 first:border-t-0" aria-label={title}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** A number typed in and applied on Enter or when the field is left (Escape puts the stored value back). */
function NumberField({ label, value, onCommit, disabled, min, max, step = 1, suffix }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean; min?: number; max?: number; step?: number; suffix?: string }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (v !== value) onCommit(v);
    setText(String(v));
  };
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setText(String(value));
          }
        }}
        className="h-7 w-20 rounded-md border border-border bg-surface px-1.5 text-right text-xs tabular-nums text-fg outline-none focus-visible:border-accent disabled:opacity-50"
      />
      {suffix && <span className="w-4 text-xs text-muted">{suffix}</span>}
    </Field>
  );
}

function ColorSelect({ label, value, theme, onPick, none, disabled }: { label: string; value: Color | null; theme: PresentationTheme; onPick: (c: Color | null) => void; none?: string; disabled?: boolean }) {
  const id = useId();
  const options = colorOptions(theme);
  const key = value ? colorKey(value) : '';
  const known = !value || options.some((o) => o.key === key);
  return (
    <Field label={label} htmlFor={id}>
      {value && <span aria-hidden className="h-4 w-4 shrink-0 rounded border border-black/15" style={{ background: options.find((o) => o.key === key)?.css ?? (typeof value === 'string' ? value : undefined) }} />}
      <Select id={id} value={key} disabled={disabled} onChange={(e) => onPick(e.target.value ? parseColorKey(e.target.value) : null)} className="h-7 w-36 py-0 text-xs">
        {none !== undefined && <option value="">{none}</option>}
        {!known && <option value={key}>{key}</option>}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn('flex items-center gap-2 text-xs', disabled && 'opacity-50')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--dc-accent,#4f46e5)]" />
      {label}
    </label>
  );
}

function Choice<T extends string | number>({ label, value, options, onPick, disabled }: { label: string; value: T; options: Array<[T, string]>; onPick: (v: T) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={String(value)} disabled={disabled} onChange={(e) => onPick(options.find(([v]) => String(v) === e.target.value)![0])} className="h-7 w-36 py-0 text-xs">
        {options.map(([v, name]) => (
          <option key={String(v)} value={String(v)}>
            {name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const fillColor = (f: Fill | undefined): Color | null => (f?.type === 'solid' ? f.color : null);

/** Fill controls: none or a solid colour. A gradient or picture fill (from a template) is named and can be replaced. */
function FillControls({ fill, theme, onFill, disabled }: { fill: Fill | undefined; theme: PresentationTheme; onFill: (f: Fill) => void; disabled?: boolean }) {
  const special = fill?.type === 'gradient' ? 'Gradient' : fill?.type === 'image' ? 'Picture' : null;
  return (
    <>
      <ColorSelect label="Fill" value={fillColor(fill)} theme={theme} none={special ?? 'No fill'} disabled={disabled} onPick={(c) => (c ? onFill({ type: 'solid', color: c }) : onFill({ type: 'none' }))} />
      {fill?.type === 'solid' && (
        <NumberField label="Fill opacity" suffix="%" min={0} max={100} value={Math.round((fill.opacity ?? 1) * 100)} disabled={disabled} onCommit={(v) => onFill(v >= 100 ? { type: 'solid', color: fill.color } : { ...fill, opacity: v / 100 })} />
      )}
    </>
  );
}

function LineControls({ line, theme, onLine, disabled, arrows, noneLabel = 'No line' }: { line: Line | null | undefined; theme: PresentationTheme; onLine: (l: Line | null) => void; disabled?: boolean; arrows?: boolean; noneLabel?: string }) {
  const base: Line = line ?? { color: { theme: 'dark1' }, width: 1, dash: 'solid' };
  return (
    <>
      <ColorSelect label="Line" value={line ? line.color : null} theme={theme} none={arrows ? undefined : noneLabel} disabled={disabled} onPick={(c) => onLine(c ? { ...base, color: c } : null)} />
      {line && (
        <>
          <Choice label="Line width" value={line.width} disabled={disabled} options={[...new Set([...LINE_WIDTHS, line.width])].sort((a, b) => a - b).map((w) => [w, `${w} pt`])} onPick={(w) => onLine({ ...line, width: w })} />
          <Choice label="Dash" value={line.dash} disabled={disabled} options={(Object.keys(DASH_NAMES) as LineDash[]).map((d) => [d, DASH_NAMES[d]])} onPick={(d) => onLine({ ...line, dash: d })} />
          {arrows && (
            <>
              <Choice label="Start" value={line.headEnd ?? 'none'} disabled={disabled} options={(Object.keys(ARROW_NAMES) as Arrowhead[]).map((a) => [a, ARROW_NAMES[a]])} onPick={(a) => onLine({ ...line, headEnd: a })} />
              <Choice label="End" value={line.tailEnd ?? 'none'} disabled={disabled} options={(Object.keys(ARROW_NAMES) as Arrowhead[]).map((a) => [a, ARROW_NAMES[a]])} onPick={(a) => onLine({ ...line, tailEnd: a })} />
            </>
          )}
        </>
      )}
    </>
  );
}

/** Alt text typed in place: one undo step per visit to the field. */
function AltText({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string, group: string) => void; disabled?: boolean }) {
  const fid = useId();
  const [visit, setVisit] = useState(0);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className="text-xs text-muted">
        Alt text
      </label>
      <textarea
        id={fid}
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="Describe it for people who cannot see it"
        onFocus={() => setVisit((v) => v + 1)}
        onChange={(e) => onChange(e.target.value, `alt:${id}:${visit}`)}
        className="w-full resize-y rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg outline-none focus-visible:border-accent disabled:opacity-60"
      />
    </div>
  );
}

/**
 * The inspector: the selected object's position and size, and its own settings (fill and line, picture fit, crop and
 * alt text, table rows, columns, fill and borders, chart type, title and legend, diagram editing). Beside the canvas on
 * wide screens, below it (and folded away until opened) on phones.
 */
export function Inspector({ tools, selected, wide }: { tools: ContentTools; selected: SlideElement[]; wide: boolean }) {
  // Phones: folded until opened. It is always there (with a hint when nothing is selected), so selecting an object
  // never resizes the slide under the pointer.
  const [open, setOpen] = useState(false);
  const el = selected.length === 1 ? selected[0] : null;
  const title = el ? TYPE_TITLES[el.type] : 'Settings';
  const body = el ? (
    <ElementSettings key={el.id} el={el} tools={tools} />
  ) : (
    <p className="px-3 py-3 text-xs text-muted">{selected.length > 1 ? 'Several objects are selected. Select one to see its settings.' : 'Select an object on the slide to see its settings.'}</p>
  );
  const label = el ? `${title} settings` : 'Object settings';
  if (wide) {
    return (
      <aside aria-label={label} data-inspector={el?.type ?? ''} className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
        <h2 className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold">
          <SlidersHorizontal size={14} className="text-muted" aria-hidden />
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </aside>
    );
  }
  return (
    <aside aria-label={label} data-inspector={el?.type ?? ''} className="flex shrink-0 flex-col overflow-hidden border-t border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <SlidersHorizontal size={14} className="text-muted" aria-hidden />
        <span className="flex-1">{title}</span>
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
      {open && <div className="h-[38vh] overflow-y-auto border-t border-border">{body}</div>}
    </aside>
  );
}

/** The settings of one object: position and size, then its own. */
function ElementSettings({ el, tools }: { el: SlideElement; tools: ContentTools }) {
  const theme = tools.content.theme;
  const locked = !!el.locked;
  const set = (change: (e: SlideElement) => SlideElement, group?: string) => tools.update(el.id, change, group);
  return (
    <div className="flex flex-col">
      {locked && <p className="px-3 pt-2 text-xs text-muted">This object is locked. Unlock it (Arrange menu) to change it.</p>}
      <Section title="Position and size">
        <NumberField label="X" suffix="px" value={el.x} disabled={locked} onCommit={(v) => set((e) => ({ ...e, x: Math.round(v) }))} />
        <NumberField label="Y" suffix="px" value={el.y} disabled={locked} onCommit={(v) => set((e) => ({ ...e, y: Math.round(v) }))} />
        <NumberField label="Width" suffix="px" min={el.type === 'shape' && el.preset === 'line' ? 0 : 4} value={el.w} disabled={locked} onCommit={(v) => set((e) => (e.type === 'table' ? fitTableToBox({ ...e, w: Math.round(v) }) : { ...e, w: Math.round(v) }))} />
        <NumberField label="Height" suffix="px" min={el.type === 'shape' && el.preset === 'line' ? 0 : 4} value={el.h} disabled={locked || el.type === 'table'} onCommit={(v) => set((e) => ({ ...e, h: Math.round(v) }))} />
        <NumberField label="Rotation" suffix="°" value={el.rotation} disabled={locked} onCommit={(v) => set((e) => ({ ...e, rotation: ((Math.round(v) % 360) + 360) % 360 }))} />
      </Section>
      {el.type === 'text' && <TextBoxSection el={el} theme={theme} set={set} locked={locked} />}
      {el.type === 'image' && <PictureSection el={el} tools={tools} set={set} locked={locked} />}
      {el.type === 'shape' && <ShapeSection el={el} theme={theme} tools={tools} set={set} locked={locked} />}
      {el.type === 'table' && <TableSection el={el} theme={theme} tools={tools} set={set} locked={locked} />}
      {el.type === 'chart' && <ChartSection el={el} tools={tools} set={set} locked={locked} />}
      {el.type === 'diagram' && <DiagramSection el={el} tools={tools} set={set} locked={locked} />}
    </div>
  );
}

type Setter = (change: (e: SlideElement) => SlideElement, group?: string) => void;

function TextBoxSection({ el, theme, set, locked }: { el: TextElement; theme: PresentationTheme; set: Setter; locked: boolean }) {
  return (
    <Section title="Box">
      <FillControls fill={el.fill} theme={theme} disabled={locked} onFill={(f) => set((e) => (e.type === 'text' ? (f.type === 'none' ? withoutKey(e, 'fill') : { ...e, fill: f }) : e))} />
      <LineControls line={el.line} theme={theme} disabled={locked} noneLabel="No outline" onLine={(l) => set((e) => (e.type === 'text' ? (l ? { ...e, line: l } : withoutKey(e, 'line')) : e))} />
    </Section>
  );
}

function PictureSection({ el, tools, set, locked }: { el: ImageElement; tools: ContentTools; set: Setter; locked: boolean }) {
  const crop = el.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const setCrop = (side: keyof typeof crop, pct: number) =>
    set((e) => {
      if (e.type !== 'image') return e;
      const c = { ...(e.crop ?? { left: 0, top: 0, right: 0, bottom: 0 }), [side]: pct / 100 };
      // At least 5% of the picture stays visible each way.
      if (c.left + c.right > 0.95 || c.top + c.bottom > 0.95) return e;
      return c.left || c.top || c.right || c.bottom ? { ...e, crop: c } : withoutKey(e, 'crop');
    });
  return (
    <>
      <Section title="Picture">
        {tools.canPictures && (
          <Button size="sm" disabled={locked || tools.busy} onClick={() => tools.replacePicture(el.id)}>
            Replace picture…
          </Button>
        )}
        <Choice
          label="Fit"
          value={el.fit}
          disabled={locked}
          options={[
            ['contain', 'Fit inside'],
            ['cover', 'Fill (crop)'],
            ['stretch', 'Stretch'],
          ]}
          onPick={(fit) => set((e) => (e.type === 'image' ? { ...e, fit } : e))}
        />
        <Button size="sm" variant="ghost" disabled={locked || !el.naturalWidth || !el.naturalHeight} onClick={() => set((e) => (e.type === 'image' ? matchPictureShape(e) : e))}>
          Match the picture’s proportions
        </Button>
      </Section>
      <Section title="Crop">
        {(['left', 'top', 'right', 'bottom'] as const).map((side) => (
          // At least 5% stays visible each way, so a side can take only what the opposite side leaves: the field
          // shows the value that was applied, never one that was refused.
          <NumberField key={side} label={side[0].toUpperCase() + side.slice(1)} suffix="%" min={0} max={Math.max(0, Math.min(90, 95 - Math.round(crop[OPPOSITE_SIDE[side]] * 100)))} value={Math.round(crop[side] * 100)} disabled={locked} onCommit={(v) => setCrop(side, v)} />
        ))}
        <Button size="sm" variant="ghost" disabled={locked || !el.crop} onClick={() => set((e) => (e.type === 'image' ? withoutKey(e, 'crop') : e))}>
          Reset crop
        </Button>
      </Section>
      <Section title="Accessibility">
        <AltText
          id={el.id}
          value={el.alt}
          disabled={locked}
          onChange={(v, group) => set((e) => (e.type === 'image' ? { ...e, alt: v } : e), group)}
        />
        {!el.alt.trim() && <p className="text-xs text-muted">This picture has no alt text: screen readers and exported files get no description of it.</p>}
      </Section>
    </>
  );
}

const OPPOSITE_SIDE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;

/** The picture's box given the visible (cropped) picture's proportions, keeping its width and centre. */
export function matchPictureShape(e: ImageElement): ImageElement {
  const c = e.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const vw = e.naturalWidth * (1 - c.left - c.right);
  const vh = e.naturalHeight * (1 - c.top - c.bottom);
  if (!(vw > 0 && vh > 0)) return e;
  const h = Math.max(1, Math.round((e.w * vh) / vw));
  return h === e.h ? e : { ...e, y: Math.round(e.y + (e.h - h) / 2), h };
}

function ShapeSection({ el, theme, tools, set, locked }: { el: ShapeElement; theme: PresentationTheme; tools: ContentTools; set: Setter; locked: boolean }) {
  const line = el.preset === 'line';
  return (
    <Section title={line ? 'Line' : 'Shape'}>
      {!line && (
        <>
          <Choice label="Shape" value={el.preset} disabled={locked} options={SHAPE_PRESETS.filter((p) => p !== 'line').map((p) => [p, SHAPE_NAMES[p]])} onPick={(preset) => set((e) => (e.type === 'shape' ? { ...e, preset } : e))} />
          <FillControls fill={el.fill} theme={theme} disabled={locked} onFill={(f) => set((e) => (e.type === 'shape' ? { ...e, fill: f } : e))} />
        </>
      )}
      <LineControls line={el.line} theme={theme} disabled={locked} arrows={line} onLine={(l) => set((e) => (e.type === 'shape' ? { ...e, line: l } : e))} />
      {!line && (
        <>
          <Check label="Flip horizontally" checked={!!el.flipH} disabled={locked} onChange={(v) => set((e) => (e.type === 'shape' ? (v ? { ...e, flipH: true } : withoutKey(e, 'flipH')) : e))} />
          <Check label="Flip vertically" checked={!!el.flipV} disabled={locked} onChange={(v) => set((e) => (e.type === 'shape' ? (v ? { ...e, flipV: true } : withoutKey(e, 'flipV')) : e))} />
          <Button size="sm" disabled={locked} onClick={() => tools.editContents(el.id)}>
            Edit text
          </Button>
        </>
      )}
    </Section>
  );
}

function TableSection({ el, theme, tools, set, locked }: { el: TableElement; theme: PresentationTheme; tools: ContentTools; set: Setter; locked: boolean }) {
  const edit = tools.edit?.kind === 'table' && tools.edit.id === el.id ? tools.edit : null;
  const range: CellRange | null = edit ? rangeOf(edit.cell, edit.anchor) : null;
  const spans = tableHasSpans(el);
  const [mode, setMode] = useState<BorderMode>('all');
  const r = edit?.cell.row ?? el.rows.length - 1;
  const c = edit?.cell.col ?? el.columns.length - 1;
  const where = edit ? 'the selected cells' : 'all cells';
  const tbl = (change: (t: TableElement) => TableElement) => set((e) => (e.type === 'table' ? change(e) : e));
  const style = el.style;
  return (
    <>
      <Section title="Table">
        <Button size="sm" disabled={locked} onClick={() => (edit ? tools.stop() : tools.editContents(el.id))}>
          {edit ? 'Done editing cells' : 'Edit cells'}
        </Button>
        <Check label="Header row" checked={style.headerRow} disabled={locked} onChange={(v) => tbl((t) => setTableStyle(t, { headerRow: v }))} />
        <Check label="Banded rows" checked={style.bandedRows} disabled={locked} onChange={(v) => tbl((t) => setTableStyle(t, { bandedRows: v }))} />
        <Check label="First column" checked={style.firstColumn} disabled={locked} onChange={(v) => tbl((t) => setTableStyle(t, { firstColumn: v }))} />
        <Choice label="Text size" value={style.text.fontSize} disabled={locked} options={[...new Set([...FONT_SIZES, style.text.fontSize])].sort((a, b) => a - b).map((s) => [s, `${s} pt`])} onPick={(s) => tbl((t) => setTableStyle(t, { text: { ...t.style.text, fontSize: s } }))} />
        <ColorSelect label="Header fill" value={style.headerFill} theme={theme} disabled={locked || !style.headerRow} onPick={(col) => col && tbl((t) => setTableStyle(t, { headerFill: col }))} />
      </Section>
      <Section title="Rows and columns">
        {spans && <p className="text-xs text-muted">This table has merged cells, so rows and columns cannot be added or removed here.</p>}
        <div className="grid grid-cols-2 gap-1">
          <Button size="sm" disabled={locked || spans} onClick={() => tbl((t) => insertRow(t, edit ? r : 0))}>
            {edit ? 'Row above' : 'Row at top'}
          </Button>
          <Button size="sm" disabled={locked || spans} onClick={() => tbl((t) => insertRow(t, r + 1))}>
            {edit ? 'Row below' : 'Row at end'}
          </Button>
          <Button size="sm" disabled={locked || spans} onClick={() => tbl((t) => insertColumn(t, edit ? c : 0))}>
            {edit ? 'Column left' : 'Column at start'}
          </Button>
          <Button size="sm" disabled={locked || spans} onClick={() => tbl((t) => insertColumn(t, c + 1))}>
            {edit ? 'Column right' : 'Column at end'}
          </Button>
          <Button size="sm" variant="ghost" disabled={locked || spans || el.rows.length <= 1} onClick={() => tbl((t) => deleteRow(t, r))}>
            {edit ? 'Delete row' : 'Delete last row'}
          </Button>
          <Button size="sm" variant="ghost" disabled={locked || spans || el.columns.length <= 1} onClick={() => tbl((t) => deleteColumn(t, c))}>
            {edit ? 'Delete column' : 'Delete last column'}
          </Button>
        </div>
      </Section>
      <Section title={`Fill and borders (${where})`}>
        <ColorSelect
          label="Cell fill"
          value={edit ? el.rows[edit.cell.row]?.cells[edit.cell.col]?.fill ?? null : null}
          theme={theme}
          none="Table style"
          disabled={locked}
          onPick={(col) => tbl((t) => setCellFill(t, range, col))}
        />
        <Choice label="Borders" value={mode} options={(Object.keys(BORDER_MODE_NAMES) as BorderMode[]).map((m) => [m, BORDER_MODE_NAMES[m]])} onPick={setMode} disabled={locked} />
        <Button size="sm" disabled={locked} onClick={() => tbl((t) => setCellBorders(t, range, mode, t.style.border ?? { color: { theme: 'dark2' }, width: 0.75, dash: 'solid' }))}>
          Apply borders
        </Button>
        <LineControls line={style.border} theme={theme} disabled={locked} noneLabel="No table border" onLine={(l) => tbl((t) => setTableStyle(t, { border: l }))} />
      </Section>
    </>
  );
}

function ChartSection({ el, tools, set, locked }: { el: ChartElement; tools: ContentTools; set: Setter; locked: boolean }) {
  const [visit, setVisit] = useState(0);
  const titleId = useId();
  const ch = (change: (c: ChartElement) => ChartElement, group?: string) => set((e) => (e.type === 'chart' ? change(e) : e), group);
  const canStack = (el.chartType === 'bar' || el.chartType === 'column') && el.series.length > 1;
  return (
    <Section title="Chart">
      <Button size="sm" disabled={locked} onClick={() => tools.editChartData(el.id)}>
        Edit data…
      </Button>
      <Choice label="Type" value={el.chartType} disabled={locked} options={CHART_TYPES.map((t) => [t, CHART_TYPE_NAMES[t]])} onPick={(t) => ch((c) => (isRoundChart(t) || t === 'line' ? withoutKey({ ...c, chartType: t }, 'stacked') : { ...c, chartType: t }))} />
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-xs text-muted">
          Title
        </label>
        <input
          id={titleId}
          value={el.title}
          disabled={locked}
          onFocus={() => setVisit((v) => v + 1)}
          onChange={(e) => {
            const title = e.target.value;
            ch((c) => ({ ...c, title }), `chart-title:${el.id}:${visit}`);
          }}
          className="h-7 w-full rounded-md border border-border bg-surface px-1.5 text-xs text-fg outline-none focus-visible:border-accent"
        />
      </div>
      <Check label="Show title" checked={el.showTitle} disabled={locked} onChange={(v) => ch((c) => ({ ...c, showTitle: v }))} />
      <Choice label="Legend" value={el.legend} disabled={locked} options={(Object.keys(LEGEND_NAMES) as Array<keyof typeof LEGEND_NAMES>).map((l) => [l, LEGEND_NAMES[l]])} onPick={(legend) => ch((c) => ({ ...c, legend }))} />
      <Check label="Show values" checked={el.showValues} disabled={locked} onChange={(v) => ch((c) => ({ ...c, showValues: v }))} />
      {canStack && <Check label="Stacked" checked={!!el.stacked} disabled={locked} onChange={(v) => ch((c) => (v ? { ...c, stacked: true } : withoutKey(c, 'stacked')))} />}
      <Choice label="Text size" value={el.fontSize} disabled={locked} options={[...new Set([...FONT_SIZES, el.fontSize])].sort((a, b) => a - b).map((s) => [s, `${s} pt`])} onPick={(s) => ch((c) => ({ ...c, fontSize: s }))} />
    </Section>
  );
}

function DiagramSection({ el, tools, set, locked }: { el: DiagramElement; tools: ContentTools; set: Setter; locked: boolean }) {
  return (
    <>
      <Section title="Diagram">
        {tools.canDiagrams ? (
          <Button size="sm" disabled={locked || tools.busy} onClick={() => tools.editDiagram(el.id)}>
            Edit diagram…
          </Button>
        ) : (
          <p className="text-xs text-muted">Diagrams can be edited where Classroom OS supplies its diagram editor.</p>
        )}
        <Button size="sm" variant="ghost" disabled={locked || !el.naturalWidth || !el.naturalHeight} onClick={() => set((e) => (e.type === 'diagram' ? { ...e, h: Math.max(1, Math.round((e.w * e.naturalHeight) / e.naturalWidth)) } : e))}>
          Match the drawing’s proportions
        </Button>
      </Section>
      <Section title="Accessibility">
        <AltText id={el.id} value={el.alt ?? ''} disabled={locked} onChange={(v, group) => set((e) => (e.type === 'diagram' ? { ...e, alt: v.trim() ? v : null } : e), group)} />
      </Section>
    </>
  );
}

/** A copy of an object without one optional field (left out rather than stored as undefined). */
function withoutKey<T extends object, K extends keyof T>(o: T, key: K): T {
  if (!(key in o)) return o;
  const copy = { ...o };
  delete copy[key];
  return copy;
}
