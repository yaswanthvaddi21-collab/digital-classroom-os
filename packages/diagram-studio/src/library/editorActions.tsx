import type { MenuItem } from '@dcos/ui';
import { Button } from '@dcos/ui';
import { CalendarPlus, Rows3 } from 'lucide-react';
import type { EditorController } from '../editor/controller';
import { inheritedData, newId } from '../editor/mutations';
import type { SelectionAction } from '../editor/selectionActions';
import type { ToolbarGroup } from '../editor/Toolbar';
import { inCanvasFrame } from '../model';
import { DEFAULT_CONNECTOR, shapeDefaults, styledEdge, type Connector, type ShapeKind, type ShapeNode } from '../types';
import { addLaneTo, settleIntoContainers } from './containers';
import { layoutMindmap, mindmapRoot, type MindmapStyle } from './mindmap';
import { isTimelineDate, layoutTimeline, timelineOrder } from './timeline';

/*
 * What the shape library adds to the editor: shapes join the container (pool, lane, system boundary) they are
 * dropped in, "Add lane", the mind map and timeline arrangements, and "Add event". Each entry records one undo step
 * before changing anything and does nothing on a read-only diagram.
 */

/** Adds a shape from the library (at canvas point `at`, or the middle of the view); it joins the container there. */
export function addShapeInContainer(ctx: EditorController, shape: ShapeKind, at?: { x: number; y: number }) {
  if (ctx.readOnly) return;
  ctx.addShape(shape, at);
  // addShape appends the new shape last; this update runs after it, in the same undo step.
  ctx.setNodes((ns) => (ns.length ? settleIntoContainers(ns, [ns[ns.length - 1].id]) : ns));
}

/**
 * Layouts never move a locked shape (its own lock, its group's or its layer's): G-CANVAS's rule for Arrange. Puts
 * every such shape back where it was.
 */
function keepLocked(ctx: EditorController, before: readonly ShapeNode[], after: ShapeNode[]): ShapeNode[] {
  const was = new Map(before.map((n) => [n.id, n.position]));
  return after.map((n) => {
    const p = was.get(n.id);
    return p && ctx.isLocked(n.id) && (p.x !== n.position.x || p.y !== n.position.y) ? { ...n, position: p } : n;
  });
}

/** After a drag: shapes dropped inside a container join it; shapes dragged out of one leave it. */
export function dropIntoContainers(ctx: EditorController, dragged: Array<{ id: string }>) {
  if (ctx.readOnly || !dragged.length) return;
  const ids = dragged.map((n) => n.id);
  ctx.setNodes((ns) => settleIntoContainers(ns, ids));
}

const singlePoolOrLane = (ctx: EditorController) => {
  if (ctx.readOnly || ctx.selectedNodes.length !== 1) return false;
  const n = ctx.selectedNodes[0];
  const pool = n.data.shape === 'bpmnPool' ? n : n.data.shape === 'bpmnLane' && n.parentId ? ctx.nodes.find((p) => p.id === n.parentId && p.data.shape === 'bpmnPool') : undefined;
  if (!pool) return false;
  // Adding a lane resizes the pool and its lanes: not while any of them is locked.
  return ![pool, ...ctx.nodes.filter((l) => l.parentId === pool.id && l.data.shape === 'bpmnLane')].some((x) => ctx.isLocked(x.id));
};

/** Adds a lane at the bottom of the selected pool (or of the pool the selected lane is in), and selects it. */
export function addLane(ctx: EditorController) {
  if (!singlePoolOrLane(ctx)) return;
  const { width: _w, height, ...style } = shapeDefaults('bpmnLane');
  const plan = addLaneTo(ctx.nodes, ctx.selectedNodes[0].id, () => newId('n'), { style: { ...style, label: '' }, height });
  if (!plan) return;
  ctx.snapshot();
  ctx.setNodes(plan.nodes.map((n) => (!!n.selected === (n.id === plan.laneId) ? n : { ...n, selected: n.id === plan.laneId })));
}

export const ADD_LANE_ACTION: SelectionAction = { id: 'add-lane', label: 'Add lane', icon: <Rows3 size={16} />, when: singlePoolOrLane, run: addLane };

