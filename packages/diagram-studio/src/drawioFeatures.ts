import { HANDLE_IDS, shapeDef } from './shapeRegistry';
import { MAX_PROPERTIES, MAX_WAYPOINTS, readLink, readPort, readRotation, type EdgePort, type Point } from './model';
import { readFontFamily, readImage, readOpacity } from './shapeStyleFields';
import type { DrawioCell, DrawioImportContext, DrawioStyle } from './drawioRegistry';
import type { ShapeKind, SerializedEdge, SerializedNode } from './types';

/*
 * diagrams.net mappings for the Phase 5 model (G-DRAWIO): links, tooltips and custom properties (UserObject), rotation,
 * opacity, fonts, text alignment, locks, pictures, connection points, label positions and bend points, plus the
 * counted notes an import reports. drawio.ts walks the file and the cell tree (groups, layers, hidden cells); the
 * per-cell readers and style writers here are registered in drawioRegistry.ts.
 *
 * Every value written for our own export also carries enough to come back exactly (`dcos…` style keys, which
 * diagrams.net keeps); files drawn in diagrams.net are mapped from its standard keys, and whatever cannot be kept is
 * counted into a note (DS-R1: never silent).
 */

// ── Counted notes ─────────────────────────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const was = (n: number) => (n === 1 ? 'was' : 'were');
const quoteList = (names: string[], max = 5) => {
  const shown = names.slice(0, max).map((s) => `“${s}”`);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
};

/** Named shapes in quotes, then how many have no text, as one list: “A”, “B” and 1 without text. */
const namedList = (names: string[], unnamed: number, max = 5) => {
  const items = names.slice(0, max).map((s) => `“${s}”`);
  if (names.length > max) items.push(`${names.length - max} more`);
  if (unnamed > 0) items.push(`${unnamed} without text`);
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? '');
};

/** A shape's text as it is named in a note: the first line, shortened. Empty when the shape has no text. */
export function nameOf(label: string): string {
  const first = label.split('\n').find((l) => l.trim())?.trim() ?? '';
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}

/**
 * Everything an import can approximate, with its sentence. Counts and names are collected while the file is read
 * (`tally`) and turned into notes once at the end, in this order, so a file with many such cells gets one sentence
 * per kind of change, with the right number and plural.
 */
