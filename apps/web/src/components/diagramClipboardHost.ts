import type { EmbeddedDiagram } from '@dcos/document-studio';

type Studio = typeof import('@dcos/diagram-studio');

export interface ShapesHostDeps {
  /** Loads Diagram Studio (lazily, as the edit dialog does). */
  loadStudio: () => Promise<Pick<Studio, 'diagramFromClipboard' | 'renderDiagramPreview'>>;
  /** Stores the preview PNG; resolves its attachment id. */
  putAttachment: (png: Blob) => Promise<string>;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

/** Shown when the pasted shapes cannot be drawn (none of them is visible). */
export const SHAPES_NOTHING_TO_SHOW = 'The copied shapes have nothing to show, so no diagram was added.';
/** Title of a diagram made from pasted shapes (the same default as a new diagram). */
export const PASTED_DIAGRAM_TITLE = 'Diagram';

/**
 * Phase 6 (CLIPBOARD): shapes copied in Diagram Studio, pasted into a document, become a new embedded diagram: the
 * shapes as its editable data, and a preview drawn off screen (renderDiagramPreview, the edit dialog's PNG path) and
 * stored as an attachment. Problems are told to the user and resolve null, so nothing is pasted (never the JSON).
 */
export async function diagramFromShapes(get: (type: string) => string, deps: ShapesHostDeps): Promise<EmbeddedDiagram | null> {
  try {
    const studio = await deps.loadStudio();
    const source = studio.diagramFromClipboard(get);
    if (!source) return null;
    const r = await studio.renderDiagramPreview(source, { title: PASTED_DIAGRAM_TITLE });
    if (!r) {
      deps.toast(SHAPES_NOTHING_TO_SHOW, 'info');
      return null;
    }
    const previewId = await deps.putAttachment(r.png);
    return { source, previewId, naturalWidth: r.width, naturalHeight: r.height, title: PASTED_DIAGRAM_TITLE };
  } catch (err) {
    deps.toast(`The copied shapes could not be pasted: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return null;
  }
}
