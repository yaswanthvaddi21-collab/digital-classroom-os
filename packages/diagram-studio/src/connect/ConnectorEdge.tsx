/**
 * The interactive parts of a connector on the canvas (G-CONNECT): its geometry from ports, floating ends and bend
 * points; its label, which can be dragged along the line and edited by double-clicking; and, while it is selected,
 * handles to move, add and remove bend points, grips to move either end to another shape or point, and a picker for
 * the eight fixed connection points or a floating end.
 *
 * Handles and grips are drawn in the viewport portal (above the shapes) and keep their size at any zoom. They are
 * buttons, so the keyboard reaches them; the Format panel offers the same choices too.
 */
import { EdgeText, useInternalNode, useReactFlow, useStore, ViewportPortal, type EdgeProps, type InternalNode } from '@xyflow/react';
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DiagramActionsContext } from '../ShapeNode';
import type { Point } from '../model';
import type { Connector, ShapeNode } from '../types';
import { useConnectActions } from './context';
import { attach, attachmentOf, insertWaypoint, moveWaypoint, portAttachment, portIdOf, removeWaypoint, setLabel, setLabelPosition, waypointsOf, type Attachment, type EndKind } from './edgeChanges';
import { centreOf, connectorGeometry, insertHandles, nearestAlong, portPoint, PORTS, snapPoint, type ConnectorGeometry, type PathGeometry, type Rect } from './geometry';

type PathFnFor = (p: EdgeProps<Connector>) => [string, number, number];

export const rectOf = (n: InternalNode<ShapeNode> | undefined): Rect | null =>
  n ? { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured?.width ?? n.width ?? 0, height: n.measured?.height ?? n.height ?? 0 } : null;

/**
 * Where a connector runs: React Flow's path for its line type when it has no schema-3 fields (so existing diagrams look
 * exactly as before), otherwise the resolved ends, the route through the bend points and the label point.
 */
export function useConnectorGeometry(p: EdgeProps<Connector>, type: string, pathFn: PathFnFor): ConnectorGeometry & { sourceNode?: InternalNode<ShapeNode>; targetNode?: InternalNode<ShapeNode> } {
  const sourceNode = useInternalNode<ShapeNode>(p.source);
  const targetNode = useInternalNode<ShapeNode>(p.target);
  const d = p.data;
  const geo = useMemo(() => {
    const source = { x: p.sourceX, y: p.sourceY, position: p.sourcePosition };
    const target = { x: p.targetX, y: p.targetY, position: p.targetPosition };
    const plain = !d?.sourcePort && !d?.targetPort && !d?.waypoints?.length && d?.labelPosition === undefined;
    const sBox = rectOf(sourceNode);
    const tBox = rectOf(targetNode);
    if ((plain && !p.selected) || !sBox || !tBox) {
      const [path, labelX, labelY] = pathFn(p);
      return { path, labelX, labelY, source, target, points: [], legs: [] };
    }
    return connectorGeometry({
      type,
      source: { box: sBox, kind: sourceNode!.data.shape, handle: source, port: d?.sourcePort },
      target: { box: tBox, kind: targetNode!.data.shape, handle: target, port: d?.targetPort },
      waypoints: d?.waypoints,
      labelPosition: d?.labelPosition,
      pathFn: (g: PathGeometry) => pathFn({ ...p, ...g }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sourceX, p.sourceY, p.targetX, p.targetY, p.sourcePosition, p.targetPosition, p.selected, d, sourceNode, targetNode, type, pathFn]);
  return { ...geo, sourceNode, targetNode };
}

/** Follows one pointer through window listeners (the element under it may re-render or disappear meanwhile). */
function trackPointer(start: ReactPointerEvent, onMove: (ev: PointerEvent, first: boolean) => void, onEnd: (ev: PointerEvent, moved: boolean) => void, threshold = 3) {
  const x0 = start.clientX;
  const y0 = start.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== start.pointerId) return;
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < threshold) return;
    const first = !moved;
    moved = true;
    onMove(ev, first);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== start.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    onEnd(ev, moved && ev.type === 'pointerup');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** The shape (and handle, if the pointer is on one) under a screen point. */
export function dropTargetAt(clientX: number, clientY: number): { nodeId: string; handle?: string } | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const h = (el as HTMLElement).closest?.('.react-flow__handle');
    const hn = h?.getAttribute('data-nodeid');
    if (h && hn) return { nodeId: hn, handle: h.getAttribute('data-handleid') ?? undefined };
    const n = (el as HTMLElement).closest?.('.react-flow__node');
    const id = n?.getAttribute('data-id');
    if (id) return { nodeId: id };
  }
  return null;
}

