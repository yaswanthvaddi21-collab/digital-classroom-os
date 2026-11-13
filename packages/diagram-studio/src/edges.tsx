import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps, type EdgeTypes } from '@xyflow/react';
import { memo } from 'react';
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

function pathFor(type: EdgeLineType, p: EdgeProps): [string, number, number] {
  const geo = { sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY, sourcePosition: p.sourcePosition, targetPosition: p.targetPosition };
  const [path, x, y] =
    type === 'straight'
      ? getStraightPath(geo)
      : type === 'step'
        ? getSmoothStepPath({ ...geo, borderRadius: 0 })
        : type === 'smoothstep'
          ? getSmoothStepPath(geo)
          : getBezierPath(geo);
  return [path, x, y];
}

function makeEdge(type: EdgeLineType) {
  return memo(function DcosEdge(props: EdgeProps<Connector>) {
    const d = { ...DEFAULT_CONNECTOR, ...props.data };
    const { start, end } = edgeMarkers(d);
    const [path, labelX, labelY] = pathFor(type, props);
    const startId = `dcos-m-${props.id}-s`;
    const endId = `dcos-m-${props.id}-e`;
    return (
      <>
        <defs>
          {start !== 'none' && <Marker id={startId} kind={start} color={d.color} />}
          {end !== 'none' && <Marker id={endId} kind={end} color={d.color} />}
        </defs>
        <BaseEdge
          id={props.id}
          path={path}
          style={props.style}
          markerStart={start !== 'none' ? `url(#${startId})` : undefined}
          markerEnd={end !== 'none' ? `url(#${endId})` : undefined}
          label={props.label}
          labelX={labelX}
          labelY={labelY}
          labelStyle={props.labelStyle}
          labelShowBg={props.labelShowBg}
          labelBgStyle={props.labelBgStyle}
          labelBgPadding={props.labelBgPadding}
          labelBgBorderRadius={props.labelBgBorderRadius}
          interactionWidth={20}
        />
      </>
    );
  });
}

/** Replaces React Flow's built-in edges under the same type names, so stored connectors keep their types. */
export const edgeTypes: EdgeTypes = {
  default: makeEdge('default'),
  straight: makeEdge('straight'),
  step: makeEdge('step'),
  smoothstep: makeEdge('smoothstep'),
};
