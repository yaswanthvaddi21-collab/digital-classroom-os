import type { Edge, Node, Viewport } from '@xyflow/react';

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
  | 'package';

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

export type ShapeData = ShapeStyle & { label: string };

export type ShapeNode = Node<ShapeData, 'shape'>;

export type EdgeLineType = 'smoothstep' | 'step' | 'straight' | 'default';
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
}

export const DEFAULT_SETTINGS: DiagramSettings = { snapToGrid: true, showGrid: true, autoLayout: 'none' };

export const DEFAULT_CONNECTOR: ConnectorData = { color: '#475569', width: 2, dashed: false, arrow: 'end' };

export function shapeDefaults(shape: ShapeKind): ShapeStyle & { width: number; height: number } {
  const base = { shape, fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
  switch (shape) {
    case 'circle':
      return { ...base, width: 110, height: 110 };
    case 'ellipse':
      return { ...base, width: 150, height: 80, fill: '#e0e7ff', stroke: '#4f46e5' };
    case 'diamond':
      return { ...base, width: 150, height: 110, fill: '#fef3c7', stroke: '#b45309' };
    case 'parallelogram':
      return { ...base, width: 170, height: 70, fill: '#dcfce7', stroke: '#15803d' };
    case 'hexagon':
      return { ...base, width: 160, height: 80, fill: '#f3e8ff', stroke: '#7e22ce' };
    case 'triangle':
      return { ...base, width: 130, height: 110 };
    case 'cylinder':
      return { ...base, width: 120, height: 110, fill: '#e0f2fe', stroke: '#0369a1' };
    case 'document':
      return { ...base, width: 160, height: 90 };
    case 'note':
      return { ...base, width: 160, height: 120, fill: '#fef9c3', stroke: '#ca8a04', strokeWidth: 1 };
    case 'text':
      return { ...base, width: 160, height: 40, fill: 'transparent', stroke: 'transparent', strokeWidth: 0, fontSize: 16 };
    case 'rounded':
      return { ...base, width: 160, height: 70 };
    case 'umlClass':
      return { ...base, width: 200, height: 130, fill: '#ffffff', stroke: '#334155', fontSize: 13 };
    case 'erEntity':
      return { ...base, width: 190, height: 120, fill: '#ffffff', stroke: '#0369a1', fontSize: 13 };
    case 'actor':
      return { ...base, width: 70, height: 110, fill: '#ffffff', stroke: '#334155', fontSize: 13 };
    case 'package':
      return { ...base, width: 180, height: 110, fill: '#fefce8', stroke: '#a16207' };
    default:
      return { ...base, width: 160, height: 70 };
  }
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

/** Newest diagram content schema this build reads and writes. Newer content opens read-only. */
export const DIAGRAM_SCHEMA = 2;

export function diagramSchemaOf(raw: unknown): number {
  const v = raw && typeof raw === 'object' ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  return typeof v === 'number' && v >= 1 ? v : 1;
}

export function createEmptyDiagram(): DiagramContent {
  return { schemaVersion: DIAGRAM_SCHEMA, nodes: [], edges: [], viewport: null, settings: { ...DEFAULT_SETTINGS } };
}

export function serializeDiagram(nodes: ShapeNode[], edges: Connector[], viewport: Viewport | null, settings: DiagramSettings): DiagramContent {
  return {
    schemaVersion: DIAGRAM_SCHEMA,
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: Math.round(n.position.x * 10) / 10, y: Math.round(n.position.y * 10) / 10 },
      width: Math.round(n.width ?? n.measured?.width ?? 160),
      height: Math.round(n.height ?? n.measured?.height ?? 70),
      data: n.data,
      ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: (e.type as EdgeLineType) ?? 'smoothstep',
      label: typeof e.label === 'string' ? e.label : '',
      data: { ...DEFAULT_CONNECTOR, ...e.data },
    })),
    viewport,
    settings,
  };
}

/** Rebuilds editor state from stored content, tolerating missing fields and dangling edges. */
export function deserializeDiagram(raw: unknown): { nodes: ShapeNode[]; edges: Connector[]; viewport: Viewport | null; settings: DiagramSettings } {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<DiagramContent>;
  const nodes: ShapeNode[] = (Array.isArray(c.nodes) ? c.nodes : [])
    .filter((n) => n && typeof n.id === 'string')
    .map((n) => {
      const shape = (n.data?.shape ?? 'rectangle') as ShapeKind;
      const { width, height, ...defaults } = shapeDefaults(shape);
      return {
        id: n.id,
        type: 'shape' as const,
        position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
        width: Number(n.width) || width,
        height: Number(n.height) || height,
        data: { ...defaults, ...n.data, label: n.data?.label ?? '' },
        ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
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
        data: { ...DEFAULT_CONNECTOR, ...e.data },
      }),
    );
  return { nodes, edges, viewport: c.viewport ?? null, settings: { ...DEFAULT_SETTINGS, ...c.settings } };
}