const OVERLAY = 'nodrag nopan nowheel nokey';
const END_NAME: Record<EndKind, string> = { source: 'start', target: 'end' };

/** The connector's label: React Flow's own label drawing, draggable along the line while the connector is selected. */
export function ConnectorLabel({ p, geo }: { p: EdgeProps<Connector>; geo: ConnectorGeometry }) {
  const actions = useConnectActions();
  const shape = useContext(DiagramActionsContext);
  const rf = useReactFlow();
  const editing = shape?.editingId === p.id && !actions.readOnly;
  const label = typeof p.label === 'string' ? p.label : '';
  const draggable = !!p.selected && !actions.readOnly && geo.points.length > 1;

  const onPointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    const points = geo.points;
    trackPointer(
      e,
      (ev, first) => {
        if (first) actions.snapshot();
        const t = nearestAlong(points, rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })).t;
        actions.update(p.id, (x) => setLabelPosition(x, t), false);
      },
      () => {},
    );
  };

  return (
    <>
      {label && !editing && (
        <EdgeText
          x={geo.labelX}
          y={geo.labelY}
          label={p.label}
          labelStyle={p.labelStyle}
          labelShowBg={p.labelShowBg}
          labelBgStyle={p.labelBgStyle}
          labelBgPadding={p.labelBgPadding}
          labelBgBorderRadius={p.labelBgBorderRadius}
          {...(draggable ? { className: `dcos-edge-label-drag ${OVERLAY}`, onPointerDown } : {})}
        />
      )}
      {editing && <LabelEditor id={p.id} initial={label} at={{ x: geo.labelX, y: geo.labelY }} />}
    </>
  );
}

