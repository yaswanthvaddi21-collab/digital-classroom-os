import type { Edge, Node, Viewport } from '@xyflow/react';
import { schemaFor } from './compat';
import { CONNECTOR_DATA_READERS, parentsFirst, readFields, readLayers, SHAPE_DATA_READERS, validParents, type DiagramLayer, type EdgePort, type Point } from './model';
import type { LibraryShapeKind } from './library/kinds';
import { shapeDef } from './shapeRegistry';

export type { DiagramLayer, EdgePort, Point } from './model';

export type ShapeKind =
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'circle'
  | 'diamond'
  | 'parallelogram'
  | 'hexagon'
  | 'triangle'
  | 'cylinder'
  | 'document'
  | 'note'
  | 'text'
  // schema 2: UML, ER and organisation shapes
  | 'umlClass'
  | 'erEntity'
  | 'actor'
  | 'package'
  // schema 3: an invisible container; the shapes in it have `parentId` set to it (React Flow parent nodes).
  | 'group'
  // schema 3 (G-DRAWIO): a picture embedded in the diagram (`data.image`), from diagrams.net image cells.
  | 'image'
  // schema 3 (G-SHAPES): BPMN, UML sequence/activity/state/use case, network icons and timeline dates (library/kinds.ts).
  | LibraryShapeKind;
// @phase5:shapes — new kinds are added to the union above (and to SHAPE_DEFS in shapeRegistry.ts).

/** Shapes whose label is split into a header and compartments (lines separated by a line holding only `--`). */
export const COMPARTMENT_SHAPES: ReadonlySet<ShapeKind> = new Set(['umlClass', 'erEntity']);

/** Splits a compartment label: first line is the header, `--` lines start new sections. */
export function splitCompartments(label: string): { header: string; sections: string[][] } {
  const [header = '', ...rest] = label.split('\n');
  const sections: string[][] = [[]];
  for (const line of rest) {
    if (line.trim() === '--') sections.push([]);
    else sections[sections.length - 1].push(line);
  }
  return { header, sections };
}

export type ShapeStyle = {
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  dashed: boolean;
  bold: boolean;
};

export type ShapeData = ShapeStyle & {
  label: string;
  /** schema 3: rotation in degrees, clockwise, about the centre. Absent = 0. */
  rotation?: number;
  /** schema 3: a web or mail address (or diagrams.net page link) the shape opens. Unsafe schemes are not kept. */
  link?: string;
  /** schema 3: text shown when pointing at the shape. */
  tooltip?: string;
  /** schema 3: custom properties (diagrams.net "Edit Data"), string to string. */
  properties?: Record<string, string>;
  /** schema 3 (diagrams.net): opacity of the fill and outline in percent, 0–100. Absent = opaque. */
  opacity?: number;
  /** schema 3 (diagrams.net): font family of the text, as the file names it. Absent = the app's font. */
  fontFamily?: string;
  /** schema 3 (diagrams.net): text alignment across the shape. Absent = centred. */
  textAlign?: 'left' | 'right';
  /** schema 3 (diagrams.net): text alignment down the shape. Absent = middle. */
  verticalAlign?: 'top' | 'bottom';
  /** schema 3 (diagrams.net): the picture of an `image` shape, as an embedded data: URL. */
  image?: string;
  // @phase5:model — new shape data fields (optional; add a reader to SHAPE_DATA_READERS in model.ts).
};

/**
 * A shape on the canvas. `parentId` and `hidden` are React Flow's own fields; `locked` and `layer` are ours and are
 * ignored by React Flow (features derive React Flow's `draggable`, `deletable` … from them when rendering).
 */
export type ShapeNode = Node<ShapeData, 'shape'> & { locked?: boolean; layer?: string };

export type EdgeLineType = 'smoothstep' | 'step' | 'straight' | 'default';
/** Every line type, in menu order. @phase5:edges — add new types here, to EdgeLineType and to EDGE_PATHS (edges.tsx). */
export const EDGE_LINE_TYPES: EdgeLineType[] = ['smoothstep', 'step', 'straight', 'default'];
export type ArrowMode = 'end' | 'both' | 'none';

/** Connector end decorations. UML: triangle = inheritance, diamond = aggregation, diamond-filled = composition. */
export type MarkerKind =
  | 'none'
  | 'arrow'
  | 'open-arrow'
  | 'triangle'
  | 'diamond'
  | 'diamond-filled'
  | 'circle'
  | 'crow-many'
  | 'crow-one'
  | 'crow-zero-many'
  | 'crow-zero-one';

