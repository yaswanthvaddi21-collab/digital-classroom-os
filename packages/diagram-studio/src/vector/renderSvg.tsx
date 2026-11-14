/**
 * Model-to-SVG renderer (Phase 5, G-EXPORT; audit DS-R3, TD-22). Draws a diagram from its stored content, not from
 * the canvas: shapes as SVG geometry (the same `SHAPE_RENDERERS` the canvas uses), labels as `<text>` with line
 * breaking, connectors as paths from the canvas's own path functions (`EDGE_PATHS`) with shared `<marker>`
 * definitions (`MarkerDefs`), groups, rotation, links and tooltips. No `<foreignObject>`, no HTML, no CSS classes:
 * the file opens in any SVG viewer, and the same SVG feeds the PNG (drawn on a canvas) and the vector PDF (svg2pdf).
 *
 * Left out, as on the canvas: hidden shapes, shapes on hidden layers, and connectors attached to either. Each is
 * named in the export notes, as is anything drawn approximately (a shape or line style from a newer version).
 */
import type { EdgeProps } from '@xyflow/react';
import { connectorGeometry, handleEnd } from '../connect/geometry';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EDGE_PATHS, MarkerDefs, markerId, MarkerScopeContext } from '../edges';
import { canvasPosition, isSafeLink, type Point } from '../model';
import { shapeDef } from '../shapeRegistry';
import { labelBoxStyle, shapeOpacity } from '../shapePresentation';
import { labelInset, SHAPE_RENDERERS, type ShapeGeometry, type ShapeRenderer } from '../shapes';
import {
  COMPARTMENT_SHAPES,
  DEFAULT_CONNECTOR,
  edgeMarkers,
  EDGE_LINE_TYPES,
  shapeDefaults,
  splitCompartments,
  type Connector,
  type ConnectorData,
  type DiagramContent,
  type EdgeLineType,
  type SerializedEdge,
  type SerializedNode,
  type ShapeData,
  type ShapeKind,
  type ShapeNode,
} from '../types';
import { renderNodes } from '../editor/canvasModel';
import { pathBounds, pathEnds } from './pathGeometry';
import { baselineOffset, ellipsize, labelBox, measureText, MONO_FAMILY, pdfFontCanShow, SANS_FAMILY, wrapText, type Box } from './textLayout';

/** Space around the drawing, in CSS pixels (the same as the earlier image exports). */
export const EXPORT_PADDING = 40;

/** How far outside the shape a connector ends (connect/geometry.ts; checked against the canvas by e2e/diagram-export.spec.ts). */
export { HANDLE_OUTSET } from '../connect/geometry';

export interface SvgExportOptions {
  /**
   * Only these shapes (and the shapes inside them), with the connectors between them. A selected connector whose
   * other end is not included is not drawn (it would end in mid-air). `edges` is accepted for callers that pass
   * the whole selection; connectors are decided by their ends.
   */
  selection?: { nodes: Iterable<string>; edges?: Iterable<string> };
  /** Page colour behind the drawing; `null` leaves it transparent. Default white. */
  background?: string | null;
  padding?: number;
  /**
   * Draw connector ends as plain shapes at each end instead of `<marker>` references. For the PDF: svg2pdf scales
   * markers by the line width even when they are in user units, so they would come out too large.
   */
  inlineMarkers?: boolean;
  /** Size written on the root element (for drawing a PNG at a pixel ratio); the viewBox stays the same. */
  outputWidth?: number;
  outputHeight?: number;
  /** Only items that overlap this part of the drawing (flow coordinates), for PDF tiles. */
  region?: Box;
  /** Document title written as the SVG's `<title>`. */
  title?: string;
  /** Prefix for marker ids. */
  idPrefix?: string;
}

