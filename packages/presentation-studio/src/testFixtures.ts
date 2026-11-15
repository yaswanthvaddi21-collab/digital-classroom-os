/**
 * A presentation that uses every part of the schema-1 model: every element type, shape preset, fill, line, rich text
 * node and mark, table feature, chart type, transition and animation. Tests use it to prove the validator and the
 * frozen vocabulary accept the whole model, and later groups (export, show) use it as their sample. Not used by the app.
 */
import { createPresentation } from './create';
import { layoutIdFor, textStyle } from './layouts';
import {
  CHART_TYPES,
  emptyRichText,
  SHAPE_PRESETS,
  type PresentationContent,
  type RichTextDoc,
  type SlideElement,
  type TransitionType,
} from './types';

let counter = 0;
const id = (prefix: string) => `${prefix}-${++counter}`;

export const RICH_EVERYTHING: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' underline', marks: [{ type: 'underline' }] },
        { type: 'text', text: ' strike', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' H', marks: [] },
        { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
        { type: 'text', text: 'O x', marks: [] },
        { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'a link', marks: [{ type: 'link', attrs: { href: 'https://example.org/' } }] },
        { type: 'text', text: ' highlighted', marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }] },
        { type: 'text', text: ' styled', marks: [{ type: 'textStyle', attrs: { color: '#dc2626', fontFamily: 'Georgia', fontSize: '28pt' } }] },
      ],
    },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }] }] }] }] },
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }] }] },
  ],
};

const base = { rotation: 0 } as const;

