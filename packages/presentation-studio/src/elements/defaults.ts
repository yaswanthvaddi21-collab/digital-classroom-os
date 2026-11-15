/**
 * New objects for the Insert tab and placeholders (Phase 7 CONTENT): pictures, shapes, tables, charts and diagrams,
 * placed in the middle of the slide (or in a placeholder's box), with sizes that keep their proportions.
 */
import { fitPicture } from '../geometry';
import type { PresentationEmbeddedDiagram } from '../hosts';
import { textStyle } from '../layouts';
import {
  emptyRichText,
  type ChartElement,
  type ChartType,
  type DiagramElement,
  type ImageElement,
  type Placeholder,
  type PresentationSize,
  type ShapeElement,
  type ShapePreset,
  type TableElement,
} from '../types';
import { isRoundChart } from './chart';
import { newTable } from './table';

export type Box = { x: number; y: number; w: number; h: number };

/** Names of the preset shapes, in the order the shape gallery shows them. */
export const SHAPE_NAMES: Readonly<Record<ShapePreset, string>> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Oval',
  triangle: 'Triangle',
  rtTriangle: 'Right triangle',
  diamond: 'Diamond',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  chevron: 'Chevron',
  rightArrow: 'Right arrow',
  leftArrow: 'Left arrow',
  upArrow: 'Up arrow',
  downArrow: 'Down arrow',
  leftRightArrow: 'Left-right arrow',
  line: 'Line',
  star5: 'Star',
  plus: 'Plus',
  heart: 'Heart',
  wedgeRectCallout: 'Callout',
  wedgeRoundRectCallout: 'Rounded callout',
};

/** A box of w × h in the middle of the slide. */
export const centred = (size: PresentationSize, w: number, h: number): Box => ({ x: Math.round((size.width - w) / 2), y: Math.round((size.height - h) / 2), w: Math.round(w), h: Math.round(h) });

/** A natural size scaled down (never up) to fit within `fraction` of the slide, centred. */
export function fitOnSlide(size: PresentationSize, natural: { width: number; height: number }, fraction = 0.6): Box {
  const maxW = size.width * fraction;
  const maxH = size.height * fraction;
  const w0 = natural.width > 0 ? natural.width : maxW;
  const h0 = natural.height > 0 ? natural.height : maxH;
  const s = Math.min(1, maxW / w0, maxH / h0);
  return centred(size, Math.max(8, w0 * s), Math.max(8, h0 * s));
}

/** A natural size fitted inside a placeholder's box (keeping proportions), centred in it. */
export function fitInBox(box: Box, natural: { width: number; height: number }): Box {
  const placed = fitPicture(natural, box, 'contain');
  return { x: Math.round(box.x + placed.x), y: Math.round(box.y + placed.y), w: Math.max(1, Math.round(placed.w)), h: Math.max(1, Math.round(placed.h)) };
}

/** The part of a placeholder an element filling it takes: its box and its link. */
export const placeholderBox = (p: Placeholder): Box => ({ x: p.x, y: p.y, w: p.w, h: p.h });

export interface StoredPictureInfo {
  attachmentId: string;
  mimeType: string;
  width: number;
  height: number;
}

export function newImage(id: string, pic: StoredPictureInfo, box: Box, alt = ''): ImageElement {
  return { id, type: 'image', ...box, rotation: 0, attachmentId: pic.attachmentId, mimeType: pic.mimeType, naturalWidth: pic.width, naturalHeight: pic.height, fit: 'contain', alt };
}

export function newShape(id: string, preset: ShapePreset, size: PresentationSize): ShapeElement {
  const line = preset === 'line';
  const square = ['ellipse', 'star5', 'plus', 'heart', 'octagon', 'hexagon', 'pentagon', 'diamond'].includes(preset);
  const box = line ? centred(size, 240, 0) : square ? centred(size, 160, 160) : centred(size, 240, 140);
  return {
    id,
    type: 'shape',
    ...box,
    rotation: 0,
    preset,
    fill: line ? { type: 'none' } : { type: 'solid', color: { theme: 'accent1' } },
    line: line ? { color: { theme: 'dark1' }, width: 2, dash: 'solid', headEnd: 'none', tailEnd: 'none' } : { color: { theme: 'dark2' }, width: 1, dash: 'solid' },
    ...(line ? {} : { text: emptyRichText(), textStyle: textStyle({ align: 'center', verticalAlign: 'middle', color: { theme: 'light1' }, autofit: 'none', fontSize: 18 }) }),
  };
}

/** The sample data a new chart starts with (three categories, two series, as PowerPoint does). */
export function sampleChartData(type: ChartType): Pick<ChartElement, 'categories' | 'series'> {
  if (isRoundChart(type)) return { categories: ['Group A', 'Group B', 'Group C', 'Group D'], series: [{ name: 'Students', values: [12, 8, 5, 3] }] };
  return {
    categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    series: [
      { name: 'Class A', values: [62, 70, 74, 81] },
      { name: 'Class B', values: [55, 64, 69, 72] },
    ],
  };
}

export function newChart(id: string, type: ChartType, box: Box): ChartElement {
  return {
    id,
    type: 'chart',
    ...box,
    rotation: 0,
    chartType: type,
    ...sampleChartData(type),
    title: 'Chart title',
    showTitle: true,
    legend: 'bottom',
    showValues: false,
    font: 'body',
    fontSize: 12,
    textColor: { theme: 'dark1' },
  };
}

export function newTableIn(id: string, rows: number, columns: number, box: Box): TableElement {
  return newTable(id, rows, columns, box);
}

/** A diagram from the app's diagram editor, at its natural size fitted on the slide (or into `box`). */
export function newDiagram(id: string, d: PresentationEmbeddedDiagram, size: PresentationSize, box?: Box): DiagramElement {
  const natural = { width: d.naturalWidth, height: d.naturalHeight };
  const at = box ? fitInBox(box, natural) : fitOnSlide(size, natural, 0.7);
  return {
    id,
    type: 'diagram',
    ...at,
    rotation: 0,
    source: d.source,
    previewId: d.previewId ?? '',
    naturalWidth: d.naturalWidth,
    naturalHeight: d.naturalHeight,
    title: d.title,
    alt: null,
    svgPreviewId: d.svgPreviewId ?? null,
  };
}

/**
 * A diagram element after its diagram was edited: the new data and preview, the same place and width, and the height
 * that keeps the new drawing's proportions (as a document keeps the chosen width). An SVG preview of the old drawing
 * is dropped unless the result brings a new one.
 */
export function withEditedDiagram(el: DiagramElement, d: PresentationEmbeddedDiagram): DiagramElement {
  const ratio = d.naturalWidth > 0 && d.naturalHeight > 0 ? d.naturalHeight / d.naturalWidth : el.h / Math.max(1, el.w);
  return {
    ...el,
    source: d.source,
    previewId: d.previewId ?? '',
    naturalWidth: d.naturalWidth,
    naturalHeight: d.naturalHeight,
    title: d.title,
    svgPreviewId: d.svgPreviewId ?? null,
    h: Math.max(1, Math.round(el.w * ratio)),
  };
}
