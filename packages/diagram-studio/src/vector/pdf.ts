/**
 * Vector PDF export: the model's SVG (renderSvg.tsx) converted by svg2pdf.js into PDF paths and real text (so text
 * can be selected and searched, and lines stay sharp at any zoom). Page size: the diagram's own size, or A4 / Letter
 * in either orientation, either scaled to fit one page or at actual size split across pages (tiling).
 */
import type { DiagramContent } from '../types';
import { buildScene, renderScene, sceneNotes, sceneViewBox, type SvgExportOptions } from './renderSvg';
import type { Box } from './textLayout';

export type PdfPageSize = 'fit' | 'a4' | 'letter';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';
/** On A4/Letter: shrink the diagram to one page, or keep it at actual size over as many pages as it needs. */
export type PdfScaleMode = 'fit-page' | 'actual-size';

export interface PdfExportOptions extends Pick<SvgExportOptions, 'selection' | 'title'> {
  page?: PdfPageSize;
  orientation?: PdfOrientation;
  mode?: PdfScaleMode;
}

/** Page sizes in points (1/72 inch), portrait. */
export const PAGE_SIZES: Record<Exclude<PdfPageSize, 'fit'>, { name: string; width: number; height: number }> = {
  a4: { name: 'A4', width: 595.28, height: 841.89 },
  letter: { name: 'Letter', width: 612, height: 792 },
};
/** 1 CSS pixel is 0.75 pt (96 px per inch), the size the diagram has on screen at 100%. */
export const PT_PER_PX = 0.75;
/** Margin on A4/Letter pages: 10 mm, so printers do not cut the drawing. */
export const PAGE_MARGIN = 28.35;
/** PDF viewers limit a page to 200 inches (14,400 pt) per side. */
export const MAX_PAGE_SIDE = 14_400;
/** More pages than this is almost certainly not what was meant; the export asks for a smaller setting instead. */
export const MAX_TILES = 100;

export interface PdfPagePlan {
  /** Where the whole drawing's top-left corner goes on this page, in points. */
  x: number;
  y: number;
  /** The printable area of this page (the drawing is clipped to it), in points; absent for a single fitted page. */
  clip?: Box;
  /** The part of the drawing (in diagram coordinates) this page shows, to leave out what is elsewhere. */
  region?: Box;
}

