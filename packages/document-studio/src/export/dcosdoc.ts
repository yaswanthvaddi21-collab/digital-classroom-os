/**
 * The Classroom OS document file (.dcosdoc, Phase 6, ADR 0013): one document with everything it needs, so it can be
 * moved to another device or browser without a whole-workspace backup and without losing anything. It holds the
 * document's content exactly as stored (embedded diagrams keep their editable data) and the pictures the content
 * refers to by attachment id (each diagram's PNG preview and SVG drawing).
 *
 * JSON, like the diagram file (.dcosdiagram):
 * { format: 'dcos-document', version: 1, app, title, content, attachments: { <id>: { type, data (base64) } } }
 *
 * Reading it back is import/dcosdoc.ts.
 */
import type { JSONContent } from '@tiptap/core';
import { contentSchemaFor } from '../migrate';
import type { DocumentContent } from '../types';
import { diagramNodes, hasSource, type DiagramExportOptions } from './diagramAssets';
import { isPng } from './diagramPng';
import { NOTES, type ExportReport } from './report';

declare const __APP_VERSION__: string | undefined;
const appVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development');

export const DCOSDOC_FORMAT = 'dcos-document';
/** Newest file version this build reads and writes. */
export const DCOSDOC_VERSION = 1;
export const DCOSDOC_EXTENSION = '.dcosdoc';
export const DCOSDOC_MIME = 'application/vnd.dcos.document+json';
/** Files larger than this are refused before they are read. */
export const DCOSDOC_MAX_BYTES = 100 * 1024 * 1024;
/** Picture types a .dcosdoc file holds. */
export const DCOSDOC_PICTURE_TYPES = ['image/png', 'image/svg+xml'] as const;

export interface DcosdocFile {
  format: typeof DCOSDOC_FORMAT;
  version: number;
  /** Version of the app that wrote the file. */
  app?: string;
  title: string;
  content: DocumentContent;
  attachments: Record<string, { type: (typeof DCOSDOC_PICTURE_TYPES)[number]; data: string }>;
}

/** Base64 of bytes, in slices (String.fromCharCode takes a limited number of arguments). */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The attachment ids a document's content refers to (each diagram's previewId and svgPreviewId). */
export function referencedAttachments(doc: JSONContent): string[] {
  const ids = new Set<string>();
  for (const n of diagramNodes(doc)) {
    for (const key of ['previewId', 'svgPreviewId']) {
      const id = n.attrs?.[key];
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return [...ids];
}

const sniffType = (bytes: Uint8Array): DcosdocFile['attachments'][string]['type'] | null => {
  if (isPng(bytes)) return 'image/png';
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /<svg[\s>]/i.test(head) ? 'image/svg+xml' : null;
};

/**
 * The .dcosdoc file of a document. Pictures are loaded with `loadAsset` (the app's attachment store); one that fails
 * to load is redrawn from the diagram's data with `options.renderPreview` when it is a diagram's PNG preview, and left
 * out otherwise (the diagram keeps its data and shows that its preview is missing). Both are noted in `report`.
 */
export async function exportDcosdoc(
  content: DocumentContent,
  title: string,
  loadAsset?: (id: string) => Promise<Blob | undefined>,
  report?: ExportReport,
  options: DiagramExportOptions = {},
  app: string = appVersion(),
): Promise<Blob> {
  const attachments: DcosdocFile['attachments'] = {};
  const missing = new Set<string>();
  for (const id of referencedAttachments(content.doc)) {
    let bytes: Uint8Array | null = null;
    try {
      const blob = loadAsset ? await loadAsset(id) : undefined;
      bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } catch {
      bytes = null;
    }
    const type = bytes ? sniffType(bytes) : null;
    if (bytes && type) attachments[id] = { type, data: toBase64(bytes) };
    else missing.add(id);
  }
  // A missing PNG preview is drawn again from the diagram's data and stored under the id the content uses.
  for (const n of diagramNodes(content.doc)) {
    const a = n.attrs ?? {};
    const id = typeof a.previewId === 'string' ? a.previewId : '';
    if (!id || !missing.has(id) || attachments[id]) continue;
    let png: Uint8Array | null = null;
    if (options.renderPreview && hasSource(a)) {
      try {
        const drawn = await options.renderPreview(a.source, typeof a.title === 'string' && a.title ? a.title : undefined);
        const bytes = drawn ? new Uint8Array(await drawn.png.arrayBuffer()) : null;
        png = bytes && isPng(bytes) ? bytes : null;
      } catch {
        png = null;
      }
    }
    if (png) {
      attachments[id] = { type: 'image/png', data: toBase64(png) };
      if (report) NOTES.diagramRedrawn(report);
    } else if (report) {
      report.add(
        'dcosdoc-preview-left-out',
        "1 diagram's preview could not be read and was left out; the diagram keeps its data and its preview can be drawn again",
        "{n} diagrams' previews could not be read and were left out; the diagrams keep their data and their previews can be drawn again",
      );
    }
  }
  const { schemaVersion: _stored, ...rest } = content;
  const file: DcosdocFile = {
    format: DCOSDOC_FORMAT,
    version: DCOSDOC_VERSION,
    ...(app ? { app } : {}),
    title,
    // The lowest schema the content needs, as storage records it, so an older build can tell whether it can open it.
    content: { ...rest, schemaVersion: contentSchemaFor(rest as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>) } as DocumentContent,
    attachments,
  };
  return new Blob([JSON.stringify(file)], { type: DCOSDOC_MIME });
}
