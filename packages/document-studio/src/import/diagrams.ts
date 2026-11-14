/**
 * Diagrams coming back from a Word or OpenDocument file (Phase 6, ADR 0013). The DOCX and ODT exports write each
 * diagram as a PNG carrying the diagram's own file (export/diagramPng.ts); importing such a picture gives an editable
 * diagram again, at the size the file shows it, with its preview stored as an attachment (ImportResult.attachments).
 * Pictures without that data, or with damaged data, stay ordinary pictures.
 */
import { pngPixelRatio, readDiagramFromPng, withoutDiagramData } from '../export/diagramPng';
import { boundDiagramSize } from '../extensions/diagramClipboard';
import type { ImportedAttachment } from './common';
import { imageSize } from './imageSize';

export interface ImportedDiagram {
  /** The diagram node's attributes (previewId is the attachment's id). */
  attrs: Record<string, unknown>;
  attachment: ImportedAttachment;
}

/** Ids for the previews of one import, replaced by the stored ids (withStoredAttachments). */
export function previewIds(prefix: string) {
  let n = 0;
  return () => `${prefix}-preview-${++n}`;
}

/**
 * The diagram a picture carries, or null when it carries none (or it cannot be read). `widthPx` is the width the file
 * shows the picture at (null: its natural size); it is kept within `maxWidthPx`, and the height follows the diagram's
 * aspect ratio. `alt` is the picture's description: kept as the diagram's alt text when it says more than its title.
 */
export function diagramFromPicture(bytes: Uint8Array, opts: { id: string; widthPx: number | null; maxWidthPx: number; alt?: string | null; title?: string | null }): ImportedDiagram | null {
  const payload = readDiagramFromPng(bytes);
  const pixels = payload ? imageSize(bytes) : null;
  if (!payload || !pixels || !pixels.width || !pixels.height) return null;
  const ratio = pngPixelRatio(bytes) ?? 2;
  const naturalWidth = Math.max(1, Math.round(pixels.width / ratio));
  const naturalHeight = Math.max(1, Math.round(pixels.height / ratio));
  const fromFile = typeof payload.envelope.title === 'string' ? payload.envelope.title.trim() : '';
  const title = fromFile || (opts.title ?? '').trim() || 'Diagram';
  const shown = opts.widthPx && Number.isFinite(opts.widthPx) && opts.widthPx > 0 ? opts.widthPx : naturalWidth;
  const width = Math.max(1, Math.round(Math.min(shown, opts.maxWidthPx > 0 ? opts.maxWidthPx : shown)));
  const height = Math.max(1, Math.round((width * naturalHeight) / naturalWidth));
  const alt = (opts.alt ?? '').trim();
  const sizes = { naturalWidth, naturalHeight, width, height };
  return {
    // Sizes read from a file are bounded as pasted ones are (Round 3): an absurd picture gives the default size.
    attrs: { source: payload.envelope.diagram, previewId: opts.id, ...sizes, ...boundDiagramSize(sizes), title, alt: alt && alt !== title ? alt : null },
    attachment: { id: opts.id, data: withoutDiagramData(bytes), mimeType: 'image/png' },
  };
}