export const IMPORT_NOTES: Record<string, (n: number, names: string[]) => string> = {
  hiddenShapes: (n, names) =>
    `${plural(n, 'shape hidden in the file was', 'shapes hidden in the file were')} imported hidden${names.length ? `: ${namedList(names, n - names.length)}` : ''}. “Show hidden shapes” in the Layers panel shows ${n === 1 ? 'it' : 'them'}.`,
  hiddenLayers: (_, names) =>
    names.length === 1
      ? `The layer “${names[0]}” is hidden in the file, so it was imported as a hidden layer.`
      : `The layers ${quoteList(names, 10)} are hidden in the file, so they were imported as hidden layers.`,
  hiddenRows: (n) => `${plural(n, 'hidden row', 'hidden rows')} of class or entity boxes ${was(n)} imported as visible text.`,
  hiddenEdges: (n, names) => `${plural(n, 'connector hidden in the file was', 'connectors hidden in the file were')} imported visible, because connectors cannot be hidden here${names.length ? ` (${quoteList(names)})` : ''}.`,
  edgesOnHiddenLayers: (n) => `${plural(n, 'connector on a hidden layer is', 'connectors on hidden layers are')} shown, because connectors have no layer here.`,
  collapsed: (n) => `${plural(n, 'collapsed container was', 'collapsed containers were')} imported expanded.`,
  gradient: (n) => `${plural(n, 'shape with a gradient fill was', 'shapes with gradient fills were')} imported with a solid fill.`,
  shadow: (n) => `Shadows on ${plural(n, 'shape were', 'shapes were')} left out.`,
  sketch: (n) => `${plural(n, 'shape drawn in sketch style was', 'shapes drawn in sketch style were')} imported with plain outlines.`,
  glass: (n) => `The glass effect on ${plural(n, 'shape was', 'shapes was')} left out.`,
  partialOpacity: (n) => `Separate fill, outline or text transparency on ${plural(n, 'shape was', 'shapes was')} left out.`,
  fontStyle: (n) => `Italic, underlined or struck-through text on ${plural(n, 'shape was', 'shapes was')} imported as plain text.`,
  richText: (n) => `Formatting inside the text of ${plural(n, 'shape or connector', 'shapes or connectors')} (such as bold words, colours, sizes or lists) was removed; the text was kept.`,
  labelImages: (n) => `${plural(n, 'picture inside text was', 'pictures inside text were')} left out.`,
  labelOutside: (n) => `The text of ${plural(n, 'shape', 'shapes')}, placed outside the shape in the file, was moved inside it.`,
  verticalText: (n) => `Vertical text on ${plural(n, 'shape was', 'shapes was')} written horizontally.`,
  webImages: (n) => `${plural(n, 'picture linked from the web was', 'pictures linked from the web were')} imported as an empty frame: the app works offline and does not download pictures.`,
  badImages: (n) => `${plural(n, 'picture', 'pictures')} could not be kept (too large, or not a PNG, JPEG, GIF, WebP, BMP or SVG picture) and ${n === 1 ? 'was' : 'were'} imported as an empty frame.`,
  shapeIcons: (n) => `Icons on ${plural(n, 'shape were', 'shapes were')} left out.`,
  unsafeLinks: (n) => `${plural(n, 'link that was not a web or mail address was', 'links that were not web or mail addresses were')} left out.`,
  pageLinks: (n) => `${plural(n, 'link leads', 'links lead')} to another page of the file, which was not imported.`,
  edgeData: (n) => `Links, tooltips or custom properties on ${plural(n, 'connector were', 'connectors were')} left out: connectors cannot hold them here.`,
  placeholders: (n) => `The text of ${plural(n, 'shape', 'shapes')} showed property values; it was imported with the values filled in.`,
  tooManyProperties: (n) => `Only the first ${MAX_PROPERTIES} custom properties of ${plural(n, 'shape were', 'shapes were')} kept.`,
  swimlanes: (n) => `${plural(n, 'swimlane was', 'swimlanes were')} imported as an outline that holds its shapes: the title band and the lane colour are not drawn.`,
  swimlaneTitles: (n) => `${plural(n, 'swimlane has', 'swimlanes have')} ${n === 1 ? 'its title' : 'their titles'} in a band on the left here; in the file the title is at the top.`,
  labelOffsets: (n) => `The labels of ${plural(n, 'connector were', 'connectors were')} moved onto the line (their offset from the line was left out).`,
  multipleLabels: (n) => `${plural(n, 'connector had', 'connectors had')} several labels; they were joined into one label each.`,
  pointOffsets: (n) => `Connection-point offsets on ${plural(n, 'connector were', 'connectors were')} left out.`,
  lockedEdges: (n) => `${plural(n, 'locked connector was', 'locked connectors were')} imported unlocked: connectors cannot be locked here.`,
  edgeOpacity: (n) => `Transparency on ${plural(n, 'connector was', 'connectors was')} left out.`,
  tooManyPoints: (n) => `Only the first ${MAX_WAYPOINTS} bend points of ${plural(n, 'connector were', 'connectors were')} kept.`,
  relativeChildren: (n) =>
    `${plural(n, 'shape attached to the edge of another shape was', 'shapes attached to the edges of other shapes were')} placed where the file draws ${n === 1 ? 'it' : 'them'}; ${n === 1 ? 'it moves' : 'they move'} with that shape but ${n === 1 ? 'does' : 'do'} not stay on its edge when it is resized.`,
  stretchedImages: (n) => `${plural(n, 'picture stretched to fill its frame in the file is', 'pictures stretched to fill their frames in the file are')} drawn keeping ${n === 1 ? 'its' : 'their'} proportions.`,
  edgeToEdge: (n) => `${plural(n, 'connector that ends on another connector was', 'connectors that end on other connectors were')} left out.`,
};