/** Counts behind the notes, for callers that word their own (PNG cannot hold links, for example). */
export interface SvgExportStats {
  shapes: number;
  connectors: number;
  hiddenShapes: number;
  hiddenLayerShapes: number;
  hiddenConnectors: number;
  unknownShapes: number;
  unknownLineTypes: number;
  undrawableConnectors: number;
  links: number;
  tooltips: number;
  /** Labels with characters the PDF's built-in fonts cannot show. */
  nonLatinLabels: number;
}

export interface SvgExport {
  svg: string;
  /** Natural size in CSS pixels (the drawing's bounds plus padding). */
  width: number;
  height: number;
  /** The drawing area in flow coordinates (the viewBox). */
  viewBox: Box;
  /** Approximations and omissions, one sentence each, for the export toast. */
  notes: string[];
  stats: SvgExportStats;
}

// ── Extension hooks ────────────────────────────────────────────────────────

/**
 * Hook for shapes whose text is not a plain centred label (G-SHAPES: pool and lane headers with vertical text, for
 * example). Returns SVG elements in the shape's own coordinates, or undefined to use the standard label.
 */
export const SVG_LABEL_RENDERERS: Partial<Record<ShapeKind, (data: ShapeData, w: number, h: number) => ReactNode>> = {};

// ── Scene ──────────────────────────────────────────────────────────────────

interface SceneNode {
  node: SerializedNode;
  data: ShapeData;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  order: number;
  bounds: Bounds;
}
interface SceneEdge {
  edge: SerializedEdge;
  data: ConnectorData;
  path: string;
  labelX: number;
  labelY: number;
  z: number;
  order: number;
  bounds: Bounds;
  label?: { x: number; y: number; width: number; height: number; text: string };
}
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const union = (a: Bounds | null, b: Bounds): Bounds =>
  a ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) } : { ...b };
const overlaps = (b: Bounds, r: Box) => b.maxX >= r.x && b.minX <= r.x + r.width && b.maxY >= r.y && b.minY <= r.y + r.height;

function rotatedBounds(x: number, y: number, w: number, h: number, deg: number): Bounds {
  if (!deg) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  const a = (deg * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([px, py]) => ({ x: cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), y: cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a) }));
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
}

/** The side a stored handle id stands for, or undefined for an id this version does not draw. Null is the first handle (top). */
const handleSide = (id: string | null | undefined) => (id === null || id === undefined ? 't' : (['t', 'r', 'b', 'l'] as const).find((h) => h === id));

const EDGE_LABEL_FONT = 12;
const EDGE_LABEL_PAD: [number, number] = [6, 3];

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  bounds: Bounds | null;
  stats: SvgExportStats;
}

