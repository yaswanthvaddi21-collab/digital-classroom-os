import { getNodesBounds, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

const PADDING = 40;

/**
 * Largest bitmap an export draws. Safari refuses canvases above 16,777,216 pixels (4096 × 4096) and draws nothing,
 * and browsers limit each side (16,384 is safe everywhere), so a large diagram at 2× or 3× would export blank (audit
 * DS-R4). The pixel ratio is lowered to fit, and the export says so.
 */
export const MAX_CANVAS_PIXELS = 16_777_216;
export const MAX_CANVAS_SIDE = 16_384;

/** The pixel ratio to draw a `width` × `height` CSS-pixel image at: `requested`, or less when that would not fit. */
export function cappedPixelRatio(width: number, height: number, requested: number): number {
  if (width <= 0 || height <= 0) return requested;
  const fit = Math.min(Math.sqrt(MAX_CANVAS_PIXELS / (width * height)), MAX_CANVAS_SIDE / Math.max(width, height));
  // Rounded down to 1/100, so the bitmap stays within both limits.
  return fit >= requested ? requested : Math.floor(fit * 100) / 100;
}

/** A rendered image and the pixel ratio actually used (lower than requested when the diagram is very large). */
export interface PngRender {
  blob: Blob;
  /** Natural size in CSS pixels. */
  width: number;
  height: number;
  pixelRatio: number;
  requestedPixelRatio: number;
}

/** The note an export adds when it had to lower the resolution. */
export function resolutionNote(r: { pixelRatio: number; requestedPixelRatio: number }): string | null {
  if (r.pixelRatio >= r.requestedPixelRatio) return null;
  return `The diagram is too large for a ${r.requestedPixelRatio}× image, so it was drawn at ${r.pixelRatio}× (the browser's largest canvas is ${MAX_CANVAS_PIXELS.toLocaleString('en-US')} pixels).`;
}

/** Editing chrome that must not appear in exported images. */
const EXCLUDED = ['react-flow__handle', 'react-flow__resize-control', 'react-flow__minimap', 'react-flow__controls', 'react-flow__panel', 'react-flow__edgeupdater'];

function captureOptions(nodes: Node[], requestedPixelRatio: number) {
  const b = getNodesBounds(nodes);
  const width = Math.ceil(b.width + PADDING * 2);
  const height = Math.ceil(b.height + PADDING * 2);
  const pixelRatio = cappedPixelRatio(width, height, requestedPixelRatio);
  // html-to-image draws the page as an SVG image of `width` × `height` first, then onto the canvas at `pixelRatio`.
  // Below 1× that intermediate image would itself be larger than the canvas limit, so the diagram is scaled down
  // inside the image instead and drawn at 1×.
  const scale = Math.min(1, pixelRatio);
  const imageWidth = Math.max(1, Math.round(width * scale));
  const imageHeight = Math.max(1, Math.round(height * scale));
  return {
    width,
    height,
    pixelRatio,
    options: {
      backgroundColor: '#ffffff',
      width: imageWidth,
      height: imageHeight,
      pixelRatio: pixelRatio / scale,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${(PADDING - b.x) * scale}px, ${(PADDING - b.y) * scale}px) scale(${scale})`,
      },
      filter: (el: HTMLElement) => !(el.classList && EXCLUDED.some((c) => el.classList.contains(c))),
    },
  };
}

function viewportOf(flowEl: HTMLElement) {
  const el = flowEl.querySelector<HTMLElement>('.react-flow__viewport');
  if (!el) throw new Error('Diagram canvas not found');
  return el;
}

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

/**
 * html-to-image turns the drawing into one data URL. A browser may refuse one that large (Safari does for a few
 * hundred shapes) and reports only an Event or "Load failed"; say what happened instead.
 */
export const TOO_LARGE_FOR_IMAGE =
  'The browser could not draw this diagram as an image (it may be too large for this browser). Export it as .drawio or .dcosdiagram instead, or try another browser.';
async function drawing<T>(make: () => Promise<T>): Promise<T> {
  try {
    return await make();
  } catch (err) {
    if (!(err instanceof Error) || /load failed|failed to fetch|access control/i.test(err.message)) throw new Error(TOO_LARGE_FOR_IMAGE);
    throw err;
  }
}

/** Size in CSS pixels of an export of these nodes (their bounds plus padding): the diagram's natural size. */
export function exportSize(nodes: Node[]): { width: number; height: number } {
  if (!nodes.length) return { width: 0, height: 0 };
  const { width, height } = captureOptions(nodes, 1);
  return { width, height };
}

/** PNG at 2× (or more) so diagrams stay crisp when pasted into documents or projected; less if it would not fit a canvas. */
export async function renderPng(flowEl: HTMLElement, nodes: Node[], requestedPixelRatio = 2): Promise<PngRender> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { width, height, pixelRatio, options } = captureOptions(nodes, requestedPixelRatio);
  const blob = await drawing(async () => dataUrlToBlob(await toPng(viewportOf(flowEl), options)));
  return { blob, width, height, pixelRatio, requestedPixelRatio };
}

export async function exportPng(flowEl: HTMLElement, nodes: Node[], pixelRatio = 2): Promise<Blob> {
  return (await renderPng(flowEl, nodes, pixelRatio)).blob;
}

export async function exportSvg(flowEl: HTMLElement, nodes: Node[]): Promise<Blob> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { options } = captureOptions(nodes, 1);
  // Embedding the UI font would add ~1.5 MB; SVG viewers fall back to their own sans-serif.
  return drawing(async () => dataUrlToBlob(await toSvg(viewportOf(flowEl), { ...options, skipFonts: true })));
}

/** Single-page PDF sized to the diagram, with a high-resolution raster of it (3×, or less if it would not fit a canvas). */
export async function renderPdf(flowEl: HTMLElement, nodes: Node[]): Promise<{ blob: Blob; pixelRatio: number; requestedPixelRatio: number }> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { width, height, pixelRatio, options } = captureOptions(nodes, 3);
  const png = await drawing(() => toPng(viewportOf(flowEl), options));
  const { jsPDF } = await import('jspdf');
  // 1 CSS px = 0.75 pt.
  const w = width * 0.75;
  const h = height * 0.75;
  const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
  pdf.addImage(png, 'PNG', 0, 0, w, h, undefined, 'FAST');
  return { blob: pdf.output('blob'), pixelRatio, requestedPixelRatio: 3 };
}

export async function exportPdf(flowEl: HTMLElement, nodes: Node[]): Promise<Blob> {
  return (await renderPdf(flowEl, nodes)).blob;
}
