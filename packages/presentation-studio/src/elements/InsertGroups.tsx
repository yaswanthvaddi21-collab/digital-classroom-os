import { Button, Menu } from '@dcos/ui';
import { BarChart3, ChevronDown, GitFork, Image as ImageIcon, Shapes, Table2 } from 'lucide-react';
import { useState } from 'react';
import { shapePath } from '../render/shapePaths';
import { CHART_TYPES, SHAPE_PRESETS, type ShapePreset } from '../types';
import { Group, Popover, ToolButton } from '../ui/parts';
import { CHART_TYPE_NAMES } from './chart';
import { SHAPE_NAMES } from './defaults';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from './table';
import type { ContentTools } from './useContentTools';

const triggerClass =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40';

/** A preset shape drawn small (the gallery's buttons). */
export function ShapeIcon({ preset, size = 22 }: { preset: ShapePreset; size?: number }) {
  const w = size;
  const h = preset === 'line' ? size : size * 0.72;
  return (
    <svg width={w} height={size} viewBox={`-1 -1 ${w + 2} ${size + 2}`} aria-hidden="true">
      <g transform={`translate(0 ${(size - h) / 2})`}>
        <path d={shapePath(preset, w, h)} fill={preset === 'line' ? 'none' : 'currentColor'} fillOpacity={0.18} stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** The table size grid of the Insert tab: hover or arrow through it, or type the size. */
function TablePicker({ onPick }: { onPick: (rows: number, columns: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [rows, setRows] = useState('3');
  const [cols, setCols] = useState('3');
  const R = 8;
  const C = 10;
  const r = Number(rows);
  const c = Number(cols);
  const valid = Number.isInteger(r) && Number.isInteger(c) && r >= 1 && c >= 1 && r <= MAX_TABLE_ROWS && c <= MAX_TABLE_COLUMNS;
  return (
    <div className="flex w-64 flex-col gap-2 text-xs">
      <div className="text-muted" aria-live="polite">
        {hover.r && hover.c ? `${hover.r} × ${hover.c} table` : 'Pick a size'}
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${C}, 1fr)` }} onMouseLeave={() => setHover({ r: 0, c: 0 })}>
        {Array.from({ length: R * C }, (_, i) => {
          const rr = Math.floor(i / C) + 1;
          const cc = (i % C) + 1;
          const on = rr <= hover.r && cc <= hover.c;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Insert a table of ${rr} rows by ${cc} columns`}
              tabIndex={i === 0 ? 0 : -1}
              onMouseEnter={() => setHover({ r: rr, c: cc })}
              onFocus={() => setHover({ r: rr, c: cc })}
              onKeyDown={(e) => {
                const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: C, ArrowUp: -C };
                if (moves[e.key] === undefined) return;
                e.preventDefault();
                const j = i + moves[e.key];
                if (j < 0 || j >= R * C) return;
                (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
              }}
              onClick={() => onPick(rr, cc)}
              className={`h-4 rounded-[3px] border ${on ? 'border-accent bg-accent-soft' : 'border-border bg-surface'} focus-visible:outline-2 focus-visible:outline-accent`}
            />
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onPick(r, c);
        }}
      >
        <label className="flex flex-col gap-0.5">
          Rows
          <input type="number" min={1} max={MAX_TABLE_ROWS} value={rows} onChange={(e) => setRows(e.target.value)} className="h-7 w-14 rounded-md border border-border bg-surface px-1.5" />
        </label>
        <label className="flex flex-col gap-0.5">
          Columns
          <input type="number" min={1} max={MAX_TABLE_COLUMNS} value={cols} onChange={(e) => setCols(e.target.value)} className="h-7 w-14 rounded-md border border-border bg-surface px-1.5" />
        </label>
        <Button size="sm" type="submit" disabled={!valid}>
          Insert
        </Button>
      </form>
    </div>
  );
}

/**
 * The Insert tab's pictures, shapes, tables, charts and diagrams (Phase 7 CONTENT). Picture and diagram controls are
 * shown only when the app supplies their host.
 */
export function InsertGroups({ tools, hasSlide }: { tools: ContentTools; hasSlide: boolean }) {
  const off = !hasSlide;
  return (
    <>
      <Group label="Images">
        {tools.canPictures && (
          <ToolButton label="Picture" text="Picture" onClick={tools.insertPicture} disabled={off || tools.busy}>
            <ImageIcon size={16} />
          </ToolButton>
        )}
        <Popover
          label="Shapes"
          trigger={({ open, toggle }) => (
            <button type="button" aria-label="Shapes" aria-haspopup="dialog" aria-expanded={open} disabled={off} onClick={toggle} onMouseDown={(e) => e.preventDefault()} className={triggerClass}>
              <Shapes size={16} />
              <span>Shapes</span>
              <ChevronDown size={12} />
            </button>
          )}
        >
          {(close) => (
            <div className="grid w-64 grid-cols-6 gap-1">
              {SHAPE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={SHAPE_NAMES[p]}
                  title={SHAPE_NAMES[p]}
                  onClick={() => {
                    close();
                    tools.insertShape(p);
                  }}
                  className="flex h-9 items-center justify-center rounded-md text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ShapeIcon preset={p} />
                </button>
              ))}
            </div>
          )}
        </Popover>
      </Group>
      <Group label="Tables and charts">
        <Popover
          label="Insert table"
          trigger={({ open, toggle }) => (
            <button type="button" aria-label="Table" aria-haspopup="dialog" aria-expanded={open} disabled={off} onClick={toggle} onMouseDown={(e) => e.preventDefault()} className={triggerClass}>
              <Table2 size={16} />
              <span>Table</span>
              <ChevronDown size={12} />
            </button>
          )}
        >
          {(close) => (
            <TablePicker
              onPick={(r, c) => {
                close();
                tools.insertTable(r, c);
              }}
            />
          )}
        </Popover>
        <Menu
          trigger={(p) => (
            <button type="button" {...p} aria-label="Chart" aria-haspopup="menu" disabled={off} onMouseDown={(e) => e.preventDefault()} className={triggerClass}>
              <BarChart3 size={16} />
              <span>Chart</span>
              <ChevronDown size={12} />
            </button>
          )}
          items={CHART_TYPES.map((t) => ({ label: `${CHART_TYPE_NAMES[t]} chart`, onSelect: () => tools.insertChart(t) }))}
        />
      </Group>
      {tools.canDiagrams && (
        <Group label="Diagrams">
          <Menu
            trigger={(p) => (
              <button type="button" {...p} aria-label="Diagram" aria-haspopup="menu" disabled={off || tools.busy} onMouseDown={(e) => e.preventDefault()} className={triggerClass}>
                <GitFork size={16} />
                <span>Diagram</span>
                <ChevronDown size={12} />
              </button>
            )}
            items={[
              { label: 'New diagram', onSelect: () => tools.insertDiagram({}) },
              ...tools.diagramTemplates.filter((t) => t.id !== 'blank').map((t) => ({ label: `New from “${t.name}”`, onSelect: () => tools.insertDiagram({ templateId: t.id, title: t.name }) })),
              { label: 'From my diagrams…', onSelect: () => tools.insertDiagram('library') },
              { label: 'From a diagrams.net file…', onSelect: () => tools.insertDiagram('file') },
            ]}
          />
        </Group>
      )}
    </>
  );
}
