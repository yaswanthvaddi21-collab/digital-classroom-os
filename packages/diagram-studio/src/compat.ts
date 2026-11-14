/**
 * Diagram content schemas.
 *
 * - Schema 1: v0.1.0 (connectors had only `arrow`; no UML, ER, actor or package shapes).
 * - Schema 2: Release 0.2 up to Phase 4. Its vocabulary is frozen below, taken from the committed Phase 4 build
 *   (git 206e080). That build opens schema 2 for editing and anything newer read-only.
 * - Schema 3: anything outside the schema-2 vocabulary (Phase 5: groups, layers, locks, hidden shapes, rotation,
 *   links, tooltips, properties, waypoints, label positions, ports, new shape kinds, new line types …).
 *
 * `schemaFor()` decides the number from the content on every save, so it follows what a diagram uses: a diagram that
 * uses only schema-2 features is saved as 2 and the Phase 4 build still edits it. NEVER EDIT THIS VOCABULARY: a new
 * feature makes the diagrams that use it schema 3 automatically. See docs/adr/0012-diagram-format-phase5.md.
 */
export const SCHEMA2_VOCABULARY = Object.freeze({
  contentFields: ['schemaVersion', 'nodes', 'edges', 'viewport', 'settings'],
  nodeFields: ['id', 'position', 'width', 'height', 'data', 'zIndex'],
  edgeFields: ['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'type', 'label', 'data'],
  shapeKinds: ['rectangle', 'rounded', 'ellipse', 'circle', 'diamond', 'parallelogram', 'hexagon', 'triangle', 'cylinder', 'document', 'note', 'text', 'umlClass', 'erEntity', 'actor', 'package'],
  // `width` and `height` inside data were written by the Phase 4 diagrams.net importer (a copy of the default size);
  // diagrams imported then still carry them.
  shapeDataFields: ['shape', 'fill', 'stroke', 'strokeWidth', 'textColor', 'fontSize', 'dashed', 'bold', 'label', 'width', 'height'],
  connectorDataFields: ['color', 'width', 'dashed', 'arrow', 'startMarker', 'endMarker'],
  arrowModes: ['end', 'both', 'none'],
  markerKinds: ['none', 'arrow', 'open-arrow', 'triangle', 'diamond', 'diamond-filled', 'circle', 'crow-many', 'crow-one', 'crow-zero-many', 'crow-zero-one'],
  edgeTypes: ['smoothstep', 'step', 'straight', 'default'],
  /** Connection handle ids; `null` (no handle) is also schema 2. */
  handles: ['t', 'r', 'b', 'l'],
  settingsFields: ['snapToGrid', 'showGrid', 'autoLayout', 'connector'],
  autoLayouts: ['none', 'TB', 'LR'],
  viewportFields: ['x', 'y', 'zoom'],
} as const);

const set = (values: readonly string[]) => new Set<string>(values);
const V = {
  content: set(SCHEMA2_VOCABULARY.contentFields),
  node: set(SCHEMA2_VOCABULARY.nodeFields),
  edge: set(SCHEMA2_VOCABULARY.edgeFields),
  kinds: set(SCHEMA2_VOCABULARY.shapeKinds),
  shapeData: set(SCHEMA2_VOCABULARY.shapeDataFields),
  connectorData: set(SCHEMA2_VOCABULARY.connectorDataFields),
  arrows: set(SCHEMA2_VOCABULARY.arrowModes),
  markers: set(SCHEMA2_VOCABULARY.markerKinds),
  edgeTypes: set(SCHEMA2_VOCABULARY.edgeTypes),
  handles: set(SCHEMA2_VOCABULARY.handles),
  settings: set(SCHEMA2_VOCABULARY.settingsFields),
  autoLayouts: set(SCHEMA2_VOCABULARY.autoLayouts),
  viewport: set(SCHEMA2_VOCABULARY.viewportFields),
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A field outside the vocabulary counts only when it holds something (JSON drops undefined). */
const extraField = (o: Obj, known: Set<string>) => Object.keys(o).some((k) => !known.has(k) && o[k] !== undefined);
const outside = (value: unknown, allowed: Set<string>) => value !== undefined && !(typeof value === 'string' && allowed.has(value));

/**
 * Why `content` needs schema 3, or null when it uses only the schema-2 vocabulary. Works on stored (serialized)
 * content; the reason is for tests and diagnostics.
 */
export function schema3Reason(content: unknown): string | null {
  if (!isObj(content)) return null;
  if (extraField(content, V.content)) return `top-level field ${Object.keys(content).find((k) => !V.content.has(k) && content[k] !== undefined)}`;
  if (isObj(content.viewport) && extraField(content.viewport, V.viewport)) return 'viewport field';
  if (isObj(content.settings)) {
    const s = content.settings;
    if (extraField(s, V.settings)) return 'settings field';
    if (outside(s.autoLayout, V.autoLayouts)) return `autoLayout ${String(s.autoLayout)}`;
    if (outside(s.connector, V.edgeTypes)) return `connector ${String(s.connector)}`;
  }
  for (const n of Array.isArray(content.nodes) ? content.nodes : []) {
    if (!isObj(n)) continue;
    if (extraField(n, V.node)) return `node ${String(n.id)}: field ${Object.keys(n).find((k) => !V.node.has(k) && n[k] !== undefined)}`;
    if (!isObj(n.data)) continue;
    if (extraField(n.data, V.shapeData)) return `node ${String(n.id)}: data field ${Object.keys(n.data).find((k) => !V.shapeData.has(k) && (n.data as Obj)[k] !== undefined)}`;
    if (outside(n.data.shape, V.kinds)) return `node ${String(n.id)}: shape ${String(n.data.shape)}`;
  }
  for (const e of Array.isArray(content.edges) ? content.edges : []) {
    if (!isObj(e)) continue;
    if (extraField(e, V.edge)) return `edge ${String(e.id)}: field ${Object.keys(e).find((k) => !V.edge.has(k) && e[k] !== undefined)}`;
    if (outside(e.type, V.edgeTypes)) return `edge ${String(e.id)}: type ${String(e.type)}`;
    for (const h of [e.sourceHandle, e.targetHandle]) if (h !== null && outside(h, V.handles)) return `edge ${String(e.id)}: handle ${String(h)}`;
    if (!isObj(e.data)) continue;
    const d = e.data;
    if (extraField(d, V.connectorData)) return `edge ${String(e.id)}: data field ${Object.keys(d).find((k) => !V.connectorData.has(k) && d[k] !== undefined)}`;
    if (outside(d.arrow, V.arrows)) return `edge ${String(e.id)}: arrow ${String(d.arrow)}`;
    if (outside(d.startMarker, V.markers) || outside(d.endMarker, V.markers)) return `edge ${String(e.id)}: marker`;
  }
  return null;
}

/** The schema number to store `content` under: 2 when it uses only the schema-2 vocabulary, otherwise 3. */
export function schemaFor(content: unknown): 2 | 3 {
  return schema3Reason(content) === null ? 2 : 3;
}