/** Arranges the mind map around the selected shape (or its central idea) radially or on two sides. */
export function arrangeMindmap(ctx: EditorController, style: MindmapStyle) {
  if (ctx.readOnly) return;
  const root = mindmapRoot(ctx.nodes, ctx.edges, ctx.selectedNodes.length === 1 ? ctx.selectedNodes[0].id : undefined);
  if (!root || !ctx.edges.some((e) => e.source === root || e.target === root)) {
    ctx.toast('Connect topics to a central idea first: a mind map is arranged around the selected shape.', 'info');
    return;
  }
  let edges: Connector[] = ctx.edges;
  const nodes = inCanvasFrame(ctx.nodes, (canvas) => {
    const laid = layoutMindmap(canvas, ctx.edges, root, style);
    edges = laid.edges.map((e) => (e.type === 'default' ? styledEdge(e) : e));
    return laid.nodes;
  });
  ctx.snapshot();
  ctx.setNodes(keepLocked(ctx, ctx.nodes, nodes));
  ctx.setEdges(edges);
  // A tree auto-arrange would undo this layout on the next Tab, so it is turned off.
  ctx.setSettings((s) => (s.autoLayout === 'none' ? s : { ...s, autoLayout: 'none' }));
  requestAnimationFrame(() => ctx.rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.2 }));
}

const axisEdge = (a: ShapeNode, b: ShapeNode): Connector =>
  styledEdge({ id: newId('e'), source: a.id, target: b.id, sourceHandle: 'r', targetHandle: 'l', type: 'straight', data: { ...DEFAULT_CONNECTOR, arrow: 'none', width: 3 } });

const hasTimeline = (ctx: EditorController) => ctx.nodes.some(isTimelineDate);

/** Evenly spaces the timeline's dates in date order, with their events alternating above and below. */
export function arrangeTimeline(ctx: EditorController) {
  if (ctx.readOnly) return;
  if (!hasTimeline(ctx)) {
    ctx.toast('Add a Timeline date from the shape library first: the timeline is arranged along its dates.', 'info');
    return;
  }
  let edges: Connector[] = ctx.edges;
  let removed: Connector[] = [];
  const nodes = inCanvasFrame(ctx.nodes, (canvas) => {
    const laid = layoutTimeline(canvas, ctx.edges, axisEdge);
    edges = laid.edges;
    removed = laid.removed;
    return laid.nodes;
  });
  ctx.snapshot();
  ctx.setNodes(keepLocked(ctx, ctx.nodes, nodes));
  ctx.setEdges(edges);
  noteRemovedAxis(ctx, removed.length);
}

/**
 * A plain line (no label, arrows or bends) between dates that are no longer neighbours looks exactly like an old axis
 * piece, so the layout removes it. Say so, rather than letting a line the user drew vanish silently.
 */
function noteRemovedAxis(ctx: EditorController, count: number) {
  if (!count) return;
  const lines = count === 1 ? '1 plain line' : `${count} plain lines`;
  ctx.toast(`Removed ${lines} between dates that are no longer next to each other: the timeline treats them as old axis pieces. Undo brings them back; a label or an arrow keeps a line.`, 'info');
}

/**
 * Adds a date and an event to the timeline: after the selected date (or the date of the selected event), else at
 * the end. The timeline is re-spaced so the spacing stays even, and the new date's text is ready to type.
 */
