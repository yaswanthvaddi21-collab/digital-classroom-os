import { inflateSync, strFromU8 } from 'fflate';
import {
  COMPARTMENT_SHAPES,
  DEFAULT_CONNECTOR,
  DEFAULT_SETTINGS,
  DIAGRAM_SCHEMA,
  edgeMarkers,
  shapeDefaults,
  splitCompartments,
  type ConnectorData,
  type DiagramContent,
  type EdgeLineType,
  type MarkerKind,
  type SerializedEdge,
  type SerializedNode,
  type ShapeKind,
} from './types';

/*
 * diagrams.net (draw.io) interchange. Files are mxGraph XML, either plain or with each page deflated + base64.
 * Export writes plain XML that diagrams.net opens directly. Every exported cell carries a `dcosShape` style key
 * (diagrams.net keeps unknown style keys), so our own files round-trip exactly; files drawn in diagrams.net are
 * mapped from its standard style names, and anything that cannot be represented is listed in the import report.
 */

// ── Export ───────────────────────────────────────────────────────────────────────────────────────────

const BASE_STYLE: Record<ShapeKind, string> = {
  rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  circle: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
  diamond: 'rhombus;whiteSpace=wrap;html=1;',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  triangle: 'triangle;whiteSpace=wrap;html=1;direction=north;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  document: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;',
  text: 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
  package: 'shape=folder;fontStyle=1;spacingTop=10;tabWidth=60;tabHeight=18;tabPosition=left;html=1;whiteSpace=wrap;',
  umlClass:
    'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
  erEntity:
    'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;rounded=1;whiteSpace=wrap;html=1;',
};
const ROW_STYLE =
  'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;';
const LINE_STYLE = 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;';

