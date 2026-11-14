import type { DiagramContent, EdgeLineType, MarkerKind, SerializedEdge, SerializedNode, ShapeKind } from './types';
import { LIBRARY_DRAWIO_SHAPE_KEYS, LIBRARY_VERTEX_READER } from './library/drawio';
import { readEdgeExtras, readVertexPresentation, splitProperties, vertexPresentationStyle } from './drawioFeatures';

/*
 * What the diagrams.net importer and exporter know, as tables and hooks that features add to. drawio.ts walks the
 * file; these say how each thing maps. Shape styles for export live with each shape (`drawioStyle`, shapeRegistry.ts).
 */

/** A parsed mxGraph style: bare names (`ellipse;`) and key=value pairs. */
export type DrawioStyle = { names: Set<string>; map: Map<string, string> };

/** One mxCell as the importer reads it (a `<UserObject>` / `<object>` wrapper supplies the id and label). */
export type DrawioCell = {
  id: string;
  value: string | null;
  parent: string;
  st: DrawioStyle;
  vertex: boolean;
  edge: boolean;
  source: string | null;
  target: string | null;
  g: Element | null;
  /** The `<UserObject>` / `<object>` element around the cell, if any (it holds links, tooltips and properties). */
  wrapper: Element | null;
  /** The `<mxCell>` element itself (its `visible` and `collapsed` attributes). */
  el?: Element;
};

/** Shared state of one import: notes are shown to the user, so every approximation must add one. */
export interface DrawioImportContext {
  notes: Set<string>;
  /** Counted approximations (drawioFeatures.ts `tally`), turned into one note per kind at the end of the import. */
  tallies?: Map<string, { n: number; names: string[] }>;
}

// ── Import ───────────────────────────────────────────────────────────────────────────────────────────

/** diagrams.net `shape=` values and the kind they import as. `swimlane` is decided by the cell's contents. */
export const DRAWIO_SHAPE_KEYS: Record<string, ShapeKind> = {
  parallelogram: 'parallelogram',
  hexagon: 'hexagon',
  cylinder3: 'cylinder',
  cylinder: 'cylinder',
  datastore: 'cylinder',
  document: 'document',
  note: 'note',
  note2: 'note',
  umlActor: 'actor',
  folder: 'package',
  umlFrame: 'package',
  module: 'package',
  table: 'erEntity',
  tableRow: 'erEntity',
  ellipse: 'ellipse',
  rhombus: 'diamond',
  triangle: 'triangle',
  rectangle: 'rectangle',
  swimlane: 'umlClass',
  image: 'image', // G-DRAWIO: embedded pictures (`image=data:…`); web pictures become an empty frame with a note
  ...LIBRARY_DRAWIO_SHAPE_KEYS, // G-SHAPES: BPMN events, gateways and data, UML lifeline/initial/final, network icons
  // @phase5:drawio-import — more shape= keys.
};

/** diagrams.net arrow names and the marker they import as; `filled` is the startFill/endFill flag. Unknown names import as 'arrow'. */
export const DRAWIO_ARROWS: Record<string, (filled: boolean) => MarkerKind> = {
  none: () => 'none',
  '': () => 'none',
  block: (f) => (f ? 'arrow' : 'triangle'),
  classic: (f) => (f ? 'arrow' : 'triangle'),
  classicThin: (f) => (f ? 'arrow' : 'triangle'),
  blockThin: (f) => (f ? 'arrow' : 'triangle'),
  open: () => 'open-arrow',
  openThin: () => 'open-arrow',
  openAsync: () => 'open-arrow',
  diamond: (f) => (f ? 'diamond-filled' : 'diamond'),
  diamondThin: (f) => (f ? 'diamond-filled' : 'diamond'),
  oval: () => 'circle',
  circle: () => 'circle',
  ERmany: () => 'crow-many',
  ERoneToMany: () => 'crow-many',
  ERmandOne: () => 'crow-one',
  ERone: () => 'crow-one',
  ERzeroToMany: () => 'crow-zero-many',
  ERzeroToOne: () => 'crow-zero-one',
  // @phase5:drawio-import — more arrow names.
};

/**
 * Called for each imported shape after its geometry, label and style are read, to bring in more of the cell
 * (links, properties, rotation …). Anything a reader cannot represent must be added to `ctx.notes`.
 */
export type DrawioVertexReader = (cell: DrawioCell, node: SerializedNode, ctx: DrawioImportContext) => void;
/** Same for each imported connector. */
export type DrawioEdgeReader = (cell: DrawioCell, edge: SerializedEdge, ctx: DrawioImportContext) => void;

export const DRAWIO_VERTEX_READERS: DrawioVertexReader[] = [
  readVertexPresentation, // G-DRAWIO: rotation, opacity, font, alignment, lock, picture, link, tooltip, properties
  LIBRARY_VERTEX_READER, // G-SHAPES: BPMN event outline and gateway type
  // @phase5:drawio-import — vertex readers.
];
export const DRAWIO_EDGE_READERS: DrawioEdgeReader[] = [
  readEdgeExtras, // G-DRAWIO: notes for what connectors cannot hold (lock, transparency, links, properties)
  // @phase5:drawio-import — edge readers.
];

