/**
 * PNG export drawn from the model's SVG (renderSvg.tsx) rather than from the canvas: the SVG is loaded as an image and
 * drawn onto a canvas at the chosen scale. It needs no on-screen canvas, has no `<foreignObject>` (so the canvas is
 * never tainted, and Safari draws large diagrams that html-to-image's data URL could not), and the pixel limits
 * from R1 still apply (cappedPixelRatio, DS-R4).
 */
import { cappedPixelRatio, resolutionNote } from '../export';
import type { DiagramContent } from '../types';
import { buildScene, renderScene, sceneNotes, sceneViewBox, type SvgExportOptions } from './renderSvg';

export interface PngExportOptions extends Pick<SvgExportOptions, 'selection' | 'title'> {
  /** Pixels per CSS pixel: 1, 2 or 3 (default 2). Lowered when the image would not fit a browser canvas. */
  scale?: number;
  /** 'white' (default) or 'transparent'. */
  background?: 'white' | 'transparent';
}

export interface PngExport {
  blob: Blob;
  /** Natural size in CSS pixels; the image is `pixelRatio` times larger. */
  width: number;
  height: number;
  pixelRatio: number;
  requestedPixelRatio: number;
  notes: string[];
}

/** Loads SVG markup as an image. A Blob URL keeps very large drawings working where a data URL is refused. */
async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The browser could not draw this diagram as an image.'));
      img.src = url;
    });
    return img;
  } finally {
    // The image keeps its decoded data; the URL is no longer needed once it has loaded.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The notes a PNG adds: what an image cannot hold. */
export function pngLossNotes(stats: { links: number; tooltips: number }): string[] {
  const parts: string[] = [];
  if (stats.links) parts.push(plural(stats.links, 'link', 'links'));
  if (stats.tooltips) parts.push(plural(stats.tooltips, 'tooltip', 'tooltips'));
  return parts.length ? [`${parts.join(' and ')} cannot be kept in a PNG image (export SVG or PDF to keep links).`] : [];
}

/** Draws the diagram (or the selection) as a PNG. */
export async function renderDiagramPng(content: DiagramContent, opts: PngExportOptions = {}): Promise<PngExport> {
  const scene = buildScene(content, opts);
  if (!scene.nodes.length) throw new Error(opts.selection ? 'Nothing selected to export' : 'The diagram is empty');
  const natural = sceneViewBox(scene);
  const requested = opts.scale ?? 2;
  const pixelRatio = cappedPixelRatio(natural.width, natural.height, requested);
  const pw = Math.max(1, Math.round(natural.width * pixelRatio));
  const ph = Math.max(1, Math.round(natural.height * pixelRatio));
  const { svg } = renderScene(scene, { background: opts.background === 'transparent' ? null : '#ffffff', outputWidth: pw, outputHeight: ph, title: opts.title });
  const img = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('The browser could not create an image of this size.');
  g.drawImage(img, 0, 0, pw, ph);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  // Free the bitmap now rather than when the canvas is collected (Safari keeps a total canvas memory budget).
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('The browser could not create an image of this size.');
  const r = { pixelRatio, requestedPixelRatio: requested };
  const res = resolutionNote(r);
  return {
    blob,
    width: natural.width,
    height: natural.height,
    ...r,
    notes: [...sceneNotes(scene.stats), ...(res ? [res] : []), ...pngLossNotes(scene.stats)],
  };
}
