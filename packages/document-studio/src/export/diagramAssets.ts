/**
 * Embedded diagrams in file exports (Phase 6, ADR 0013): what DOCX, ODT and the native .dcosdoc file write for each
 * diagram, shared so every format behaves the same way.
 *
 * - Previews are loaded from the app's storage; one that fails to load is treated as missing, never as a failed
 *   export (prepareDiagramExport).
 * - A missing preview is redrawn from the diagram's own data with the host's off-screen renderer; a placeholder is
 *   written only when the data is missing too, or cannot be drawn.
 * - The vector drawing (SVG) is written next to the PNG where the format can hold both: the stored SVG preview when
 *   there is one, else one drawn from the diagram's data. A diagram from a newer version keeps its stored PNG only:
 *   this version would draw it as far as it can, which may not match what the newer version drew.
 * - The PNG carries the diagram's editable data (diagramPng.ts), so importing the file back restores an editable
 *   diagram. Other apps show the picture.
 */
import type { JSONContent } from '@tiptap/core';
import type { RenderedDiagramPreview } from '../extensions/diagramEmbed';
import { imageSize } from '../import/imageSize';
import { diagramPngEnvelope, embedDiagramInPng, isPng } from './diagramPng';
import { NOTES, type ExportReport } from './report';

/**
 * Newest Diagram Studio content schema this build draws (diagram-studio DIAGRAM_SCHEMA; a test in tests/integration
 * checks they are equal). Document Studio does not depend on Diagram Studio, so the number is kept here.
 */
export const DRAWN_DIAGRAM_SCHEMA = 3;

type Attrs = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether a diagram node still carries its editable data. */
export const hasSource = (attrs: Attrs | undefined): attrs is Attrs & { source: Record<string, unknown> } => isObj(attrs?.source);

/**
 * The text that describes a diagram: its alt text, else its title, else 'Diagram' (the same rule as diagramEmbed's
 * diagramAltText, kept here so the exporters do not load the editor's node view).
 */
export const diagramAltText = (attrs: Attrs | undefined): string =>
  (typeof attrs?.alt === 'string' && attrs.alt.trim()) || (typeof attrs?.title === 'string' && attrs.title.trim()) || 'Diagram';

/** Whether a diagram's data comes from a newer version of Diagram Studio than this build draws. */
export function isNewerDiagram(source: unknown): boolean {
  const v = isObj(source) ? source.schemaVersion : undefined;
  return typeof v === 'number' && v > DRAWN_DIAGRAM_SCHEMA;
}

/** The host's off-screen renderer (DiagramHost.renderPreview). */
export type RenderPreview = (source: unknown, title?: string) => Promise<RenderedDiagramPreview | null>;

export interface DiagramExportOptions {
  /** Draws a diagram from its data (DiagramHost.renderPreview). Without it, missing previews become placeholders. */
  renderPreview?: RenderPreview;
}

/** A drawing made at export time from a diagram's data. */
export interface RedrawnDiagram {
  /** Set when the stored PNG preview was missing (or unreadable) and this one is used instead. */
  png: Uint8Array | null;
  /** Set when there was no stored SVG preview. */
  svg: Uint8Array | null;
  /** Natural size of the drawing in CSS pixels. */
  width: number;
  height: number;
}

/** Drawings made at export time, by diagramKey. */
export type DiagramRenders = Map<string, RedrawnDiagram>;

/** What an exporter writes for one diagram. Copies of the same diagram get the same object (and the same bytes). */
export interface DiagramPicture {
  /** The PNG, carrying the diagram's editable data when `editable`. */
  png: Uint8Array;
  /** The same drawing as SVG, when there is one. */
  svg: Uint8Array | null;
  /** True when the PNG carries the diagram's data (an import into Classroom OS restores an editable diagram). */
  editable: boolean;
  /** True when the PNG was drawn at export time because the stored preview was missing. */
  redrawn: boolean;
}

/**
 * A key for one diagram's look and data: copies of a diagram share it, an edited diagram does not. (Two diagrams
 * can share a preview, which is stored by content, and still hold different data, such as a hidden shape.)
 */
export function diagramKey(attrs: Attrs | undefined): string {
  const a = attrs ?? {};
  try {
    return JSON.stringify([a.previewId ?? null, a.svgPreviewId ?? null, a.title ?? '', a.source ?? null]);
  } catch {
    return JSON.stringify([a.previewId ?? null, a.svgPreviewId ?? null, a.title ?? '', 'unserialisable']);
  }
}