/** Works out what is drawn where: canvas positions, visibility, z-order, connector paths and everything's bounds. */
export function buildScene(content: DiagramContent, opts: Pick<SvgExportOptions, 'selection'> = {}): Scene {
  const stats: SvgExportStats = {
    shapes: 0,
    connectors: 0,
    hiddenShapes: 0,
    hiddenLayerShapes: 0,
    hiddenConnectors: 0,
    unknownShapes: 0,
    unknownLineTypes: 0,
    undrawableConnectors: 0,
    links: 0,
    tooltips: 0,
    nonLatinLabels: 0,
  };
  const all = content.nodes ?? [];
  const byId = new Map(all.map((n) => [n.id, n]));

  // Selection: the chosen shapes, everything inside chosen groups, and the connectors between them.
  let inScope: (id: string) => boolean = () => true;
  if (opts.selection) {
    const chosen = new Set(opts.selection.nodes);
    inScope = (id: string) => {
      const seen = new Set<string>();
      for (let cur: SerializedNode | undefined = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
        if (chosen.has(cur.id)) return true;
        seen.add(cur.id);
      }
      return false;
    };
  }

  // What the canvas draws and in which order, from the canvas's own rules (G-CANVAS renderNodes): hidden shapes and
  // layers (a shape in a group on a hidden layer is hidden with it; an unknown layer id counts as the bottom layer),
  // and the stacking order of layers, groups and stored order.
  const derived = new Map(renderNodes(all as unknown as ShapeNode[], content.layers, new WeakMap()).map((n) => [n.id, n]));
  const drawn = new Map<string, SceneNode>();
  // React Flow's stacking: a shape's zIndex, and a shape in a group above its group.
  const zOf = new Map<string, number>();
  const zFor = (n: SerializedNode, seen = new Set<string>()): number => {
    const known = zOf.get(n.id);
    if (known !== undefined) return known;
    const dz = derived.get(n.id)?.zIndex;
    const own = typeof dz === 'number' ? dz : 0;
    const parent = n.parentId && !seen.has(n.parentId) ? byId.get(n.parentId) : undefined;
    const z = parent ? Math.max(own, zFor(parent, new Set(seen).add(n.id)) + 1) : own;
    zOf.set(n.id, z);
    return z;
  };

  all.forEach((n, order) => {
    if (!inScope(n.id)) return;
    if (n.hidden) {
      stats.hiddenShapes++;
      return;
    }
    if (derived.get(n.id)?.hidden) {
      stats.hiddenLayerShapes++;
      return;
    }
    const kind = (n.data?.shape ?? 'rectangle') as ShapeKind;
    const { width: dw, height: dh, ...style } = shapeDefaults(kind);
    const data = { ...style, ...n.data, label: n.data?.label ?? '' } as ShapeData;
    // Content normally comes through the model readers; a link that is not safe is still never written into a file.
    if (data.link !== undefined && !(typeof data.link === 'string' && isSafeLink(data.link))) delete data.link;
    const pos = canvasPosition(n, byId);
    const w = Number(n.width) || dw;
    const h = Number(n.height) || dh;
    const rotation = typeof data.rotation === 'number' && Number.isFinite(data.rotation) ? data.rotation : 0;
    if (!shapeDef(kind)) stats.unknownShapes++;
    if (data.link) stats.links++;
    if (data.tooltip) stats.tooltips++;
    if (data.label && !pdfFontCanShow(data.label)) stats.nonLatinLabels++;
    stats.shapes++;
    // Text can sit outside the shape (under a network icon or a BPMN event), so the bounds include its area.
    let bounds = rotatedBounds(pos.x, pos.y, w, h, rotation);
    if (data.label && !COMPARTMENT_SHAPES.has(kind)) {
      const lb = labelLayout(data, w, h).box;
      bounds = union(bounds, rotatedBounds(pos.x + Math.min(0, lb.x), pos.y + Math.min(0, lb.y), Math.max(w, lb.x + lb.width) - Math.min(0, lb.x), Math.max(h, lb.y + lb.height) - Math.min(0, lb.y), rotation));
    }
    drawn.set(n.id, { node: n, data, x: pos.x, y: pos.y, w, h, rotation, z: zFor(n), order, bounds });
  });

  const edges: SceneEdge[] = [];
  (content.edges ?? []).forEach((e, order) => {
    if (!inScope(e.source) || !inScope(e.target)) return;
    const s = drawn.get(e.source);
    const t = drawn.get(e.target);
    if (!s || !t) {
      if (byId.has(e.source) && byId.has(e.target)) stats.hiddenConnectors++;
      return;
    }
    const data = { ...DEFAULT_CONNECTOR, ...e.data };
    // A side handle this version does not have: React Flow draws nothing, and neither does the export.
    const known = (EDGE_LINE_TYPES as string[]).includes(e.type);
    const sh = handleSide(e.sourceHandle);
    const th = handleSide(e.targetHandle);
    if ((!sh && !data.sourcePort) || (!th && !data.targetPort)) {
      stats.undrawableConnectors++;
      return;
    }
    if (!known) stats.unknownLineTypes++;
    const pathFn = EDGE_PATHS[(known ? e.type : 'default') as EdgeLineType] ?? EDGE_PATHS.default;
    const base = { id: e.id, source: e.source, target: e.target, sourceHandleId: e.sourceHandle, targetHandleId: e.targetHandle, data, label: e.label, selected: false, animated: false };
    // The canvas's own connector geometry (G-CONNECT, connect/geometry.ts): ends at the handles, ports and perimeter
    // points, routes through bend points, and the label along the line, from the same boxes React Flow measures.
    const box = (n: SceneNode) => ({ x: n.x, y: n.y, width: n.w, height: n.h });
    const geo = connectorGeometry({
      type: known ? e.type : 'default',
      source: { box: box(s), kind: s.data.shape, handle: handleEnd(box(s), e.sourceHandle), port: data.sourcePort },
      target: { box: box(t), kind: t.data.shape, handle: handleEnd(box(t), e.targetHandle), port: data.targetPort },
      waypoints: data.waypoints,
      labelPosition: data.labelPosition,
      pathFn: (g) => pathFn({ ...base, ...g } as unknown as EdgeProps),
    });
    const { path, labelX, labelY } = geo;
    const ends = { sourceX: geo.source.x, sourceY: geo.source.y, targetX: geo.target.x, targetY: geo.target.y };
    let bounds = pathBounds(path) ?? { minX: ends.sourceX, minY: ends.sourceY, maxX: ends.targetX, maxY: ends.targetY };
    // End markers reach up to 20 px from the line.
    bounds = { minX: bounds.minX - 10, minY: bounds.minY - 10, maxX: bounds.maxX + 10, maxY: bounds.maxY + 10 };
    let label: SceneEdge['label'];
    const text = (e.label ?? '').replace(/\s*\n\s*/g, ' ');
    if (text) {
      const tw = measureText(text, { size: EDGE_LABEL_FONT });
      const th = 1.117 * EDGE_LABEL_FONT;
      label = { x: labelX - tw / 2 - EDGE_LABEL_PAD[0], y: labelY - th / 2 - EDGE_LABEL_PAD[1], width: tw + 2 * EDGE_LABEL_PAD[0], height: th + 2 * EDGE_LABEL_PAD[1], text };
      bounds = union(bounds, { minX: label.x, minY: label.y, maxX: label.x + label.width, maxY: label.y + label.height });
      if (!pdfFontCanShow(text)) stats.nonLatinLabels++;
    }
    const z = Math.max(s.node.parentId ? s.z : 0, t.node.parentId ? t.z : 0);
    stats.connectors++;
    edges.push({ edge: e, data, path, labelX, labelY, z, order, bounds, label });
  });

  let bounds: Bounds | null = null;
  for (const n of drawn.values()) bounds = union(bounds, n.bounds);
  for (const e of edges) bounds = union(bounds, e.bounds);
  return { nodes: [...drawn.values()], edges, bounds, stats };
}