// ── Export ───────────────────────────────────────────────────────────────────────────────────────────

/** Each marker as a diagrams.net arrow name and fill flag. */
export const MARKER_TO_DRAWIO: Record<MarkerKind, { arrow: string; fill: 0 | 1 }> = {
  none: { arrow: 'none', fill: 0 },
  arrow: { arrow: 'block', fill: 1 },
  'open-arrow': { arrow: 'open', fill: 0 },
  triangle: { arrow: 'block', fill: 0 },
  diamond: { arrow: 'diamondThin', fill: 0 },
  'diamond-filled': { arrow: 'diamondThin', fill: 1 },
  circle: { arrow: 'oval', fill: 0 },
  'crow-many': { arrow: 'ERmany', fill: 0 },
  'crow-one': { arrow: 'ERmandOne', fill: 0 },
  'crow-zero-many': { arrow: 'ERzeroToMany', fill: 0 },
  'crow-zero-one': { arrow: 'ERzeroToOne', fill: 0 },
};

/** Each line type as a diagrams.net edge style. */
export const LINE_TO_DRAWIO: Record<EdgeLineType, string> = {
  smoothstep: 'edgeStyle=orthogonalEdgeStyle;rounded=1;',
  step: 'edgeStyle=orthogonalEdgeStyle;rounded=0;',
  straight: 'edgeStyle=none;',
  default: 'edgeStyle=orthogonalEdgeStyle;curved=1;',
  // @phase5:drawio-export — styles for new line types.
};

/** Extra style keys for a shape (`rotation=45;` …), appended after the built-in ones. */
export type DrawioVertexStyleWriter = (node: SerializedNode) => string;
/** Extra style keys for a connector. */
export type DrawioEdgeStyleWriter = (edge: SerializedEdge) => string;

export const DRAWIO_VERTEX_STYLE_WRITERS: DrawioVertexStyleWriter[] = [
  vertexPresentationStyle, // G-DRAWIO: rotation, opacity, font, alignment, lock, picture
  // @phase5:drawio-export — vertex style writers.
];
export const DRAWIO_EDGE_STYLE_WRITERS: DrawioEdgeStyleWriter[] = [
  // @phase5:drawio-export — edge style writers.
];

/**
 * Something a .drawio export cannot carry yet: `count` says how many things in the diagram are affected (0 = none),
 * `note` says in plain words what happened to them. The export toast lists every note (plan rule 3, DS-R1: never
 * silent). A feature that adds a real diagrams.net mapping removes its entry here, with a round-trip test.
 */
export interface DrawioExportLoss {
  id: string;
  count: (content: DiagramContent) => number;
  note: (count: number) => string;
}

const nodesWhere = (c: DiagramContent, test: (n: SerializedNode) => boolean) => c.nodes.filter(test).length;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const DRAWIO_EXPORT_LOSSES: DrawioExportLoss[] = [
  // G-DRAWIO wrote real mappings for groups, hidden shapes, locks, layers, rotation, links, tooltips, properties, bend
  // points, label positions and connection points (drawio.ts, drawioFeatures.ts; round-trip tests in
  // drawio-phase5.test.ts). What diagrams.net still cannot hold:
  {
    // diagrams.net puts a group's contents on the group's layer; a shape here can be on another layer than its group.
    id: 'child-layer',
    count: (c) => {
      const byId = new Map(c.nodes.map((n) => [n.id, n]));
      const top = (n: SerializedNode) => {
        const seen = new Set<string>([n.id]);
        let t = n;
        for (let p = t.parentId ? byId.get(t.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
          seen.add(p.id);
          t = p;
        }
        return t;
      };
      const first = c.layers?.[0]?.id;
      const layerOf = (n: SerializedNode) => (n.layer && c.layers?.some((l) => l.id === n.layer) ? n.layer : first);
      return nodesWhere(c, (n) => !!n.parentId && layerOf(n) !== layerOf(top(n)));
    },
    note: (n) => `${plural(n, 'shape inside a group was', 'shapes inside groups were')} written on the layer of ${n === 1 ? 'its group' : 'their groups'}: in diagrams.net a group's shapes share its layer.`,
  },
  {
    id: 'property-names',
    count: (c) => c.nodes.reduce((sum, n) => sum + splitProperties(n.data.properties).dropped.length, 0),
    note: (n) =>
      `${plural(n, 'custom property was', 'custom properties were')} left out: diagrams.net cannot store ${n === 1 ? 'its name' : 'their names'} (a name must start with a letter and hold only letters, digits, dots, hyphens and underscores; id, label, link, tooltip and placeholders are reserved).`,
  },
  // @phase5:drawio-export — losses for new fields that have no diagrams.net mapping yet.
];