/** Every diagram node of a document, in document order. */
export function diagramNodes(doc: JSONContent): JSONContent[] {
  const out: JSONContent[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'diagram') out.push(n);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

const looksLikeSvg = (bytes: Uint8Array | undefined): bytes is Uint8Array => {
  if (!bytes || !bytes.length) return false;
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /<svg[\s>]/i.test(head);
};
const utf8 = (text: string) => new TextEncoder().encode(text);
const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/**
 * Loads the previews (PNG and SVG) of every diagram into `assets`, by attachment id, and draws what is missing.
 * Never rejects because of one diagram: a preview that fails to load is treated as missing, and a drawing that
 * fails is left out (the exporter then writes the stored PNG, or a placeholder).
 */
export async function prepareDiagramExport(
  doc: JSONContent,
  assets: Map<string, Uint8Array>,
  loadAsset: ((id: string) => Promise<Blob | undefined>) | undefined,
  options: DiagramExportOptions = {},
): Promise<DiagramRenders> {
  const nodes = diagramNodes(doc);
  if (loadAsset) {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (typeof n.attrs?.previewId === 'string' && n.attrs.previewId) ids.add(n.attrs.previewId);
      if (typeof n.attrs?.svgPreviewId === 'string' && n.attrs.svgPreviewId) ids.add(n.attrs.svgPreviewId);
    }
    for (const id of ids) {
      if (assets.has(id)) continue;
      try {
        const blob = await loadAsset(id);
        if (blob) assets.set(id, await blobBytes(blob));
      } catch {
        // Treated as missing: the exporter redraws it or writes a placeholder, and says so.
      }
    }
  }
  const renders: DiagramRenders = new Map();
  const render = options.renderPreview;
  if (!render) return renders;
  for (const n of nodes) {
    const a = n.attrs ?? {};
    const key = diagramKey(a);
    if (renders.has(key) || !hasSource(a)) continue;
    const stored = typeof a.previewId === 'string' ? assets.get(a.previewId) : undefined;
    const needPng = !stored || !isPng(stored);
    const storedSvg = typeof a.svgPreviewId === 'string' ? assets.get(a.svgPreviewId) : undefined;
    // A newer diagram's own preview is kept as it is; it is drawn here only when there is nothing else to show.
    const needSvg = !looksLikeSvg(storedSvg) && (needPng || !isNewerDiagram(a.source));
    if (!needPng && !needSvg) continue;
    let drawn: RenderedDiagramPreview | null = null;
    try {
      drawn = await render(a.source, typeof a.title === 'string' && a.title ? a.title : undefined);
    } catch {
      drawn = null;
    }
    if (!drawn) continue;
    let png: Uint8Array | null = null;
    if (needPng) {
      try {
        const bytes = await blobBytes(drawn.png);
        png = isPng(bytes) ? bytes : null;
      } catch {
        png = null;
      }
    }
    const svg = needSvg && typeof drawn.svg === 'string' && /<svg[\s>]/i.test(drawn.svg) ? utf8(drawn.svg) : null;
    if (png || svg) renders.set(key, { png, svg, width: drawn.width, height: drawn.height });
  }
  return renders;
}

/**
 * The picture to write for one diagram node, or null when there is none (no preview, and none could be drawn).
 * Results are kept in `cache`, so copies of a diagram are written with the same bytes (stored once where the format
 * allows).
 */
export function diagramPicture(attrs: Attrs | undefined, assets: Map<string, Uint8Array>, renders: DiagramRenders | undefined, cache: Map<string, DiagramPicture | null>): DiagramPicture | null {
  const a = attrs ?? {};
  const key = diagramKey(a);
  if (cache.has(key)) return cache.get(key) ?? null;
  const drawn = renders?.get(key);
  const stored = typeof a.previewId === 'string' ? assets.get(a.previewId) : undefined;
  const storedOk = !!stored && isPng(stored);
  const base = storedOk ? stored : drawn?.png ?? null;
  if (!base) {
    cache.set(key, null);
    return null;
  }
  const storedSvg = typeof a.svgPreviewId === 'string' ? assets.get(a.svgPreviewId) : undefined;
  const svg = looksLikeSvg(storedSvg) ? storedSvg : drawn?.svg ?? null;
  // Device pixels per CSS pixel of the PNG, for its pHYs density (2 for the editor's previews).
  const pixels = imageSize(base);
  const natural = storedOk ? Number(a.naturalWidth) : drawn?.width;
  const ratio = pixels && natural && natural > 0 ? pixels.width / natural : 2;
  let png = base;
  let editable = false;
  if (hasSource(a)) {
    try {
      const title = typeof a.title === 'string' ? a.title : '';
      png = embedDiagramInPng(base, diagramPngEnvelope(a.source, title), { pixelRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 2 });
      editable = true;
    } catch {
      // Too large, or not a usable PNG: written as the picture alone (and reported).
      png = base;
    }
  }
  const picture: DiagramPicture = { png, svg, editable, redrawn: !storedOk };
  cache.set(key, picture);
  return picture;
}