// ── Drawing ────────────────────────────────────────────────────────────────

const round = (v: number) => Math.round(v * 100) / 100;

/** A shape from a newer version: a visible placeholder (as on the canvas). */
const placeholder: ShapeRenderer = ({ w, h, i }) => (
  <>
    <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={6} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
    <text x={w / 2} y={14} textAnchor="middle" fontSize={10} fill="#64748b" fontFamily={SANS_FAMILY}>
      unknown shape
    </text>
  </>
);

/** Text lines placed in a box, centred (or as `align`), like the canvas's flex-centred label. */
function TextLines({ lines, box, size, bold, color, family = SANS_FAMILY, lineHeight, align = 'center', valign = 'center' }: {
  lines: string[];
  box: Box;
  size: number;
  bold?: boolean;
  color: string;
  family?: string;
  lineHeight: number;
  align?: 'start' | 'center' | 'end';
  valign?: 'start' | 'center' | 'end';
}) {
  const total = lines.length * lineHeight;
  const top = valign === 'start' ? box.y : valign === 'end' ? box.y + box.height - total : box.y + (box.height - total) / 2;
  const base = baselineOffset(size, lineHeight);
  const x = align === 'center' ? box.x + box.width / 2 : align === 'end' ? box.x + box.width : box.x;
  return (
    <>
      {lines.map((line, k) => {
        const lineTop = top + k * lineHeight;
        // Like overflow: hidden on the canvas: a line that falls outside the shape's text area is not drawn.
        if (lineTop + lineHeight / 2 < box.y - 0.5 || lineTop + lineHeight / 2 > box.y + box.height + 0.5 || !line) return null;
        return (
          <text key={k} x={round(x)} y={round(lineTop + base)} fontFamily={family} fontSize={size} fontWeight={bold ? 'bold' : 'normal'} fill={color} textAnchor={align === 'center' ? 'middle' : align} xmlSpace="preserve">
            {line}
          </text>
        );
      })}
    </>
  );
}

