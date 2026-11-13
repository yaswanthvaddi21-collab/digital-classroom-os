import { getNodesBounds, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

const PADDING = 40;

/** Editing chrome that must not appear in exported images. */
const EXCLUDED = ['react-flow__handle', 'react-flow__resize-control', 'react-flow__minimap', 'react-flow__controls', 'react-flow__panel', 'react-flow__edgeupdater'];

function captureOptions(nodes: Node[], pixelRatio: number) {
  const b = getNodesBounds(nodes);
  const width = Math.ceil(b.width + PADDING * 2);
  const height = Math.ceil(b.height + PADDING * 2);
  return {
    width,
    height,
    options: {
      backgroundColor: '#ffffff',
      width,
      height,
      pixelRatio,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${PADDING - b.x}px, ${PADDING - b.y}px) scale(1)` },
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

/** Size in CSS pixels of an export of these nodes (their bounds plus padding): the diagram's natural size. */
export function exportSize(nodes: Node[]): { width: number; height: number } {
  if (!nodes.length) return { width: 0, height: 0 };
  const { width, height } = captureOptions(nodes, 1);
  return { width, height };
}

/** PNG at 2× (or more) so diagrams stay crisp when pasted into documents or projected. */
export async function exportPng(flowEl: HTMLElement, nodes: Node[], pixelRatio = 2): Promise<Blob> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { options } = captureOptions(nodes, pixelRatio);
  return dataUrlToBlob(await toPng(viewportOf(flowEl), options));
}

export async function exportSvg(flowEl: HTMLElement, nodes: Node[]): Promise<Blob> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { options } = captureOptions(nodes, 1);
  // Embedding the UI font would add ~1.5 MB; SVG viewers fall back to their own sans-serif.
  return dataUrlToBlob(await toSvg(viewportOf(flowEl), { ...options, skipFonts: true }));
}

/** Single-page PDF sized to the diagram, with a high-resolution raster of it. */
export async function exportPdf(flowEl: HTMLElement, nodes: Node[]): Promise<Blob> {
  if (!nodes.length) throw new Error('The diagram is empty');
  const { width, height, options } = captureOptions(nodes, 3);
  const png = await toPng(viewportOf(flowEl), options);
  const { jsPDF } = await import('jspdf');
  // 1 CSS px = 0.75 pt.
  const w = width * 0.75;
  const h = height * 0.75;
  const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
  pdf.addImage(png, 'PNG', 0, 0, w, h, undefined, 'FAST');
  return pdf.output('blob');
}