export const MARKER_KINDS: MarkerKind[] = ['none', 'arrow', 'open-arrow', 'triangle', 'diamond', 'diamond-filled', 'circle', 'crow-many', 'crow-one', 'crow-zero-many', 'crow-zero-one'];

export type ConnectorData = {
  color: string;
  width: number;
  dashed: boolean;
  /** v1 field, still honoured when start/endMarker are absent. */
  arrow: ArrowMode;
  /** schema 2: explicit end decorations; when set they take precedence over `arrow`. */
  startMarker?: MarkerKind;
  endMarker?: MarkerKind;
  /** schema 3: bend points in flow coordinates, from source to target. */
  waypoints?: Point[];
  /** schema 3: where the label sits along the connector, 0 (source) to 1 (target). Absent = 0.5. */
  labelPosition?: number;
  /** schema 3: attachment beyond the four side handles (perimeter or a fixed point). Absent = the handle. */
  sourcePort?: EdgePort;
  targetPort?: EdgePort;
  // @phase5:model — new connector data fields (optional; add a reader to CONNECTOR_DATA_READERS in model.ts).
};

/** The decorations actually drawn at each end of a connector. */
export function edgeMarkers(d: ConnectorData): { start: MarkerKind; end: MarkerKind } {
  return {
    start: d.startMarker ?? (d.arrow === 'both' ? 'arrow' : 'none'),
    end: d.endMarker ?? (d.arrow === 'none' ? 'none' : 'arrow'),
  };
}

export type Connector = Edge<ConnectorData>;

export type AutoLayout = 'none' | 'TB' | 'LR';

export interface DiagramSettings {
  snapToGrid: boolean;
  showGrid: boolean;
  /** Tree-style diagrams re-layout automatically when children are added. */
  autoLayout: AutoLayout;
  /** schema 2: line style for newly drawn connectors (default elbow). Existing connectors keep their own. */
  connector?: EdgeLineType;
}

/** Persisted node: only what is needed to rebuild it. Selection and measurements are runtime state. */
export interface SerializedNode {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  data: ShapeData;
  zIndex?: number;
  /** schema 3: the containing group (or container) node. `position` is then relative to that node. */
  parentId?: string;
  /** schema 3: cannot be moved, resized, edited or deleted until unlocked. Stored only when true. */
  locked?: true;
  /** schema 3: not shown or exported (diagrams.net hidden cells). Stored only when true. */
  hidden?: true;
  /** schema 3: id of the layer (in `DiagramContent.layers`) the shape is on. Absent = the first layer. */
  layer?: string;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: EdgeLineType;
  label: string;
  data: ConnectorData;
}

export interface DiagramContent {
  schemaVersion: number;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  viewport: Viewport | null;
  settings: DiagramSettings;
  /** schema 3: layers, bottom first. Absent = one implicit layer holding everything. */
  layers?: DiagramLayer[];
}

export const DEFAULT_SETTINGS: DiagramSettings = { snapToGrid: true, showGrid: true, autoLayout: 'none' };

export const DEFAULT_CONNECTOR: ConnectorData = { color: '#475569', width: 2, dashed: false, arrow: 'end' };

