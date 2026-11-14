import { inflateSync, strFromU8 } from 'fflate';
import {
  COMPARTMENT_SHAPES,
  DEFAULT_CONNECTOR,
  DEFAULT_SETTINGS,
  edgeMarkers,
  shapeDefaults,
  splitCompartments,
  type ConnectorData,
  type DiagramContent,
  type DiagramLayer,
  type EdgeLineType,
  type MarkerKind,
  type SerializedEdge,
  type SerializedNode,
  type ShapeKind,
} from './types';
import {
  DRAWIO_ARROWS,
  DRAWIO_EDGE_READERS,
  DRAWIO_EDGE_STYLE_WRITERS,
  DRAWIO_EXPORT_LOSSES,
  DRAWIO_SHAPE_KEYS,
  DRAWIO_VERTEX_READERS,
  DRAWIO_VERTEX_STYLE_WRITERS,
  LINE_TO_DRAWIO,
  MARKER_TO_DRAWIO,
  type DrawioCell,
  type DrawioImportContext,
  type DrawioStyle,
} from './drawioRegistry';
import { schemaFor, SCHEMA2_VOCABULARY } from './compat';
import { CONNECTOR_DATA_READERS, parentsFirst, SHAPE_DATA_READERS, validParents, type Point } from './model';
import {
  endFromStyle,
  endStyle,
  labelGeometryX,
  nameOf,
  readLabelPlace,
  readPoints,
  richText,
  splitProperties,
  swimlaneKind,
  tally,
  tallyNotes,
} from './drawioFeatures';
import { shapeDef } from './shapeRegistry';

/*
 * diagrams.net (draw.io) interchange. Files are mxGraph XML, either plain or with each page deflated + base64.
 * Export writes plain XML that diagrams.net opens directly. Every exported cell carries a `dcosShape` style key
 * (diagrams.net keeps unknown style keys), so our own files round-trip exactly; files drawn in diagrams.net are
 * mapped from its standard style names, and anything that cannot be represented is listed in the import report.
 */

// ── Export ───────────────────────────────────────────────────────────────────────────────────────────

const ROW_STYLE =
  'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;';
const LINE_STYLE = 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;';

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

/** The exported style of a kind; a kind this version does not know is written as a rectangle. */
const baseStyle = (kind: string) => (shapeDef(kind) ?? shapeDef('rectangle')!).drawioStyle;

function vertexStyle(node: SerializedNode) {
  const d = node.data;
  let style = `${baseStyle(d.shape)}dcosShape=${d.shape};fillColor=${color(d.fill)};strokeColor=${color(d.stroke)};fontColor=${d.textColor};fontSize=${d.fontSize};strokeWidth=${d.strokeWidth};`;
  if (d.dashed) style += 'dashed=1;';
  if (d.bold && !COMPARTMENT_SHAPES.has(d.shape) && d.shape !== 'package') style += 'fontStyle=1;';
  // A group is drawn invisible here; without this diagrams.net would paint its stored colours as a box.
  if (d.shape === 'group') style += 'fillColor=none;strokeColor=none;';
  for (const write of DRAWIO_VERTEX_STYLE_WRITERS) style += write(node);
  return style;
}

function edgeStyle(edge: SerializedEdge) {
  const d = { ...DEFAULT_CONNECTOR, ...edge.data };
  const { start, end } = edgeMarkers(d);
  const s = MARKER_TO_DRAWIO[start];
  const e = MARKER_TO_DRAWIO[end];
  let style = `${LINE_TO_DRAWIO[edge.type] ?? LINE_TO_DRAWIO.smoothstep}html=1;dcosLine=${edge.type};strokeColor=${d.color};strokeWidth=${d.width};startArrow=${s.arrow};startFill=${s.fill};endArrow=${e.arrow};endFill=${e.fill};dcosStart=${start};dcosEnd=${end};`;
  if (d.dashed) style += 'dashed=1;';
  // Side handles as exit/entry points, fixed ports as their exact point, perimeter ports as floating ends.
  style += endStyle(edge, 'source') + endStyle(edge, 'target');
  for (const write of DRAWIO_EDGE_STYLE_WRITERS) style += write(edge);
  return style;
}

