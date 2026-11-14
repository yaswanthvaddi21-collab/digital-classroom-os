/**
 * Timeline layout: the dates (`timelineDate` shapes) sit on one horizontal axis, evenly spaced, in date order; each
 * date's events (the shapes connected to it) alternate above and below. Pure functions on canvas positions.
 */

interface TlNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: { shape: string; label: string };
}

interface TlEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export const TIMELINE_DATE = 'timelineDate';
/** Distance between a date and its first event. */
export const EVENT_OFFSET = 46;
/** Smallest space between two dates' centres, and the gap kept between neighbouring events. */
export const MIN_SPACING = 180;
export const EVENT_GAP = 32;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A sortable number for a date label, or null when the label holds no date: "1947", "300 BC", "2023-08-23",
 * "23/08/2023" (day first), "Aug 2023", "August 23, 2023", "1990s".
 */
export function parseDateKey(label: string): number | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  const key = (y: number, m = 0, d = 0) => y * 10000 + m * 100 + d;
  let m = /^(\d{1,4})\s*(bc|bce)\b/.exec(s);
  if (m) return key(-Number(m[1]));
  m = /\b(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\b/.exec(s);
  if (m) return key(Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(s);
  if (m) return key(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{3,4})\b/.exec(s);
  if (m && MONTHS.includes(m[2])) return key(Number(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1]));
  m = /\b([a-z]{3})[a-z]*\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{3,4})\b/.exec(s);
  if (m && MONTHS.includes(m[1])) return key(Number(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2] ?? 0));
  m = /\b(\d{3,4})s?\b/.exec(s);
  if (m) return key(Number(m[1]));
  return null;
}

const size = (n: TlNode) => ({ w: n.width ?? 160, h: n.height ?? 70 });
const centre = (n: TlNode) => ({ x: n.position.x + size(n).w / 2, y: n.position.y + size(n).h / 2 });

export const isTimelineDate = (n: { data: { shape: string } }) => n.data.shape === TIMELINE_DATE;

/** The dates in timeline order: by date when every label holds one, otherwise left to right as they are drawn. */
export function timelineOrder<N extends TlNode>(nodes: N[]): N[] {
  const dates = nodes.filter(isTimelineDate);
  const byX = (a: N, b: N) => centre(a).x - centre(b).x;
  const keys = new Map(dates.map((d) => [d.id, parseDateKey(d.data.label)]));
  if (dates.every((d) => keys.get(d.id) !== null)) return [...dates].sort((a, b) => keys.get(a.id)! - keys.get(b.id)! || byX(a, b));
  return [...dates].sort(byX);
}

export interface TimelineLayout<N, E> {
  nodes: N[];
  edges: E[];
  /** Plain lines between dates that are no longer neighbours, removed as old axis pieces (the caller says so). */
  removed: E[];
}

/**
 * A connector the timeline layout made (or could have made) for its axis: unlabelled, straight, without ends or bends.
 * Only these are removed when the dates they join are no longer neighbours.
 */
export function isAxisSegment(edge: TlEdge): boolean {
  const e = edge as TlEdge & { label?: unknown; type?: string; data?: { arrow?: string; startMarker?: string; endMarker?: string; waypoints?: unknown[] } };
  const d = e.data ?? {};
  const noEnd = (m: string | undefined) => m === undefined || m === 'none';
  if (e.label || d.waypoints?.length) return false;
  if (e.type === undefined && e.data === undefined) return true; // a bare joint (the layout's own form)
  return e.type === 'straight' && d.arrow === 'none' && noEnd(d.startMarker) && noEnd(d.endMarker);
}

/**
 * Lays the timeline out. The first date keeps its place; the others follow at an even spacing wide enough for the
 * widest event. Connectors between consecutive dates form the axis (missing ones are made with `axisEdge`, ones that
 * no longer join neighbours are removed); connectors to events attach on the sides facing each other. Shapes that
 * are not dates or connected to one are not moved. Returns new arrays; inputs are not changed.
 */
