import { cn, Input, Select } from '@dcos/ui';
import type { ReactNode } from 'react';
import type { ArrowMode, Connector, ConnectorData, EdgeLineType, ShapeData, ShapeNode } from './types';

const FILLS = ['#ffffff', '#f1f5f9', '#e0e7ff', '#dcfce7', '#fef3c7', '#fce7f3', '#e0f2fe', '#f3e8ff', '#fee2e2', '#1e293b', '#4f46e5', 'transparent'];
const STROKES = ['#334155', '#94a3b8', '#4f46e5', '#15803d', '#b45309', '#be185d', '#0369a1', '#7e22ce', '#dc2626', 'transparent'];
const TEXT = ['#0f172a', '#475569', '#ffffff', '#4f46e5', '#15803d', '#b45309', '#be185d', '#dc2626'];

export type PatchOpts = { snapshot: boolean };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c === 'transparent' ? 'None' : c}
          title={c === 'transparent' ? 'None' : c}
          onClick={() => onPick(c)}
          className={cn('h-6 w-6 rounded-md border transition hover:scale-110', value === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-black/10')}
          style={
            c === 'transparent'
              ? { background: 'linear-gradient(to top right, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%), #fff' }
              : { background: c }
          }
        />
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--dc-accent)]" />
      {label}
    </label>
  );
}

export function NodeInspector({ nodes, onPatch }: { nodes: ShapeNode[]; onPatch: (patch: Partial<ShapeData>, opts: PatchOpts) => void }) {
  const d = nodes[0].data;
  const set = (patch: Partial<ShapeData>) => onPatch(patch, { snapshot: true });
  return (
    <div className="grid gap-4">
      <div className="text-sm font-semibold">{nodes.length > 1 ? `${nodes.length} shapes` : 'Shape'}</div>
      {nodes.length === 1 && (
        <Row label="Text">
          <textarea
            value={d.label}
            onFocus={() => onPatch({}, { snapshot: true })}
            onChange={(e) => onPatch({ label: e.target.value }, { snapshot: false })}
            onKeyDown={(e) => e.stopPropagation()}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </Row>
      )}
      <Row label="Fill">
        <Swatches colors={FILLS} value={d.fill} onPick={(fill) => set({ fill })} />
      </Row>
      <Row label="Border">
        <Swatches colors={STROKES} value={d.stroke} onPick={(stroke) => set({ stroke, strokeWidth: stroke === 'transparent' ? 0 : d.strokeWidth || 2 })} />
        <div className="flex items-center gap-2">
          <Select value={String(d.strokeWidth)} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} aria-label="Border width" className="flex-1">
            {[0, 1, 2, 3, 4, 6].map((w) => (
              <option key={w} value={w}>
                {w === 0 ? 'No border' : `${w}px`}
              </option>
            ))}
          </Select>
          <Toggle label="Dashed" checked={d.dashed} onChange={(dashed) => set({ dashed })} />
        </div>
      </Row>
      <Row label="Text style">
        <Swatches colors={TEXT} value={d.textColor} onPick={(textColor) => set({ textColor })} />
        <div className="flex items-center gap-2">
          <Select value={String(d.fontSize)} onChange={(e) => set({ fontSize: Number(e.target.value) })} aria-label="Font size" className="flex-1">
            {[11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </Select>
          <Toggle label="Bold" checked={d.bold} onChange={(bold) => set({ bold })} />
        </div>
      </Row>
    </div>
  );
}

export interface EdgePatch {
  type?: EdgeLineType;
  label?: string;
  data?: Partial<ConnectorData>;
}

export function EdgeInspector({ edges, onPatch }: { edges: Connector[]; onPatch: (patch: EdgePatch, opts: PatchOpts) => void }) {
  const e = edges[0];
  const d = e.data!;
  const set = (patch: EdgePatch) => onPatch(patch, { snapshot: true });
  return (
    <div className="grid gap-4">
      <div className="text-sm font-semibold">{edges.length > 1 ? `${edges.length} connectors` : 'Connector'}</div>
      {edges.length === 1 && (
        <Row label="Label">
          <Input
            value={typeof e.label === 'string' ? e.label : ''}
            placeholder="e.g. Yes"
            onFocus={() => onPatch({}, { snapshot: true })}
            onChange={(ev) => onPatch({ label: ev.target.value }, { snapshot: false })}
            onKeyDown={(ev) => ev.stopPropagation()}
            className="h-8"
          />
        </Row>
      )}
      <Row label="Line">
        <div className="grid grid-cols-2 gap-2">
          <Select value={e.type ?? 'smoothstep'} onChange={(ev) => set({ type: ev.target.value as EdgeLineType })} aria-label="Line shape">
            <option value="smoothstep">Elbow</option>
            <option value="step">Square elbow</option>
            <option value="straight">Straight</option>
            <option value="default">Curved</option>
          </Select>
          <Select value={d.arrow} onChange={(ev) => set({ data: { arrow: ev.target.value as ArrowMode } })} aria-label="Arrows">
            <option value="end">Arrow →</option>
            <option value="both">Arrows ↔</option>
            <option value="none">No arrow</option>
          </Select>
          <Select value={String(d.width)} onChange={(ev) => set({ data: { width: Number(ev.target.value) } })} aria-label="Line width">
            {[1, 1.5, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </Select>
          <Toggle label="Dashed" checked={d.dashed} onChange={(dashed) => set({ data: { dashed } })} />
        </div>
      </Row>
      <Row label="Colour">
        <Swatches colors={STROKES.filter((c) => c !== 'transparent')} value={d.color} onPick={(color) => set({ data: { color } })} />
      </Row>
    </div>
  );
}