/** UML class / ER entity: header band, then compartments separated by full-width rules (as CompartmentBody). */
function Compartments({ data, w, h }: { data: ShapeData; w: number; h: number }) {
  const { header, sections } = splitCompartments(data.label);
  const fs = data.fontSize;
  const lh = fs * 1.35;
  const rule = Math.max(1, data.strokeWidth);
  const rowSize = fs * 0.92;
  const rowLh = rowSize * 1.35;
  const headerLines = header ? wrapText(header, w - 16, { size: fs, bold: true }) : [];
  const headerH = Math.max(1, headerLines.length) * lh + 12;
  const out: ReactNode[] = [];
  if (data.shape === 'erEntity') {
    out.push(<path key="band" d={`M0,${round(headerH)} V4 Q0,0 4,0 H${w - 4} Q${w},0 ${w},4 V${round(headerH)} Z`} fill={data.stroke} fillOpacity={0.1} stroke="none" />);
  }
  out.push(<TextLines key="header" lines={headerLines} box={{ x: 8, y: 6, width: w - 16, height: headerH - 12 }} size={fs} bold color={data.textColor} lineHeight={lh} />);
  let y = headerH;
  sections.forEach((rows, i) => {
    if (y >= h) return;
    out.push(<rect key={`rule${i}`} x={0} y={round(y)} width={w} height={rule} fill={data.stroke} stroke="none" />);
    y += rule + 4;
    rows.forEach((row, j) => {
      if (y + rowLh / 2 <= h) {
        const key = /^(PK|FK)\b/.exec(row.trim())?.[1];
        const text = ellipsize(row, w - 16, { size: rowSize, mono: true });
        if (text.trim()) {
          out.push(
            <text
              key={`r${i}-${j}`}
              x={8}
              y={round(y + baselineOffset(rowSize, rowLh))}
              fontFamily={MONO_FAMILY}
              fontSize={round(rowSize)}
              fontWeight={key === 'PK' ? 'bold' : 'normal'}
              fill={data.textColor}
              xmlSpace="preserve"
            >
              {text}
            </text>,
          );
          // A primary key is underlined. Drawn as a line: PDF converters and some viewers ignore text-decoration.
          if (key === 'PK') {
            const base = round(y + baselineOffset(rowSize, rowLh) + rowSize * 0.12);
            const end = round(8 + measureText(text.trimEnd(), { size: rowSize, mono: true }));
            out.push(<path key={`u${i}-${j}`} d={`M8,${base} H${end}`} stroke={data.textColor} strokeWidth={round(Math.max(0.75, rowSize / 16))} fill="none" />);
          }
        }
      }
      y += rowLh;
    });
    y += 4;
  });
  return <>{out}</>;
}

/** Where a shape's text goes and how it is set, from the same CSS the canvas uses (shape definition + data). */
function labelLayout(data: ShapeData, w: number, h: number) {
  const style = { ...labelInset(data.shape), ...labelBoxStyle(data) } as Record<string, unknown>;
  const box = labelBox(style, w, h);
  const vertical = typeof style.writingMode === 'string' && style.writingMode.startsWith('vertical');
  // vertical-rl reads top to bottom; turned by 180° (pool and lane bands) it reads bottom to top.
  const turn = vertical ? (/rotate\(180deg\)/.test(String(style.transform ?? '')) ? -90 : 90) : 0;
  const align = style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'center';
  const valign = style.alignItems === 'flex-end' ? 'end' : style.alignItems === 'flex-start' ? 'start' : 'center';
  return { box, turn, align, valign } as const;
}

