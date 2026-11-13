/** Shapes as data: their kinds, checked attributes and SVG drawing (shared by the editor, print and exports). */
import { ALIGNMENTS, escapeXml, safeChoice, safeColor, safeNumber, textColorOn, type Alignment } from './objectAttrs';

export const SHAPE_KINDS = ['rect', 'roundRect', 'ellipse', 'line', 'arrow', 'callout'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  callout: 'Callout',
};

/** Shapes that can hold a text label (a line cannot). */
export const shapeHasText = (kind: ShapeKind) => kind !== 'line';

export interface ShapeAttrs {
  kind: ShapeKind;
  /** Size on the page in CSS pixels. */
  width: number;
  height: number;
  /** #rrggbb or 'none'. */
  fill: string;
  stroke: string;
  /** Outline width in CSS pixels (0 = none). */
  strokeWidth: number;
  /** Plain text label, drawn centred; new lines start new lines. */
  text: string;
  align: Alignment;
}

export const SHAPE_DEFAULTS: ShapeAttrs = { kind: 'rect', width: 160, height: 100, fill: '#dbeafe', stroke: '#1d4ed8', strokeWidth: 2, text: '', align: 'center' };
export const SHAPE_MIN = 12;
export const SHAPE_MAX = 2000;

/** New shapes start at a size that suits their kind. */
export function newShapeAttrs(kind: ShapeKind): ShapeAttrs {
  const size = kind === 'line' ? { width: 200, height: 24 } : kind === 'arrow' ? { width: 160, height: 80 } : kind === 'callout' ? { width: 200, height: 120 } : {};
  return { ...SHAPE_DEFAULTS, kind, ...size, ...(kind === 'callout' ? { fill: '#fff7d6', stroke: '#b45309' } : {}) };
}

/** The stored attributes, checked (see objectAttrs): what is drawn and exported. */
export function readShape(attrs: Record<string, unknown> | undefined): ShapeAttrs {
  const a = attrs ?? {};
  return {
    kind: safeChoice(a.kind, SHAPE_KINDS, SHAPE_DEFAULTS.kind),
    width: Math.round(safeNumber(a.width, SHAPE_MIN, SHAPE_MAX, SHAPE_DEFAULTS.width)),
    height: Math.round(safeNumber(a.height, SHAPE_MIN, SHAPE_MAX, SHAPE_DEFAULTS.height)),
    fill: safeColor(a.fill, SHAPE_DEFAULTS.fill),
    stroke: safeColor(a.stroke, SHAPE_DEFAULTS.stroke),
    strokeWidth: safeNumber(a.strokeWidth, 0, 12, SHAPE_DEFAULTS.strokeWidth),
    text: typeof a.text === 'string' ? a.text.slice(0, 500) : '',
    align: safeChoice(a.align, ALIGNMENTS, SHAPE_DEFAULTS.align),
  };
}

const n = (v: number) => String(Math.round(v * 100) / 100);

/**
 * The shape as a standalone SVG document, the single source for the editor, print and the DOCX picture. Built from
 * checked attributes only, with the label escaped, so stored data can never add markup.
 */
export function shapeSvg(attrs: Record<string, unknown> | undefined): string {
  const s = readShape(attrs);
  const { width: w, height: h } = s;
  const sw = s.stroke === 'none' ? 0 : s.strokeWidth;
  const i = sw / 2;
  const paint = `fill="${s.fill}" stroke="${s.stroke === 'none' || !sw ? 'none' : s.stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"`;
  let body = '';
  let textCenter = h / 2;
  switch (s.kind) {
    case 'rect':
      body = `<rect x="${n(i)}" y="${n(i)}" width="${n(Math.max(0, w - sw))}" height="${n(Math.max(0, h - sw))}" ${paint}/>`;
      break;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.18;
      body = `<rect x="${n(i)}" y="${n(i)}" width="${n(Math.max(0, w - sw))}" height="${n(Math.max(0, h - sw))}" rx="${n(r)}" ry="${n(r)}" ${paint}/>`;
      break;
    }
    case 'ellipse':
      body = `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(Math.max(0, w / 2 - i))}" ry="${n(Math.max(0, h / 2 - i))}" ${paint}/>`;
      break;
    case 'line': {
      const stroke = s.stroke === 'none' ? s.fill : s.stroke;
      body = `<line x1="${n(Math.max(i, 1))}" y1="${n(h / 2)}" x2="${n(w - Math.max(i, 1))}" y2="${n(h / 2)}" stroke="${stroke === 'none' ? '#1a1a1f' : stroke}" stroke-width="${n(Math.max(sw, 1))}" stroke-linecap="round"/>`;
      break;
    }
    case 'arrow': {
      const head = Math.min(h * 0.75, w * 0.45);
      const hx = w - i - head;
      const pts = [
        [i, h * 0.3],
        [hx, h * 0.3],
        [hx, i],
        [w - i, h / 2],
        [hx, h - i],
        [hx, h * 0.7],
        [i, h * 0.7],
      ];
      body = `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${paint}/>`;
      textCenter = h / 2;
      break;
    }
    case 'callout': {
      const bh = h * 0.78;
      const r = Math.min(12, w * 0.1, bh * 0.2);
      const [l, t, rt] = [i, i, w - i];
      body = `<path d="M${n(l + r)},${n(t)} H${n(rt - r)} Q${n(rt)},${n(t)} ${n(rt)},${n(t + r)} V${n(bh - r)} Q${n(rt)},${n(bh)} ${n(rt - r)},${n(bh)} H${n(w * 0.36)} L${n(w * 0.12)},${n(h - i)} L${n(w * 0.2)},${n(bh)} H${n(l + r)} Q${n(l)},${n(bh)} ${n(l)},${n(bh - r)} V${n(t + r)} Q${n(l)},${n(t)} ${n(l + r)},${n(t)} Z" ${paint}/>`;
      textCenter = bh / 2;
      break;
    }
  }
  let label = '';
  if (s.text && shapeHasText(s.kind)) {
    const lines = s.text.split('\n');
    const size = 14;
    const lineH = size * 1.25;
    const first = textCenter - ((lines.length - 1) * lineH) / 2;
    label =
      `<text x="${n(w / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Carlito, Calibri, Arial, sans-serif" font-size="${size}" fill="${textColorOn(s.fill)}">` +
      lines.map((line, k) => `<tspan x="${n(w / 2)}" y="${n(first + k * lineH)}">${escapeXml(line)}</tspan>`).join('') +
      '</text>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}${label}</svg>`;
}

/** Accessible name and alternative text of a shape, e.g. "Callout: Remember the units". */
export function shapeLabel(attrs: Record<string, unknown> | undefined): string {
  const s = readShape(attrs);
  return s.text.trim() && shapeHasText(s.kind) ? `${SHAPE_LABELS[s.kind]}: ${s.text.trim().replace(/\s+/g, ' ')}` : SHAPE_LABELS[s.kind];
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
