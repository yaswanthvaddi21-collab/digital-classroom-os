/**
 * One entry point for the image exports (PNG, SVG, PDF) with their options. Used by the Export menu's one-click
 * entries (defaults) and by the Export options dialog. Every export works from the diagram's content, not the canvas.
 */
import type { DiagramContent } from '../types';
import { renderDiagramPdf, type PdfOrientation, type PdfPageSize, type PdfScaleMode } from './pdf';
import { renderDiagramPng } from './raster';
import { renderDiagramSvg } from './renderSvg';

export type ImageFormat = 'png' | 'svg' | 'pdf';

export interface ImageExportRequest {
  format: ImageFormat;
  /** Export only these shapes (with the shapes inside them) and connectors. */
  selection?: { nodes: string[]; edges: string[] };
  /** PNG and SVG: page colour (default white). The PDF page is always white paper. */
  background?: 'white' | 'transparent';
  /** PNG: 1, 2 or 3 pixels per CSS pixel (default 2). */
  scale?: number;
  /** PDF page settings (default: one page the size of the diagram). */
  page?: PdfPageSize;
  orientation?: PdfOrientation;
  mode?: PdfScaleMode;
}

export interface ImageExportResult {
  blob: Blob;
  extension: ImageFormat;
  /** "Exported PNG", "Exported PDF of the selection" … */
  message: string;
  notes: string[];
}

export const SVG_MIME = 'image/svg+xml';

export async function exportDiagramImage(content: DiagramContent, title: string, req: ImageExportRequest): Promise<ImageExportResult> {
  const message = `Exported ${req.format.toUpperCase()}${req.selection ? ' of the selection' : ''}`;
  if (req.format === 'svg') {
    const r = renderDiagramSvg(content, { selection: req.selection, background: req.background === 'transparent' ? null : '#ffffff', title });
    return { blob: new Blob([r.svg], { type: SVG_MIME }), extension: 'svg', message, notes: r.notes };
  }
  if (req.format === 'png') {
    const r = await renderDiagramPng(content, { selection: req.selection, background: req.background, scale: req.scale ?? 2, title });
    return { blob: r.blob, extension: 'png', message, notes: r.notes };
  }
  const r = await renderDiagramPdf(content, { selection: req.selection, page: req.page, orientation: req.orientation, mode: req.mode, title });
  return { blob: r.blob, extension: 'pdf', message, notes: r.notes };
}
