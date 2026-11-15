/**
 * PowerPoint export (Phase 7 EXPORT, ADR 0014). PptxGenJS 4.0.1 (MIT, loaded only here, on first export) writes the
 * package: layouts as slide layouts with real title/body placeholders, pictures, native tables, native editable charts
 * (with their embedded workbook), preset shapes, backgrounds, speaker notes and hidden slides. pptxPost.ts then
 * finishes it: our own DrawingML text bodies, gradients, crops, transitions and animations, links and theme colours.
 *
 * Units: the model is in CSS px at 96 per inch (960 × 540 = 10 × 5.625 in), PptxGenJS takes inches, OOXML EMU.
 */
import { pxToEmu, fitPicture } from '../geometry';
import { resolveColor, resolveFont } from '../themes';
import {
  isEmptyRichText,
  type Background,
  type ChartElement,
  type Fill,
  type ImageElement,
  type Line,
  type Placeholder,
  type PresentationContent,
  type ShapeElement,
  type SlideElement,
  type TableElement,
  type TextElement,
  type TextStyle,
} from '../types';
import { AssetLoader, MIME, type ExportHosts } from './assets';
import { cellTextBody, linkRels, notesTextBody, shapeTextBody } from './drawingml';
import { shrinkScale } from './layoutText';
import { browserMeasure, type Measure } from './metrics';
import { postProcess, type PartPlan, type SlidePlan } from './pptxPost';
import { ExportReport } from './report';
import { richParagraphs } from './richRuns';
import { buildSteps } from '../show/sequence';
import { transitionXml } from './timing';
import { dataUrl, hex6 } from './xml';

export interface PptxOptions extends ExportHosts {
  title: string;
  /** Text measuring for 'shrink text on overflow' (defaults to the browser's fonts). */
  measure?: Measure;
}

export interface PptxBuild {
  bytes: Uint8Array;
  report: ExportReport;
  slides: number;
}

const IN = (px: number) => px / 96;
type PptxObjOptions = Record<string, unknown>;

/** Text style for speaker notes in the notes pages (PowerPoint's 12 pt body text). */
const NOTES_STYLE: TextStyle = { font: 'body', fontSize: 12, color: '#000000', bold: false, italic: false, align: 'left', verticalAlign: 'top', autofit: 'none', lineSpacing: 1.15, padding: [0, 0, 0, 0] };

/**
 * Layout placeholders written as PowerPoint placeholders: text ones only. PptxGenJS 4.0.1 drops the type of picture
 * and table placeholders (it maps image → pic, then looks pic up again), and puts an empty copy of every layout
 * placeholder on each slide that uses the layout; a picture, chart or table placed into one in the app is written as
 * an ordinary object, so that empty copy sat on top of it with its prompt. Their prompts exist in the editor only.
 */
const PLACEHOLDER_TYPE: Partial<Record<Placeholder['kind'], string>> = { title: 'title', subtitle: 'body', body: 'body' };
const DASH: Record<Line['dash'], string> = { solid: 'solid', dash: 'dash', dot: 'sysDot', dashDot: 'dashDot' };

/** OOXML gradient fill for a model gradient (0° = left to right, as a:lin). */
export function gradFillXml(fill: Extract<Fill, { type: 'gradient' }>, theme: PresentationContent['theme']): string {
  const stops = [...fill.stops].sort((a, b) => a.position - b.position);
  const gs = (stops.length ? stops : [{ position: 0, color: '#ffffff' }]).map((s) => `<a:gs pos="${Math.round(Math.max(0, Math.min(1, s.position)) * 100000)}"><a:srgbClr val="${hex6(resolveColor(s.color, theme))}"/></a:gs>`).join('');
  const ang = Math.round((((fill.angle % 360) + 360) % 360) * 60000);
  return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
}

/** The <a:xfrm> of a box (placeholders get theirs back from it). */
export function xfrmXml(el: { x: number; y: number; w: number; h: number; rotation?: number }): string {
  const rot = el.rotation ? Math.round((((el.rotation % 360) + 360) % 360) * 60000) : 0;
  return `<a:xfrm${rot ? ` rot="${rot}"` : ''}><a:off x="${pxToEmu(el.x)}" y="${pxToEmu(el.y)}"/><a:ext cx="${pxToEmu(Math.max(1, el.w))}" cy="${pxToEmu(Math.max(1, el.h))}"/></a:xfrm>`;
}