/** Adds one to the count of `key` (an IMPORT_NOTES key), optionally remembering a name to quote. */
export function tally(ctx: DrawioImportContext, key: keyof typeof IMPORT_NOTES, name?: string) {
  ctx.tallies ??= new Map();
  const t = ctx.tallies.get(key) ?? { n: 0, names: [] };
  t.n++;
  if (name) t.names.push(name);
  ctx.tallies.set(key, t);
}

/** The counted notes of an import, in IMPORT_NOTES order. */
export function tallyNotes(ctx: DrawioImportContext): string[] {
  const out: string[] = [];
  for (const [key, note] of Object.entries(IMPORT_NOTES)) {
    const t = ctx.tallies?.get(key);
    if (t && t.n > 0) out.push(note(t.n, t.names));
  }
  return out;
}

// ── Swimlanes ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * MAPPING HOOK for swimlanes (G-SHAPES / integrator). diagrams.net swimlanes that hold shapes import as the BPMN pool
 * and lane container kinds named here, once SHAPE_DEFS registers them (G-SHAPES: `bpmnPool`, `bpmnLane`); a kind that
 * is not registered is ignored, so the hook never produces a shape this build cannot draw, and the swimlane imports as
 * a transparent outline container with a note instead. On export those kinds write their own `drawioStyle` (a
 * `swimlane;` style) and their shapes are written inside them. Set a role to null to force the outline.
 */
export const DRAWIO_SWIMLANE_KINDS: { pool: string | null; lane: string | null } = {
  pool: 'bpmnPool',
  lane: 'bpmnLane',
};

/** The registered kind for a swimlane in `role`, or null for the outline fallback. */
export function swimlaneKind(role: 'pool' | 'lane'): ShapeKind | null {
  const kind = DRAWIO_SWIMLANE_KINDS[role];
  return kind && shapeDef(kind) ? (kind as ShapeKind) : null;
}

// ── Links, tooltips and custom properties (UserObject) ────────────────────────────────────────────────

/** Attributes of `<UserObject>` / `<object>` that are not custom properties. */
export const RESERVED_ATTRIBUTES = new Set(['id', 'label', 'link', 'tooltip', 'placeholders']);

/** A name diagrams.net can store as a property: an XML attribute name without a namespace prefix. */
export const isPropertyName = (k: string) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) && !RESERVED_ATTRIBUTES.has(k) && !/^xml/i.test(k);

export interface UserObjectData {
  link?: string;
  unsafeLink: boolean;
  tooltip?: string;
  properties?: Record<string, string>;
  tooMany: boolean;
  placeholders: boolean;
}

/** Reads the link, tooltip and custom properties of a cell's `<UserObject>` / `<object>` wrapper. */
export function readUserObject(wrapper: Element | null): UserObjectData {
  const out: UserObjectData = { unsafeLink: false, tooMany: false, placeholders: false };
  if (!wrapper) return out;
  const props: Array<[string, string]> = [];
  for (const attr of Array.from(wrapper.attributes)) {
    const { name, value } = attr;
    if (name === 'link') {
      if (value === '') continue;
      out.link = readLink(value);
      if (!out.link) out.unsafeLink = true;
    } else if (name === 'tooltip') {
      if (value !== '') out.tooltip = value;
    } else if (name === 'placeholders') {
      out.placeholders = value === '1';
    } else if (!RESERVED_ATTRIBUTES.has(name)) {
      props.push([name, value]);
    }
  }
  if (props.length > MAX_PROPERTIES) out.tooMany = true;
  if (props.length) out.properties = Object.fromEntries(props.slice(0, MAX_PROPERTIES));
  return out;
}

