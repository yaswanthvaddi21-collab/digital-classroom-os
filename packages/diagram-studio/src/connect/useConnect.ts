/**
 * Editor wiring for G-CONNECT: the actions connectors use to change themselves, a floating connection when a new
 * connection is dropped on a shape's body (not on a handle), bend points that travel with their shapes when both ends
 * are dragged together, and React Flow's reconnect anchors kept off ends that are attached by a port.
 */
import type { FinalConnectionState, InternalNode, NodeChange, NodePositionChange, OnConnectEnd } from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import type { DiagramState } from '../editor/useDiagramState';
import { canvasPosition, type Point } from '../model';
import { canConnect, facingHandles } from '../quickConnectGeometry';
import { DEFAULT_CONNECTOR, styledEdge, type Connector, type EdgeLineType, type ShapeNode } from '../types';
import type { ConnectActions } from './context';
import { offsetWaypoints, setWaypoints } from './edgeChanges';
import { dropTargetAt } from './ConnectorEdge';

let counter = 0;
const newEdgeId = () => `e-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : `${Date.now().toString(36)}${(++counter).toString(36)}`}`;

export interface ConnectDeps {
  state: DiagramState;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

/** Where a mouse or touch event happened on screen. */
function clientPoint(event: MouseEvent | TouchEvent): Point | null {
  if ('changedTouches' in event) {
    const t = event.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * A connection dropped on a shape's body (away from its handles) joins that shape with a floating end, as in
 * diagrams.net. Returns the new connector, or null when the drop is not on another shape. Pure apart from the lookup.
 */
export function floatingConnection(
  state: Pick<FinalConnectionState<InternalNode<ShapeNode>>, 'isValid' | 'fromNode' | 'fromHandle'>,
  targetId: string | null,
  nodes: ShapeNode[],
  edges: Connector[],
  lineType: EdgeLineType,
  id: () => string = newEdgeId,
): Connector | null {
  // isValid is true when React Flow connected to a handle (onConnect did it), false over a refused handle.
  if (state.isValid !== null || !state.fromNode || !targetId) return null;
  const from = state.fromNode.id;
  if (!canConnect([], new Set(nodes.map((n) => n.id)), from, targetId).ok) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const box = (n: ShapeNode) => ({ id: n.id, ...canvasPosition(n, byId), width: n.width ?? n.measured?.width ?? 160, height: n.height ?? n.measured?.height ?? 70 });
  const facing = facingHandles(box(byId.get(from)!), box(byId.get(targetId)!));
  const sourceHandle = state.fromHandle?.id ?? facing.sourceHandle;
  if (edges.some((e) => e.source === from && e.target === targetId && (e.sourceHandle ?? null) === sourceHandle && e.data?.targetPort === 'perimeter')) return null;
  return styledEdge({
    id: id(),
    source: from,
    target: targetId,
    sourceHandle,
    targetHandle: facing.targetHandle,
    type: lineType,
    data: { ...DEFAULT_CONNECTOR, targetPort: 'perimeter' },
  });
}

/** The shapes moved by dragging `dragged`: those nodes and everything inside them (groups carry their shapes). */
function movedWith(dragged: Set<string>, nodes: ShapeNode[]): Set<string> {
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  const out = new Set<string>();
  for (const n of nodes) {
    const seen = new Set<string>();
    for (let id: string | undefined = n.id; id && !seen.has(id); id = parent.get(id)) {
      seen.add(id);
      if (dragged.has(id)) {
        out.add(n.id);
        break;
      }
    }
  }
  return out;
}

export function useConnect({ state, toast }: ConnectDeps) {
  const { readOnly, snapshot, setEdges, current, settings } = state;
  const lineType = settings.connector ?? 'smoothstep';

  const update = useCallback<ConnectActions['update']>(
    (id, change, record) => {
      if (readOnly) return;
      const e = current.current.edges.find((x) => x.id === id);
      if (!e || change(e) === e) return;
      if (record) snapshot();
      setEdges((es) => es.map((x) => (x.id === id ? change(x) : x)));
    },
    [readOnly, current, snapshot, setEdges],
  );

  const grid = settings.snapToGrid ? 10 : null;
  const actions = useMemo<ConnectActions>(() => ({ readOnly, grid, snapshot, update, toast }), [readOnly, grid, snapshot, update, toast]);

  // React Flow reports the end of a reconnect drag (moving an existing connector's end) through onConnectEnd too.
  const reconnecting = useRef(false);
  const onReconnectStart = () => void (reconnecting.current = true);
  const onReconnectEnd = () => void (reconnecting.current = false);

  const onConnectEnd: OnConnectEnd = (event, connection) => {
    if (readOnly || reconnecting.current) return;
    const at = clientPoint(event);
    const target = at ? (dropTargetAt(at.x, at.y)?.nodeId ?? null) : null;
    const { nodes, edges } = current.current;
    const edge = floatingConnection(connection as FinalConnectionState<InternalNode<ShapeNode>>, target, nodes, edges, lineType);
    if (!edge) return;
    snapshot();
    setEdges((es) => [...es, edge]);
  };

  // Bend points are canvas points: when both shapes of a connector move together, its bends move with them. Driven
  // by the position changes the editor applies (after G-CANVAS turned a drag on a shape in a group into a drag of the
  // group), so it follows mouse and touch drags, group drags and arrow-key nudges alike.
  const drag = useRef<{ start: Map<string, Point>; bends: Map<string, Point[]> } | null>(null);
  const onPositionChanges = useCallback(
    (changes: NodeChange<ShapeNode>[], before: readonly ShapeNode[]) => {
      if (readOnly) return;
      const moves = changes.filter((c): c is NodePositionChange => c.type === 'position' && !!c.position);
      if (!moves.length) return;
      const dragging = moves.some((c) => c.dragging);
      let d = drag.current;
      if (!d) {
        // A resize moves shapes by different amounts: their bends stay.
        if (changes.some((c) => c.type === 'dimensions')) return;
        const byId = new Map(before.map((n) => [n.id, n]));
        const start = new Map<string, Point>();
        for (const c of moves) {
          const n = byId.get(c.id);
          if (n) start.set(c.id, { ...n.position });
        }
        const moving = movedWith(new Set(start.keys()), [...before]);
        const bends = new Map<string, Point[]>();
        for (const e of current.current.edges) if (e.data?.waypoints?.length && moving.has(e.source) && moving.has(e.target)) bends.set(e.id, e.data.waypoints);
        d = { start, bends };
        if (dragging) drag.current = d;
      }
      if (!dragging) drag.current = null;
      if (!d.bends.size) return;
      const deltas = moves.flatMap((c) => {
        const from = d!.start.get(c.id);
        return from ? [{ x: c.position!.x - from.x, y: c.position!.y - from.y }] : [];
      });
      if (!deltas.length) return;
      const delta = deltas[0];
      // Shapes that moved by different amounts (not one drag or nudge): leave the bends alone.
      if (deltas.some((x) => Math.abs(x.x - delta.x) > 0.5 || Math.abs(x.y - delta.y) > 0.5)) return;
      const bends = d.bends;
      setEdges((es) => es.map((e) => (bends.has(e.id) ? setWaypoints(e, offsetWaypoints(bends.get(e.id)!, delta)) : e)));
    },
    [readOnly, current, setEdges],
  );

  // React Flow places its reconnect anchors on the side handle; an end attached by a port is not there.
  const flowEdges = useMemo(
    () =>
      state.edges.map((e) => {
        const s = !!e.data?.sourcePort;
        const t = !!e.data?.targetPort;
        const want = readOnly || (!s && !t) ? undefined : s && t ? false : s ? ('target' as const) : ('source' as const);
        if (e.reconnectable === want) return e;
        const { reconnectable: _r, ...rest } = e;
        return want === undefined ? rest : { ...rest, reconnectable: want };
      }),
    [state.edges, readOnly],
  );

  return { actions, onConnectEnd, onReconnectStart, onReconnectEnd, onPositionChanges, flowEdges, lineType };
}

export type ConnectWiring = ReturnType<typeof useConnect>;