export function kitchenSinkPresentation(): PresentationContent {
  counter = 0;
  const p = createPresentation('blank', { newId: () => id('x') });
  const text = (x: number, y: number, doc: RichTextDoc): SlideElement => ({ ...base, id: id('t'), type: 'text', x, y, w: 300, h: 120, text: doc, style: textStyle(), fill: { type: 'solid', color: { theme: 'light2' }, opacity: 0.8 }, line: { color: '#000000', width: 1, dash: 'dash' } });
  const shapes: SlideElement[] = SHAPE_PRESETS.map((preset, i) => ({
    ...base,
    id: id('s'),
    type: 'shape',
    preset,
    x: 20 + (i % 8) * 110,
    y: 20 + Math.floor(i / 8) * 120,
    w: 100,
    h: preset === 'line' ? 0 : 90,
    rotation: i * 15,
    fill: i % 3 === 0 ? { type: 'gradient', angle: 45, stops: [{ position: 0, color: { theme: 'accent1' } }, { position: 1, color: '#ffffff' }] } : { type: 'solid', color: { theme: 'accent2' } },
    line: { color: { theme: 'dark1' }, width: 2, dash: (['solid', 'dash', 'dot', 'dashDot'] as const)[i % 4], ...(preset === 'line' ? { headEnd: 'oval', tailEnd: 'triangle' } : {}) },
    ...(preset === 'line' ? {} : { text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: preset }] }] }, textStyle: textStyle({ fontSize: 12, align: 'center', verticalAlign: 'middle' }) }),
    ...(i % 5 === 0 ? { flipH: true, flipV: true } : {}),
  }));
  const charts: SlideElement[] = CHART_TYPES.map((chartType, i) => ({
    ...base,
    id: id('c'),
    type: 'chart',
    chartType,
    x: 20 + i * 180,
    y: 300,
    w: 170,
    h: 200,
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'Lab A', values: [3, 5, null] },
      { name: 'Lab B', values: [4, 2, 6], color: { theme: 'accent3' } },
    ],
    title: `${chartType} chart`,
    showTitle: true,
    legend: (['none', 'top', 'bottom', 'left', 'right'] as const)[i],
    showValues: i % 2 === 0,
    ...(chartType === 'bar' || chartType === 'column' ? { stacked: chartType === 'column' } : {}),
    ...(chartType === 'pie' || chartType === 'doughnut' ? { categoryColors: [{ theme: 'accent1' }, '#16a34a', { theme: 'accent5' }] } : {}),
    font: 'body',
    fontSize: 12,
    textColor: { theme: 'dark1' },
  }));
  const table: SlideElement = {
    ...base,
    id: id('tb'),
    type: 'table',
    x: 40,
    y: 40,
    w: 600,
    h: 160,
    columns: [200, 200, 200],
    rows: [
      { height: 40, cells: ['Name', 'Value', 'Unit'].map((t) => ({ text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } })) },
      {
        height: 40,
        cells: [
          { text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merged' }] }] }, colSpan: 2, fill: '#fde68a', align: 'center', verticalAlign: 'middle' },
          { text: emptyRichText(), merged: true },
          { text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cm' }] }] }, borders: { top: null, right: { color: '#ff0000', width: 2, dash: 'solid' } } },
        ],
      },
      { height: 40, cells: [0, 1, 2].map(() => ({ text: emptyRichText() })) },
    ],
    style: {
      headerRow: true,
      bandedRows: true,
      firstColumn: true,
      fill: { theme: 'light1' },
      headerFill: { theme: 'accent1' },
      bandFill: { theme: 'light2' },
      headerTextColor: '#ffffff',
      border: { color: { theme: 'dark2' }, width: 1, dash: 'solid' },
      text: textStyle({ fontSize: 14 }),
    },
  };
  const image: SlideElement = { ...base, id: id('i'), type: 'image', x: 660, y: 40, w: 240, h: 160, attachmentId: 'attachment-picture', mimeType: 'image/png', naturalWidth: 640, naturalHeight: 480, fit: 'cover', crop: { left: 0.1, top: 0, right: 0.1, bottom: 0.05 }, alt: 'A lab bench', name: 'Bench photo', locked: true };
  const diagram: SlideElement = { ...base, id: id('d'), type: 'diagram', x: 660, y: 220, w: 240, h: 160, source: { schemaVersion: 3, nodes: [], edges: [] }, previewId: 'attachment-diagram', naturalWidth: 480, naturalHeight: 320, title: 'Process', alt: 'The process', svgPreviewId: 'attachment-diagram-svg' };
  const transitions: TransitionType[] = ['none', 'fade', 'push', 'wipe', 'cover', 'split', 'zoom'];
  const effects = ['appear', 'fade', 'fly-in', 'zoom', 'wipe'] as const;
  const animated = (els: SlideElement[]) =>
    els.map((e, i) => ({ ...e, animation: { effect: effects[i % effects.length], order: i + 1, trigger: (['on-click', 'with-previous', 'after-previous'] as const)[i % 3], duration: 500, delay: i * 100, ...(effects[i % effects.length] === 'fly-in' ? { direction: 'left' as const } : {}) } }));
  const title = p.slides[0];
  title.elements = title.elements.map((e) => (e.type === 'text' ? { ...e, text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: e.placeholderId === 'title' ? 'Every feature' : 'A sample' }] }] } } : e));
  title.notes = RICH_EVERYTHING;
  title.transition = { type: 'fade', duration: 700 };
  p.masters[0].decorations = [{ ...base, id: id('md'), type: 'shape', preset: 'rect', x: 0, y: 530, w: 960, h: 10, fill: { type: 'solid', color: { theme: 'accent1' } }, line: null }];
  p.layouts[1].background = { type: 'gradient', angle: 90, stops: [{ position: 0, color: { theme: 'light1' } }, { position: 1, color: { theme: 'light2' } }] };
  p.layouts[1].decorations = [{ ...base, id: id('ld'), type: 'image', x: 900, y: 10, w: 50, h: 50, attachmentId: 'attachment-logo', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64, fit: 'contain', alt: '' }];
  p.slides.push(
    { id: id('slide'), layoutId: layoutIdFor('titleContent'), elements: [text(40, 140, RICH_EVERYTHING), image, diagram], notes: emptyRichText(), transition: { type: 'push', duration: 500, direction: 'left' }, background: { type: 'image', attachmentId: 'attachment-background', fit: 'cover' } },
    { id: id('slide'), layoutId: layoutIdFor('blank'), elements: animated(shapes), notes: emptyRichText(), transition: { type: 'split', duration: 400, orientation: 'vertical' } },
    { id: id('slide'), layoutId: layoutIdFor('blank'), elements: [table, ...charts], notes: emptyRichText(), hidden: true, background: { type: 'solid', color: '#f8fafc' } },
    ...transitions.map((type) => ({ id: id('slide'), layoutId: layoutIdFor('sectionHeader'), elements: [], notes: emptyRichText(), transition: { type, duration: 300, ...(type === 'wipe' || type === 'cover' ? { direction: 'up' as const } : {}) } })),
  );
  return p;
}
