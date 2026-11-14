import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps, type EdgeTypes } from '@xyflow/react';
import { createContext, memo, useContext } from 'react';
import { ConnectorControls, ConnectorLabel, useConnectorGeometry } from './connect/ConnectorEdge';
import { DEFAULT_CONNECTOR, edgeMarkers, type Connector, type EdgeLineType, type MarkerKind } from './types';

/**
 * One marker definition. Drawn along the path direction with the tip at x = 20, so `orient="auto-start-reverse"`
 * makes the same shape point outward at both ends.
 */
function Marker({ id, kind, color }: { id: string; kind: Exclude<MarkerKind, 'none'>; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  let shape: React.ReactNode;
  switch (kind) {
    case 'arrow':
      shape = <path d="M2,3 L20,10 L2,17 Z" fill={color} {...stroke} />;
      break;
    case 'open-arrow':
      shape = <path d="M4,3 L20,10 L4,17" fill="none" {...stroke} />;
      break;
    case 'triangle':
      shape = <path d="M2,2 L20,10 L2,18 Z" fill="#ffffff" {...stroke} />;
      break;
    case 'diamond':
      shape = <path d="M0,10 L10,4 L20,10 L10,16 Z" fill="#ffffff" {...stroke} />;
      break;
    case 'diamond-filled':
      shape = <path d="M0,10 L10,4 L20,10 L10,16 Z" fill={color} {...stroke} />;
      break;
    case 'circle':
      shape = <circle cx="14" cy="10" r="5" fill="#ffffff" {...stroke} />;
      break;
    case 'crow-many':
      shape = <path d="M6,10 L20,3 M6,10 L20,10 M6,10 L20,17" fill="none" {...stroke} />;
      break;
    case 'crow-one':
      shape = <path d="M10,3 L10,17 M15,3 L15,17" fill="none" {...stroke} />;
      break;
    case 'crow-zero-many':
      shape = (
        <>
          <circle cx="4" cy="10" r="3.5" fill="#ffffff" {...stroke} />
          <path d="M9,10 L20,3 M9,10 L20,10 M9,10 L20,17" fill="none" {...stroke} />
        </>
      );
      break;
    case 'crow-zero-one':
      shape = (
        <>
          <circle cx="6" cy="10" r="3.5" fill="#ffffff" {...stroke} />
          <path d="M15,3 L15,17" fill="none" {...stroke} />
        </>
      );
      break;
  }
  return (
    <marker id={id} viewBox="0 0 22 20" refX="20" refY="10" markerWidth="20" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      {shape}
    </marker>
  );
}

/** Computes a connector's SVG path and its label position from React Flow's endpoint geometry. */
export type EdgePathFn = (p: EdgeProps) => [path: string, labelX: number, labelY: number];

const geometry = (p: EdgeProps) => ({ sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY, sourcePosition: p.sourcePosition, targetPosition: p.targetPosition });
const first3 = (r: [string, number, number, ...unknown[]]): [string, number, number] => [r[0], r[1], r[2]];

/** One path function per line type. Stored connectors name their type, so existing keys never change meaning. */
export const EDGE_PATHS: Record<EdgeLineType, EdgePathFn> = {
  straight: (p) => first3(getStraightPath(geometry(p))),
  step: (p) => first3(getSmoothStepPath({ ...geometry(p), borderRadius: 0 })),
  smoothstep: (p) => first3(getSmoothStepPath(geometry(p))),
  default: (p) => first3(getBezierPath(geometry(p))),
  // @phase5:edges — path functions for new line types (and add the type to EdgeLineType).
};

/** Prefix for this editor's marker ids, so two editors on one page (a document and its diagram dialog) never clash. */
export const MarkerScopeContext = createContext('dcos');

const colorKey = (c: string) => c.replace(/[^a-zA-Z0-9]/g, (ch) => `_${ch.charCodeAt(0).toString(16)}`);
/** The id of the shared definition of one end decoration in one colour. */
export const markerId = (scope: string, kind: MarkerKind, color: string) => `${scope}-m-${kind}-${colorKey(color)}`;

/**
 * One shared `<marker>` per end decoration and colour used in the diagram, instead of one per connector end (TD-21).
 * Rendered inside the canvas viewport (ViewportPortal), so image exports, which capture the viewport, include it.
 */
export const MarkerDefs = memo(function MarkerDefs({ edges }: { edges: Connector[] }) {
  const scope = useContext(MarkerScopeContext);
  const used = new Map<string, { kind: Exclude<MarkerKind, 'none'>; color: string }>();
  for (const e of edges) {
    const d = { ...DEFAULT_CONNECTOR, ...e.data };
    const { start, end } = edgeMarkers(d);
    for (const kind of [start, end]) if (kind !== 'none') used.set(markerId(scope, kind, d.color), { kind, color: d.color });
  }
  return (
    <svg className="dcos-marker-defs" width={0} height={0} aria-hidden style={{ position: 'absolute', overflow: 'hidden' }}>
      <defs>
        {[...used].map(([id, m]) => (
          <Marker key={id} id={id} kind={m.kind} color={m.color} />
        ))}
      </defs>
    </svg>
  );
});

function makeEdge(type: EdgeLineType) {
  return memo(function DcosEdge(props: EdgeProps<Connector>) {
    const d = { ...DEFAULT_CONNECTOR, ...props.data };
    const { start, end } = edgeMarkers(d);
    // @phase5:connect — ports, floating ends, bend points and the label position (connect/). Without them the line
    // type's own path is drawn, exactly as before.
    const geo = useConnectorGeometry(props, type, EDGE_PATHS[type] ?? EDGE_PATHS.default);
    const scope = useContext(MarkerScopeContext);
    return (
      <>
        <BaseEdge
          id={props.id}
          path={geo.path}
          style={props.style}
          markerStart={start !== 'none' ? `url(#${markerId(scope, start, d.color)})` : undefined}
          markerEnd={end !== 'none' ? `url(#${markerId(scope, end, d.color)})` : undefined}
          interactionWidth={20}
        />
        <ConnectorLabel p={props} geo={geo} />
        {props.selected && <ConnectorControls p={props} geo={geo} />}
      </>
    );
  });
}

/** Replaces React Flow's built-in edges under the same type names, so stored connectors keep their types. */
export const edgeTypes: EdgeTypes = Object.fromEntries((Object.keys(EDGE_PATHS) as EdgeLineType[]).map((type) => [type, makeEdge(type)]));