const KNOWN_SHAPE_DATA = new Set<string>([...SCHEMA2_VOCABULARY.shapeDataFields, ...Object.keys(SHAPE_DATA_READERS)]);
const KNOWN_CONNECTOR_DATA = new Set<string>([...SCHEMA2_VOCABULARY.connectorDataFields, ...Object.keys(CONNECTOR_DATA_READERS)]);
const unknownFields = (data: object | undefined, known: Set<string>) => !!data && Object.entries(data).some(([k, v]) => v !== undefined && !known.has(k));

/**
 * What a `toDrawio` export of `content` leaves out or changes, one plain sentence each; empty when the file holds
 * everything. Shown in the export toast. Each entry of DRAWIO_EXPORT_LOSSES, plus kinds, line types and fields that
 * this version does not know (from a newer version).
 */
export function drawioExportNotes(content: DiagramContent): string[] {
  const notes: string[] = [];
  for (const loss of DRAWIO_EXPORT_LOSSES) {
    const n = loss.count(content);
    if (n > 0) notes.push(loss.note(n));
  }
  const unknownKinds = content.nodes.filter((n) => !shapeDef(n.data.shape)).length;
  if (unknownKinds) notes.push(`${unknownKinds} ${unknownKinds === 1 ? 'shape of a kind' : 'shapes of kinds'} this version does not know ${unknownKinds === 1 ? 'was' : 'were'} written as ${unknownKinds === 1 ? 'a rectangle' : 'rectangles'}.`);
  const unknownLines = content.edges.filter((e) => !LINE_TO_DRAWIO[e.type]).length;
  if (unknownLines) notes.push(`${unknownLines} ${unknownLines === 1 ? 'connector of a line type' : 'connectors of line types'} this version does not know ${unknownLines === 1 ? 'was' : 'were'} written as rounded elbow lines.`);
  const extra = content.nodes.filter((n) => unknownFields(n.data, KNOWN_SHAPE_DATA)).length + content.edges.filter((e) => unknownFields(e.data, KNOWN_CONNECTOR_DATA)).length;
  if (extra) notes.push(`Settings from a newer version on ${extra} ${extra === 1 ? 'shape or connector were' : 'shapes or connectors were'} left out.`);
  return notes;
}

/** A cell, wrapped in `<UserObject>` when the shape has a link, tooltip or custom properties (diagrams.net's own form). */
function cellXml(node: SerializedNode, label: string, attrs: string, geometry: string): string {
  const d = node.data;
  const { kept } = splitProperties(d.properties);
  if (!d.link && !d.tooltip && !kept.length) return `<mxCell id="${xmlEscape(node.id)}" value="${xmlEscape(label)}" ${attrs}>${geometry}</mxCell>`;
  let wrapper = `<UserObject label="${xmlEscape(label)}"`;
  if (d.link) wrapper += ` link="${xmlEscape(d.link)}"`;
  if (d.tooltip) wrapper += ` tooltip="${xmlEscape(d.tooltip)}"`;
  for (const [k, v] of kept) wrapper += ` ${k}="${xmlEscape(v)}"`;
  return `${wrapper} id="${xmlEscape(node.id)}"><mxCell ${attrs}>${geometry}</mxCell></UserObject>`;
}

/**
 * Serialises a diagram as a diagrams.net file (plain, uncompressed mxGraph XML). Groups are written as diagrams.net
 * groups (their shapes inside them, at positions relative to the group, as stored), layers as layers (hidden and
 * locked as in the diagram), hidden shapes with visible="0", and links, tooltips and properties on a `<UserObject>`.
 * What the file still cannot hold is listed by `drawioExportNotes`.
 */
