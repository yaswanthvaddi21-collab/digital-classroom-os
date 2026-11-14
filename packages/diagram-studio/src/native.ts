import { DrawioImportError, fromDrawio } from './drawio';
import { isSafeLink, MAX_PROPERTIES, MAX_WAYPOINTS, readLayers, type DiagramLayer } from './model';
import { HANDLE_IDS, shapeDef } from './shapeRegistry';
import { readFontFamily, readImage, readOpacity, readTextAlign, readVerticalAlign } from './shapeStyleFields';

const PRESENTATION_FIELDS: ReadonlyArray<readonly [string, (v: unknown) => unknown, string]> = [
  ['opacity', readOpacity, 'opacity'],
  ['fontFamily', readFontFamily, 'font family'],
  ['textAlign', readTextAlign, 'text alignment'],
  ['verticalAlign', readVerticalAlign, 'vertical text alignment'],
  ['image', readImage, 'picture (it must be an embedded PNG, JPEG, GIF, WebP, BMP or SVG picture)'],
];
import { deserializeDiagram, DIAGRAM_SCHEMA, EDGE_LINE_TYPES, MARKER_KINDS, serializeDiagram, type DiagramContent } from './types';

/*
 * The app's own diagram file (.dcosdiagram): the stored diagram content, unchanged, in a small JSON envelope.
 * Opening one always creates a new diagram; it is never merged into an existing one.
 */

export const NATIVE_FORMAT = 'dcos-diagram';
/** Newest envelope version this build reads and writes. */
export const NATIVE_VERSION = 1;
export const NATIVE_EXTENSION = '.dcosdiagram';
export const NATIVE_MIME = 'application/vnd.dcos.diagram+json';
/** Files larger than this are refused before parsing. */
export const NATIVE_MAX_BYTES = 64 * 1024 * 1024;

export interface NativeDiagramFile {
  format: typeof NATIVE_FORMAT;
  version: number;
  /** Version of the app that wrote the file. */
  app: string;
  title?: string;
  diagram: DiagramContent;
}

/** A file that cannot be opened; the message says why, in words a user can act on. */
export class NativeDiagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeDiagramError';
  }
}

declare const __APP_VERSION__: string | undefined;
const appVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development');

