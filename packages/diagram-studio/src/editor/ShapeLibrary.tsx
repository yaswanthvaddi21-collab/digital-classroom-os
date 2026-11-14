import { Input, Select } from '@dcos/ui';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { resolveEntry, searchShapes, SHAPE_CATEGORIES, type ResolvedEntry } from '../library/categories';
import { ShapeSvg } from '../shapes';
import { shapeDefaults, type ShapeKind } from '../types';

/** Drag-and-drop type for shapes dragged from the library onto the canvas. */
export const DRAG_MIME = 'application/x-dcos-shape';

const ALL = 'all';
const CATEGORY_KEY = 'dcos.diagram.libraryCategory';

/** The category the viewer last chose (a per-device convenience; storage may be unavailable). */
function rememberedCategory(): string {
  try {
    const v = localStorage.getItem(CATEGORY_KEY);
    if (v && (v === ALL || SHAPE_CATEGORIES.some((c) => c.id === v))) return v;
  } catch {
    // Private windows and blocked storage: start at the first category.
  }
  return SHAPE_CATEGORIES[0].id;
}

function remember(id: string) {
  try {
    localStorage.setItem(CATEGORY_KEY, id);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

function Tile({ entry, readOnly, onAdd }: { entry: ResolvedEntry; readOnly: boolean; onAdd: (shape: ShapeKind) => void }) {
  const d = shapeDefaults(entry.kind);
  const pw = 44;
  const ratio = d.height / d.width;
  const ph = ratio < 0.2 ? 8 : Math.max(18, Math.min(34, ratio * pw));
  // Very wide or tall shapes (a fork bar, a lifeline) keep their look inside the tile.
  const w = ratio > 34 / 44 ? Math.max(12, (d.width / d.height) * 34) : pw;
  return (
    <button
      type="button"
      draggable={!readOnly}
      disabled={readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, entry.kind);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onAdd(entry.kind)}
      title={`${entry.name}${entry.hint ? ` — ${entry.hint}` : ''}. Click or drag onto the canvas.`}
      className="flex w-[64px] shrink-0 cursor-grab flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10.5px] leading-tight text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing disabled:cursor-default md:w-auto"
    >
      <span className="flex h-9 items-center justify-center" aria-hidden>
        {entry.kind === 'text' ? (
          <span className="text-base font-semibold text-fg">Aa</span>
        ) : (
          <ShapeSvg className="block overflow-visible" shape={entry.kind} width={Math.min(pw, w)} height={ph} fill={d.fill} stroke={d.stroke} strokeWidth={Math.min(1.5, d.strokeWidth || 1.5)} dashed={d.dashed} />
        )}
      </span>
      <span className="line-clamp-2 text-center">{entry.name}</span>
    </button>
  );
}

/**
 * The shape library: a column beside the canvas (a strip above it on phones). Shapes are grouped in categories (one
 * at a time, or all) and can be searched by name, use or notation. Click a shape to add it, or drag it in.
 */
export function ShapeLibrary({ readOnly, onAdd }: { readOnly: boolean; onAdd: (shape: ShapeKind) => void }) {
  const [category, setCategory] = useState(rememberedCategory);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchShapes(query), [query]);
  const searching = query.trim() !== '';
  const sections = searching
    ? [{ id: 'results', name: results.length ? `${results.length} ${results.length === 1 ? 'shape' : 'shapes'} found` : '', entries: results }]
    : SHAPE_CATEGORIES.filter((c) => category === ALL || c.id === category).map((c) => ({ id: c.id, name: c.name, entries: c.entries.map((e) => resolveEntry(e, c)) }));

  return (
    <aside aria-label="Shapes" className="flex shrink-0 flex-col border-b border-border bg-surface md:w-[212px] md:border-b-0 md:border-r">
      <div className="flex gap-1.5 px-2 pt-2 md:flex-col">
        <label className="relative min-w-0 flex-1 md:flex-none">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            aria-label="Search shapes"
            placeholder="Search shapes"
            value={query}
            disabled={readOnly}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              }
              if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                onAdd(results[0].kind);
              }
            }}
            className="h-8 pl-8 text-[13px]"
          />
        </label>
        <Select
          aria-label="Shape category"
          value={category}
          disabled={readOnly || searching}
          onChange={(e) => {
            setCategory(e.target.value);
            remember(e.target.value);
          }}
          className="max-w-[44%] md:max-w-none"
        >
          {SHAPE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={ALL}>All shapes</option>
        </Select>
      </div>
      <div className="flex min-h-0 gap-3 overflow-x-auto p-2 [scrollbar-width:thin] md:flex-1 md:flex-col md:gap-2 md:overflow-y-auto md:overflow-x-hidden" aria-live={searching ? 'polite' : undefined}>
        {searching && !results.length && <p className="px-1 py-2 text-xs text-muted">No shapes match “{query.trim()}”.</p>}
        {sections.map((s) => (
          <section key={s.id} aria-label={s.name || 'Shapes'} className="flex shrink-0 items-start gap-1 md:block">
            {s.name && (category === ALL || searching) && <h3 className="hidden px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted md:block">{s.name}</h3>}
            <div className="flex gap-1 md:grid md:grid-cols-3">
              {s.entries.map((e) => (
                <Tile key={`${e.kind}-${e.name}`} entry={e} readOnly={readOnly} onAdd={onAdd} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
