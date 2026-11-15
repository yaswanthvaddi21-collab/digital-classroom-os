/**
 * PDF export (Phase 7 EXPORT, ADR 0014): one vector page per slide, drawn from the slide SVG (slideSvg.ts) by svg2pdf
 * into jsPDF, the pipeline Diagram Studio already ships. Text is real text in the PDF's standard fonts (Helvetica,
 * Times, Courier); links are clickable. With speaker notes, each slide gets a portrait notes page instead: the slide
 * at the top and its notes below (continued on further pages when long). Hidden slides are left out.
 * Browser only: svg2pdf needs the DOM.
 */
import { decorationsOf } from '../render/SlideView';
import type { PresentationContent, Slide, TextStyle } from '../types';
import { AssetLoader, type ExportHosts, type Picture } from './assets';
import { layoutParagraphs } from './layoutText';
import { pdfFontCanShow, pdfFontOf, type Measure } from './metrics';
import { ExportReport } from './report';
import { richParagraphs } from './richRuns';
import { slideSvg, type SvgPictures } from './slideSvg';

export interface PdfOptions extends ExportHosts {
  title: string;
  /** Notes pages: each slide with its speaker notes below it. */
  notes?: boolean;
}

export interface PdfBuild {
  blob: Blob;
  pages: number;
  report: ExportReport;
}

/** Page size in points for a slide size in px (96 px = 72 pt). */
export const slidePageSize = (size: { width: number; height: number }) => ({ width: (size.width * 72) / 96, height: (size.height * 72) / 96 });

/** Notes pages are US Letter-sized portrait pages (7.5 × 10 in, PowerPoint's notes page), in points. */
export const NOTES_PAGE = { width: 540, height: 720, margin: 36 };

const NOTES_STYLE: TextStyle = { font: 'Helvetica', fontSize: 11, color: '#000000', bold: false, italic: false, align: 'left', verticalAlign: 'top', autofit: 'none', lineSpacing: 1.3, padding: [0, 0, 0, 0] };

/**
 * Text as jsPDF's standard fonts can write it. One character outside WinAnsi (日本, Ελληνικά, an emoji) makes jsPDF
 * write the whole string as 16-bit text, which these fonts show with every character spaced apart and garbled; so
 * only the characters they cannot show become "?" and the rest of the line stays readable. Latin-1 and cp1252's
 * typographic marks (ü, é, €, “”) are kept. The export toast counts the texts this happens to (unsupportedCharacters).
 */
export function pdfSafeText(text: string): string {
  if (pdfFontCanShow(text)) return text;
  const composed = text.normalize('NFC'); // "e" + combining accent → "é", which WinAnsi has
  let out = '';
  for (const ch of composed) out += pdfFontCanShow(ch) ? ch : '?';
  return out;
}

/** Applies pdfSafeText to every piece of text in a slide SVG (text boxes, table cells, chart labels, frame captions). */
function pdfSafeSvg(root: Element) {
  for (const tag of ['text', 'tspan']) {
    for (const el of Array.from(root.getElementsByTagName(tag))) {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3 && node.nodeValue && !pdfFontCanShow(node.nodeValue)) node.nodeValue = pdfSafeText(node.nodeValue);
      }
    }
  }
}

