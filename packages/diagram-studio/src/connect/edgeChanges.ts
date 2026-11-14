/**
 * Changes to one connector's attachment, bend points and label (G-CONNECT). Pure: each takes a connector and returns
 * the changed copy (or the same object when nothing changes), so the canvas, the Format panel and tests share them.
 */
import type { EdgePort, Point } from '../model';
import { DEFAULT_CONNECTOR, type Connector, type ConnectorData } from '../types';
import { PORTS, storedLabelPosition } from './geometry';

export type EndKind = 'source' | 'target';

/** How one end of a connector is attached. */
export type Attachment = { kind: 'handle'; handle: string } | { kind: 'port'; point: Point } | { kind: 'perimeter' };

/** Sets connector data fields; `undefined` removes a field, so a connector back at the defaults stores nothing extra. */
export function withData(e: Connector, patch: Partial<ConnectorData>): Connector {
  const data: Record<string, unknown> = { ...DEFAULT_CONNECTOR, ...e.data };
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      if (k in data) {
        delete data[k];
        changed = true;
      }
    } else if (data[k] !== v) {
      data[k] = v;
      changed = true;
    }
  }
  return changed ? { ...e, data: data as ConnectorData } : e;
}

const portKey = (end: EndKind) => (end === 'source' ? 'sourcePort' : 'targetPort');
const handleKey = (end: EndKind) => (end === 'source' ? 'sourceHandle' : 'targetHandle');
const nodeKey = (end: EndKind) => (end === 'source' ? 'source' : 'target');

/** How an end is attached now. */
export function attachmentOf(e: Connector, end: EndKind): Attachment {
  const port: EdgePort | undefined = e.data?.[portKey(end)];
  if (port === 'perimeter') return { kind: 'perimeter' };
  if (port) return { kind: 'port', point: port };
  // Without a handle id React Flow uses the shape's first handle, the top one.
  return { kind: 'handle', handle: e[handleKey(end)] ?? 't' };
}

/**
 * The attachment for one of the eight fixed points (`PORTS`): the side middles are the shape's own side handles, so
 * choosing one stores a schema-2 handle; corners are stored as a port.
 */
export function portAttachment(id: string): Attachment | null {
  const p = PORTS.find((x) => x.id === id);
  if (!p) return null;
  return p.handle ? { kind: 'handle', handle: p.handle } : { kind: 'port', point: { ...p.point } };
}

/** The `PORTS` id an attachment is, if it is one of the eight fixed points. */
export function portIdOf(a: Attachment): string | null {
  if (a.kind === 'handle') return PORTS.find((p) => p.handle === a.handle)?.id ?? null;
  if (a.kind === 'port') return PORTS.find((p) => p.point.x === a.point.x && p.point.y === a.point.y)?.id ?? null;
  return null;
}

/** Attaches one end (optionally to another shape, `nodeId`). */
export function attach(e: Connector, end: EndKind, a: Attachment, nodeId?: string): Connector {
  let next: Connector = nodeId && nodeId !== e[nodeKey(end)] ? { ...e, [nodeKey(end)]: nodeId } : e;
  if (a.kind === 'handle') {
    if (next[handleKey(end)] !== a.handle) next = { ...next, [handleKey(end)]: a.handle };
    return withData(next, { [portKey(end)]: undefined });
  }
  const current = next.data?.[portKey(end)];
  if (a.kind === 'perimeter') return current === 'perimeter' ? next : withData(next, { [portKey(end)]: 'perimeter' });
  if (current && current !== 'perimeter' && current.x === a.point.x && current.y === a.point.y) return next;
  return withData(next, { [portKey(end)]: { x: a.point.x, y: a.point.y } });
}

export const waypointsOf = (e: Connector): Point[] => e.data?.waypoints ?? [];

/** Replaces the bend points (none = the field is removed). */
export function setWaypoints(e: Connector, points: Point[]): Connector {
  return withData(e, { waypoints: points.length ? points.map((p) => ({ x: p.x, y: p.y })) : undefined });
}

export const insertWaypoint = (e: Connector, index: number, p: Point) => {
  const w = [...waypointsOf(e)];
  w.splice(Math.max(0, Math.min(index, w.length)), 0, p);
  return setWaypoints(e, w);
};

export const moveWaypoint = (e: Connector, index: number, p: Point) => setWaypoints(e, waypointsOf(e).map((q, i) => (i === index ? p : q)));

export const removeWaypoint = (e: Connector, index: number) => setWaypoints(e, waypointsOf(e).filter((_, i) => i !== index));

/** Moves every bend point by `delta` (both connected shapes were moved together). */
export const offsetWaypoints = (points: Point[], delta: Point) => points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));

/** Sets where the label sits along the connector (0..1); the middle is the default and is not stored. */
export const setLabelPosition = (e: Connector, t: number | undefined) => withData(e, { labelPosition: t === undefined ? undefined : storedLabelPosition(t) });

export function setLabel(e: Connector, label: string): Connector {
  const current = typeof e.label === 'string' ? e.label : '';
  if (current === label) return e;
  // Without a label there is nothing to place: the position goes too (it would keep the diagram at schema 3).
  return label ? { ...e, label } : withData({ ...e, label: undefined }, { labelPosition: undefined });
}
