/**
 * A slide as plain SVG markup for the PDF export (svg2pdf draws it as vector graphics with real, selectable text).
 * The markup holds only what svg2pdf draws faithfully: rect, line, path, image (PNG/JPEG data), text with an explicit
 * position per piece, linear gradients and clip paths. No foreignObject, no CSS, no markers (arrowheads are paths).
 * Text is laid out here (layoutText.ts) with the PDF's own font metrics, so every line is placed exactly.
 *
 * Coordinates are slide pixels (viewBox 0 0 width height); the PDF page is the same size in points × 0.75.
 */
import { layoutChart } from '../elements/chart';
import { fitPicture } from '../geometry';
import { decorationsOf, effectiveBackground } from '../render/SlideView';
import { isLinePreset, shapePath, shapeTextBox } from '../render/shapePaths';
import { resolveColor, resolveFont } from '../themes';
import type { Background, ChartElement, DiagramElement, Fill, ImageElement, Line, PresentationContent, PresentationTheme, ShapeElement, Slide, SlideElement, TableElement, TextElement, TextStyle } from '../types';
import type { Picture } from './assets';
import { layoutParagraphs, shrinkScale, type TextLayout } from './layoutText';
import { pdfFontCanShow, pdfFontOf, pdfSubstitutes, type Measure } from './metrics';
import type { ExportReport } from './report';
import { richParagraphs, type TextParagraph } from './richRuns';
import { dataUrl, esc, num } from './xml';

const PT = 96 / 72;

/** Pictures loaded before drawing (svg2pdf needs them inline). */
export interface SvgPictures {
  picture(id: string): Picture | null;
  diagram(el: DiagramElement): Uint8Array | null;
}