/** Records the notes for one diagram written as `picture` (or as a placeholder when it is null). */
export function noteDiagram(report: ExportReport, picture: DiagramPicture | null) {
  if (!picture) {
    NOTES.missingDiagramPreview(report);
    return;
  }
  if (picture.editable) NOTES.diagramPicture(report);
  else NOTES.diagramPictureOnly(report);
  if (picture.redrawn) NOTES.diagramRedrawn(report);
}

/**
 * The text of a diagram for plain-text export: the visible shapes' labels in reading order (top to bottom, then left
 * to right), then the labels of connectors between visible shapes as "from → to: label". Hidden shapes and shapes on
 * hidden layers are left out, as in the picture. Unreadable data gives no lines, never an error.
 */
export function diagramLabels(source: unknown): string[] {
  if (!isObj(source)) return [];
  const nodes = Array.isArray(source.nodes) ? source.nodes.filter(isObj) : [];
  const edges = Array.isArray(source.edges) ? source.edges.filter(isObj) : [];
  const layers = Array.isArray(source.layers) ? source.layers.filter(isObj) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const n of nodes) if (typeof n.id === 'string') byId.set(n.id, n);
  const layerIds = layers.map((l) => l.id).filter((id): id is string => typeof id === 'string');
  const hiddenLayers = new Set(layers.filter((l) => l.visible === false && typeof l.id === 'string').map((l) => l.id as string));
  const parentOf = (n: Record<string, unknown>) => (typeof n.parentId === 'string' ? byId.get(n.parentId) : undefined);
  // The layer a shape is on (Diagram Studio's layerIdOf): its own, else its nearest group's, else the bottom layer.
  const layerOf = (n: Record<string, unknown>): string | undefined => {
    if (!layerIds.length) return undefined;
    const seen = new Set<unknown>();
    for (let cur: Record<string, unknown> | undefined = n; cur && !seen.has(cur); cur = parentOf(cur)) {
      seen.add(cur);
      if (typeof cur.layer === 'string' && layerIds.includes(cur.layer)) return cur.layer;
    }
    return layerIds[0];
  };
  // Hidden as on the canvas: hidden itself, or on a hidden layer (its own or a containing group's).
  const onHiddenLayer = (n: Record<string, unknown>): boolean => {
    const seen = new Set<unknown>();
    for (let cur: Record<string, unknown> | undefined = n; cur && !seen.has(cur) && seen.size < 64; cur = parentOf(cur)) {
      seen.add(cur);
      const layer = layerOf(cur);
      if (layer && hiddenLayers.has(layer)) return true;
    }
    return false;
  };
  const visible = (n: Record<string, unknown>) => n.hidden !== true && !onHiddenLayer(n);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  // Positions are relative to the containing group: add them up.
  const at = (n: Record<string, unknown>) => {
    let x = 0;
    let y = 0;
    const seen = new Set<unknown>();
    for (let cur: Record<string, unknown> | undefined = n; cur && !seen.has(cur) && seen.size < 64; cur = parentOf(cur)) {
      seen.add(cur);
      const p = isObj(cur.position) ? cur.position : {};
      x += num(p.x);
      y += num(p.y);
    }
    return { x, y };
  };
  // A label's text on one line: compartment separators ("--" lines) and line breaks become " · " and spaces.
  const oneLine = (label: unknown) =>
    typeof label === 'string'
      ? label
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && l !== '--')
          .join(' · ')
      : '';
  const labelOf = (n: Record<string, unknown>) => oneLine(isObj(n.data) ? n.data.label : undefined);
  const shown = nodes.filter(visible);
  const lines = shown
    .map((n) => ({ n, label: labelOf(n), ...at(n) }))
    .filter((s) => s.label)
    .sort((p, q) => p.y - q.y || p.x - q.x)
    .map((s) => s.label);
  const shownIds = new Set(shown.map((n) => n.id));
  for (const e of edges) {
    const label = oneLine(e.label);
    if (!label || !shownIds.has(e.source) || !shownIds.has(e.target)) continue;
    const from = labelOf(byId.get(e.source as string)!) || '…';
    const to = labelOf(byId.get(e.target as string)!) || '…';
    lines.push(`${from} → ${to}: ${label}`);
  }
  return lines;
}