export function layoutTimeline<N extends TlNode, E extends TlEdge>(nodes: N[], edges: E[], axisEdge: (source: N, target: N) => E): TimelineLayout<N, E> {
  const dates = timelineOrder(nodes);
  if (!dates.length) return { nodes, edges, removed: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dateIds = new Set(dates.map((d) => d.id));

  // Events: the non-date shapes connected to a date (each placed with the first date that has it).
  const eventsOf = new Map<string, N[]>(dates.map((d) => [d.id, []]));
  const claimed = new Set<string>();
  for (const d of dates)
    for (const e of edges) {
      const other = e.source === d.id ? e.target : e.target === d.id ? e.source : null;
      if (!other || dateIds.has(other) || claimed.has(other) || !byId.has(other)) continue;
      claimed.add(other);
      eventsOf.get(d.id)!.push(byId.get(other)!);
    }

  const widest = Math.max(...dates.map((d) => size(d).w), ...[...claimed].map((id) => size(byId.get(id)!).w));
  const spacing = Math.max(MIN_SPACING, widest + EVENT_GAP);
  const first = centre(dates[0]);
  const placed = new Map<string, { x: number; y: number }>();
  const below = new Map<string, boolean>();
  dates.forEach((d, i) => {
    const c = { x: first.x + i * spacing, y: first.y };
    placed.set(d.id, c);
    const half = size(d).h / 2;
    const down = i % 2 === 1;
    let edge = down ? c.y + half + EVENT_OFFSET : c.y - half - EVENT_OFFSET;
    for (const ev of eventsOf.get(d.id)!) {
      const h = size(ev).h;
      placed.set(ev.id, { x: c.x, y: down ? edge + h / 2 : edge - h / 2 });
      below.set(ev.id, down);
      edge = down ? edge + h + 16 : edge - h - 16;
    }
  });

  const outNodes = nodes.map((n) => {
    const c = placed.get(n.id);
    if (!c) return n;
    const { w, h } = size(n);
    return { ...n, position: { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) } };
  });
  const outById = new Map(outNodes.map((n) => [n.id, n]));

  // The axis: consecutive dates joined once, left to right.
  const next = new Map(dates.slice(0, -1).map((d, i) => [d.id, dates[i + 1].id]));
  const joined = new Set<string>();
  const outEdges: E[] = [];
  const removed: E[] = [];
  for (const e of edges) {
    const s = dateIds.has(e.source);
    const t = dateIds.has(e.target);
    if (s && t) {
      const forward = next.get(e.source) === e.target;
      const backward = next.get(e.target) === e.source;
      const pair = forward ? `${e.source}>${e.target}` : `${e.target}>${e.source}`;
      if ((!forward && !backward) || joined.has(pair)) {
        // An axis segment between dates that are no longer neighbours (or a second one) is replaced by the new axis;
        // any other connector between dates (a labelled "led to", an arrow, a bent line) is the user's and stays.
        if (!isAxisSegment(e)) outEdges.push(e);
        else removed.push(e);
        continue;
      }
      joined.add(pair);
      outEdges.push({ ...e, sourceHandle: forward ? 'r' : 'l', targetHandle: forward ? 'l' : 'r' });
    } else if (s !== t && (below.has(e.source) || below.has(e.target))) {
      const ev = s ? e.target : e.source;
      const down = below.get(ev)!;
      const dateSide = down ? 'b' : 't';
      const eventSide = down ? 't' : 'b';
      outEdges.push({ ...e, sourceHandle: s ? dateSide : eventSide, targetHandle: s ? eventSide : dateSide });
    } else outEdges.push(e);
  }
  for (const [a, b] of next) if (!joined.has(`${a}>${b}`)) outEdges.push({ ...axisEdge(outById.get(a)!, outById.get(b)!), sourceHandle: 'r', targetHandle: 'l' });
  return { nodes: outNodes, edges: outEdges, removed };
}