export function shapeDefaults(shape: ShapeKind): ShapeStyle & { width: number; height: number } {
  const base = { shape, fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
  const def = shapeDef(shape);
  // A kind from a newer version keeps the base style at the default size (it is drawn as a placeholder).
  return def ? { ...base, ...def.style, width: def.width, height: def.height } : { ...base, width: 160, height: 70 };
}

/** Derives React Flow presentation props (stroke, markers, label style) from connector data. */
export function styledEdge(edge: Connector): Connector {
  const d = { ...DEFAULT_CONNECTOR, ...edge.data };
  // End markers are drawn by the connector component itself (see edges.tsx), so exports always include them.
  return {
    ...edge,
    data: d,
    style: { stroke: d.color, strokeWidth: d.width, strokeDasharray: d.dashed ? '6 5' : undefined },
    markerEnd: undefined,
    markerStart: undefined,
    labelStyle: { fill: '#0f172a', fontSize: 12, fontWeight: 500 },
    labelBgStyle: { fill: '#ffffff' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  };
}

/**
 * Newest diagram content schema this build reads and writes. Newer content opens read-only. Content is stored under
 * `schemaFor(content)` (compat.ts): 2 when it uses only the schema-2 vocabulary, so older builds can still edit it.
 */
export const DIAGRAM_SCHEMA = 3;

export function diagramSchemaOf(raw: unknown): number {
  const v = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  return typeof v === 'number' && v >= 1 ? v : 1;
}

export function createEmptyDiagram(): DiagramContent {
  return { schemaVersion: 2, nodes: [], edges: [], viewport: null, settings: { ...DEFAULT_SETTINGS } };
}

/** The stored form of shape data: schema-3 fields at their default are left out. */
const storedShapeData = (d: ShapeData): ShapeData => readFields(d, SHAPE_DATA_READERS);
const storedConnectorData = (d: ConnectorData): ConnectorData => readFields(d, CONNECTOR_DATA_READERS);

/** The stored form of the editor's diagram. Runtime fields (selection, measurements) are left out. */
export function serializeDiagram(nodes: ShapeNode[], edges: Connector[], viewport: Viewport | null, settings: DiagramSettings, layers?: DiagramLayer[]): DiagramContent {
  const content: DiagramContent = {
    schemaVersion: 2,
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: Math.round(n.position.x * 10) / 10, y: Math.round(n.position.y * 10) / 10 },
      width: Math.round(n.width ?? n.measured?.width ?? 160),
      height: Math.round(n.height ?? n.measured?.height ?? 70),
      data: storedShapeData(n.data),
      ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(n.locked ? { locked: true as const } : {}),
      ...(n.hidden ? { hidden: true as const } : {}),
      ...(n.layer ? { layer: n.layer } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: (e.type as EdgeLineType) ?? 'smoothstep',
      label: typeof e.label === 'string' ? e.label : '',
      data: storedConnectorData({ ...DEFAULT_CONNECTOR, ...e.data }),
    })),
    viewport,
    settings,
    ...(layers?.length ? { layers } : {}),
  };
  content.schemaVersion = schemaFor(content);
  return content;
}

/** Editor state rebuilt from stored content. */
export interface DeserializedDiagram {
  nodes: ShapeNode[];
  edges: Connector[];
  viewport: Viewport | null;
  settings: DiagramSettings;
  /** Present only when the diagram has layers. */
  layers?: DiagramLayer[];
}

/**
 * Rebuilds editor state from stored content, tolerating missing fields and dangling edges. Schema-3 fields with
 * invalid values are left out (model.ts); unknown data fields are kept as they are. Never changes `raw`.
 */
export function deserializeDiagram(raw: unknown): DeserializedDiagram {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<DiagramContent>;
  const layers = readLayers(c.layers);
  const layerIds = new Set(layers?.map((l) => l.id));
  const stored = (Array.isArray(c.nodes) ? c.nodes : []).filter((n) => n && typeof n.id === 'string');
  const parents = validParents(stored);
  const nodes: ShapeNode[] = stored.map((n) => {
    const shape = (n.data?.shape ?? 'rectangle') as ShapeKind;
    const { width, height, ...defaults } = shapeDefaults(shape);
    const parentId = parents.get(n.id);
    return {
      id: n.id,
      type: 'shape' as const,
      position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
      width: Number(n.width) || width,
      height: Number(n.height) || height,
      data: storedShapeData({ ...defaults, ...n.data, label: n.data?.label ?? '' }),
      ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
      ...(parentId ? { parentId } : {}),
      ...(n.locked === true ? { locked: true } : {}),
      ...(n.hidden === true ? { hidden: true } : {}),
      ...(typeof n.layer === 'string' && layerIds.has(n.layer) ? { layer: n.layer } : {}),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Connector[] = (Array.isArray(c.edges) ? c.edges : [])
    .filter((e) => e && ids.has(e.source) && ids.has(e.target))
    .map((e) =>
      styledEdge({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        type: e.type ?? 'smoothstep',
        label: e.label || undefined,
        data: storedConnectorData({ ...DEFAULT_CONNECTOR, ...e.data }),
      }),
    );
  return { nodes: parentsFirst(nodes), edges, viewport: c.viewport ?? null, settings: { ...DEFAULT_SETTINGS, ...c.settings }, ...(layers ? { layers } : {}) };
}