/** The file's text for a diagram. The content is written as stored (`DiagramContent`), with its own schema number. */
export function toNativeFile(diagram: DiagramContent, title: string): string {
  const file: NativeDiagramFile = { format: NATIVE_FORMAT, version: NATIVE_VERSION, app: appVersion(), title, diagram };
  return JSON.stringify(file, null, 2);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const NEWER = 'It was made by a newer version of Classroom OS. Update the app on this device to open it.';

const NODE_FIELDS = new Set(['id', 'position', 'width', 'height', 'data', 'zIndex', 'parentId', 'locked', 'hidden', 'layer']);
const EDGE_FIELDS = new Set(['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'type', 'label', 'data']);
const CONTENT_FIELDS = new Set(['schemaVersion', 'nodes', 'edges', 'viewport', 'settings', 'layers']);
// New settings fields are added here with their check below (deserialize keeps unknown settings fields, so a field
// left out of this list would be imported silently).
const SETTINGS_FIELDS = new Set(['snapToGrid', 'showGrid', 'autoLayout', 'connector']);
const VIEWPORT_FIELDS = new Set(['x', 'y', 'zoom']);
const HANDLES = new Set<string>(HANDLE_IDS);
const ARROWS = new Set(['end', 'both', 'none']);
const LAYOUTS = new Set(['none', 'TB', 'LR']);
const MARKERS = new Set<string>(MARKER_KINDS);

const point = (v: unknown) => isObj(v) && finite(v.x) && finite(v.y);
const fraction = (v: unknown) => finite(v) && v >= 0 && v <= 1;
const port = (v: unknown) => v === 'perimeter' || (point(v) && fraction((v as Obj).x) && fraction((v as Obj).y));

/**
 * Checks every part of a diagram strictly. Returns the first problem as a sentence, or null when the diagram is valid.
 * Unknown fields inside `data` are allowed (they are kept); anywhere else they are a problem. Anything the stored form
 * would drop or shorten (too many bend points or properties, an empty property name) is a problem too, so a file
 * that opens is kept whole.
 */
export function validateDiagram(d: unknown): string | null {
  if (!isObj(d)) return 'The file has no diagram in it.';
  if (!Number.isInteger(d.schemaVersion) || (d.schemaVersion as number) < 1) return 'The diagram has no valid schema version.';
  if ((d.schemaVersion as number) > DIAGRAM_SCHEMA) return `The diagram uses a newer format (schema ${String(d.schemaVersion)}). ${NEWER}`;
  const extra = Object.keys(d).find((k) => !CONTENT_FIELDS.has(k));
  if (extra) return `The diagram has a field this version does not know (“${extra}”). ${NEWER}`;
  if (!Array.isArray(d.nodes)) return 'The diagram has no list of shapes.';
  if (!Array.isArray(d.edges)) return 'The diagram has no list of connectors.';

  let layerIds = new Set<string>();
  if (d.layers !== undefined) {
    if (!Array.isArray(d.layers)) return 'The diagram’s layers are not a list.';
    const layers = readLayers(d.layers) ?? [];
    if (layers.length !== d.layers.length || !d.layers.every((l, i) => isObj(l) && typeof l.name === 'string' && typeof l.visible === 'boolean' && typeof l.locked === 'boolean' && sameLayer(l, layers[i])))
      return 'One of the diagram’s layers is damaged (each needs a unique id, a name, and visible and locked flags).';
    layerIds = new Set(layers.map((l) => l.id));
  }

  const ids = new Set<string>();
  for (const [i, n] of d.nodes.entries()) {
    const where = `Shape ${i + 1}`;
    if (!isObj(n)) return `${where} is damaged.`;
    if (typeof n.id !== 'string' || !n.id) return `${where} has no id.`;
    if (ids.has(n.id)) return `Two shapes have the same id (“${n.id}”).`;
    ids.add(n.id);
    const extraField = Object.keys(n).find((k) => !NODE_FIELDS.has(k));
    if (extraField) return `${where} has a field this version does not know (“${extraField}”). ${NEWER}`;
    if (!point(n.position)) return `${where} has no valid position.`;
    if (!finite(n.width) || n.width <= 0 || !finite(n.height) || n.height <= 0) return `${where} has no valid size.`;
    if (n.zIndex !== undefined && !finite(n.zIndex)) return `${where} has an invalid stacking order.`;
    if (n.locked !== undefined && n.locked !== true) return `${where} has an invalid lock setting.`;
    if (n.hidden !== undefined && n.hidden !== true) return `${where} has an invalid hidden setting.`;
    if (n.layer !== undefined && (typeof n.layer !== 'string' || !layerIds.has(n.layer))) return `${where} is on a layer the diagram does not have.`;
    const data = n.data;
    if (!isObj(data)) return `${where} has no shape data.`;
    if (typeof data.shape !== 'string') return `${where} has no shape type.`;
    if (!shapeDef(data.shape)) return `${where} is a kind of shape this version does not know (“${data.shape}”). ${NEWER}`;
    if (typeof data.label !== 'string') return `${where} has no text field.`;
    for (const k of ['fill', 'stroke', 'textColor'] as const) if (typeof data[k] !== 'string') return `${where} has an invalid colour (${k}).`;
    for (const k of ['strokeWidth', 'fontSize'] as const) if (!finite(data[k]) || (data[k] as number) < 0) return `${where} has an invalid ${k === 'fontSize' ? 'font size' : 'border width'}.`;
    for (const k of ['dashed', 'bold'] as const) if (typeof data[k] !== 'boolean') return `${where} has an invalid ${k} setting.`;
    if (data.rotation !== undefined && !finite(data.rotation)) return `${where} has an invalid rotation.`;
    if (data.link !== undefined && (typeof data.link !== 'string' || !isSafeLink(data.link))) return `${where} has a link that is not a web or mail address.`;
    if (data.tooltip !== undefined && typeof data.tooltip !== 'string') return `${where} has an invalid tooltip.`;
    if (data.properties !== undefined) {
      if (!isObj(data.properties) || !Object.entries(data.properties).every(([k, v]) => k !== '' && typeof v === 'string')) return `${where} has invalid properties (each needs a name, and its value must be text).`;
      if (Object.keys(data.properties).length > MAX_PROPERTIES) return `${where} has more than ${MAX_PROPERTIES} properties.`;
    }
    // @phase5:drawio-fields — G-DRAWIO's presentation fields (shapeStyleFields.ts): an invalid value would be dropped on load.
    for (const [field, valid, what] of PRESENTATION_FIELDS) if (data[field] !== undefined && valid(data[field]) === undefined) return `${where} has an invalid ${what}.`;
  }
  for (const [i, n] of (d.nodes as Obj[]).entries()) {
    if (n.parentId === undefined) continue;
    if (typeof n.parentId !== 'string' || n.parentId === n.id || !ids.has(n.parentId)) return `Shape ${i + 1} is inside a group the diagram does not have.`;
  }
  if (groupLoop(d.nodes as Array<{ id: string; parentId?: string }>)) return 'Some shapes are inside each other in a loop.';

  const edgeIds = new Set<string>();
  for (const [i, e] of d.edges.entries()) {
    const where = `Connector ${i + 1}`;
    if (!isObj(e)) return `${where} is damaged.`;
    if (typeof e.id !== 'string' || !e.id) return `${where} has no id.`;
    if (edgeIds.has(e.id)) return `Two connectors have the same id (“${e.id}”).`;
    edgeIds.add(e.id);
    const extraField = Object.keys(e).find((k) => !EDGE_FIELDS.has(k));
    if (extraField) return `${where} has a field this version does not know (“${extraField}”). ${NEWER}`;
    if (typeof e.source !== 'string' || !ids.has(e.source) || typeof e.target !== 'string' || !ids.has(e.target)) return `${where} is not attached to shapes in the diagram.`;
    for (const h of [e.sourceHandle, e.targetHandle]) if (h !== null && (typeof h !== 'string' || !HANDLES.has(h))) return `${where} has a connection point this version does not know (“${String(h)}”). ${NEWER}`;
    if (typeof e.type !== 'string' || !(EDGE_LINE_TYPES as string[]).includes(e.type)) return `${where} has a line style this version does not know (“${String(e.type)}”). ${NEWER}`;
    if (typeof e.label !== 'string') return `${where} has no label field.`;
    const data = e.data;
    if (!isObj(data)) return `${where} has no style data.`;
    if (typeof data.color !== 'string') return `${where} has an invalid colour.`;
    if (!finite(data.width) || data.width <= 0) return `${where} has an invalid line width.`;
    if (typeof data.dashed !== 'boolean') return `${where} has an invalid dashed setting.`;
    if (typeof data.arrow !== 'string' || !ARROWS.has(data.arrow)) return `${where} has an invalid arrow setting.`;
    for (const m of [data.startMarker, data.endMarker]) if (m !== undefined && (typeof m !== 'string' || !MARKERS.has(m))) return `${where} has an end this version does not know (“${String(m)}”). ${NEWER}`;
    if (data.waypoints !== undefined && (!Array.isArray(data.waypoints) || !data.waypoints.every(point))) return `${where} has invalid bend points.`;
    if (Array.isArray(data.waypoints) && data.waypoints.length > MAX_WAYPOINTS) return `${where} has more than ${MAX_WAYPOINTS} bend points.`;
    if (data.labelPosition !== undefined && !fraction(data.labelPosition)) return `${where} has an invalid label position.`;
    for (const p of [data.sourcePort, data.targetPort]) if (p !== undefined && !port(p)) return `${where} has an invalid attachment point.`;
  }

  if (d.viewport !== null && d.viewport !== undefined && !(isObj(d.viewport) && finite(d.viewport.x) && finite(d.viewport.y) && finite(d.viewport.zoom) && d.viewport.zoom > 0))
    return 'The diagram’s saved view is damaged.';
  const viewExtra = isObj(d.viewport) ? Object.keys(d.viewport).find((k) => !VIEWPORT_FIELDS.has(k)) : undefined;
  if (viewExtra) return `The diagram’s saved view has a field this version does not know (“${viewExtra}”). ${NEWER}`;
  const s = d.settings;
  if (!isObj(s)) return 'The diagram has no settings.';
  const settingsExtra = Object.keys(s).find((k) => !SETTINGS_FIELDS.has(k));
  if (settingsExtra) return `The diagram has a setting this version does not know (“${settingsExtra}”). ${NEWER}`;
  if (typeof s.snapToGrid !== 'boolean' || typeof s.showGrid !== 'boolean') return 'The diagram’s grid settings are damaged.';
  if (typeof s.autoLayout !== 'string' || !LAYOUTS.has(s.autoLayout)) return 'The diagram’s auto-arrange setting is damaged.';
  if (s.connector !== undefined && (typeof s.connector !== 'string' || !(EDGE_LINE_TYPES as string[]).includes(s.connector))) return 'The diagram’s line style setting is damaged.';
  return null;
}

const sameLayer = (raw: Obj, l: DiagramLayer | undefined) => !!l && raw.id === l.id && raw.name === l.name && raw.visible === l.visible && raw.locked === l.locked;

function groupLoop(nodes: Array<{ id: string; parentId?: string }>): boolean {
  const parent = new Map(nodes.filter((n) => n.parentId).map((n) => [n.id, n.parentId!]));
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    for (let p = parent.get(n.id); p !== undefined; p = parent.get(p)) {
      if (seen.has(p)) return true;
      seen.add(p);
    }
  }
  return false;
}

/**
 * Reads a .dcosdiagram file strictly: anything damaged, unknown or from a newer version is refused with the reason.
 * The diagram is returned in its stored form (as this version would save it), ready to become a new diagram.
 */
export function parseNativeFile(text: string): { content: DiagramContent; title: string | null } {
  if (text.length > NATIVE_MAX_BYTES) throw new NativeDiagramError('The file is too large to open (the limit is 64 MB).');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new NativeDiagramError('This is not a Classroom OS diagram file: it is not valid JSON.');
  }
  if (!isObj(raw) || raw.format !== NATIVE_FORMAT) throw new NativeDiagramError('This is not a Classroom OS diagram file.');
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) throw new NativeDiagramError('The file has no valid format version.');
  if ((raw.version as number) > NATIVE_VERSION) throw new NativeDiagramError(`The file uses a newer file format (version ${String(raw.version)}). ${NEWER}`);
  if (raw.app !== undefined && typeof raw.app !== 'string') throw new NativeDiagramError('The file’s app version is damaged.');
  if (raw.title !== undefined && typeof raw.title !== 'string') throw new NativeDiagramError('The file’s title is damaged.');
  const problem = validateDiagram(raw.diagram);
  if (problem) throw new NativeDiagramError(problem);
  const s = deserializeDiagram(raw.diagram);
  // Stored as this version saves it (serializeDiagram decides the schema number from what the diagram uses).
  const content = serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
  return { content, title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : null };
}

/** What opening a diagram file produced. */
export interface DiagramFileImport {
  kind: 'native' | 'drawio';
  content: DiagramContent;
  /** From the file, or null when it names none (use the file name). */
  title: string | null;
  /** Approximations (diagrams.net files only). */
  notes: string[];
  nodes: number;
  edges: number;
}

/** Opens a .dcosdiagram or diagrams.net file, telling them apart by their contents. Throws with a readable reason. */
export function readDiagramFile(text: string): DiagramFileImport {
  if (text.trimStart().startsWith('{')) {
    const { content, title } = parseNativeFile(text);
    return { kind: 'native', content, title, notes: [], nodes: content.nodes.length, edges: content.edges.length };
  }
  try {
    const { content, report } = fromDrawio(text);
    return { kind: 'drawio', content, title: report.title === 'Imported diagram' ? null : report.title, notes: report.notes, nodes: report.nodes, edges: report.edges };
  } catch (err) {
    if (err instanceof DrawioImportError) throw new NativeDiagramError(err.message);
    throw err;
  }
}