function ShapeLabel({ data, w, h }: { data: ShapeData; w: number; h: number }) {
  const custom = SVG_LABEL_RENDERERS[data.shape];
  if (custom) return <>{custom(data, w, h)}</>;
  if (COMPARTMENT_SHAPES.has(data.shape)) return <Compartments data={data} w={w} h={h} />;
  if (!data.label) return null;
  const { box, turn, align, valign } = labelLayout(data, w, h);
  const family = data.fontFamily ? `${data.fontFamily}, ${SANS_FAMILY}` : SANS_FAMILY;
  const lineHeight = data.fontSize * 1.25;
  if (turn) {
    // Laid out along the band's length, then turned about the band's centre.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const along = { x: cx - box.height / 2, y: cy - box.width / 2, width: box.height, height: box.width };
    const lines = wrapText(data.label, along.width, { size: data.fontSize, bold: data.bold });
    return (
      <g transform={`rotate(${turn} ${round(cx)} ${round(cy)})`}>
        <TextLines lines={lines} box={along} size={data.fontSize} bold={data.bold} color={data.textColor} family={family} lineHeight={lineHeight} align={align} />
      </g>
    );
  }
  const lines = wrapText(data.label, box.width, { size: data.fontSize, bold: data.bold });
  return <TextLines lines={lines} box={box} size={data.fontSize} bold={data.bold} color={data.textColor} family={family} lineHeight={lineHeight} align={align} valign={valign} />;
}

function NodeSvg({ n }: { n: SceneNode }) {
  const { data, w, h } = n;
  const i = data.strokeWidth / 2 + 0.5;
  const common = { fill: data.fill, stroke: data.stroke, strokeWidth: data.strokeWidth, strokeDasharray: data.dashed ? '6 5' : undefined, strokeLinejoin: 'round' as const };
  const geometry: ShapeGeometry = { w, h, i, common, data };
  const opacity = shapeOpacity(data);
  const renderer = SHAPE_RENDERERS[data.shape] ?? (shapeDef(data.shape) ? null : placeholder);
  const transform = `translate(${round(n.x)} ${round(n.y)})${n.rotation ? ` rotate(${round(n.rotation)} ${round(w / 2)} ${round(h / 2)})` : ''}`;
  const body = (
    <g transform={transform} data-node-id={n.node.id}>
      {data.tooltip ? <title>{data.tooltip}</title> : null}
      {data.shape !== 'text' && renderer ? opacity === undefined ? renderer(geometry) : <g opacity={opacity}>{renderer(geometry)}</g> : null}
      <ShapeLabel data={data} w={w} h={h} />
    </g>
  );
  // An SVG <a> (JSX types it as the HTML one): `href` for SVG 2 viewers, `xlink:href` for older ones and svg2pdf.
  return data.link ? createElement('a', { href: data.link, xlinkHref: data.link, target: '_blank' }, body) : body;
}