/** diagrams.net placeholders: `%name%` in a label shows the property `name`. Unknown names are left as they are. */
export function resolvePlaceholders(label: string, props: Record<string, string> | undefined, id: string): string {
  return label.replace(/%([A-Za-z_][\w.-]*)%/g, (m, k: string) => (props && Object.hasOwn(props, k) ? props[k] : k === 'id' ? id : m));
}

// ── Rich text ─────────────────────────────────────────────────────────────────────────────────────────

const PLAIN_TAG = /^<\/?(br|div|p|span)\s*\/?>$/i;

/**
 * What a label's HTML holds beyond plain text: whether the whole label is bold (kept as the shape's bold setting),
 * whether other formatting is lost (a note), and how many pictures it holds (left out, a note).
 */
export function richText(value: string | null): { wholeBold: boolean; inner: string | null; formatted: boolean; images: number } {
  if (!value || !value.includes('<')) return { wholeBold: false, inner: value, formatted: false, images: 0 };
  let inner = value.trim();
  let wholeBold = false;
  const bold = /^<(b|strong)>([\s\S]*)<\/\1>$/i.exec(inner);
  if (bold && !/<\/?(b|strong)\b/i.test(bold[2])) {
    wholeBold = true;
    inner = bold[2];
  }
  const tags = inner.match(/<[^>]*>/g) ?? [];
  const images = tags.filter((t) => /^<img\b/i.test(t)).length;
  const formatted = tags.some((t) => !PLAIN_TAG.test(t) && !/^<img\b/i.test(t));
  return { wholeBold, inner: wholeBold ? inner : value, formatted, images };
}

// ── Pictures ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * A diagrams.net `image=` style value as a data: URL. diagrams.net writes embedded pictures as `data:image/png,<base64>`
 * (a `;` would end the style entry), which is turned back into a standard `;base64` URL. Returns the kind of source
 * when it cannot be kept.
 */