/** Builds the .pptx bytes. */
export async function buildPptx(content: PresentationContent, opts: PptxOptions): Promise<PptxBuild> {
  const mod = (await import('pptxgenjs')) as unknown as { default: new () => PptxLike };
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  const report = new ExportReport();
  const assets = new AssetLoader(opts);
  const measure = opts.measure ?? browserMeasure();
  const theme = content.theme;
  const { width: W, height: H } = content.size;

  pptx.defineLayout({ name: 'CLASSROOM_OS', width: IN(W), height: IN(H) });
  pptx.layout = 'CLASSROOM_OS';
  pptx.title = opts.title || 'Presentation';
  pptx.company = '';
  pptx.author = '';
  pptx.theme = { headFontFace: theme.fonts.heading, bodyFontFace: theme.fonts.body };

  let seq = 0;
  // Markers and object names carry a random part per export, so a user's own text can never be mistaken for one
  // (a text that read exactly "DCOSTXT4X" made the export fail).
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 24]).join('');
  const token = () => `dcosobj${nonce}n${++seq}`;
  const marker = () => `DCOSTXT${nonce}N${++seq}X`;
  const color = (c: Parameters<typeof resolveColor>[0]) => hex6(resolveColor(c, theme));

  /** PptxGenJS fill options for a model fill; gradients are written by post-processing. */
  const fillOpts = (fill: Fill | undefined, part: PartPlan, tok: string): PptxObjOptions | undefined => {
    if (!fill || fill.type === 'none') return undefined;
    if (fill.type === 'solid') return { color: color(fill.color), ...(fill.opacity !== undefined && fill.opacity < 1 ? { transparency: Math.round((1 - Math.max(0, fill.opacity)) * 100) } : {}) };
    if (fill.type === 'gradient') {
      part.fills.push({ token: tok, fill: gradFillXml(fill, theme) });
      return { color: color(fill.stops[0]?.color ?? '#ffffff') };
    }
    report.add('pictureFill');
    return { color: color({ theme: 'light2' }) };
  };
  const lineOpts = (line: Line | null | undefined): PptxObjOptions | undefined =>
    line
      ? {
          color: color(line.color),
          width: Math.max(0.25, line.width),
          dashType: DASH[line.dash] ?? 'solid',
          ...(line.headEnd && line.headEnd !== 'none' ? { beginArrowType: line.headEnd } : {}),
          ...(line.tailEnd && line.tailEnd !== 'none' ? { endArrowType: line.tailEnd } : {}),
        }
      : undefined;
  const pos = (el: { x: number; y: number; w: number; h: number }) => ({ x: IN(el.x), y: IN(el.y), w: IN(Math.max(1, el.w)), h: IN(Math.max(1, el.h)) });
  const rot = (el: SlideElement) => (el.rotation ? { rotate: el.rotation } : {});

  /** The text body for a text box or shape text, with its shrink scale. */
  const body = (doc: TextElement['text'], style: TextStyle, box: { w: number; h: number }, links: ReturnType<typeof linkRels>) => {
    const [t, r, b, l] = style.padding;
    const scale = style.autofit === 'shrink' ? shrinkScale(doc, style, theme, Math.max(1, box.w - l - r), Math.max(1, box.h - t - b), measure) : 1;
    return shapeTextBody(richParagraphs(doc, style, theme), { padding: style.padding, verticalAlign: style.verticalAlign, autofit: style.autofit, fontScale: scale, lineSpacing: style.lineSpacing }, links);
  };

  /** A labelled frame where a picture or diagram is missing (never a broken image). */
  const missingFrame = (target: PptxTarget, el: SlideElement, label: string, part: PartPlan, links: ReturnType<typeof linkRels>) => {
    const tok = token();
    const m = marker();
    const style: TextStyle = { font: 'body', fontSize: 12, color: { theme: 'dark2' }, bold: false, italic: false, align: 'center', verticalAlign: 'middle', autofit: 'none', lineSpacing: 1.15, padding: [6, 6, 6, 6] };
    target.addText(m, { ...pos(el), ...rot(el), objectName: tok, shape: 'rect', fill: { color: color({ theme: 'light2' }) }, line: { color: color({ theme: 'dark2' }), width: 0.75, dashType: 'dash' } });
    part.texts.push({ marker: m, body: shapeTextBody(richParagraphs({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: label }] }] }, style, theme), { padding: style.padding, verticalAlign: 'middle', autofit: 'none', lineSpacing: 1.15 }, links) });
    part.names.push({ token: tok, name: el.name || label });
    return tok;
  };

  /** Adds one element to a slide or layout. Returns the token naming it (for animations), or null. */
  const addElement = async (target: PptxTarget, el: SlideElement, part: PartPlan, links: ReturnType<typeof linkRels>, placeholders: Map<string, Placeholder>, filled = new Set<string>()): Promise<{ token: string; textShape: boolean } | null> => {
    const tok = token();
    const name = (fallback: string) => part.names.push({ token: tok, name: el.name || fallback });
    switch (el.type) {
      case 'text': {
        const m = marker();
        const ph = el.placeholderId ? placeholders.get(el.placeholderId) : undefined;
        // One object per placeholder: a second text linked to the same one (a pasted copy) is written as a text box.
        const textPh = ph && (ph.kind === 'title' || ph.kind === 'subtitle' || ph.kind === 'body') && !filled.has(ph.id);
        if (textPh) {
          filled.add(ph.id);
          target.addText(m, { placeholder: ph.id });
          part.texts.push({ marker: m, body: body(el.text, el.style, el, links), placeholder: { token: tok, xfrm: xfrmXml(el) } });
          name(ph.kind === 'title' ? 'Title' : ph.kind === 'subtitle' ? 'Subtitle' : 'Content');
        } else {
          target.addText(m, { ...pos(el), ...rot(el), objectName: tok, shape: 'rect', ...(el.fill ? { fill: fillOpts(el.fill, part, tok) } : {}), ...(el.line ? { line: lineOpts(el.line) } : {}) });
          part.texts.push({ marker: m, body: body(el.text, el.style, el, links) });
          name('Text box');
        }
        return { token: tok, textShape: true };
      }
      case 'shape': {
        const s = el as ShapeElement;
        const common = { ...pos(s), ...rot(s), objectName: tok, ...(s.flipH ? { flipH: true } : {}), ...(s.flipV ? { flipV: true } : {}), line: lineOpts(s.line) ?? { type: 'none' } };
        if (s.preset === 'line') {
          target.addShape('line', { ...common, h: IN(Math.max(0, s.h)), w: IN(Math.max(0, s.w)) });
          name('Line');
          return { token: tok, textShape: false };
        }
        const fill = fillOpts(s.fill, part, tok) ?? { type: 'none' };
        if (s.text && s.textStyle && !isEmptyRichText(s.text)) {
          const m = marker();
          target.addText(m, { ...common, shape: s.preset, fill });
          const tb = { w: s.w, h: s.h };
          part.texts.push({ marker: m, body: body(s.text, s.textStyle, tb, links) });
          name('Shape');
          return { token: tok, textShape: true };
        }
        target.addShape(s.preset, { ...common, fill });
        name('Shape');
        return { token: tok, textShape: false };
      }
      case 'image': {
        const img = el as ImageElement;
        const pic = await assets.picture(img.attachmentId, { gif: true });
        if (!pic) {
          report.add('missingPicture');
          return { token: missingFrame(target, img, img.alt ? `Picture not on this device: ${img.alt}` : 'Picture not on this device', part, links), textShape: true };
        }
        if (pic.converted) report.add('convertedPicture');
        const crop = img.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
        const vw = Math.max(1, img.naturalWidth * (1 - crop.left - crop.right));
        const vh = Math.max(1, img.naturalHeight * (1 - crop.top - crop.bottom));
        let box = { x: img.x, y: img.y, w: img.w, h: img.h };
        let src = { l: crop.left, t: crop.top, r: crop.right, b: crop.bottom };
        if (img.fit === 'contain') {
          const f = fitPicture({ width: vw, height: vh }, img, 'contain');
          box = { x: img.x + f.x, y: img.y + f.y, w: f.w, h: f.h };
        } else if (img.fit === 'cover') {
          const k = Math.max(img.w / vw, img.h / vh);
          const ex = (vw - img.w / k) / 2 / Math.max(1, img.naturalWidth);
          const ey = (vh - img.h / k) / 2 / Math.max(1, img.naturalHeight);
          src = { l: src.l + ex, r: src.r + ex, t: src.t + ey, b: src.b + ey };
        }
        target.addImage({ data: dataUrl(pic.bytes, MIME[pic.type]), ...pos(box), ...rot(img), objectName: tok, altText: img.alt });
        if (src.l || src.t || src.r || src.b) part.crops.push({ token: tok, ...src });
        name('Picture');
        return { token: tok, textShape: false };
      }
      case 'diagram': {
        const d = await assets.diagram(el, true);
        if (!d) {
          report.add('missingDiagram');
          return { token: missingFrame(target, el, `Diagram: ${(el.alt ?? '').trim() || el.title.trim() || 'Diagram'}`, part, links), textShape: true };
        }
        report.add('diagramPicture');
        if (d.redrawn) report.add('diagramRedrawn');
        const f = fitPicture({ width: Math.max(1, el.naturalWidth), height: Math.max(1, el.naturalHeight) }, el, 'contain');
        target.addImage({ data: dataUrl(d.png, 'image/png'), x: IN(el.x + f.x), y: IN(el.y + f.y), w: IN(Math.max(1, f.w)), h: IN(Math.max(1, f.h)), ...rot(el), objectName: tok, altText: (el.alt ?? '').trim() || el.title || 'Diagram' });
        name(el.title || 'Diagram');
        return { token: tok, textShape: false };
      }
      case 'table': {
        const t = el as TableElement;
        if (t.rotation) report.add('rotatedFrame');
        const rows = tableRows(t, part, links, marker, color, report, theme);
        // w and h too: without them the table's frame is written at PptxGenJS's default size, not its grid's.
        const colW = t.columns.map((c) => IN(Math.max(1, c)));
        const rowH = t.rows.map((r) => IN(Math.max(1, r.height)));
        target.addTable(rows, { x: IN(t.x), y: IN(t.y), w: colW.reduce((a, b) => a + b, 0), h: rowH.reduce((a, b) => a + b, 0), colW, rowH, objectName: tok });
        name('Table');
        return { token: tok, textShape: false };
      }
      case 'chart': {
        const c = el as ChartElement;
        // A chart with no series or no categories (possible in stored or restored data) has nothing PowerPoint can
        // chart: it is written as a labelled frame, as the app draws it ("No data").
        if (!c.series.length || !c.categories.length) return { token: missingFrame(target, c, `Chart: ${c.title.trim() || 'Chart'} (no data)`, part, links), textShape: true };
        if (c.rotation) report.add('rotatedFrame');
        const { type, data, options } = chartArgs(c, theme);
        target.addChart(pptx.ChartType[type], data, { ...pos(c), ...options, objectName: tok, altText: c.title || 'Chart' });
        name(c.title || 'Chart');
        return { token: tok, textShape: false };
      }
      default:
        return null;
    }
  };

  // Picture backgrounds are loaded first: PptxGenJS takes them synchronously.
  const bgPictures = new Map<string, { url: string; width?: number; height?: number } | null>();
  for (const b of [...content.masters.map((m) => m.background), ...content.layouts.map((l) => l.background), ...content.slides.map((s) => s.background)]) {
    if (b?.type !== 'image' || bgPictures.has(b.attachmentId)) continue;
    const pic = await assets.picture(b.attachmentId, { gif: true });
    if (pic?.converted) report.add('convertedPicture');
    bgPictures.set(b.attachmentId, pic ? { url: dataUrl(pic.bytes, MIME[pic.type]), width: pic.width, height: pic.height } : null);
  }

  // ── Layouts (each with its master's decorations, PptxGenJS has a single slide master) ──────────────
  const layoutTitles = new Map<string, string>();
  // PptxGenJS keeps a layout of its own named DEFAULT: a user layout of that name would be confused with it.
  const usedTitles = new Set<string>(['DEFAULT']);
  const layoutPlans: Array<PartPlan & { title: string }> = [];
  if (content.masters.some((m) => m.decorations.length)) report.flag('masterAsLayouts');
  for (const layout of content.layouts) {
    const master = content.masters.find((m) => m.id === layout.masterId) ?? content.masters[0];
    let title = (layout.name || 'Layout').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').trim() || 'Layout';
    for (let n = 2; usedTitles.has(title); n++) title = `${(layout.name || 'Layout').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').trim() || 'Layout'} ${n}`;
    usedTitles.add(title);
    layoutTitles.set(layout.id, title);
    const plan: PartPlan & { title: string } = { title, texts: [], names: [], crops: [], fills: [], links: [] };
    const links = linkRels();
    const objects: unknown[] = [];
    // Decorations are collected through a recording target, then given to defineSlideMaster as master objects.
    const rec = recorder(objects);
    for (const el of [...(layout.showMasterDecorations && master ? master.decorations : []), ...layout.decorations]) {
      if (el.type === 'table') {
        report.add('tableOnLayout');
        continue;
      }
      await addElement(rec, el, plan, links, new Map());
    }
    for (const ph of layout.placeholders) {
      const type = PLACEHOLDER_TYPE[ph.kind];
      if (!type) continue;
      const st = ph.style;
      objects.push({
        placeholder: {
          options: {
            name: ph.id.replace(/[^A-Za-z0-9_-]/g, '_'),
            type,
            ...pos(ph),
            fontFace: resolveFont(st.font, theme),
            fontSize: st.fontSize,
            color: color(st.color),
            bold: st.bold,
            italic: st.italic,
            align: st.align,
            valign: st.verticalAlign,
            margin: [st.padding[3], st.padding[1], st.padding[2], st.padding[0]].map((v) => (v * 72) / 96),
          },
          text: ph.prompt,
        },
      });
    }
    const bg = backgroundOf(layout.background ?? master?.background, plan);
    pptx.defineSlideMaster({ title, ...(bg ? { background: bg } : {}), objects });
    plan.links = links.entries;
    if (plan.texts.length || plan.names.length || plan.fills.length || plan.crops.length || plan.background || plan.backgroundFit) layoutPlans.push(plan);
  }

  function backgroundOf(b: Background | undefined, plan: PartPlan): PptxObjOptions | undefined {
    if (!b) return undefined;
    if (b.type === 'solid') return { color: color(b.color), ...(b.opacity !== undefined && b.opacity < 1 ? { transparency: Math.round((1 - b.opacity) * 100) } : {}) };
    if (b.type === 'gradient') {
      plan.background = `<p:bg><p:bgPr>${gradFillXml(b, theme)}<a:effectLst/></p:bgPr></p:bg>`;
      return { color: color(b.stops[0]?.color ?? '#ffffff') };
    }
    return pendingPicture(b, plan);
  }
  function pendingPicture(b: Extract<Background, { type: 'image' }>, plan: PartPlan): PptxObjOptions | undefined {
    const pic = bgPictures.get(b.attachmentId);
    if (!pic) {
      report.add('missingPicture');
      return { color: color({ theme: 'light2' }) };
    }
    const fit = backgroundFit(b.fit, pic, content.size);
    if (fit) plan.backgroundFit = fit;
    return { data: pic.url };
  }

  // ── Slides ────────────────────────────────────────────────────────────────────────────────────────
  const slidePlans: SlidePlan[] = [];
  for (const slide of content.slides) {
    const layout = content.layouts.find((l) => l.id === slide.layoutId) ?? content.layouts[0];
    const target = pptx.addSlide(layout ? { masterName: layoutTitles.get(layout.id) } : {});
    const plan: SlidePlan = { texts: [], names: [], crops: [], fills: [], links: [], transition: transitionXml(slide.transition), steps: [] };
    if (slide.transition && slide.transition.type !== 'none' && ![500, 750, 1000].includes(slide.transition.duration)) report.flag('transitionSpeed');
    const links = linkRels();
    const bg = backgroundOf(slide.background, plan);
    if (bg) target.background = bg;
    if (slide.hidden) target.hidden = true;
    const placeholders = new Map((layout?.placeholders ?? []).map((p) => [p.id, { ...p, id: p.id.replace(/[^A-Za-z0-9_-]/g, '_') }]));
    const added = new Map<string, { token: string; textShape: boolean }>();
    const filled = new Set<string>();
    for (const el of slide.elements) {
      const a = await addElement(target, el, plan, links, placeholders, filled);
      if (a) added.set(el.id, a);
    }
    // Animations are grouped and timed exactly as the app's slide show plays them.
    plan.steps = buildSteps(slide)
      .map((st) => ({ auto: st.auto, effects: st.effects.flatMap((e) => (added.has(e.elementId) ? [{ ...added.get(e.elementId)!, animation: e.animation, start: Math.max(0, Math.round(e.start)) }] : [])) }))
      .filter((st) => st.effects.length);
    if (!isEmptyRichText(slide.notes)) {
      const m = marker();
      target.addNotes(m);
      const nl = linkRels();
      plan.notes = { marker: m, body: notesTextBody(richParagraphs(slide.notes, NOTES_STYLE, theme), nl), links: nl.entries };
    }
    plan.links = links.entries;
    slidePlans.push(plan);
  }
  const raw = (await pptx.write({ outputType: 'uint8array', compression: true })) as Uint8Array;
  const bytes = postProcess(raw, { slides: slidePlans, layouts: layoutPlans, theme });
  return { bytes, report, slides: content.slides.length };
}