export function addTimelineEvent(ctx: EditorController) {
  if (ctx.readOnly || !hasTimeline(ctx)) return;
  const order = timelineOrder(ctx.nodes);
  const sel = ctx.selectedNodes.length === 1 ? ctx.selectedNodes[0] : undefined;
  const linkedDate = sel && !isTimelineDate(sel) ? ctx.edges.map((e) => (e.source === sel.id ? e.target : e.target === sel.id ? e.source : null)).find((id) => order.some((d) => d.id === id)) : undefined;
  const afterId = sel && isTimelineDate(sel) ? sel.id : (linkedDate ?? order[order.length - 1].id);
  const index = order.findIndex((d) => d.id === afterId);
  const after = order[index];
  const before = order[index + 1];
  const d = shapeDefaults('timelineDate');
  // Placed between its neighbours so the left-to-right order puts it there ("New date" is not a date yet).
  const x = before ? (after.position.x + before.position.x) / 2 : after.position.x + (after.width ?? d.width) + 40;
  // Same group or container and layer as the date it follows, so positions are in the same frame.
  const placement = { ...(after.parentId ? { parentId: after.parentId } : {}), ...(after.layer ? { layer: after.layer } : {}) };
  const { width: dw, height: dh, ...dateStyle } = d;
  const look = after.data;
  const date: ShapeNode = {
    id: newId('n'),
    type: 'shape',
    position: { x, y: after.position.y },
    width: after.width ?? dw,
    height: after.height ?? dh,
    selected: true,
    data: { ...dateStyle, fill: look.fill, stroke: look.stroke, textColor: look.textColor, fontSize: look.fontSize, bold: look.bold, label: 'New date' },
    ...placement,
  };
  // The event looks like the events of the date it follows, if it has one.
  const sample = ctx.edges
    .map((e) => (e.source === after.id ? e.target : e.target === after.id ? e.source : null))
    .map((id) => ctx.nodes.find((n) => n.id === id))
    .find((n): n is ShapeNode => !!n && !isTimelineDate(n));
  const { width: ew, height: _eh, ...evStyle } = shapeDefaults('rounded');
  const eventNode: ShapeNode = {
    id: newId('n'),
    type: 'shape',
    position: { x, y: after.position.y - 120 },
    width: sample?.width ?? ew,
    height: sample?.height ?? 60,
    data: { ...(sample ? inheritedData(sample.data) : evStyle), label: 'New event' },
    ...placement,
  };
  const link = styledEdge({ id: newId('e'), source: date.id, target: eventNode.id, sourceHandle: 't', targetHandle: 'b', type: 'straight', data: { ...DEFAULT_CONNECTOR, arrow: 'none', dashed: true, width: 1.5 } });
  // The axis segment between `after` and `before` is replaced by two through the new date (layoutTimeline rejoins).
  const nodes = [...ctx.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), date, eventNode];
  const edges = [...ctx.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), link];
  let laidEdges: Connector[] = edges;
  let removed: Connector[] = [];
  const laidNodes = inCanvasFrame(nodes, (canvas) => {
    const laid = layoutTimeline(canvas, edges, axisEdge);
    laidEdges = laid.edges;
    removed = laid.removed;
    return laid.nodes;
  });
  ctx.snapshot();
  ctx.setNodes(keepLocked(ctx, nodes, laidNodes));
  ctx.setEdges(laidEdges);
  // The one axis piece between `after` and `before` is replaced as expected; only other removals are worth a note.
  const replaced = (e: Connector) => before && ((e.source === after.id && e.target === before.id) || (e.source === before.id && e.target === after.id));
  noteRemovedAxis(ctx, removed.filter((e) => !replaced(e)).length);
  ctx.editLabel(date.id);
}

/** Entries for the toolbar's Arrange menu (after the tree layouts). */
export function arrangeMenuItems(ctx: EditorController): MenuItem[] {
  return [
    { label: 'Mind map: radial', onSelect: () => arrangeMindmap(ctx, 'radial') },
    { label: 'Mind map: two sides', onSelect: () => arrangeMindmap(ctx, 'two-sided') },
    { label: 'Timeline: even spacing', disabled: !hasTimeline(ctx), onSelect: () => arrangeTimeline(ctx) },
  ];
}

/** Toolbar group shown while the diagram has a timeline. */
export const TIMELINE_TOOLBAR_GROUP: ToolbarGroup = {
  id: 'timeline',
  visible: hasTimeline,
  render: (ctx) => (
    <Button size="sm" variant="ghost" icon={<CalendarPlus size={15} />} disabled={ctx.readOnly} onClick={() => addTimelineEvent(ctx)} title="Add a date and an event to the timeline, keeping the spacing even">
      Add event
    </Button>
  ),
};
