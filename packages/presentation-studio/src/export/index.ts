/**
 * The exports, loaded on first use by the Export menu (ExportMenu.tsx imports this module dynamically, so PptxGenJS,
 * jsPDF and svg2pdf never reach the editor's own chunk).
 */
import { safeFileName } from '@dcos/ui';
import type { PresentationContent } from '../types';
import type { ExportHosts } from './assets';
import { buildPdf } from './pdf';
import { buildPptx } from './pptx';
import type { ExportResult } from './report';

export type ExportFormatId = 'pptx' | 'pdf' | 'pdf-notes';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const slides = (n: number) => `${n} ${n === 1 ? 'slide' : 'slides'}`;

/** Runs one export and says what it did. Throws (with a readable message) when it cannot. */
export async function exportPresentation(format: ExportFormatId, content: PresentationContent, opts: ExportHosts & { title: string }): Promise<ExportResult> {
  const name = safeFileName(opts.title, 'Presentation');
  if (format === 'pptx') {
    const r = await buildPptx(content, opts);
    return { blob: new Blob([r.bytes as BlobPart], { type: PPTX_MIME }), fileName: `${name}.pptx`, message: `Exported PowerPoint (${slides(r.slides)})`, notes: r.report.sentences() };
  }
  const notes = format === 'pdf-notes';
  const r = await buildPdf(content, { ...opts, notes });
  return { blob: r.blob, fileName: notes ? `${name} (notes).pdf` : `${name}.pdf`, message: notes ? `Exported PDF with speaker notes (${r.pages} ${r.pages === 1 ? 'page' : 'pages'})` : `Exported PDF (${slides(r.pages)})`, notes: r.report.sentences() };
}

export { buildPptx, buildPdf };
export type { ExportResult };