export function toDrawio(content: DiagramContent, title = 'Diagram'): string {
  const nodes = parentsFirst(content.nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = validParents(nodes);
  const containers = new Set(parentOf.values());
  const used = new Set<string>(['0', ...nodes.map((n) => n.id), ...content.edges.map((e) => e.id)]);
  const cells: string[] = ['<mxCell id="0" />'];

  // One diagrams.net layer per layer, bottom first; without layers, the single default layer "1".
  const layerCell = new Map<string, string>();
  const layers = content.layers?.length ? content.layers : null;
  if (layers) {
    layers.forEach((l, i) => {
      let id = l.id;
      for (let k = i + 1; used.has(id); k++) id = `layer-${k}`;
      used.add(id);
      layerCell.set(l.id, id);
      cells.push(`<mxCell id="${xmlEscape(id)}" value="${xmlEscape(htmlEscape(l.name))}"${l.locked ? ' style="locked=1;"' : ''} parent="0"${l.visible ? '' : ' visible="0"'} />`);
    });
  } else cells.push('<mxCell id="1" parent="0" />');
  const firstLayer = layers ? layerCell.get(layers[0].id)! : '1';
  /** The outermost group a shape is in (itself when in none): its layer is the layer of every shape inside it. */
  const top = (n: SerializedNode) => {
    let t = n;
    for (let p = parentOf.get(t.id); p !== undefined; p = parentOf.get(t.id)) t = byId.get(p)!;
    return t;
  };
  const layerOf = (n: SerializedNode) => {
    const t = top(n);
    return (t.layer && layerCell.get(t.layer)) || firstLayer;
  };

  // @phase5:drawio-export — real group, layer and hidden cells, and UserObject wrappers for links and properties, go here.
  for (const node of nodes) {
    // Positions are stored relative to the group a shape is in, which is also how diagrams.net stores children.
    const { x, y } = node.position;
    const id = xmlEscape(node.id);
    const parent = parentOf.get(node.id) ?? layerOf(node);
    let style = vertexStyle(node);
    if (containers.has(node.id) && node.data.shape !== 'group') style += 'container=1;';
    const attrs = `style="${xmlEscape(style)}" vertex="1" parent="${xmlEscape(parent)}"${node.hidden ? ' visible="0"' : ''}`;
    const geometry = `<mxGeometry x="${r(x)}" y="${r(y)}" width="${r(node.width)}" height="${r(node.height)}" as="geometry" />`;
    if (COMPARTMENT_SHAPES.has(node.data.shape)) {
      const { header, sections } = splitCompartments(node.data.label);
      cells.push(cellXml(node, htmlEscape(header), attrs, geometry));
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
      cells.push(cellXml(node, node.data.label.split('\n').map(htmlEscape).join('<br>'), attrs, geometry));
    }
  }
  for (const edge of content.edges) {
    // Connectors go on the layer of the shape they start from; bend points are canvas coordinates, as is a layer's.
    const source = byId.get(edge.source);
    const parent = source ? layerOf(source) : firstLayer;
    const position = edge.data?.labelPosition;
    const gx = position !== undefined && position !== 0.5 ? ` x="${labelGeometryX(position)}"` : '';
    const points = edge.data?.waypoints?.length ? `<Array as="points">${edge.data.waypoints.map((p) => `<mxPoint x="${r(p.x)}" y="${r(p.y)}" />`).join('')}</Array>` : '';
    cells.push(
      `<mxCell id="${xmlEscape(edge.id)}" value="${xmlEscape(htmlEscape(edge.label ?? ''))}" style="${xmlEscape(edgeStyle(edge))}" edge="1" parent="${xmlEscape(parent)}" source="${xmlEscape(edge.source)}" target="${xmlEscape(edge.target)}">` +
        (points ? `<mxGeometry relative="1"${gx} as="geometry">${points}</mxGeometry>` : `<mxGeometry relative="1"${gx} as="geometry" />`) +
        '</mxCell>',
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

type Style = DrawioStyle;

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

/** Shape from the generic style names (`ellipse;`, `rhombus;` …), ignoring any specific `shape=` key. */
function shapeFromNames(st: Style): ShapeKind {
  const n = st.names;
  if (n.has('swimlane')) return st.map.get('rounded') === '1' ? 'erEntity' : 'umlClass';
  if (n.has('group')) return 'group';
  if (n.has('image')) return 'image';
  if (n.has('ellipse')) return st.map.get('aspect') === 'fixed' ? 'circle' : 'ellipse';
  if (n.has('rhombus')) return 'diamond';
  if (n.has('triangle')) return 'triangle';
  if (n.has('text') || n.has('label')) return 'text';
  return st.map.get('rounded') === '1' ? 'rounded' : 'rectangle';
}

const KIND_NAMES: Partial<Record<ShapeKind, string>> = { ellipse: 'ellipses', rectangle: 'rectangles', rounded: 'rounded rectangles', diamond: 'diamonds' };

function shapeFromStyle(st: Style, notes: Set<string>): ShapeKind {
  const tagged = st.map.get('dcosShape') as ShapeKind | undefined;
  if (tagged && shapeDef(tagged)) return tagged;
  // A specific `shape=` wins over generic names: `ellipse;shape=cloud` is a cloud, not an ellipse.
  const shape = st.map.get('shape');
  if (shape) {
    const known = Object.hasOwn(DRAWIO_SHAPE_KEYS, shape) ? DRAWIO_SHAPE_KEYS[shape] : undefined;
    if (known) return known === 'umlClass' ? shapeFromNames(st) : known === 'ellipse' && st.map.get('aspect') === 'fixed' ? 'circle' : known;
    const fallback = shapeFromNames(st);
    notes.add(`Shapes of type “${shape}” were imported as ${KIND_NAMES[fallback] ?? fallback}.`);
    return fallback;
  }
  return shapeFromNames(st);
}

function markerFromStyle(st: Style, end: 'start' | 'end', fallback: MarkerKind): MarkerKind {
  const tagged = st.map.get(end === 'start' ? 'dcosStart' : 'dcosEnd') as MarkerKind | undefined;
  if (tagged && Object.hasOwn(MARKER_TO_DRAWIO, tagged)) return tagged;
  const arrow = st.map.get(end === 'start' ? 'startArrow' : 'endArrow');
  const filled = st.map.get(end === 'start' ? 'startFill' : 'endFill') !== '0';
  if (arrow === undefined) return fallback;
  return Object.hasOwn(DRAWIO_ARROWS, arrow) ? DRAWIO_ARROWS[arrow](filled) : 'arrow';
}

function lineFromStyle(st: Style): EdgeLineType {
  const tagged = st.map.get('dcosLine') as EdgeLineType | undefined;
  if (tagged && Object.hasOwn(LINE_TO_DRAWIO, tagged)) return tagged;
  const es = st.map.get('edgeStyle');
  if (st.map.get('curved') === '1') return 'default';
  if (!es || es === 'none') return 'straight';
  return st.map.get('rounded') === '0' ? 'step' : 'smoothstep';
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

type Cell = DrawioCell;

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
      wrapper,
      el,
    };
  });
}

/** The pages of a diagrams.net file, by name, in file order (a bare mxGraphModel is one unnamed page). */
export function drawioPages(text: string): string[] {
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DrawioImportError('This file is not valid diagrams.net XML.');
  const root = doc.documentElement;
  if (root.nodeName === 'mxGraphModel') return [''];
  if (root.nodeName !== 'mxfile') throw new DrawioImportError('This is not a diagrams.net file.');
  return Array.from(root.getElementsByTagName('diagram')).map((d, i) => d.getAttribute('name') || `Page-${i + 1}`);
}

export interface DrawioImportOptions {
  /** Which page to import (0-based). Default: the first. */
  page?: number;
}

/**
 * Reads a diagrams.net / draw.io file (.drawio, .xml, plain or compressed): one page, the first unless `options.page`
 * names another. Groups, containers and swimlanes keep their shapes inside them; layers, hidden cells, locks, links,
 * tooltips, custom properties, rotation, opacity, fonts, alignment, pictures, bend points, connection points and label
 * positions are kept. Everything approximated or left out is named in `report.notes` (DS-R1).
 */
export function fromDrawio(text: string, options: DrawioImportOptions = {}): { content: DiagramContent; report: DrawioImportReport } {
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DrawioImportError('This file is not valid diagrams.net XML.');
  const root = doc.documentElement;
  const notes = new Set<string>();
  const ctx: DrawioImportContext = { notes };
  let title = 'Imported diagram';
  let model: Element;
  let pageId: string | null = null;
  if (root.nodeName === 'mxfile') {
    const pages = Array.from(root.getElementsByTagName('diagram'));
    if (!pages.length) throw new DrawioImportError('The file contains no diagram pages.');
    const index = options.page ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new DrawioImportError(`The file has no page ${index + 1}.`);
    const names = pages.map((d, i) => d.getAttribute('name') || `Page-${i + 1}`);
    title = pages[index].getAttribute('name') || title;
    if (pages.length > 1) {
      const others = names.filter((_, i) => i !== index).map((n) => `“${n}”`);
      const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`;
      notes.add(
        index === 0
          ? `Only the first page (“${names[0]}”) was imported; the file has ${pages.length} pages. The ${others.length === 1 ? 'other page' : 'other pages'}, ${list}, ${others.length === 1 ? 'was' : 'were'} not imported.`
          : `Only page ${index + 1} (“${names[index]}”) was imported; the file has ${pages.length} pages. The ${others.length === 1 ? 'other page' : 'other pages'}, ${list}, ${others.length === 1 ? 'was' : 'were'} not imported.`,
      );
    }
    pageId = pages[index].getAttribute('id');
    model = decodePage(pages[index]);
  } else if (root.nodeName === 'mxGraphModel') {
    model = root;
  } else {
    throw new DrawioImportError('This is not a diagrams.net file.');
  }

  const cells = readCells(model);
  const byId = new Map(cells.map((c) => [c.id, c]));
  const children = new Map<string, Cell[]>();
  // Appended in place: copying the list for every cell was quadratic on large flat files (TD-20).
  for (const c of cells) {
    const list = children.get(c.parent);
    if (list) list.push(c);
    else children.set(c.parent, [c]);
  }
  const vertexChildren = (id: string) => (children.get(id) ?? []).filter((k) => k.vertex);
  /**
   * A vertex with relative geometry inside another vertex (diagrams.net's BPMN boundary events, badges on a border):
   * x and y are fractions of the parent's size, plus an offset point. Edges keep their own relative geometry.
   */
  const relativeIn = (c: Cell): Cell | undefined => {
    if (!c.vertex || c.g?.getAttribute('relative') !== '1') return undefined;
    const parent = byId.get(c.parent);
    return parent?.vertex ? parent : undefined;
  };
  const offsetOf = (c: Cell) => Array.from(c.g?.children ?? []).find((k) => k.nodeName === 'mxPoint' && k.getAttribute('as') === 'offset');
  const along = (c: Cell, axis: 'x' | 'y'): number => {
    const v = num(c.g?.getAttribute(axis), 0);
    const parent = relativeIn(c);
    if (!parent) return v;
    const size = num(parent.g?.getAttribute(axis === 'x' ? 'width' : 'height'), 0);
    return size * v + num(offsetOf(c)?.getAttribute(axis), 0);
  };
  const y = (c: Cell) => along(c, 'y');
  const x = (c: Cell) => along(c, 'x');
  const isHidden = (c: Cell) => c.el?.getAttribute('visible') === '0';

  // Layers: the cells directly under the root cell (diagrams.net's "0"). Shapes belong to the layer they sit under.
  const isRoot = (c: Cell | undefined) => !!c && !c.vertex && !c.edge && !byId.has(c.parent);
  const layerCells = cells.filter((c) => !c.vertex && !c.edge && isRoot(byId.get(c.parent)));
  const layerIds = new Set(layerCells.map((c) => c.id));
  const layerOf = (c: Cell): Cell | undefined => {
    const visited = new Set<Cell>();
    for (let k: Cell | undefined = c; k && !visited.has(k); k = byId.get(k.parent)) {
      if (layerIds.has(k.id)) return k;
      visited.add(k);
    }
    return undefined;
  };
  const hasLayers = layerCells.length > 1 || layerCells.some((l) => isHidden(l) || l.st.map.get('locked') === '1');
  const layers: DiagramLayer[] | undefined = hasLayers
    ? layerCells.map((l, i) => ({ id: l.id, name: htmlToText(l.value).trim() || (i === 0 ? 'Background' : `Layer ${i + 1}`), visible: !isHidden(l), locked: l.st.map.get('locked') === '1' }))
    : undefined;
  const hiddenLayer = (c: Cell) => {
    const l = layerOf(c);
    return !!l && isHidden(l);
  };
  if (layers) for (const l of layers) if (!l.visible) tally(ctx, 'hiddenLayers', l.name);

  // diagrams.net paints a container, then its contents, then the next sibling. React Flow paints nodes in array
  // order, so visiting the cell tree depth-first keeps every container behind the shapes inside it. A file that
  // already lists every cell after its parent (diagrams.net writes depth-first; our export writes the diagram's own
  // order) is read in its own order, so a diagram exported here comes back in the order it was stored.
  let ordered: Cell[] = [];
  const position = new Map(cells.map((c, i) => [c.id, i]));
  if (cells.every((c, i) => !byId.has(c.parent) || (position.get(c.parent) ?? i) < i)) ordered = cells;
  else {
    const seen = new Set<Cell>();
    const visit = (c: Cell) => {
      if (seen.has(c)) return;
      seen.add(c);
      ordered.push(c);
      for (const k of children.get(c.id) ?? []) visit(k);
    };
    for (const c of cells) if (!byId.has(c.parent)) visit(c);
    for (const c of cells) visit(c); // anything unreachable (a malformed parent chain) keeps document order
  }

  /** Cells folded into a class/entity/table, mapped to the node that now holds their text. */
  const owner = new Map<string, string>();
  const fold = (id: string, into: string) => {
    for (const k of vertexChildren(id)) {
      if (owner.has(k.id)) continue;
      owner.set(k.id, into);
      if (isHidden(k)) tally(ctx, 'hiddenRows');
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
    const kids = vertexChildren(c.id);
    // An empty swimlane in a pool (or a vertical-title swimlane without a stack layout) is an empty lane, not a class.
    if (!kids.length && !stack) {
      const parent = byId.get(c.parent);
      if ((parent?.vertex && isSwimlane(parent)) || c.st.map.get('horizontal') === '0') return false;
    }
    return kids.every((k) => isRow(k) || (stack && !vertexChildren(k.id).length && !k.st.names.has('swimlane')));
  };
  const isSwimlane = (c: Cell) => c.st.names.has('swimlane') || c.st.map.get('shape') === 'swimlane';

  const absolute = (c: Cell): Point => {
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
  /** The canvas origin of a cell's coordinates: its parent's absolute position (0,0 on a layer). */
  const originOf = (c: Cell): Point => {
    const parent = byId.get(c.parent);
    return parent?.vertex ? absolute(parent) : { x: 0, y: 0 };
  };

  const nodes: SerializedNode[] = [];
  const nodeById = new Map<string, SerializedNode>();
  const edgeLabels = new Map<string, Cell[]>();
  /** Labels as plain text, counting what the HTML held beyond text. */
  const labelText = (c: Cell) => {
    const rt = richText(c.value);
    if (rt.formatted) tally(ctx, 'richText');
    for (let i = 0; i < rt.images; i++) tally(ctx, 'labelImages');
    return { text: htmlToText(rt.inner), bold: rt.wholeBold };
  };

  for (const c of ordered) {
    if (!c.vertex) continue;
    const { id, st } = c;
    // Labels drawn on connectors are child vertices of the edge.
    if (st.names.has('edgeLabel') || byId.get(c.parent)?.edge) {
      const labels = edgeLabels.get(c.parent);
      if (labels) labels.push(c);
      else edgeLabels.set(c.parent, [c]);
      continue;
    }
    if (owner.has(id)) continue; // a row of a class/entity, already folded into its owner
    let shape = shapeFromStyle(st, notes);
    const { text, bold: wholeBold } = labelText(c);
    let label = text;
    let fill: string | undefined;
    let swimlaneAlign: Pick<SerializedNode['data'], 'textAlign' | 'verticalAlign'> = {};
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
          ? rowCells.map((k) => labelText(k).text.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join(' ')
          : labelText(row).text;
        if (text || !sawContent) lines.push(...text.split('\n'));
        sawContent = true;
      }
      label = lines.join('\n');
      if (st.map.get('shape') === 'table') notes.add('Tables were imported as entities: the cells of each row became one line of text.');
    } else if (COMPARTMENT_SHAPES.has(shape)) {
      // A swimlane holding real shapes (a process lane, a pool): a container that holds its shapes. As the BPMN pool
      // or lane kind when one is registered (DRAWIO_SWIMLANE_KINDS), otherwise as a transparent outline, so the
      // connectors between the shapes inside stay visible.
      const role = vertexChildren(id).some(isSwimlane) ? 'pool' : 'lane';
      const kind = swimlaneKind(role);
      if (kind) {
        shape = kind;
        // The pool and lane kinds draw their title band on the left (diagrams.net's horizontal=0).
        if (st.map.get('horizontal') !== '0') tally(ctx, 'swimlaneTitles');
      } else {
        shape = 'rectangle';
        fill = 'transparent';
        // The title sits in the band at the top (or, for horizontal=0, the left) as in diagrams.net.
        swimlaneAlign = st.map.get('horizontal') === '0' ? { textAlign: 'left' } : { verticalAlign: 'top' };
        tally(ctx, 'swimlanes');
      }
    }
    // The default size is the geometry fallback only; it is not part of the shape's data.
    const { width: defaultWidth, height: defaultHeight, ...defaults } = shapeDefaults(shape);
    const fontStyle = num(st.map.get('fontStyle'), 0);
    const boldAllowed = !COMPARTMENT_SHAPES.has(shape) && shape !== 'package';
    // A shape inside a group or container keeps its position relative to it (diagrams.net and React Flow agree).
    const parent = byId.get(c.parent);
    const parentNode = parent?.vertex ? nodeById.get(parent.id) : undefined;
    const node: SerializedNode = {
      id,
      position: parentNode ? { x: x(c), y: y(c) } : absolute(c),
      width: num(c.g?.getAttribute('width'), defaultWidth),
      height: num(c.g?.getAttribute('height'), defaultHeight),
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
        bold: ((fontStyle & 1) === 1 || wholeBold) && boldAllowed ? true : defaults.bold,
      },
    };
    if (parentNode) node.parentId = parentNode.id;
    if (parentNode && relativeIn(c)) tally(ctx, 'relativeChildren');
    // With layers, every shape names its layer (as the editor stores it once a diagram has layers).
    if (layers) {
      const layer = layerOf(c);
      if (layer) node.layer = layer.id;
    }
    // Hidden in the file: the cell itself, or a group it is in. A hidden layer hides its shapes as a layer.
    if (isHidden(c) || parentNode?.hidden) {
      node.hidden = true;
      tally(ctx, 'hiddenShapes', nameOf(label) || undefined);
    }
    // A collapsed container is stored at its folded size; it opens at its full size (`alternateBounds`).
    if (c.el?.getAttribute('collapsed') === '1' && vertexChildren(id).length) {
      tally(ctx, 'collapsed');
      const full = Array.from(c.g?.children ?? []).find((k) => k.getAttribute('as') === 'alternateBounds');
      if (full) {
        node.width = num(full.getAttribute('width'), node.width);
        node.height = num(full.getAttribute('height'), node.height);
      }
    }
    for (const read of DRAWIO_VERTEX_READERS) read(c, node, ctx);
    // A swimlane outline's title placement, unless the file set an alignment of its own.
    if (swimlaneAlign.textAlign && !node.data.textAlign) node.data.textAlign = swimlaneAlign.textAlign;
    if (swimlaneAlign.verticalAlign && !node.data.verticalAlign) node.data.verticalAlign = swimlaneAlign.verticalAlign;
    nodes.push(node);
    nodeById.set(id, node);
  }

  const edges: SerializedEdge[] = [];
  let dropped = 0;
  let toEdges = 0;
  let loops = 0;
  for (const c of cells) {
    if (!c.edge) continue;
    const source = ownerOf(c.source);
    const target = ownerOf(c.target);
    const a = source ? nodeById.get(source) : undefined;
    const b = target ? nodeById.get(target) : undefined;
    if (!a || !b) {
      // DS-R7: say why. A connector that ends on another connector is a different case from one left loose.
      if ((source && byId.get(source)?.edge) || (target && byId.get(target)?.edge)) toEdges++;
      else dropped++;
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
    // Labels: the connector's own, then label cells on it. The position comes from the first label with text.
    const childLabels = (edgeLabels.get(id) ?? []).map((k) => ({ cell: k, text: labelText(k).text }));
    const own = { cell: c, text: labelText(c).text };
    const withText = [own, ...childLabels].filter((l) => l.text);
    if (withText.length > 1) tally(ctx, 'multipleLabels');
    const label = withText.map((l) => l.text).join(' ');
    if (withText.length) {
      const place = readLabelPlace(withText[0].cell.g);
      if (place.position !== undefined) data.labelPosition = place.position;
      if (place.offset) tally(ctx, 'labelOffsets');
    }
    // Bend points are stored in the coordinates of the connector's parent; here they are canvas coordinates.
    const { points, tooMany } = readPoints(c.g);
    if (points.length) {
      const o = originOf(c);
      data.waypoints = points.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    }
    if (tooMany) tally(ctx, 'tooManyPoints');
    const s = endFromStyle(st, 'source');
    const t = endFromStyle(st, 'target');
    if (s.port) data.sourcePort = s.port;
    if (t.port) data.targetPort = t.port;
    if (s.offset || t.offset) tally(ctx, 'pointOffsets');
    const edge: SerializedEdge = {
      id,
      source: a.id,
      target: b.id,
      sourceHandle: s.handle ?? fallbackS,
      targetHandle: t.handle ?? fallbackT,
      type: lineFromStyle(st),
      label,
      data,
    };
    if (isHidden(c)) tally(ctx, 'hiddenEdges', nameOf(label) || undefined);
    else if (hiddenLayer(c) && !a.hidden && !b.hidden && !hiddenLayer(byId.get(a.id)!) && !hiddenLayer(byId.get(b.id)!)) tally(ctx, 'edgesOnHiddenLayers');
    for (const read of DRAWIO_EDGE_READERS) read(c, edge, ctx);
    edges.push(edge);
  }
  if (dropped) notes.add(`${dropped} ${dropped === 1 ? 'connector' : 'connectors'} not attached to shapes at both ends ${dropped === 1 ? 'was' : 'were'} left out.`);
  for (let i = 0; i < toEdges; i++) tally(ctx, 'edgeToEdge');
  if (loops) notes.add(`${loops} connector${loops === 1 ? '' : 's'} between rows of the same class or entity ${loops === 1 ? 'was' : 'were'} left out.`);
  if (!nodes.length) throw new DrawioImportError('The diagram has no shapes that could be imported.');

  // Links to another page of the file lead nowhere here, since only one page is imported.
  for (const n of nodes) {
    const target = /^data:page\/id,(.*)$/i.exec(n.data.link ?? '')?.[1];
    if (target !== undefined && target !== pageId) tally(ctx, 'pageLinks');
  }

  const content: DiagramContent = { schemaVersion: 2, nodes, edges, viewport: null, settings: { ...DEFAULT_SETTINGS }, ...(layers ? { layers } : {}) };
  content.schemaVersion = schemaFor(content);
  return {
    content,
    report: { title, nodes: nodes.length, edges: edges.length, notes: [...notes, ...tallyNotes(ctx)] },
  };
}