export interface PdfLayout {
  pageWidth: number;
  pageHeight: number;
  /** Points per CSS pixel of the diagram. */
  scale: number;
  cols: number;
  rows: number;
  pages: PdfPagePlan[];
  notes: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Plans the pages for a drawing of `width` × `height` CSS pixels whose top-left is at `origin` in diagram
 * coordinates. Pure, so it is tested without a browser.
 */
export function planPdf(width: number, height: number, opts: Pick<PdfExportOptions, 'page' | 'orientation' | 'mode'> = {}, origin = { x: 0, y: 0 }): PdfLayout {
  const page = opts.page ?? 'fit';
  if (page === 'fit') {
    const longest = Math.max(width, height) * PT_PER_PX;
    const scale = longest > MAX_PAGE_SIDE ? (PT_PER_PX * MAX_PAGE_SIDE) / longest : PT_PER_PX;
    const notes = scale < PT_PER_PX ? [`The diagram is larger than the biggest PDF page (200 inches), so it was scaled to ${pct(scale / PT_PER_PX)}.`] : [];
    return { pageWidth: width * scale, pageHeight: height * scale, scale, cols: 1, rows: 1, pages: [{ x: 0, y: 0 }], notes };
  }
  const size = PAGE_SIZES[page];
  const landscape = opts.orientation === 'landscape' || (opts.orientation !== 'portrait' && width > height);
  const pageWidth = landscape ? size.height : size.width;
  const pageHeight = landscape ? size.width : size.height;
  const availW = pageWidth - 2 * PAGE_MARGIN;
  const availH = pageHeight - 2 * PAGE_MARGIN;
  const label = `${size.name} ${landscape ? 'landscape' : 'portrait'}`;
  if ((opts.mode ?? 'fit-page') === 'fit-page') {
    const scale = Math.min(PT_PER_PX, availW / width, availH / height);
    const x = (pageWidth - width * scale) / 2;
    const y = (pageHeight - height * scale) / 2;
    const notes = scale < PT_PER_PX ? [`The diagram was scaled to ${pct(scale / PT_PER_PX)} to fit one ${label} page.`] : [];
    return { pageWidth, pageHeight, scale, cols: 1, rows: 1, pages: [{ x, y }], notes };
  }
  const scale = PT_PER_PX;
  const cols = Math.max(1, Math.ceil((width * scale) / availW - 1e-9));
  const rows = Math.max(1, Math.ceil((height * scale) / availH - 1e-9));
  if (cols * rows > MAX_TILES)
    throw new Error(`At actual size this diagram needs ${cols * rows} ${size.name} pages (more than ${MAX_TILES}). Choose "Fit to one page" or "Diagram size" instead.`);
  const pages: PdfPagePlan[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      // A diagram that fits one page is centred on it; tiles start at the margin.
      const x = cols * rows === 1 ? (pageWidth - width * scale) / 2 : PAGE_MARGIN - c * availW;
      const y = cols * rows === 1 ? (pageHeight - height * scale) / 2 : PAGE_MARGIN - r * availH;
      pages.push({
        x,
        y,
        clip: cols * rows === 1 ? undefined : { x: PAGE_MARGIN, y: PAGE_MARGIN, width: availW, height: availH },
        region: { x: origin.x + (c * availW) / scale, y: origin.y + (r * availH) / scale, width: availW / scale, height: availH / scale },
      });
    }
  const notes = cols * rows > 1 ? [`It was split across ${cols * rows} ${label} pages (${cols} across, ${rows} down) at actual size.`] : [];
  return { pageWidth, pageHeight, scale, cols, rows, pages, notes };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface PdfExport {
  blob: Blob;
  pages: number;
  notes: string[];
}

/** Draws the diagram (or the selection) as a vector PDF. Browser only (svg2pdf needs the DOM). */
export async function renderDiagramPdf(content: DiagramContent, opts: PdfExportOptions = {}): Promise<PdfExport> {
  const scene = buildScene(content, opts);
  if (!scene.nodes.length) throw new Error(opts.selection ? 'Nothing selected to export' : 'The diagram is empty');
  const vb = sceneViewBox(scene);
  const layout = planPdf(vb.width, vb.height, opts, vb);
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const orientation = layout.pageWidth >= layout.pageHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'pt', format: [layout.pageWidth, layout.pageHeight], orientation, compress: true });
  pdf.setProperties({ title: opts.title ?? 'Diagram', creator: 'Classroom OS' });
  const parser = new DOMParser();
  for (const [i, page] of layout.pages.entries()) {
    if (i > 0) pdf.addPage([layout.pageWidth, layout.pageHeight], orientation);
    // Markers are drawn in place (svg2pdf would scale <marker>s by the line width); only what reaches this page is drawn.
    const { svg } = renderScene(scene, { background: null, inlineMarkers: true, region: page.region });
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('The diagram could not be converted to PDF.');
    if (page.clip) {
      pdf.saveGraphicsState();
      pdf.rect(page.clip.x, page.clip.y, page.clip.width, page.clip.height, null);
      pdf.clip();
      pdf.discardPath();
    }
    await pdf.svg(doc.documentElement, { x: page.x, y: page.y, width: vb.width * layout.scale, height: vb.height * layout.scale });
    if (page.clip) pdf.restoreGraphicsState();
  }
  const notes = [...sceneNotes(scene.stats), ...layout.notes];
  if (scene.stats.nonLatinLabels)
    notes.push(`${plural(scene.stats.nonLatinLabels, 'label uses', 'labels use')} characters the PDF's built-in fonts cannot show, so ${scene.stats.nonLatinLabels === 1 ? 'it' : 'they'} may not appear correctly; export SVG or PNG for ${scene.stats.nonLatinLabels === 1 ? 'it' : 'them'}.`);
  if (scene.stats.tooltips) notes.push(`${plural(scene.stats.tooltips, 'tooltip is', 'tooltips are')} not kept in the PDF (links are).`);
  return { blob: pdf.output('blob'), pages: layout.pages.length, notes };
}