const MARKER_TO_DRAWIO: Record<MarkerKind, { arrow: string; fill: 0 | 1 }> = {
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

const LINE_TO_DRAWIO: Record<EdgeLineType, string> = {
  smoothstep: 'edgeStyle=orthogonalEdgeStyle;rounded=1;',
  step: 'edgeStyle=orthogonalEdgeStyle;rounded=0;',
  straight: 'edgeStyle=none;',
  default: 'edgeStyle=orthogonalEdgeStyle;curved=1;',
};

const HANDLE_POINT: Record<string, [number, number]> = { t: [0.5, 0], r: [1, 0.5], b: [0.5, 1], l: [0, 0.5] };

// Characters XML 1.0 forbids are dropped (a file containing them cannot be opened at all). Tab, CR and LF are written
// as character references, because attribute-value normalisation would otherwise turn them into spaces.
const xmlEscape = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;')
    .replace(/\r/g, '&#13;');
const htmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const color = (c: string) => (c === 'transparent' ? 'none' : c);
const r = (n: number) => Math.round(n * 10) / 10;

function vertexStyle(node: SerializedNode) {
  const d = node.data;
  let style = `${BASE_STYLE[d.shape] ?? BASE_STYLE.rectangle}dcosShape=${d.shape};fillColor=${color(d.fill)};strokeColor=${color(d.stroke)};fontColor=${d.textColor};fontSize=${d.fontSize};strokeWidth=${d.strokeWidth};`;
  if (d.dashed) style += 'dashed=1;';
  if (d.bold && !COMPARTMENT_SHAPES.has(d.shape) && d.shape !== 'package') style += 'fontStyle=1;';
  return style;
}

function edgeStyle(edge: SerializedEdge) {
  const d = { ...DEFAULT_CONNECTOR, ...edge.data };
  const { start, end } = edgeMarkers(d);
  const s = MARKER_TO_DRAWIO[start];
  const e = MARKER_TO_DRAWIO[end];
  let style = `${LINE_TO_DRAWIO[edge.type] ?? LINE_TO_DRAWIO.smoothstep}html=1;dcosLine=${edge.type};strokeColor=${d.color};strokeWidth=${d.width};startArrow=${s.arrow};startFill=${s.fill};endArrow=${e.arrow};endFill=${e.fill};dcosStart=${start};dcosEnd=${end};`;
  if (d.dashed) style += 'dashed=1;';
  const exit = edge.sourceHandle ? HANDLE_POINT[edge.sourceHandle] : undefined;
  const entry = edge.targetHandle ? HANDLE_POINT[edge.targetHandle] : undefined;
  if (exit) style += `exitX=${exit[0]};exitY=${exit[1]};exitDx=0;exitDy=0;`;
  if (entry) style += `entryX=${entry[0]};entryY=${entry[1]};entryDx=0;entryDy=0;`;
  return style;
}

/** Serialises a diagram as a diagrams.net file (plain, uncompressed mxGraph XML). */
export function toDrawio(content: DiagramContent, title = 'Diagram'): string {
  const cells: string[] = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
  for (const node of content.nodes) {
    const { x, y } = node.position;
    const id = xmlEscape(node.id);
    if (COMPARTMENT_SHAPES.has(node.data.shape)) {
      const { header, sections } = splitCompartments(node.data.label);
      cells.push(`<mxCell id="${id}" value="${xmlEscape(htmlEscape(header))}" style="${xmlEscape(vertexStyle(node))}" vertex="1" parent="1"><mxGeometry x="${r(x)}" y="${r(y)}" width="${r(node.width)}" height="${r(node.height)}" as="geometry" /></mxCell>`);
      // Rows are laid out by diagrams.net's stack layout; we give them sensible starting geometry.
      let cy = 26;
      const rowH = Math.max(26, (node.height - 26 - 8 * (sections.length - 1)) / Math.max(1, sections.length));
      sections.forEach((rows, i) => {
        if (i > 0) {
          cells.push(`<mxCell id="${id}__sep${i}" value="" style="${xmlEscape(LINE_STYLE)}" vertex="1" parent="${id}"><mxGeometry y="${r(cy)}" width="${r(node.width)}" height="8" as="geometry" /></mxCell>`);
          cy += 8;
        }
        const html = rows.map(htmlEscape).join('<br>');
        cells.push(`<mxCell id="${id}__row${i}" value="${xmlEscape(html)}" style="${xmlEscape(ROW_STYLE)}" vertex="1" parent="${id}"><mxGeometry y="${r(cy)}" width="${r(node.width)}" height="${r(rowH)}" as="geometry" /></mxCell>`);
        cy += rowH;
      });
    } else {
      const html = node.data.label.split('\n').map(htmlEscape).join('<br>');
      cells.push(`<mxCell id="${id}" value="${xmlEscape(html)}" style="${xmlEscape(vertexStyle(node))}" vertex="1" parent="1"><mxGeometry x="${r(x)}" y="${r(y)}" width="${r(node.width)}" height="${r(node.height)}" as="geometry" /></mxCell>`);
    }
  }
  for (const edge of content.edges) {
    cells.push(
      `<mxCell id="${xmlEscape(edge.id)}" value="${xmlEscape(htmlEscape(edge.label ?? ''))}" style="${xmlEscape(edgeStyle(edge))}" edge="1" parent="1" source="${xmlEscape(edge.source)}" target="${xmlEscape(edge.target)}"><mxGeometry relative="1" as="geometry" /></mxCell>`,
    );
  }
  const grid = content.settings?.showGrid === false ? 0 : 1;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<mxfile host="Digital Classroom OS" agent="Digital Classroom OS" type="device">`,
    `<diagram id="dcos" name="${xmlEscape(title)}">`,
    `<mxGraphModel grid="${grid}" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">`,
    `<root>${cells.join('')}</root>`,
    '</mxGraphModel></diagram></mxfile>',
  ].join('\n');
}

// ── Import ───────────────────────────────────────────────────────────────────────────────────────────

export interface DrawioImportReport {
  title: string;
  nodes: number;
  edges: number;
  /** Things that could not be brought in exactly, in plain language. Empty when the import is exact. */
  notes: string[];
}

export class DrawioImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawioImportError';
  }
}

type Style = { names: Set<string>; map: Map<string, string> };

function parseStyle(style: string | null): Style {
  const names = new Set<string>();
  const map = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) names.add(part.trim());
    else map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return { names, map };
}

