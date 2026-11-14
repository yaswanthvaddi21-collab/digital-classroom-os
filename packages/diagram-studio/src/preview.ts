/**
 * Off-screen previews of stored diagrams (Phase 6, ADR 0013): the picture an embedded diagram shows in a document,
 * drawn from its editable data with no editor on screen. It is the same drawing the edit dialog stores when the
 * user saves (DiagramEditorApi.renderPng(2), drawn by the vector renderer in vector/), so a preview made here
 * matches one made there.
 *
 * The diagram is only read. Content from a newer version is drawn as far as this version can (read-only, as the
 * editor opens it) and is never migrated, normalised or handed back.
 */
import { DIAGRAM_SCHEMA, deserializeDiagram, diagramSchemaOf, serializeDiagram } from './types';

export interface DiagramPreview {
  /** PNG drawn at `pixelRatio` times the natural size (2 unless the diagram is too large for a browser canvas). */
  png: Blob;
  /** The same drawing as a standalone vector SVG document (white paper, with the title when given). */
  svg: string;
  /** Natural size in CSS pixels. */
  width: number;
  height: number;
  pixelRatio: number;
  /** True when the diagram comes from a newer version (drawn as far as this version can). */
  readOnly: boolean;
  /** What the picture could not show exactly (hidden layers left out, links, lowered resolution …). */
  notes: string[];
}

export interface DiagramPreviewOptions {
  title?: string;
  /** Pixels per CSS pixel for the PNG (default 2, like the edit dialog). */
  scale?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Draws a stored diagram as a PNG and an SVG. Resolves null when there is nothing to draw: no diagram data, or no
 * visible shapes. Rejects only when the browser cannot draw the picture (for example, too large for its memory).
 */
export async function renderDiagramPreview(source: unknown, opts: DiagramPreviewOptions = {}): Promise<DiagramPreview | null> {
  if (!isObj(source)) return null;
  const readOnly = diagramSchemaOf(source) > DIAGRAM_SCHEMA;
  // The content the editor would show for this source. deserializeDiagram never changes its input, and the result is
  // used only for drawing: it is never returned, so a newer diagram is never rewritten in this version's format.
  const s = deserializeDiagram(source);
  const content = serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
  const [{ renderDiagramPng }, { buildScene, renderScene }] = await Promise.all([import('./vector/raster'), import('./vector/renderSvg')]);
  const scene = buildScene(content);
  if (!scene.nodes.length) return null;
  const png = await renderDiagramPng(content, { scale: opts.scale ?? 2 });
  const svg = renderScene(scene, { title: opts.title || undefined }).svg;
  return { png: png.blob, svg, width: png.width, height: png.height, pixelRatio: png.pixelRatio, readOnly, notes: png.notes };
}