/** A link area in slide pixels (the PDF adds a link annotation for it). */
export interface LinkArea {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

interface Ctx {
  theme: PresentationTheme;
  measure: Measure;
  pictures: SvgPictures;
  report: ExportReport;
  links: LinkArea[];
  ids: number;
}

const color = (c: Parameters<typeof resolveColor>[0], ctx: Ctx) => resolveColor(c, ctx.theme);
const uid = (ctx: Ctx, p: string) => `${p}${++ctx.ids}`;

/** A linear gradient element (objectBoundingBox) for a model angle (0° = left to right, 90° = top to bottom). */
function gradientDef(id: string, fill: Extract<Fill, { type: 'gradient' }>, ctx: Ctx): string {
  const a = (fill.angle * Math.PI) / 180;
  const c = Math.cos(a) / 2;
  const s = Math.sin(a) / 2;
  const stops = [...fill.stops].sort((p, q) => p.position - q.position).map((st) => `<stop offset="${num(Math.max(0, Math.min(1, st.position)))}" stop-color="${color(st.color, ctx)}"/>`);
  return `<linearGradient id="${id}" x1="${num(0.5 - c)}" y1="${num(0.5 - s)}" x2="${num(0.5 + c)}" y2="${num(0.5 + s)}">${stops.join('')}</linearGradient>`;
}

/** fill="…" (and fill-opacity) for a fill; gradients add a definition to `defs`. */
function fillAttrs(fill: Fill | undefined, ctx: Ctx, defs: string[]): string {
  if (!fill || fill.type === 'none') return ' fill="none"';
  if (fill.type === 'solid') return ` fill="${color(fill.color, ctx)}"${fill.opacity !== undefined && fill.opacity < 1 ? ` fill-opacity="${num(Math.max(0, fill.opacity))}"` : ''}`;
  if (fill.type === 'gradient') {
    const id = uid(ctx, 'g');
    defs.push(gradientDef(id, fill, ctx));
    return ` fill="url(#${id})"`;
  }
  ctx.report.add('pictureFill');
  return ` fill="${color({ theme: 'light2' }, ctx)}"`;
}

function dash(line: Line): string {
  const w = Math.max(line.width * PT, 1);
  if (line.dash === 'dash') return ` stroke-dasharray="${num(w * 4)} ${num(w * 3)}"`;
  if (line.dash === 'dot') return ` stroke-dasharray="${num(w)} ${num(w * 2)}"`;
  if (line.dash === 'dashDot') return ` stroke-dasharray="${num(w * 4)} ${num(w * 2)} ${num(w)} ${num(w * 2)}"`;
  return '';
}

const strokeAttrs = (line: Line | null | undefined, ctx: Ctx) => (line ? ` stroke="${color(line.color, ctx)}" stroke-width="${num(Math.max(0.25, line.width) * PT)}" stroke-linejoin="round"${dash(line)}` : ' stroke="none"');

/** A picture drawn into a box (w × h) with its crop and fit, clipped to the box. */
function pictureMarkup(pic: Picture, natural: { width: number; height: number }, crop: ImageElement['crop'], fit: ImageElement['fit'], w: number, h: number, ctx: Ctx, defs: string[]): string {
  const c = crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const vw = Math.max(1, natural.width * (1 - c.left - c.right));
  const vh = Math.max(1, natural.height * (1 - c.top - c.bottom));
  const placed = fitPicture({ width: vw, height: vh }, { w, h }, fit);
  const sx = placed.w / vw;
  const sy = placed.h / vh;
  const id = uid(ctx, 'c');
  defs.push(`<clipPath id="${id}"><rect x="0" y="0" width="${num(w)}" height="${num(h)}"/></clipPath>`);
  const mime = pic.type === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `<g clip-path="url(#${id})"><image x="${num(placed.x - natural.width * c.left * sx)}" y="${num(placed.y - natural.height * c.top * sy)}" width="${num(natural.width * sx)}" height="${num(natural.height * sy)}" preserveAspectRatio="none" href="${dataUrl(pic.bytes, mime)}"/></g>`;
}

/** The text of a laid-out box as SVG, at (x, y) in the element's own coordinates. Records links. */
function textMarkup(layout: TextLayout, x: number, y: number, ctx: Ctx, origin: { x: number; y: number } | null): string {
  let out = '';
  for (const line of layout.lines) {
    for (const f of line.fragments) {
      const r = f.run;
      const lead = /^\s+/.exec(f.text)?.[0] ?? '';
      const text = f.text.slice(lead.length).replace(/\s+$/, '');
      if (!text) continue;
      const font = pdfFontOf(r.family);
      const fx = x + f.x + (lead ? ctx.measure(lead, { family: r.family, sizePx: f.sizePx, bold: r.bold, italic: r.italic }) : 0);
      const fw = ctx.measure(text, { family: r.family, sizePx: f.sizePx, bold: r.bold, italic: r.italic });
      const by = y + line.baseline + f.shift;
      if (r.highlight) out += `<rect x="${num(fx)}" y="${num(y + line.top)}" width="${num(fw)}" height="${num(line.height)}" fill="${r.highlight}"/>`;
      out += `<text x="${num(fx)}" y="${num(by)}" font-family="${font}" font-size="${num(f.sizePx)}"${r.bold ? ' font-weight="bold"' : ''}${r.italic ? ' font-style="italic"' : ''} fill="${r.color}">${esc(text)}</text>`;
      const thick = Math.max(0.6, f.sizePx / 16);
      if (r.underline) out += `<rect x="${num(fx)}" y="${num(by + f.sizePx * 0.1)}" width="${num(fw)}" height="${num(thick)}" fill="${r.color}"/>`;
      if (r.strike) out += `<rect x="${num(fx)}" y="${num(by - f.sizePx * 0.3)}" width="${num(fw)}" height="${num(thick)}" fill="${r.color}"/>`;
      if (r.href && origin) ctx.links.push({ x: origin.x + fx, y: origin.y + y + line.top, w: fw, h: line.height, url: r.href });
      if (!pdfFontCanShow(text)) ctx.report.add('unsupportedCharacters');
      if (pdfSubstitutes(r.family)) ctx.report.font(r.family);
    }
  }
  return out;
}

/** Lays out rich text in a box with a text style (padding, vertical alignment, autofit shrink). */
function boxText(doc: TextElement['text'], style: TextStyle, w: number, h: number, ctx: Ctx, defs: string[], origin: { x: number; y: number } | null): string {
  const [t, r, b, l] = style.padding;
  const iw = Math.max(1, w - l - r);
  const ih = Math.max(1, h - t - b);
  const scale = style.autofit === 'shrink' ? shrinkScale(doc, style, ctx.theme, iw, ih, ctx.measure) : 1;
  const paras: TextParagraph[] = richParagraphs(doc, style, ctx.theme, scale);
  if (paras.some((p) => p.align === 'justify')) ctx.report.flag('justified');
  const layout = layoutParagraphs(paras, iw, style.lineSpacing, ctx.measure);
  const dy = style.verticalAlign === 'middle' ? (ih - layout.height) / 2 : style.verticalAlign === 'bottom' ? ih - layout.height : 0;
  const body = textMarkup(layout, l, t + dy, ctx, origin);
  if (!body) return '';
  if (style.autofit === 'none') return body;
  const id = uid(ctx, 'c');
  defs.push(`<clipPath id="${id}"><rect x="0" y="0" width="${num(w)}" height="${num(h)}"/></clipPath>`);
  return `<g clip-path="url(#${id})">${body}</g>`;
}

function frame(label: string, w: number, h: number, ctx: Ctx, defs: string[]): string {
  const style: TextStyle = { font: 'body', fontSize: 12, color: { theme: 'dark2' }, bold: false, italic: false, align: 'center', verticalAlign: 'middle', autofit: 'shrink', lineSpacing: 1.15, padding: [6, 6, 6, 6] };
  return `<rect x="0" y="0" width="${num(w)}" height="${num(h)}" fill="${color({ theme: 'light2' }, ctx)}" stroke="${color({ theme: 'dark2' }, ctx)}" stroke-width="1" stroke-dasharray="4 3"/>${boxText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: label }] }] }, style, w, h, ctx, defs, null)}`;
}

/** An arrowhead at (x, y) pointing along angle `a` (radians). */
function arrowhead(kind: NonNullable<Line['headEnd']>, x: number, y: number, a: number, line: Line, ctx: Ctx): string {
  if (kind === 'none') return '';
  const s = Math.max(6, line.width * PT * 3);
  const c = color(line.color, ctx);
  const pt = (dx: number, dy: number) => `${num(x + dx * Math.cos(a) - dy * Math.sin(a))},${num(y + dx * Math.sin(a) + dy * Math.cos(a))}`;
  if (kind === 'oval') return `<path d="M${pt(-s / 2, 0)} A${num(s / 2)},${num(s / 2)} 0 1 1 ${pt(s / 2, 0)} A${num(s / 2)},${num(s / 2)} 0 1 1 ${pt(-s / 2, 0)} Z" fill="${c}"/>`;
  if (kind === 'triangle') return `<path d="M${pt(0, 0)} L${pt(-s, -s / 2)} L${pt(-s, s / 2)} Z" fill="${c}"/>`;
  return `<path d="M${pt(-s, -s / 2)} L${pt(0, 0)} L${pt(-s, s / 2)}" fill="none" stroke="${c}" stroke-width="${num(Math.max(1, line.width * PT))}"/>`;
}

function shapeMarkup(el: ShapeElement, ctx: Ctx, defs: string[], origin: { x: number; y: number } | null): string {
  const flip = `${el.flipH ? `translate(${num(el.w)} 0) scale(-1 1) ` : ''}${el.flipV ? `translate(0 ${num(el.h)}) scale(1 -1)` : ''}`.trim();
  const line = isLinePreset(el.preset);
  let out = `<path d="${shapePath(el.preset, el.w, el.h)}"${flip ? ` transform="${flip}"` : ''}${line ? ' fill="none"' : fillAttrs(el.fill, ctx, defs)}${strokeAttrs(el.line, ctx)}/>`;
  if (line && el.line) {
    // The line runs from (0,0) to (w,h) in the flipped box.
    const x1 = el.flipH ? el.w : 0;
    const y1 = el.flipV ? el.h : 0;
    const x2 = el.flipH ? 0 : el.w;
    const y2 = el.flipV ? 0 : el.h;
    const a = Math.atan2(y2 - y1, x2 - x1);
    out += arrowhead(el.line.headEnd ?? 'none', x1, y1, a + Math.PI, el.line, ctx) + arrowhead(el.line.tailEnd ?? 'none', x2, y2, a, el.line, ctx);
  }
  if (!line && el.text && el.textStyle) {
    const tb = shapeTextBox(el.preset, el.w, el.h);
    out += `<g transform="translate(${num(tb.x)} ${num(tb.y)})">${boxText(el.text, el.textStyle, tb.w, tb.h, ctx, defs, origin ? { x: origin.x + tb.x, y: origin.y + tb.y } : null)}</g>`;
  }
  return out;
}

function tableMarkup(el: TableElement, ctx: Ctx, defs: string[], origin: { x: number; y: number } | null): string {
  const s = el.style;
  const xs = [0];
  for (const c of el.columns) xs.push(xs[xs.length - 1] + Math.max(0, c));
  const ys = [0];
  for (const r of el.rows) ys.push(ys[ys.length - 1] + Math.max(0, r.height));
  let fills = '';
  let texts = '';
  let borders = '';
  const lineMarkup = (l: Line | null | undefined, x1: number, y1: number, x2: number, y2: number) => (l ? `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color(l.color, ctx)}" stroke-width="${num(Math.max(0.25, l.width) * PT)}"${dash(l)}/>` : '');
  el.rows.forEach((row, r) => {
    const header = s.headerRow && r === 0;
    const band = s.bandedRows && !header && (r - (s.headerRow ? 1 : 0)) % 2 === 1;
    row.cells.forEach((cell, c) => {
      if (cell.merged || c >= el.columns.length) return;
      const x = xs[c];
      const y = ys[r];
      const w = xs[Math.min(xs.length - 1, c + Math.max(1, cell.colSpan ?? 1))] - x;
      const h = ys[Math.min(ys.length - 1, r + Math.max(1, cell.rowSpan ?? 1))] - y;
      fills += `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${color(cell.fill ?? (header ? s.headerFill : band ? s.bandFill : s.fill), ctx)}"/>`;
      const first = s.firstColumn && c === 0;
      const style: TextStyle = { ...s.text, autofit: 'none', bold: header || first || s.text.bold, color: header ? s.headerTextColor : s.text.color, align: cell.align ?? s.text.align, verticalAlign: cell.verticalAlign ?? 'top' };
      const id = uid(ctx, 'c');
      defs.push(`<clipPath id="${id}"><rect x="0" y="0" width="${num(w)}" height="${num(h)}"/></clipPath>`);
      texts += `<g transform="translate(${num(x)} ${num(y)})"><g clip-path="url(#${id})">${boxText(cell.text, style, w, h, ctx, defs, origin ? { x: origin.x + x, y: origin.y + y } : null)}</g></g>`;
      const b = cell.borders;
      const side = (v: Line | null | undefined) => (v === undefined ? s.border : v);
      borders += lineMarkup(side(b?.top), x, y, x + w, y) + lineMarkup(side(b?.bottom), x, y + h, x + w, y + h) + lineMarkup(side(b?.left), x, y, x, y + h) + lineMarkup(side(b?.right), x + w, y, x + w, y + h);
    });
  });
  const id = uid(ctx, 'c');
  defs.push(`<clipPath id="${id}"><rect x="-2" y="-2" width="${num(el.w + 4)}" height="${num(el.h + 4)}"/></clipPath>`);
  return `<g clip-path="url(#${id})">${fills}${texts}${borders}</g>`;
}

function chartMarkup(el: ChartElement, ctx: Ctx): string {
  const g = layoutChart(el, ctx.theme);
  const family = resolveFont(el.font, ctx.theme);
  if (pdfSubstitutes(family)) ctx.report.font(family);
  const font = pdfFontOf(family);
  return g.items
    .map((p) => {
      switch (p.kind) {
        case 'rect':
          return `<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" fill="${p.fill}"/>`;
        case 'line':
          return `<line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}" stroke="${p.stroke}" stroke-width="${num(p.width)}"/>`;
        case 'path':
          return `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${num(p.width)}" stroke-linejoin="round"/>`;
        case 'circle':
          return `<circle cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${num(p.width)}"/>`;
        case 'text':
          if (!pdfFontCanShow(p.text)) ctx.report.add('unsupportedCharacters');
          return `<text x="${num(p.x)}" y="${num(p.y)}" font-family="${font}" font-size="${num(p.size)}" text-anchor="${p.anchor}" fill="${p.fill}"${p.bold ? ' font-weight="bold"' : ''}>${esc(p.text)}</text>`;
        default:
          return '';
      }
    })
    .join('');
}

function elementMarkup(el: SlideElement, ctx: Ctx, defs: string[]): string {
  // Links get areas only on unrotated objects (a PDF link is an upright rectangle).
  const origin = el.rotation ? null : { x: el.x, y: el.y };
  let inner = '';
  switch (el.type) {
    case 'text': {
      inner = `${el.fill && el.fill.type !== 'none' ? `<rect x="0" y="0" width="${num(el.w)}" height="${num(el.h)}"${fillAttrs(el.fill, ctx, defs)} stroke="none"/>` : ''}${boxText(el.text, el.style, el.w, el.h, ctx, defs, origin)}${el.line ? `<rect x="0" y="0" width="${num(el.w)}" height="${num(el.h)}" fill="none"${strokeAttrs(el.line, ctx)}/>` : ''}`;
      break;
    }
    case 'shape':
      inner = shapeMarkup(el, ctx, defs, origin);
      break;
    case 'image': {
      const pic = ctx.pictures.picture(el.attachmentId);
      if (!pic) {
        ctx.report.add('missingPicture');
        inner = frame(el.alt ? `Picture not on this device: ${el.alt}` : 'Picture not on this device', el.w, el.h, ctx, defs);
      } else {
        if (pic.converted) ctx.report.add('convertedPicture');
        inner = pictureMarkup(pic, { width: el.naturalWidth, height: el.naturalHeight }, el.crop, el.fit, el.w, el.h, ctx, defs);
      }
      break;
    }
    case 'diagram': {
      const png = ctx.pictures.diagram(el);
      if (!png) {
        ctx.report.add('missingDiagram');
        inner = frame(`Diagram: ${(el.alt ?? '').trim() || el.title.trim() || 'Diagram'}`, el.w, el.h, ctx, defs);
      } else inner = pictureMarkup({ bytes: png, type: 'png', converted: false }, { width: Math.max(1, el.naturalWidth), height: Math.max(1, el.naturalHeight) }, undefined, 'contain', el.w, el.h, ctx, defs);
      break;
    }
    case 'table':
      inner = tableMarkup(el, ctx, defs, origin);
      break;
    case 'chart':
      inner = chartMarkup(el, ctx);
      break;
  }
  const rotate = el.rotation ? ` rotate(${num(el.rotation)} ${num(el.w / 2)} ${num(el.h / 2)})` : '';
  return `<g transform="translate(${num(el.x)} ${num(el.y)})${rotate}">${inner}</g>`;
}

function backgroundMarkup(b: Background, w: number, h: number, ctx: Ctx, defs: string[]): string {
  if (b.type === 'image') {
    const pic = ctx.pictures.picture(b.attachmentId);
    if (!pic) {
      ctx.report.add('missingPicture');
      return `<rect x="0" y="0" width="${num(w)}" height="${num(h)}" fill="${color({ theme: 'light2' }, ctx)}"/>`;
    }
    if (pic.converted) ctx.report.add('convertedPicture');
    const natural = { width: pic.width ?? w, height: pic.height ?? h };
    return pictureMarkup(pic, natural, undefined, b.fit, w, h, ctx, defs);
  }
  return `<rect x="0" y="0" width="${num(w)}" height="${num(h)}"${fillAttrs(b, ctx, defs)}/>`;
}

/** The slide as an SVG document (as text), and the link areas on it. */
export function slideSvg(content: PresentationContent, slide: Slide, opts: { measure: Measure; pictures: SvgPictures; report: ExportReport }): { svg: string; links: LinkArea[] } {
  const { width: W, height: H } = content.size;
  const ctx: Ctx = { theme: content.theme, measure: opts.measure, pictures: opts.pictures, report: opts.report, links: [], ids: 0 };
  const defs: string[] = [];
  const parts = [backgroundMarkup(effectiveBackground(content, slide), W, H, ctx, defs)];
  for (const el of decorationsOf(content, slide)) parts.push(elementMarkup(el, ctx, defs));
  for (const el of slide.elements) parts.push(elementMarkup(el, ctx, defs));
  const clip = uid(ctx, 'c');
  defs.push(`<clipPath id="${clip}"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs><g clip-path="url(#${clip})">${parts.join('')}</g></svg>`;
  return { svg, links: ctx.links };
}