/** PptxGenJS table rows: each cell's text is a marker replaced by our DrawingML (cellTextBody). */
function tableRows(
  t: TableElement,
  part: PartPlan,
  links: ReturnType<typeof linkRels>,
  marker: () => string,
  color: (c: Parameters<typeof resolveColor>[0]) => string,
  report: ExportReport,
  theme: PresentationContent['theme'],
): unknown[][] {
  const s = t.style;
  const border = (l: Line | null | undefined) => (l ? { type: l.dash === 'solid' ? 'solid' : 'dash', pt: Math.max(0.25, l.width), color: color(l.color) } : { type: 'none' });
  const defaultBorder = border(s.border);
  return t.rows.map((row, r) => {
    const header = s.headerRow && r === 0;
    const band = s.bandedRows && !header && (r - (s.headerRow ? 1 : 0)) % 2 === 1;
    const cells: unknown[] = [];
    row.cells.forEach((cell, c) => {
      if (cell.merged) return;
      if ((cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1) if (cell.borders) report.flag('mergedBorders');
      const first = s.firstColumn && c === 0;
      const style: TextStyle = { ...s.text, bold: header || first || s.text.bold, color: header ? s.headerTextColor : s.text.color, align: cell.align ?? s.text.align };
      const m = marker();
      part.texts.push({ marker: m, body: cellTextBody(richParagraphs(cell.text, style, theme), style.lineSpacing, links) });
      const b = cell.borders;
      const side = (v: Line | null | undefined) => (v === undefined ? defaultBorder : border(v));
      cells.push({
        text: m,
        options: {
          fill: { color: color(cell.fill ?? (header ? s.headerFill : band ? s.bandFill : s.fill)) },
          border: [side(b?.top), side(b?.right), side(b?.bottom), side(b?.left)],
          valign: cell.verticalAlign ?? 'top',
          margin: [s.text.padding[0], s.text.padding[1], s.text.padding[2], s.text.padding[3]].map((v) => v / 96),
          ...((cell.colSpan ?? 1) > 1 ? { colspan: cell.colSpan } : {}),
          ...((cell.rowSpan ?? 1) > 1 ? { rowspan: cell.rowSpan } : {}),
        },
      });
    });
    return cells;
  });
}

/** PptxGenJS chart arguments for a chart element (native, editable charts). */
export function chartArgs(c: ChartElement, theme: PresentationContent['theme']): { type: 'bar' | 'line' | 'pie' | 'doughnut'; data: unknown[]; options: PptxObjOptions } {
  const hex = (v: Parameters<typeof resolveColor>[0]) => hex6(resolveColor(v, theme));
  const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;
  const auto = (i: number) => ({ theme: ACC[i % 6] });
  const round = c.chartType === 'pie' || c.chartType === 'doughnut';
  const n = c.categories.length;
  // A missing value stays missing (a gap), as in the app's chart; pptxPost drops its empty point from the chart XML.
  const values = (v: Array<number | null>) => Array.from({ length: n }, (_, i) => (typeof v[i] === 'number' && Number.isFinite(v[i]) ? (v[i] as number) : null));
  const series = round ? c.series.slice(0, 1) : c.series;
  const data = series.map((s) => ({ name: s.name, labels: [...c.categories], values: values(s.values) }));
  const font = resolveFont(c.font, theme);
  const text = hex(c.textColor);
  const legendPos = { top: 't', bottom: 'b', left: 'l', right: 'r', none: 'b' }[c.legend];
  const options: PptxObjOptions = {
    chartColors: round ? c.categories.map((_, i) => hex(c.categoryColors?.[i] ?? auto(i))) : c.series.map((s, i) => hex(s.color ?? auto(i))),
    showLegend: c.legend !== 'none',
    legendPos,
    legendFontFace: font,
    legendFontSize: c.fontSize,
    legendColor: text,
    showTitle: c.showTitle && !!c.title.trim(),
    ...(c.showTitle && c.title.trim() ? { title: c.title.trim(), titleFontFace: font, titleFontSize: Math.round(c.fontSize * 1.3), titleColor: text } : {}),
    showValue: c.showValues,
    displayBlanksAs: 'gap',
    dataLabelColor: text,
    dataLabelFontFace: font,
    dataLabelFontSize: c.fontSize,
    catAxisLabelColor: text,
    catAxisLabelFontFace: font,
    catAxisLabelFontSize: c.fontSize,
    valAxisLabelColor: text,
    valAxisLabelFontFace: font,
    valAxisLabelFontSize: c.fontSize,
  };
  if (c.chartType === 'bar' || c.chartType === 'column') Object.assign(options, { barDir: c.chartType === 'bar' ? 'bar' : 'col', barGrouping: c.stacked ? 'stacked' : 'clustered', ...(c.stacked ? { barOverlapPct: 100 } : {}) });
  if (c.chartType === 'doughnut') options.holeSize = 50;
  if (c.chartType === 'line') Object.assign(options, { lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 6 });
  const type = c.chartType === 'line' ? 'line' : c.chartType === 'pie' ? 'pie' : c.chartType === 'doughnut' ? 'doughnut' : 'bar';
  return { type, data, options };
}

// ── The parts of the PptxGenJS API used here (its own types are not imported, so the editor never pulls them in) ─────

interface PptxTarget {
  addText(text: string, options: PptxObjOptions): unknown;
  addShape(shape: string, options: PptxObjOptions): unknown;
  addImage(options: PptxObjOptions): unknown;
  addTable(rows: unknown[][], options: PptxObjOptions): unknown;
  addChart(type: unknown, data: unknown[], options: PptxObjOptions): unknown;
  addNotes(text: string): unknown;
  background?: PptxObjOptions;
  hidden?: boolean;
}

interface PptxLike {
  layout: string;
  title: string;
  company: string;
  author: string;
  theme: { headFontFace?: string; bodyFontFace?: string };
  ChartType: Record<'bar' | 'line' | 'pie' | 'doughnut', unknown>;
  defineLayout(l: { name: string; width: number; height: number }): void;
  defineSlideMaster(m: PptxObjOptions): void;
  addSlide(o?: { masterName?: string }): PptxTarget;
  write(o: { outputType: 'uint8array'; compression?: boolean }): Promise<unknown>;
}

/** Collects master objects in defineSlideMaster's format. */
function recorder(objects: unknown[]): PptxTarget {
  return {
    addText: (text, options) => objects.push({ text: { text, options } }),
    addShape: (shape, options) => objects.push({ text: { text: '', options: { ...options, shape } } }),
    addImage: (options) => objects.push({ image: options }),
    addTable: () => undefined,
    addChart: (type, data, options) => objects.push({ chart: { type, data, opts: options } }),
    addNotes: () => undefined,
  };
}

/**
 * A picture background's fit in the PPTX (PptxGenJS stretches it): 'cover' crops the picture's overflow evenly
 * (<a:srcRect>), 'contain' leaves the slide's edges around it empty (<a:fillRect> insets). Null for 'stretch', or when
 * the picture's size is unknown.
 */
export function backgroundFit(fit: 'cover' | 'contain' | 'stretch', pic: { width?: number; height?: number }, slide: { width: number; height: number }): PartPlan['backgroundFit'] | null {
  if (fit === 'stretch' || !pic.width || !pic.height) return null;
  const ia = pic.width / pic.height;
  const sa = slide.width / slide.height;
  if (Math.abs(ia - sa) < 1e-3) return null;
  const wider = ia > sa;
  const cut = wider ? (1 - sa / ia) / 2 : (1 - ia / sa) / 2;
  const sides = wider ? { l: cut, t: 0, r: cut, b: 0 } : { l: 0, t: cut, r: 0, b: cut };
  if (fit === 'cover') return { crop: sides };
  // contain: the picture fills the slide's width (wider) or height, and the rest of the other way stays empty.
  return { inset: wider ? { l: 0, t: cut, r: 0, b: cut } : { l: cut, t: 0, r: cut, b: 0 } };
}
