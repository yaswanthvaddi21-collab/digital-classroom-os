import { MarkerType, type Edge, type Node, type Viewport } from '@xyflow/react';

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
  | 'text';

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

export type ConnectorData = {
  color: string;
  width: number;
  dashed: boolean;
  arrow: ArrowMode;
};

export type Connector = Edge<ConnectorData>;

export type AutoLayout = 'none' | 'TB' | 'LR';

export interface DiagramSettings {
  snapToGrid: boolean;
  showGrid: boolean;
  /** Tree-style diagrams re-layout automatically when children are added. */
  autoLayout: AutoLayout;
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
  schemaVersion: 1;
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
    default:
      return { ...base, width: 160, height: 70 };
  }
}

/** Derives React Flow presentation props (stroke, markers, label style) from connector data. */
export function styledEdge(edge: Connector): Connector {
  const d = { ...DEFAULT_CONNECTOR, ...edge.data };
  const marker = { type: MarkerType.ArrowClosed, color: d.color, width: 16, height: 16 };
  return {
    ...edge,
    data: d,
    style: { stroke: d.color, strokeWidth: d.width, strokeDasharray: d.dashed ? '6 5' : undefined },
    markerEnd: d.arrow !== 'none' ? marker : undefined,
    markerStart: d.arrow === 'both' ? marker : undefined,
    labelStyle: { fill: '#0f172a', fontSize: 12, fontWeight: 500 },
    labelBgStyle: { fill: '#ffffff' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  };
}

export function createEmptyDiagram(): DiagramContent {
  return { schemaVersion: 1, nodes: [], edges: [], viewport: null, settings: { ...DEFAULT_SETTINGS } };
}

export function serializeDiagram(nodes: ShapeNode[], edges: Connector[], viewport: Viewport | null, settings: DiagramSettings): DiagramContent {
  return {
    schemaVersion: 1,
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
