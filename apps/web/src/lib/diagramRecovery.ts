/**
 * Applying recovered diagram-dialog edits to a stored document (Phase 6, ADR 0013). Loaded on demand: it pulls in
 * Document Studio's schema code, which the app otherwise loads only with the editor.
 */
import { contentSchemaFor, fitSize, paperSize, prepareDocument, type DocumentContent, type EmbeddedDiagram } from '@dcos/document-studio';
import type { DiagramDialogBase } from './storage';

type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; [k: string]: unknown };

/** Where the recovered diagram went: over the diagram it was opened on, or (when that is gone) at the end. */
export type RecoveredPlacement = 'replaced' | 'appended';

const sameJson = (a: unknown, b: unknown) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/** The page's text width in CSS pixels: the widest a new diagram is placed. */
function textWidthPx(page: DocumentContent['page']): number {
  const paper = paperSize(page);
  return Math.max(80, Math.round(((paper.width - page.margins.left - page.margins.right) / 25.4) * 96));
}

/**
 * The document with `result` applied: it replaces the first diagram still holding exactly the data and preview the
 * dialog was opened on (`base`), keeping that diagram's width, alignment and caption as an edit in place would.
 * When there is no such diagram (a new one, or it was changed or removed since), the diagram is added at the end,
 * so the recovered work is never dropped. Throws when the document cannot be changed by this version.
 */
export function applyRecoveredDiagram(
  raw: unknown,
  base: DiagramDialogBase | null,
  result: EmbeddedDiagram,
): { content: DocumentContent; placed: RecoveredPlacement } {
  const prepared = prepareDocument(raw);
  if (prepared.state !== 'editable') throw new Error(prepared.detail);
  const content = prepared.content;
  // Only the fields the result sets (an absent svgPreviewId must not be stored as undefined).
  const fields = Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
  let placed: RecoveredPlacement | null = null;

  const visit = (node: Json): Json => {
    if (placed) return node;
    if (node.type === 'diagram' && base) {
      const attrs = node.attrs ?? {};
      if ((attrs.previewId ?? null) === base.previewId && sameJson(attrs.source, base.source)) {
        placed = 'replaced';
        const width = typeof attrs.width === 'number' && attrs.width > 0 ? attrs.width : result.naturalWidth;
        // As an edit in the document does: the chosen width stays, the height follows the new drawing, and an SVG
        // preview of the old drawing is dropped unless the result brings a new one.
        return { ...node, attrs: { ...attrs, svgPreviewId: null, ...fields, ...fitSize(result.naturalWidth, result.naturalHeight, width, Number.MAX_SAFE_INTEGER) } };
      }
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(visit) };
  };

  let doc = visit(content.doc as Json);
  if (!placed) {
    placed = 'appended';
    const size = fitSize(result.naturalWidth, result.naturalHeight, result.naturalWidth, textWidthPx(content.page));
    doc = { ...doc, content: [...(doc.content ?? []), { type: 'diagram', attrs: { ...fields, ...size } }] };
  }
  const next: DocumentContent & Record<string, unknown> = { ...content, doc };
  // The schema the content needs, as the editor stores it: a document using nothing new stays schema 2 (or 1).
  return { content: { ...next, schemaVersion: contentSchemaFor(next) }, placed };
}