const styleOf = (bold?: boolean, italic?: boolean) => (bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');

/** Every attachment id a slide draws (pictures, picture backgrounds) and its diagrams. */
function slideAssets(content: PresentationContent, slide: Slide) {
  const ids = new Set<string>();
  const diagrams: Array<Extract<Slide['elements'][number], { type: 'diagram' }>> = [];
  const layout = content.layouts.find((l) => l.id === slide.layoutId);
  const master = content.masters.find((m) => m.id === layout?.masterId) ?? content.masters[0];
  for (const b of [slide.background, layout?.background, master?.background]) if (b?.type === 'image') ids.add(b.attachmentId);
  for (const el of [...decorationsOf(content, slide), ...slide.elements]) {
    if (el.type === 'image') ids.add(el.attachmentId);
    if (el.type === 'diagram') diagrams.push(el);
  }
  return { ids, diagrams };
}

/** Builds the PDF. */
export async function buildPdf(content: PresentationContent, opts: PdfOptions): Promise<PdfBuild> {
  const slides = content.slides.filter((s) => !s.hidden);
  const report = new ExportReport();
  report.add('hiddenSkipped', content.slides.length - slides.length);
  if (!slides.length) throw new Error(content.slides.length ? 'Every slide is hidden, so there is nothing to put in the PDF.' : 'This presentation has no slides.');
  if (slides.some((s) => (s.transition && s.transition.type !== 'none') || s.elements.some((e) => e.animation))) report.flag('noMotion');

  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const page = slidePageSize(content.size);
  const notes = !!opts.notes;
  const first = notes ? NOTES_PAGE : page;
  const orientation = (p: { width: number; height: number }) => (p.width >= p.height ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ unit: 'pt', format: [first.width, first.height], orientation: orientation(first), compress: true });
  pdf.setProperties({ title: opts.title || 'Presentation', creator: 'Classroom OS' });

  // Text is laid out with the PDF fonts' own metrics, measured on a separate document so measuring never changes the
  // output's current font. Text is measured as it will be written (pdfSafeText), so lines break where they are drawn.
  const meter = new jsPDF({ unit: 'pt', compress: false });
  const measure: Measure = (text, font) => {
    meter.setFont(pdfFontOf(font.family), styleOf(font.bold, font.italic));
    return meter.getStringUnitWidth(pdfSafeText(text)) * font.sizePx;
  };

  // Pictures are loaded once, before drawing.
  const assets = new AssetLoader(opts);
  const pictures = new Map<string, Picture | null>();
  const diagrams = new Map<string, Uint8Array | null>();
  for (const s of slides) {
    const { ids, diagrams: ds } = slideAssets(content, s);
    for (const id of ids) if (!pictures.has(id)) pictures.set(id, await assets.picture(id, { gif: false }));
    for (const d of ds) {
      if (diagrams.has(d.id)) continue;
      const got = await assets.diagram(d, false);
      if (got?.redrawn) report.add('diagramRedrawn');
      diagrams.set(d.id, got?.png ?? null);
    }
  }
  const svgPictures: SvgPictures = { picture: (id) => pictures.get(id) ?? null, diagram: (el) => diagrams.get(el.id) ?? null };

  const parser = new DOMParser();
  const draw = async (slide: Slide, x: number, y: number, width: number) => {
    const { svg, links } = slideSvg(content, slide, { measure, pictures: svgPictures, report });
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('A slide could not be converted to PDF.');
    pdfSafeSvg(doc.documentElement);
    const k = width / content.size.width;
    // svg2pdf only sets a font style or a text colour that differs from SVG's defaults (Times, normal, black), so the
    // document starts each slide in exactly that state; otherwise a style or colour used before (the notes) carries over.
    pdf.setFont('times', 'normal');
    pdf.setTextColor(0, 0, 0);
    await pdf.svg(doc.documentElement, { x, y, width, height: content.size.height * k });
    for (const l of links) pdf.link(x + l.x * k, y + l.y * k, l.w * k, l.h * k, { url: l.url });
  };

  let pages = 0;
  for (const [i, slide] of slides.entries()) {
    if (!notes) {
      if (i > 0) pdf.addPage([page.width, page.height], orientation(page));
      pages++;
      await draw(slide, 0, 0, page.width);
      continue;
    }
    if (i > 0) pdf.addPage([NOTES_PAGE.width, NOTES_PAGE.height], 'portrait');
    pages++;
    const m = NOTES_PAGE.margin;
    const w = NOTES_PAGE.width - 2 * m;
    const h = (content.size.height * w) / content.size.width;
    await draw(slide, m, m, w);
    pdf.setDrawColor(160, 160, 160);
    pdf.setLineWidth(0.5);
    pdf.rect(m, m, w, h);
    // The notes, laid out in px (1 px = 0.75 pt) like slide text, then drawn with jsPDF's text calls.
    const toPt = 0.75;
    const top = m + h + 24;
    const paras = richParagraphs(slide.notes, NOTES_STYLE, content.theme);
    const layout = layoutParagraphs(paras, w / toPt, NOTES_STYLE.lineSpacing, measure);
    let offset = 0;
    let areaTop = top;
    const label = `Slide ${content.slides.indexOf(slide) + 1}`;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(label, m, top - 8);
    for (const line of layout.lines) {
      let y = areaTop + (line.baseline - offset) * toPt;
      if (y > NOTES_PAGE.height - m) {
        pdf.addPage([NOTES_PAGE.width, NOTES_PAGE.height], 'portrait');
        pages++;
        areaTop = m;
        offset = line.top;
        y = areaTop + (line.baseline - offset) * toPt;
      }
      for (const f of line.fragments) {
        const text = f.text.replace(/\s+$/, '');
        if (!text) continue;
        const r = f.run;
        pdf.setFont(pdfFontOf(r.family), styleOf(r.bold, r.italic));
        pdf.setFontSize(f.sizePx * toPt);
        const c = parseInt(r.color.slice(1), 16);
        pdf.setTextColor((c >> 16) & 255, (c >> 8) & 255, c & 255);
        const x = m + f.x * toPt;
        pdf.text(pdfSafeText(text), x, y + f.shift * toPt);
        if (r.underline || r.strike) {
          const w = measure(text, { family: r.family, sizePx: f.sizePx, bold: r.bold, italic: r.italic }) * toPt;
          pdf.setDrawColor((c >> 16) & 255, (c >> 8) & 255, c & 255);
          pdf.setLineWidth(Math.max(0.4, (f.sizePx * toPt) / 16));
          if (r.underline) pdf.line(x, y + f.sizePx * toPt * 0.12, x + w, y + f.sizePx * toPt * 0.12);
          if (r.strike) pdf.line(x, y - f.sizePx * toPt * 0.28, x + w, y - f.sizePx * toPt * 0.28);
        }
        if (!pdfFontCanShow(text)) report.add('unsupportedCharacters');
        if (r.href) pdf.link(x, y - f.sizePx * toPt, measure(text, { family: r.family, sizePx: f.sizePx, bold: r.bold, italic: r.italic }) * toPt, line.height * toPt, { url: r.href });
      }
    }
  }
  return { blob: pdf.output('blob'), pages, report };
}