export function imageFromStyle(v: string | undefined): { image?: string; problem?: 'web' | 'bad' } {
  if (!v) return { problem: 'bad' };
  const m = /^data:(image\/[A-Za-z0-9.+-]+),(.*)$/s.exec(v);
  if (!m) return { problem: /^https?:/i.test(v) || /^\/\//.test(v) ? 'web' : 'bad' };
  const payload = m[2];
  const url = /^[A-Za-z0-9+/]+=*$/.test(payload) ? `data:${m[1]};base64,${payload}` : `data:${m[1]},${payload}`;
  const image = readImage(url);
  return image ? { image } : { problem: 'bad' };
}

/** A data: URL as diagrams.net writes it in a style (`data:image/png,<base64>`): no `;`, which would end the entry. */
export function imageToStyle(url: string): string {
  const m = /^data:(image\/[A-Za-z0-9.+-]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) return '';
  return `data:${m[1]},${m[2] ? m[3] : m[3].replace(/;/g, '%3B')}`;
}

// ── Connection points, label positions, bend points ───────────────────────────────────────────────────

const SIDE_CENTRES: Record<string, [number, number]> = { t: [0.5, 0], r: [1, 0.5], b: [0.5, 1], l: [0, 0.5] };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const isHandle = (h: string | undefined): h is string => !!h && (HANDLE_IDS as readonly string[]).includes(h);
const numOr = (v: string | undefined | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** The side handle nearest to a point on a shape's box (fractions 0..1). */
export function nearestSide(x: number, y: number): string {
  const d = { t: y, b: 1 - y, l: x, r: 1 - x };
  return (Object.keys(d) as Array<keyof typeof d>).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/**
 * Where one end of a connector attaches: the side handle and, for a point that is not a side's centre, the exact point
 * (a schema-3 port). `dcosSourcePort` / `dcosSourceHandle` (our own export) win; otherwise diagrams.net's exitX/exitY
 * (or entryX/entryY). `handle: null` means the file does not say (the caller picks facing sides).
 */
export function endFromStyle(st: DrawioStyle, end: 'source' | 'target'): { handle: string | null; port?: EdgePort; offset: boolean } {
  const tagPrefix = end === 'source' ? 'dcosSource' : 'dcosTarget';
  const prefix = end === 'source' ? 'exit' : 'entry';
  const taggedHandle = st.map.get(`${tagPrefix}Handle`);
  const taggedPort = st.map.get(`${tagPrefix}Port`);
  const dx = numOr(st.map.get(`${prefix}Dx`)) ?? 0;
  const dy = numOr(st.map.get(`${prefix}Dy`)) ?? 0;
  const offset = dx !== 0 || dy !== 0;
  if (taggedPort !== undefined) {
    let port: EdgePort | undefined;
    if (taggedPort === 'perimeter') port = 'perimeter';
    else {
      const [px, py] = taggedPort.split(',').map(Number);
      port = readPort({ x: px, y: py });
    }
    return { handle: isHandle(taggedHandle) ? taggedHandle : null, port, offset };
  }
  const fx = numOr(st.map.get(`${prefix}X`));
  const fy = numOr(st.map.get(`${prefix}Y`));
  if (fx === undefined || fy === undefined) return { handle: isHandle(taggedHandle) ? taggedHandle : null, offset };
  const x = clamp01(fx);
  const y = clamp01(fy);
  const side = Object.entries(SIDE_CENTRES).find(([, [cx, cy]]) => cx === x && cy === y)?.[0];
  if (side) return { handle: isHandle(taggedHandle) ? taggedHandle : side, offset };
  return { handle: isHandle(taggedHandle) ? taggedHandle : nearestSide(x, y), port: { x, y }, offset };
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * Style keys for one end of a connector. A side handle is written as diagrams.net's exit/entry point at that side's
 * centre; a fixed port as its exact point; a perimeter port as no point (diagrams.net then attaches to the outline,
 * re-picking the side as shapes move, which is what a perimeter port means here).
 */
export function endStyle(edge: SerializedEdge, end: 'source' | 'target'): string {
  const handle = end === 'source' ? edge.sourceHandle : edge.targetHandle;
  const port = end === 'source' ? edge.data?.sourcePort : edge.data?.targetPort;
  const prefix = end === 'source' ? 'exit' : 'entry';
  const tag = end === 'source' ? 'dcosSource' : 'dcosTarget';
  const handleTag = handle ? `${tag}Handle=${handle};` : '';
  if (port === 'perimeter') return `${tag}Port=perimeter;${handleTag}`;
  if (port) return `${prefix}X=${fmt(port.x)};${prefix}Y=${fmt(port.y)};${prefix}Dx=0;${prefix}Dy=0;${tag}Port=${fmt(port.x)},${fmt(port.y)};${handleTag}`;
  const centre = handle ? SIDE_CENTRES[handle] : undefined;
  if (centre) return `${prefix}X=${centre[0]};${prefix}Y=${centre[1]};${prefix}Dx=0;${prefix}Dy=0;`;
  return handleTag;
}

/** Bend points of an edge geometry (`<Array as="points">`), in the coordinates of the edge's parent. */
export function readPoints(g: Element | null): { points: Point[]; tooMany: boolean } {
  if (!g) return { points: [], tooMany: false };
  const arr = Array.from(g.children).find((c) => c.nodeName === 'Array' && c.getAttribute('as') === 'points');
  if (!arr) return { points: [], tooMany: false };
  const all = Array.from(arr.children)
    .filter((c) => c.nodeName === 'mxPoint')
    .map((p) => ({ x: numOr(p.getAttribute('x')) ?? 0, y: numOr(p.getAttribute('y')) ?? 0 }));
  return { points: all.slice(0, MAX_WAYPOINTS), tooMany: all.length > MAX_WAYPOINTS };
}

/**
 * Where a label sits along its connector: diagrams.net stores it as the geometry's x, -1 (source) … 1 (target), with
 * y and an `offset` point moving it off the line. Returns 0..1 (undefined for the middle) and whether it was off the line.
 */
export function readLabelPlace(g: Element | null): { position?: number; offset: boolean } {
  if (!g) return { offset: false };
  const x = numOr(g.getAttribute('x')) ?? 0;
  const y = numOr(g.getAttribute('y')) ?? 0;
  const off = Array.from(g.children).find((c) => c.nodeName === 'mxPoint' && c.getAttribute('as') === 'offset');
  const offset = y !== 0 || (!!off && ((numOr(off.getAttribute('x')) ?? 0) !== 0 || (numOr(off.getAttribute('y')) ?? 0) !== 0));
  const p = Math.round(clamp01((x + 1) / 2) * 10000) / 10000;
  return { position: p === 0.5 ? undefined : p, offset };
}

/** The geometry x diagrams.net uses for a label position 0..1. */
export const labelGeometryX = (p: number) => fmt(p * 2 - 1);

// ── Vertex readers and writers (registered in drawioRegistry.ts) ──────────────────────────────────────

/** The value of `key` in a kind's own exported style, so a key we write ourselves is not reported as a difference. */
const ownStyle = (kind: string, key: string) => {
  const style = shapeDef(kind)?.drawioStyle ?? '';
  const m = new RegExp(`(?:^|;)${key}=([^;]*)`).exec(style);
  return m?.[1];
};

const COMPARTMENT = new Set(['umlClass', 'erEntity']);

/**
 * Reads the presentation of a shape: rotation, opacity, font family, alignment, lock and picture, and counts every
 * style it cannot draw. Runs after drawio.ts has read the geometry, label and colours.
 */
export function readVertexPresentation(cell: DrawioCell, node: SerializedNode, ctx: DrawioImportContext) {
  const { st } = cell;
  const m = st.map;
  const d = node.data;
  const kind = d.shape;
  const rotation = readRotation(numOr(m.get('rotation')));
  if (rotation !== undefined) d.rotation = rotation;
  const opacity = readOpacity(numOr(m.get('opacity')));
  if (opacity !== undefined) d.opacity = opacity;
  const font = readFontFamily(m.get('fontFamily'));
  if (font) d.fontFamily = font;
  // Classes, entities and swimlanes place their own titles (a swimlane's alignment is decided in drawio.ts).
  const placesOwnText = COMPARTMENT.has(kind) || st.names.has('swimlane') || m.get('shape') === 'swimlane';
  if (!placesOwnText) {
    const align = m.get('align');
    if ((align === 'left' || align === 'right') && ownStyle(kind, 'align') !== align) d.textAlign = align;
    const valign = m.get('verticalAlign');
    if ((valign === 'top' || valign === 'bottom') && ownStyle(kind, 'verticalAlign') !== valign && !d.verticalAlign) d.verticalAlign = valign;
  }
  if (m.get('locked') === '1') node.locked = true;

  const gradient = m.get('gradientColor');
  if (gradient && gradient !== 'none' && gradient !== 'default') tally(ctx, 'gradient');
  if (m.get('shadow') === '1') tally(ctx, 'shadow');
  if (m.get('sketch') === '1') tally(ctx, 'sketch');
  if (m.get('glass') === '1') tally(ctx, 'glass');
  if (['fillOpacity', 'strokeOpacity', 'textOpacity'].some((k) => m.has(k) && Number(m.get(k)) !== 100)) tally(ctx, 'partialOpacity');
  const fontStyle = numOr(m.get('fontStyle')) ?? 0;
  if (fontStyle & 14) tally(ctx, 'fontStyle');
  // Text outside the shape (beside or below it in diagrams.net) is moved inside, against the side it was on.
  const lp = m.get('labelPosition');
  const vlp = m.get('verticalLabelPosition');
  const outsideX = (lp === 'left' || lp === 'right') && ownStyle(kind, 'labelPosition') !== lp;
  const outsideY = (vlp === 'top' || vlp === 'bottom') && ownStyle(kind, 'verticalLabelPosition') !== vlp;
  if (outsideX || outsideY) {
    tally(ctx, 'labelOutside');
    if (!placesOwnText) {
      if (outsideX) d.textAlign = lp as 'left' | 'right';
      else delete d.textAlign;
      if (outsideY) d.verticalAlign = vlp as 'top' | 'bottom';
      else delete d.verticalAlign;
    }
  }
  // A swimlane's horizontal=0 is a title band on its left; drawio.ts handles swimlanes.
  if (m.get('horizontal') === '0' && !st.names.has('swimlane') && m.get('shape') !== 'swimlane') tally(ctx, 'verticalText');

  const isImage = m.get('shape') === 'image' || st.names.has('image');
  if (isImage) {
    const { image, problem } = imageFromStyle(m.get('image'));
    if (image) {
      d.image = image;
      if (m.get('imageAspect') === '0') tally(ctx, 'stretchedImages');
    }
    else tally(ctx, problem === 'web' ? 'webImages' : 'badImages');
  } else if (m.get('image') && m.get('image') !== 'none') tally(ctx, 'shapeIcons');

  const uo = readUserObject(cell.wrapper);
  if (uo.link) d.link = uo.link;
  if (uo.unsafeLink) tally(ctx, 'unsafeLinks');
  if (uo.tooltip) d.tooltip = uo.tooltip;
  if (uo.properties) d.properties = uo.properties;
  if (uo.tooMany) tally(ctx, 'tooManyProperties');
  if (uo.placeholders && /%[A-Za-z_][\w.-]*%/.test(d.label)) {
    const filled = resolvePlaceholders(d.label, uo.properties, node.id);
    if (filled !== d.label) {
      d.label = filled;
      tally(ctx, 'placeholders');
    }
  }
}

/** Reads what a connector cell has beyond its ends and style: lock, transparency, links and properties (not kept). */
export function readEdgeExtras(cell: DrawioCell, _edge: SerializedEdge, ctx: DrawioImportContext) {
  const m = cell.st.map;
  if (m.get('locked') === '1') tally(ctx, 'lockedEdges');
  if (m.has('opacity') && Number(m.get('opacity')) !== 100) tally(ctx, 'edgeOpacity');
  const uo = readUserObject(cell.wrapper);
  if (uo.link || uo.unsafeLink || uo.tooltip || uo.properties) tally(ctx, 'edgeData');
}

/** Style keys for the presentation fields of a shape (rotation, opacity, font, alignment, lock, picture). */
export function vertexPresentationStyle(node: SerializedNode): string {
  const d = node.data;
  let s = '';
  if (d.rotation) s += `rotation=${fmt(d.rotation)};`;
  if (d.opacity !== undefined) s += `opacity=${fmt(d.opacity)};`;
  if (d.fontFamily) s += `fontFamily=${d.fontFamily};`;
  if (d.textAlign) s += `align=${d.textAlign};`;
  if (d.verticalAlign) s += `verticalAlign=${d.verticalAlign};`;
  if (node.locked) s += 'locked=1;';
  if (d.shape === 'image' && d.image) {
    const v = imageToStyle(d.image);
    if (v) s += `image=${v};`;
  }
  return s;
}

/** The custom properties of a shape that diagrams.net can store, and those it cannot (their names are not allowed). */
export function splitProperties(props: Record<string, string> | undefined): { kept: Array<[string, string]>; dropped: string[] } {
  const entries = Object.entries(props ?? {});
  return { kept: entries.filter(([k]) => isPropertyName(k)), dropped: entries.filter(([k]) => !isPropertyName(k)).map(([k]) => k) };
}