/** The `<marker>` elements of the connectors, parsed so the PDF can draw them in place. */
interface MarkerSpec {
  inner: string;
  refX: number;
  refY: number;
  scale: number;
  orient: string;
  userSpace: boolean;
}
function parseMarkers(defs: string): Map<string, MarkerSpec> {
  const out = new Map<string, MarkerSpec>();
  for (const m of defs.matchAll(/<marker\b([^>]*)>([\s\S]*?)<\/marker>/g)) {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
    const id = attr('id');
    if (!id) continue;
    const [, , vbw = 3, vbh = 3] = (attr('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const mw = Number(attr('markerWidth') ?? 3);
    const mh = Number(attr('markerHeight') ?? 3);
    out.set(id, {
      inner: m[2],
      refX: Number(attr('refX') ?? 0),
      refY: Number(attr('refY') ?? 0),
      scale: attr('viewBox') ? Math.min(mw / vbw, mh / vbh) : 1,
      orient: attr('orient') ?? '0',
      userSpace: attr('markerUnits') === 'userSpaceOnUse',
    });
  }
  return out;
}

function EdgeSvg({ e, scope, inline }: { e: SceneEdge; scope: string; inline: Map<string, MarkerSpec> | null }) {
  const d = e.data;
  const { start, end } = edgeMarkers(d);
  const startId = start !== 'none' ? markerId(scope, start, d.color) : undefined;
  const endId = end !== 'none' ? markerId(scope, end, d.color) : undefined;
  const placed: ReactNode[] = [];
  if (inline) {
    const ends = pathEnds(e.path);
    const place = (id: string | undefined, at: Point | undefined, angle: number, isStart: boolean) => {
      const m = id ? inline.get(id) : undefined;
      if (!m || !at) return;
      let a = angle;
      if (/^-?[\d.]+$/.test(m.orient)) a = Number(m.orient);
      else if (isStart && m.orient === 'auto-start-reverse') a = angle + 180;
      const s = m.scale * (m.userSpace ? 1 : d.width);
      placed.push(
        <g
          key={isStart ? 'ms' : 'me'}
          transform={`translate(${round(at.x)} ${round(at.y)}) rotate(${round(a)}) scale(${round(s * 1000) / 1000}) translate(${-m.refX} ${-m.refY})`}
          dangerouslySetInnerHTML={{ __html: m.inner }}
        />,
      );
    };
    if (ends) {
      place(startId, ends.start, ends.startAngle, true);
      place(endId, ends.end, ends.endAngle, false);
    }
  }
  return (
    <g data-edge-id={e.edge.id}>
      <path
        d={e.path}
        fill="none"
        stroke={d.color}
        strokeWidth={d.width}
        strokeDasharray={d.dashed ? '6 5' : undefined}
        markerStart={!inline && startId ? `url(#${startId})` : undefined}
        markerEnd={!inline && endId ? `url(#${endId})` : undefined}
      />
      {placed}
      {e.label && (
        <>
          <rect x={round(e.label.x)} y={round(e.label.y)} width={round(e.label.width)} height={round(e.label.height)} rx={4} ry={4} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1} />
          <text x={round(e.labelX)} y={round(e.labelY + 0.3 * EDGE_LABEL_FONT)} fontFamily={SANS_FAMILY} fontSize={EDGE_LABEL_FONT} fill="#0f172a" textAnchor="middle" xmlSpace="preserve">
            {e.label.text}
          </text>
        </>
      )}
    </g>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentences the export toast shows for what the drawing left out or drew approximately. */
export function sceneNotes(stats: SvgExportStats): string[] {
  const notes: string[] = [];
  if (stats.hiddenShapes) notes.push(`${plural(stats.hiddenShapes, 'hidden shape was', 'hidden shapes were')} left out.`);
  if (stats.hiddenLayerShapes) notes.push(`${plural(stats.hiddenLayerShapes, 'shape on a hidden layer was', 'shapes on hidden layers were')} left out.`);
  if (stats.hiddenConnectors) notes.push(`${plural(stats.hiddenConnectors, 'connector to a shape that is not shown was', 'connectors to shapes that are not shown were')} left out.`);
  if (stats.undrawableConnectors) notes.push(`${plural(stats.undrawableConnectors, 'connector names a connection point', 'connectors name connection points')} this version does not have, so ${stats.undrawableConnectors === 1 ? 'it was' : 'they were'} left out (as on the canvas).`);
  if (stats.unknownShapes) notes.push(`${plural(stats.unknownShapes, 'shape from a newer version was', 'shapes from a newer version were')} drawn as a placeholder.`);
  if (stats.unknownLineTypes) notes.push(`${plural(stats.unknownLineTypes, 'connector with a line style from a newer version was', 'connectors with a line style from a newer version were')} drawn curved.`);
  return notes;
}

/** The drawing area of a scene in diagram coordinates: everything drawn plus the padding, on whole pixels. */
export function sceneViewBox(scene: Scene, padding = EXPORT_PADDING): Box {
  const b = scene.bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const x = Math.floor(b.minX - padding);
  const y = Math.floor(b.minY - padding);
  return { x, y, width: Math.ceil(b.maxX + padding) - x, height: Math.ceil(b.maxY + padding) - y };
}

/**
 * Characters XML 1.0 does not allow (control characters other than tab and line breaks, U+FFFE/U+FFFF, unpaired
 * surrogates) would make the file unreadable; they can arrive in labels pasted from other programs. A vertical tab or
 * form feed (PowerPoint's line break) becomes a space; the others are dropped.
 */
export function xmlSafe(text: string): string {
  return text.replace(/[\u000B\u000C]/g, ' ').replace(/[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/** Renders a scene (or the part of it inside `opts.region`) as an SVG document string. */
export function renderScene(scene: Scene, opts: SvgExportOptions = {}): SvgExport {
  const viewBox = sceneViewBox(scene, opts.padding);
  const scope = opts.idPrefix ?? 'dcos-export';
  const region = opts.region;
  const nodes = region ? scene.nodes.filter((n) => overlaps(n.bounds, region)) : scene.nodes;
  const edges = region ? scene.edges.filter((e) => overlaps(e.bounds, region)) : scene.edges;

  // Shared marker definitions, drawn by the canvas's own MarkerDefs.
  const connectors = edges.map((e) => ({ id: e.edge.id, source: e.edge.source, target: e.edge.target, data: e.data }) as Connector);
  const defsSvg = renderToStaticMarkup(
    <MarkerScopeContext.Provider value={scope}>
      <MarkerDefs edges={connectors} />
    </MarkerScopeContext.Provider>,
  );
  const defs = /<defs>([\s\S]*)<\/defs>/.exec(defsSvg)?.[1] ?? '';
  const inline = opts.inlineMarkers ? parseMarkers(defs) : null;

  // Painting order: by stacking level; at the same level connectors under shapes, then stored order.
  const items = [
    ...edges.map((e) => ({ z: e.z, layer: 0, order: e.order, el: <EdgeSvg key={`e-${e.edge.id}-${e.order}`} e={e} scope={scope} inline={inline} /> })),
    ...nodes.map((n) => ({ z: n.z, layer: 1, order: n.order, el: <NodeSvg key={`n-${n.node.id}-${n.order}`} n={n} /> })),
  ].sort((a, c) => a.z - c.z || a.layer - c.layer || a.order - c.order);

  const width = opts.outputWidth ?? viewBox.width;
  const height = opts.outputHeight ?? viewBox.height;
  const doc = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      version="1.1"
      width={width}
      height={height}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
    >
      {opts.title ? <title>{opts.title}</title> : null}
      {!inline && defs ? <defs dangerouslySetInnerHTML={{ __html: defs }} /> : null}
      {opts.background !== null ? <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill={opts.background ?? '#ffffff'} /> : null}
      {items.map((it) => it.el)}
    </svg>
  );
  // "transparent" is CSS; plain SVG viewers and PDF converters understand "none".
  const svg = xmlSafe(renderToStaticMarkup(doc).replace(/(fill|stroke)="transparent"/g, '$1="none"'));
  return { svg, width: viewBox.width, height: viewBox.height, viewBox, notes: sceneNotes(scene.stats), stats: scene.stats };
}

/** Renders stored diagram content as a standalone, vector SVG document. */
export function renderDiagramSvg(content: DiagramContent, opts: SvgExportOptions = {}): SvgExport {
  const scene = buildScene(content, opts);
  if (!scene.nodes.length) throw new Error(opts.selection ? 'Nothing selected to export' : 'The diagram is empty');
  return renderScene(scene, opts);
}