function LabelEditor({ id, initial, at }: { id: string; initial: string; at: Point }) {
  const actions = useConnectActions();
  const shape = useContext(DiagramActionsContext);
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) actions.update(id, (e) => setLabel(e, value.trim() ? value : ''), true);
    shape?.setEditingId(null);
  };
  return (
    <ViewportPortal>
      <input
        ref={ref}
        aria-label="Connector label"
        placeholder="Label"
        className={`dcos-edge-label-editor ${OVERLAY}`}
        style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)` }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            // Inside a modal <dialog>, Escape's default action would close the whole dialog.
            e.preventDefault();
            finish(false);
          }
        }}
      />
    </ViewportPortal>
  );
}

/** One burst of arrow-key moves is one undo step. */
const KEY_BURST_MS = 800;

/**
 * Bend-point handles, "add a bend" handles, end grips and the connection-point picker of a selected connector.
 */
export function ConnectorControls({ p, geo }: { p: EdgeProps<Connector>; geo: ReturnType<typeof useConnectorGeometry> }) {
  const actions = useConnectActions();
  const shape = useContext(DiagramActionsContext);
  const rf = useReactFlow<ShapeNode, Connector>();
  const zoom = useStore((s) => s.transform[2]);
  const [picker, setPicker] = useState<EndKind | null>(null);
  const [drag, setDrag] = useState<{ end: EndKind; at: Point; over: string | null } | null>(null);
  const [focusBend, setFocusBend] = useState<number | null>(null);
  const justDragged = useRef(false);
  const lastKey = useRef(0);
  const bendRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (focusBend === null) return;
    bendRefs.current[focusBend]?.focus();
    setFocusBend(null);
  }, [focusBend]);
  useEffect(() => {
    if (!p.selected) setPicker(null);
  }, [p.selected]);

  if (!p.selected || actions.readOnly || shape?.editingId === p.id) return null;
  const edge: Connector = { id: p.id, source: p.source, target: p.target, sourceHandle: p.sourceHandleId, targetHandle: p.targetHandleId, data: p.data };
  const waypoints = waypointsOf(edge);
  const scale = 1 / (zoom || 1);
  const place = (q: Point): CSSProperties => ({ transform: `translate(${q.x}px, ${q.y}px) translate(-50%, -50%) scale(${scale})` });
  const toFlow = (ev: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
  const snap = (q: Point) => snapPoint(q, actions.grid);
  const label = typeof p.label === 'string' && p.label ? { x: geo.labelX, y: geo.labelY } : null;
  const inserts = geo.legs.length ? insertHandles(geo.legs, label) : [];

  const keyStep = () => {
    if (Date.now() - lastKey.current > KEY_BURST_MS) actions.snapshot();
    lastKey.current = Date.now();
  };

  const dragBend = (index: number, insert: boolean) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackPointer(
      e,
      (ev, first) => {
        const at = snap(toFlow(ev));
        if (first) actions.snapshot();
        actions.update(p.id, (x) => (insert && first ? insertWaypoint(x, index, at) : moveWaypoint(x, index, at)), false);
      },
      () => {},
    );
  };

  const onBendKey = (index: number) => (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 1 : (actions.grid ?? 10);
    const delta = ({ ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 } } as Record<string, Point>)[e.key];
    if (delta) {
      e.preventDefault();
      e.stopPropagation();
      keyStep();
      const w = waypoints[index];
      actions.update(p.id, (x) => moveWaypoint(x, index, { x: w.x + delta.x, y: w.y + delta.y }), false);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      actions.update(p.id, (x) => removeWaypoint(x, index), true);
      if (waypoints.length > 1) setFocusBend(Math.min(index, waypoints.length - 2));
    }
  };

  const ends: Record<EndKind, { at: Point; node?: InternalNode<ShapeNode> }> = {
    source: { at: geo.source, node: geo.sourceNode },
    target: { at: geo.target, node: geo.targetNode },
  };

  const dragEnd = (end: EndKind) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackPointer(
      e,
      (ev) => {
        const over = dropTargetAt(ev.clientX, ev.clientY)?.nodeId ?? null;
        setDrag({ end, at: toFlow(ev), over });
      },
      (ev, moved) => {
        setDrag(null);
        if (!moved) return;
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
        const drop = dropTargetAt(ev.clientX, ev.clientY);
        if (!drop) return;
        const fixedNode = end === 'source' ? p.target : p.source;
        if (drop.nodeId === fixedNode) {
          actions.toast('A connector cannot join a shape to itself.', 'info');
          return;
        }
        let a: Attachment = { kind: 'perimeter' };
        if (drop.handle) a = { kind: 'handle', handle: drop.handle };
        else {
          const n = rf.getInternalNode(drop.nodeId);
          const box = rectOf(n);
          if (n && box) {
            const at = toFlow(ev);
            const near = PORTS.map((port) => ({ port, d: Math.hypot(...((q) => [q.x - at.x, q.y - at.y] as const)(portPoint(n.data.shape, box, port.point))) })).sort((x, y) => x.d - y.d)[0];
            if (near && near.d <= 12 * scale) a = portAttachment(near.port.id)!;
          }
        }
        actions.update(p.id, (x) => attach(x, end, a, drop.nodeId), true);
        setPicker(null);
      },
    );
  };

  const choose = (end: EndKind, a: Attachment) => {
    actions.update(p.id, (x) => attach(x, end, a), true);
    setPicker(null);
  };

  const pickerNode = picker ? ends[picker].node : undefined;
  const pickerBox = rectOf(pickerNode);
  const current = picker ? attachmentOf(edge, picker) : null;
  const currentPort = current ? portIdOf(current) : null;
  const hover = drag?.over ? rf.getInternalNode(drag.over) : undefined;
  const hoverBox = rectOf(hover);
  const fixedEnd = drag ? (drag.end === 'source' ? geo.target : geo.source) : null;

  return (
    <ViewportPortal>
      <div className="dcos-connect-layer">
        {waypoints.map((w, i) => (
          <button
            key={`b${i}`}
            ref={(el) => void (bendRefs.current[i] = el)}
            type="button"
            className={`dcos-bend ${OVERLAY}`}
            style={place(w)}
            aria-label={`Bend point ${i + 1} of ${waypoints.length}`}
            title="Drag to move this bend. Double-click (or press Delete) to remove it. Arrow keys move it."
            onPointerDown={dragBend(i, false)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              actions.update(p.id, (x) => removeWaypoint(x, i), true);
            }}
            onKeyDown={onBendKey(i)}
          />
        ))}
        {inserts.map((q, i) => (
          <button
            key={`i${i}`}
            type="button"
            className={`dcos-bend-add ${OVERLAY}`}
            style={place(q)}
            aria-label={`Add a bend point to part ${i + 1} of the connector`}
            title="Drag to add a bend here"
            onPointerDown={dragBend(i, true)}
            onClick={(e) => {
              // Keyboard (Enter / Space): a bend here, focused, ready to move with the arrow keys.
              if (e.detail !== 0) return;
              actions.update(p.id, (x) => insertWaypoint(x, i, snap(q)), true);
              setFocusBend(i);
            }}
          />
        ))}
        {(['source', 'target'] as const).map((end) => (
          <button
            key={end}
            type="button"
            className={`dcos-end-grip ${OVERLAY}${picker === end ? ' dcos-active' : ''}`}
            style={place(ends[end].at)}
            aria-label={`${END_NAME[end] === 'start' ? 'Start' : 'End'} of the connector: choose its connection point`}
            aria-expanded={picker === end}
            title="Drag onto a shape, a point or a handle to reattach this end. Click to choose a connection point."
            onPointerDown={dragEnd(end)}
            onClick={() => {
              if (justDragged.current) return;
              setPicker((x) => (x === end ? null : end));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && picker) {
                e.preventDefault();
                e.stopPropagation();
                setPicker(null);
              }
            }}
          />
        ))}
        {picker && pickerNode && pickerBox && (
          <div role="group" aria-label={`Connection points for the ${END_NAME[picker]}`} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setPicker(null))}>
            {PORTS.map((port) => (
              <button
                key={port.id}
                type="button"
                className={`dcos-port ${OVERLAY}${currentPort === port.id ? ' dcos-active' : ''}`}
                style={place(portPoint(pickerNode.data.shape, pickerBox, port.point))}
                aria-label={`Attach the ${END_NAME[picker]} to the ${port.name}`}
                aria-pressed={currentPort === port.id}
                title={`Attach to the ${port.name}`}
                onClick={() => choose(picker, portAttachment(port.id)!)}
              />
            ))}
            <button
              type="button"
              className={`dcos-port-float ${OVERLAY}${current?.kind === 'perimeter' ? ' dcos-active' : ''}`}
              style={place(centreOf(pickerBox))}
              aria-label={`Let the ${END_NAME[picker]} float: attach it to the nearest point of the outline`}
              aria-pressed={current?.kind === 'perimeter'}
              title="Floating: the connector meets the outline at the nearest point and moves round as the shapes move"
              onClick={() => choose(picker, { kind: 'perimeter' })}
            />
          </div>
        )}
        {drag && fixedEnd && (
          <svg className="dcos-connect-preview" aria-hidden>
            {hoverBox && <rect x={hoverBox.x - 4} y={hoverBox.y - 4} width={hoverBox.width + 8} height={hoverBox.height + 8} rx={8} />}
            <line x1={fixedEnd.x} y1={fixedEnd.y} x2={drag.at.x} y2={drag.at.y} />
          </svg>
        )}
        {drag &&
          hover &&
          hoverBox &&
          PORTS.map((port) => <span key={port.id} className="dcos-port dcos-port-hint" style={place(portPoint(hover.data.shape, hoverBox, port.point))} aria-hidden />)}
      </div>
    </ViewportPortal>
  );
}