/** diagrams.net labels are often HTML. Keeps line breaks and text, drops markup. */
export function htmlToText(value: string | null): string {
  if (!value) return '';
  if (!/[<&]/.test(value)) return value;
  const withBreaks = value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h\d)>/gi, '\n');
  const doc = new DOMParser().parseFromString(`<body>${withBreaks}</body>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/ /g, ' ').replace(/\n+$/, '');
}

function decodePage(diagram: Element): Element {
  const inline = diagram.getElementsByTagName('mxGraphModel')[0];
  if (inline) return inline;
  const text = (diagram.textContent ?? '').trim();
  if (!text) throw new DrawioImportError('The diagram page is empty.');
  let xml: string;
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    xml = decodeURIComponent(strFromU8(inflateSync(bytes)));
  } catch {
    throw new DrawioImportError('This diagrams.net page is compressed in a way that could not be read.');
  }
  const model = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  if (model.nodeName !== 'mxGraphModel') throw new DrawioImportError('The compressed page does not contain a diagram.');
  return model;
}

const SHAPE_KEYS: Record<string, ShapeKind> = {
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
};

/** Shape from the generic style names (`ellipse;`, `rhombus;` …), ignoring any specific `shape=` key. */
function shapeFromNames(st: Style): ShapeKind {
  const n = st.names;
  if (n.has('swimlane')) return st.map.get('rounded') === '1' ? 'erEntity' : 'umlClass';
  if (n.has('ellipse')) return st.map.get('aspect') === 'fixed' ? 'circle' : 'ellipse';
  if (n.has('rhombus')) return 'diamond';
  if (n.has('triangle')) return 'triangle';
  if (n.has('text') || n.has('label')) return 'text';
  return st.map.get('rounded') === '1' ? 'rounded' : 'rectangle';
}

const KIND_NAMES: Partial<Record<ShapeKind, string>> = { ellipse: 'ellipses', rectangle: 'rectangles', rounded: 'rounded rectangles', diamond: 'diamonds' };

function shapeFromStyle(st: Style, notes: Set<string>): ShapeKind {
  const tagged = st.map.get('dcosShape') as ShapeKind | undefined;
  if (tagged && tagged in BASE_STYLE) return tagged;
  // A specific `shape=` wins over generic names: `ellipse;shape=cloud` is a cloud, not an ellipse.
  const shape = st.map.get('shape');
  if (shape) {
    const known = SHAPE_KEYS[shape];
    if (known) return known === 'umlClass' ? shapeFromNames(st) : known === 'ellipse' && st.map.get('aspect') === 'fixed' ? 'circle' : known;
    const fallback = shapeFromNames(st);
    notes.add(`Shapes of type “${shape}” were imported as ${KIND_NAMES[fallback] ?? fallback}.`);
    return fallback;
  }
  return shapeFromNames(st);
}

function markerFromStyle(st: Style, end: 'start' | 'end', fallback: MarkerKind): MarkerKind {
  const tagged = st.map.get(end === 'start' ? 'dcosStart' : 'dcosEnd') as MarkerKind | undefined;
  if (tagged && tagged in MARKER_TO_DRAWIO) return tagged;
  const arrow = st.map.get(end === 'start' ? 'startArrow' : 'endArrow');
  const filled = st.map.get(end === 'start' ? 'startFill' : 'endFill') !== '0';
  if (arrow === undefined) return fallback;
  switch (arrow) {
    case 'none':
    case '':
      return 'none';
    case 'block':
    case 'classic':
    case 'classicThin':
    case 'blockThin':
      return filled ? 'arrow' : 'triangle';
    case 'open':
    case 'openThin':
    case 'openAsync':
      return 'open-arrow';
    case 'diamond':
    case 'diamondThin':
      return filled ? 'diamond-filled' : 'diamond';
    case 'oval':
    case 'circle':
      return 'circle';
    case 'ERmany':
    case 'ERoneToMany':
      return 'crow-many';
    case 'ERmandOne':
    case 'ERone':
      return 'crow-one';
    case 'ERzeroToMany':
      return 'crow-zero-many';
    case 'ERzeroToOne':
      return 'crow-zero-one';
    default:
      return 'arrow';
  }
}

function lineFromStyle(st: Style): EdgeLineType {
  const tagged = st.map.get('dcosLine') as EdgeLineType | undefined;
  if (tagged && tagged in LINE_TO_DRAWIO) return tagged;
  const es = st.map.get('edgeStyle');
  if (st.map.get('curved') === '1') return 'default';
  if (!es || es === 'none') return 'straight';
  return st.map.get('rounded') === '0' ? 'step' : 'smoothstep';
}

function handleFrom(x: string | undefined, y: string | undefined): string | null {
  if (x === undefined || y === undefined) return null;
  const fx = Number(x);
  const fy = Number(y);
  if (fy <= 0.05) return 't';
  if (fy >= 0.95) return 'b';
  if (fx <= 0.05) return 'l';
  if (fx >= 0.95) return 'r';
  return null;
}

/** Picks facing sides when a file does not say where a connector attaches. */
function facing(a: SerializedNode, b: SerializedNode): [string, string] {
  const dx = b.position.x + b.width / 2 - (a.position.x + a.width / 2);
  const dy = b.position.y + b.height / 2 - (a.position.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['r', 'l'] : ['l', 'r'];
  return dy > 0 ? ['b', 't'] : ['t', 'b'];
}

const colorOf = (v: string | undefined, fallback: string) => (v === undefined || v === 'default' ? fallback : v === 'none' ? 'transparent' : v);
const num = (v: string | null | undefined, fallback: number) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

type Cell = {
  id: string;
  value: string | null;
  parent: string;
  st: Style;
  vertex: boolean;
  edge: boolean;
  source: string | null;
  target: string | null;
  g: Element | null;
};

const WRAPPERS = new Set(['UserObject', 'object']);

/**
 * Reads every mxCell. diagrams.net wraps a cell that has a link, tooltip or custom properties in
 * `<UserObject>` / `<object>`, and the wrapper then holds the cell's id and label.
 */
function readCells(model: Element): Cell[] {
  return Array.from(model.getElementsByTagName('mxCell')).map((el, i) => {
    const wrapper = el.parentElement && WRAPPERS.has(el.parentElement.nodeName) ? el.parentElement : null;
    return {
      id: (wrapper ?? el).getAttribute('id') || `drawio-cell-${i}`,
      value: wrapper ? wrapper.getAttribute('label') : el.getAttribute('value'),
      parent: el.getAttribute('parent') ?? '',
      st: parseStyle(el.getAttribute('style')),
      vertex: el.getAttribute('vertex') === '1',
      edge: el.getAttribute('edge') === '1',
      source: el.getAttribute('source'),
      target: el.getAttribute('target'),
      g: el.getElementsByTagName('mxGeometry')[0] ?? null,
    };
  });
}

/** Reads a diagrams.net / draw.io file (.drawio, .xml, plain or compressed). Uses the first page. */
export function fromDrawio(text: string): { content: DiagramContent; report: DrawioImportReport } {
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DrawioImportError('This file is not valid diagrams.net XML.');
  const root = doc.documentElement;
  const notes = new Set<string>();
  let title = 'Imported diagram';
  let model: Element;
  if (root.nodeName === 'mxfile') {
    const pages = Array.from(root.getElementsByTagName('diagram'));
    if (!pages.length) throw new DrawioImportError('The file contains no diagram pages.');
    title = pages[0].getAttribute('name') || title;
    if (pages.length > 1) notes.add(`Only the first page (“${title}”) was imported; the file has ${pages.length} pages.`);
    model = decodePage(pages[0]);
  } else if (root.nodeName === 'mxGraphModel') {
    model = root;
  } else {
    throw new DrawioImportError('This is not a diagrams.net file.');
  }

  const cells = readCells(model);
  const byId = new Map(cells.map((c) => [c.id, c]));
  const children = new Map<string, Cell[]>();
  for (const c of cells) children.set(c.parent, [...(children.get(c.parent) ?? []), c]);
  const vertexChildren = (id: string) => (children.get(id) ?? []).filter((k) => k.vertex);
  const y = (c: Cell) => num(c.g?.getAttribute('y'), 0);
  const x = (c: Cell) => num(c.g?.getAttribute('x'), 0);

  // diagrams.net paints a container, then its contents, then the next sibling. React Flow paints nodes in array
  // order, so visiting the cell tree depth-first keeps every container behind the shapes inside it.
  const ordered: Cell[] = [];
  const seen = new Set<Cell>();
  const visit = (c: Cell) => {
    if (seen.has(c)) return;
    seen.add(c);
    ordered.push(c);
    for (const k of children.get(c.id) ?? []) visit(k);
  };
  for (const c of cells) if (!byId.has(c.parent)) visit(c);
  for (const c of cells) visit(c); // anything unreachable (a malformed parent chain) keeps document order

  /** Cells folded into a class/entity/table, mapped to the node that now holds their text. */
  const owner = new Map<string, string>();
  const fold = (id: string, into: string) => {
    for (const k of vertexChildren(id)) {
      if (owner.has(k.id)) continue;
      owner.set(k.id, into);
      fold(k.id, into);
    }
  };
  /** Connectors may attach to a row of a class/entity; they belong to the class/entity itself. */
  const ownerOf = (id: string | null): string | null => (id ? (owner.get(id) ?? id) : null);
  const isRow = (c: Cell) => c.st.names.has('text') || c.st.names.has('label') || c.st.names.has('line');
  /** A class/entity stack: every child is a text or divider row (or a plain leaf of a stack layout). */
  const isStack = (c: Cell) => {
    if (c.st.map.get('shape') === 'table') return true;
    const stack = c.st.map.get('childLayout') === 'stackLayout';
    return vertexChildren(c.id).every((k) => isRow(k) || (stack && !vertexChildren(k.id).length && !k.st.names.has('swimlane')));
  };

  const absolute = (c: Cell): { x: number; y: number } => {
    let pos = { x: x(c), y: y(c) };
    let parent = byId.get(c.parent);
    const visited = new Set<Cell>();
    while (parent?.vertex && !visited.has(parent)) {
      visited.add(parent);
      pos = { x: pos.x + x(parent), y: pos.y + y(parent) };
      parent = byId.get(parent.parent);
    }
    return pos;
  };

  const nodes: SerializedNode[] = [];
  const nodeById = new Map<string, SerializedNode>();
  const edgeLabels = new Map<string, string[]>();

  for (const c of ordered) {
    if (!c.vertex) continue;
    const { id, st } = c;
    // Labels drawn on connectors are child vertices of the edge.
    if (st.names.has('edgeLabel') || byId.get(c.parent)?.edge) {
      edgeLabels.set(c.parent, [...(edgeLabels.get(c.parent) ?? []), htmlToText(c.value)]);
      continue;
    }
    if (owner.has(id)) continue; // a row of a class/entity, already folded into its owner
    if (st.names.has('group')) continue; // groups are flattened; children keep absolute positions
    let shape = shapeFromStyle(st, notes);
    if (st.map.get('shape') === 'image' || st.names.has('image')) notes.add('Images inside diagrams were not imported.');
    let label = htmlToText(c.value);
    let fill: string | undefined;
    if (COMPARTMENT_SHAPES.has(shape) && isStack(c)) {
      fold(id, id);
      const lines = [label];
      let sawContent = false;
      for (const row of vertexChildren(id).sort((a, b) => y(a) - y(b))) {
        if (row.st.names.has('line')) {
          lines.push('--');
          continue;
        }
        const isTableRow = row.st.map.get('shape') === 'tableRow';
        if (!isRow(row) && !isTableRow) notes.add('Shapes inside some class or entity boxes were turned into lines of text.');
        if (!isTableRow && vertexChildren(row.id).length) notes.add('Shapes nested inside the rows of some class or entity boxes were left out.');
        // Table rows hold their text in cells (`PK`, `id`); the cells, left to right, make one line.
        const rowCells = isTableRow ? vertexChildren(row.id).sort((a, b) => x(a) - x(b)) : [];
        const text = rowCells.length
          ? rowCells.map((k) => htmlToText(k.value).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join(' ')
          : htmlToText(row.value);
        if (text || !sawContent) lines.push(...text.split('\n'));
        sawContent = true;
      }
      label = lines.join('\n');
      if (st.map.get('shape') === 'table') notes.add('Tables were imported as entities: the cells of each row became one line of text.');
    } else if (COMPARTMENT_SHAPES.has(shape)) {
      // A swimlane holding real shapes (a process lane, a pool): an outline behind its contents, which are imported
      // as shapes of their own. Transparent, so connectors between those shapes stay visible.
      shape = 'rectangle';
      fill = 'transparent';
      notes.add('Swimlanes were imported as plain boxes drawn behind the shapes they contain.');
    }
    const defaults = shapeDefaults(shape);
    const fontStyle = num(st.map.get('fontStyle'), 0);
    const node: SerializedNode = {
      id,
      position: absolute(c),
      width: num(c.g?.getAttribute('width'), defaults.width),
      height: num(c.g?.getAttribute('height'), defaults.height),
      data: {
        ...defaults,
        shape,
        label,
        fill: fill ?? colorOf(st.map.get('fillColor'), defaults.fill),
        stroke: colorOf(st.map.get('strokeColor'), defaults.stroke),
        textColor: colorOf(st.map.get('fontColor'), defaults.textColor),
        fontSize: num(st.map.get('fontSize'), defaults.fontSize),
        strokeWidth: num(st.map.get('strokeWidth'), defaults.strokeWidth),
        dashed: st.map.get('dashed') === '1',
        bold: (fontStyle & 1) === 1 && !COMPARTMENT_SHAPES.has(shape) && shape !== 'package' ? true : defaults.bold,
      },
    };
    nodes.push(node);
    nodeById.set(id, node);
  }

  const edges: SerializedEdge[] = [];
  let dropped = 0;
  let loops = 0;
  for (const c of cells) {
    if (!c.edge) continue;
    const source = ownerOf(c.source);
    const target = ownerOf(c.target);
    const a = source ? nodeById.get(source) : undefined;
    const b = target ? nodeById.get(target) : undefined;
    if (!a || !b) {
      dropped++;
      continue;
    }
    // Two rows of one class folded into the same shape would make a loop the user never drew: leave those out.
    // A loop the file really has (same source and target) is kept.
    if (a === b && c.source !== c.target) {
      loops++;
      continue;
    }
    const { st } = c;
    const [fallbackS, fallbackT] = facing(a, b);
    const start = markerFromStyle(st, 'start', 'none');
    const end = markerFromStyle(st, 'end', 'arrow');
    const data: ConnectorData = {
      ...DEFAULT_CONNECTOR,
      color: colorOf(st.map.get('strokeColor'), DEFAULT_CONNECTOR.color),
      width: num(st.map.get('strokeWidth'), DEFAULT_CONNECTOR.width),
      dashed: st.map.get('dashed') === '1',
      arrow: end === 'none' ? (start === 'none' ? 'none' : 'end') : start === 'arrow' && end === 'arrow' ? 'both' : 'end',
      startMarker: start,
      endMarker: end,
    };
    const { id } = c;
    const label = [htmlToText(c.value), ...(edgeLabels.get(id) ?? [])].filter(Boolean).join(' ');
    edges.push({
      id,
      source: a.id,
      target: b.id,
      sourceHandle: handleFrom(st.map.get('exitX'), st.map.get('exitY')) ?? fallbackS,
      targetHandle: handleFrom(st.map.get('entryX'), st.map.get('entryY')) ?? fallbackT,
      type: lineFromStyle(st),
      label,
      data,
    });
  }
  if (dropped) notes.add(`${dropped} connector${dropped === 1 ? '' : 's'} not attached to shapes at both ends were left out.`);
  if (loops) notes.add(`${loops} connector${loops === 1 ? '' : 's'} between rows of the same class or entity ${loops === 1 ? 'was' : 'were'} left out.`);
  if (!nodes.length) throw new DrawioImportError('The diagram has no shapes that could be imported.');

  return {
    content: { schemaVersion: DIAGRAM_SCHEMA, nodes, edges, viewport: null, settings: { ...DEFAULT_SETTINGS } },
    report: { title, nodes: nodes.length, edges: edges.length, notes: [...notes] },
  };
}
