/**
 * Format panel sections for connectors (G-CONNECT): where each end attaches, bend points and the label position.
 * The same choices as the canvas handles, reachable with the keyboard.
 */
import { Select } from '@dcos/ui';
import { useRef, type ReactNode } from 'react';
import type { EdgeSectionProps, InspectorSection } from '../Inspector';
import { useConnectActions } from './context';
import { attach, attachmentOf, portAttachment, portIdOf, setLabelPosition, setWaypoints, type Attachment, type EndKind } from './edgeChanges';
import { PORTS } from './geometry';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

const OPTION_LABEL: Record<string, string> = {
  top: 'Top (side point)',
  right: 'Right (side point)',
  bottom: 'Bottom (side point)',
  left: 'Left (side point)',
  'top-right': 'Top-right corner',
  'bottom-right': 'Bottom-right corner',
  'bottom-left': 'Bottom-left corner',
  'top-left': 'Top-left corner',
};

/** The select value for an attachment. */
export function attachmentValue(a: Attachment): string {
  if (a.kind === 'perimeter') return 'perimeter';
  return portIdOf(a) ?? 'custom';
}

function attachmentFromValue(v: string): Attachment | null {
  if (v === 'perimeter') return { kind: 'perimeter' };
  return portAttachment(v);
}

function EndSelect({ end, edges }: { end: EndKind; edges: EdgeSectionProps['edges'] }) {
  const actions = useConnectActions();
  const values = new Set(edges.map((e) => attachmentValue(attachmentOf(e, end))));
  const value = values.size === 1 ? [...values][0] : 'mixed';
  const custom = attachmentOf(edges[0], end);
  return (
    <Select
      value={value}
      aria-label={end === 'source' ? 'Start attaches at' : 'End attaches at'}
      onChange={(ev) => {
        const a = attachmentFromValue(ev.target.value);
        if (!a) return;
        actions.snapshot();
        for (const e of edges) actions.update(e.id, (x) => attach(x, end, a), false);
      }}
    >
      {value === 'mixed' && <option value="mixed">{end === 'source' ? 'Start' : 'End'}: mixed</option>}
      {value === 'custom' && custom.kind === 'port' && (
        <option value="custom">
          {end === 'source' ? 'Start' : 'End'}: point at {Math.round(custom.point.x * 100)}%, {Math.round(custom.point.y * 100)}%
        </option>
      )}
      <option value="perimeter">{end === 'source' ? 'Start' : 'End'}: floating (nearest point)</option>
      {PORTS.map((p) => (
        <option key={p.id} value={p.id}>
          {end === 'source' ? 'Start' : 'End'}: {OPTION_LABEL[p.id]}
        </option>
      ))}
    </Select>
  );
}

function BendRow({ edges }: { edges: EdgeSectionProps['edges'] }) {
  const actions = useConnectActions();
  const count = edges.reduce((n, e) => n + (e.data?.waypoints?.length ?? 0), 0);
  return (
    <Row label="Bend points">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="text-muted">{count === 0 ? 'None. Drag the dot on a selected connector to add one.' : `${count} ${count === 1 ? 'bend point' : 'bend points'}`}</span>
        {count > 0 && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] font-medium hover:bg-surface-2"
            onClick={() => {
              actions.snapshot();
              for (const e of edges) actions.update(e.id, (x) => setWaypoints(x, []), false);
            }}
          >
            Remove bends
          </button>
        )}
      </div>
    </Row>
  );
}

/** Where the label sits along the connector: a slider (one undo step per use) and a reset to the middle. */
function LabelPositionRow({ e }: { e: EdgeSectionProps['e'] }) {
  const actions = useConnectActions();
  const recorded = useRef(false);
  const t = e.data?.labelPosition;
  return (
    <Row label="Label position">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((t ?? 0.5) * 100)}
          aria-label="Label position along the connector (percent from the start)"
          className="min-w-0 flex-1 accent-[var(--dc-accent)]"
          onFocus={() => (recorded.current = false)}
          onKeyDown={(ev) => ev.stopPropagation()}
          onChange={(ev) => {
            if (!recorded.current) actions.snapshot();
            recorded.current = true;
            const v = Number(ev.target.value) / 100;
            actions.update(e.id, (x) => setLabelPosition(x, v), false);
          }}
        />
        {t !== undefined && t !== 0.5 && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] font-medium hover:bg-surface-2"
            onClick={() => actions.update(e.id, (x) => setLabelPosition(x, undefined), true)}
          >
            Middle
          </button>
        )}
      </div>
    </Row>
  );
}

/** Connector sections, after the line, ends and colour sections (Inspector.tsx). */
export const CONNECT_EDGE_SECTIONS: InspectorSection<EdgeSectionProps>[] = [
  {
    id: 'attach',
    render: ({ edges }) => (
      <Row label="Connection points">
        <div className="grid gap-2">
          <EndSelect end="source" edges={edges} />
          <EndSelect end="target" edges={edges} />
        </div>
      </Row>
    ),
  },
  { id: 'bends', render: ({ edges }) => <BendRow edges={edges} /> },
  { id: 'label-position', render: ({ edges, e }) => edges.length === 1 && typeof e.label === 'string' && e.label !== '' && <LabelPositionRow e={e} /> },
];
