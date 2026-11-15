// @vitest-environment jsdom
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { kitchenSinkPresentation } from '../testFixtures';
import { richTextFromPlain, type PresentationContent, type TextElement } from '../types';
import { helveticaMeasure } from './metrics';
import { buildPdf, pdfSafeText } from './pdf';
import { ExportReport } from './report';
import { slideSvg, type SvgPictures } from './slideSvg';
import { memoryImageHost, solidPng } from './testing';

// Node resolves svg2pdf.js to its UMD build (which expects a global jsPDF); browsers get the ES build, as here.
const SVG2PDF_ES = '../../../../node_modules/svg2pdf.js/dist/svg2pdf.es.js';
vi.mock('svg2pdf.js', async () => import(/* @vite-ignore */ SVG2PDF_ES));

// jsdom has no layout: svg2pdf measures text (for text-anchor) with getBBox or a canvas; both are stubbed alike.
const width = (t: string | null) => (t ?? '').length * 8;
Object.defineProperty(window.SVGElement.prototype, 'getBBox', {
  configurable: true,
  value(this: SVGElement) {
    return { x: 0, y: 0, width: width(this.textContent), height: 16 };
  },
});
// …and no image decoding: svg2pdf reads a picture's size from an Image, which gets it from the PNG header here.
class HeaderImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  width = 0;
  height = 0;
  set src(url: string) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const u32 = (at: number) => ((bin.charCodeAt(at) << 24) | (bin.charCodeAt(at + 1) << 16) | (bin.charCodeAt(at + 2) << 8) | bin.charCodeAt(at + 3)) >>> 0;
    [this.width, this.height] = bin.startsWith('\x89PNG') ? [u32(16), u32(20)] : [1, 1];
    setTimeout(() => this.onload?.(), 0);
  }
}
Object.defineProperty(window, 'Image', { configurable: true, value: HeaderImage });
Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value() {
    return { font: '', measureText: (t: string) => ({ width: width(t) }) };
  },
});

const host = () => memoryImageHost({ 'attachment-picture': solidPng(64, 48), 'attachment-diagram': solidPng(96, 64), 'attachment-logo': solidPng(8, 8), 'attachment-background': solidPng(16, 9) });

/** The PDF's objects as text, with its content streams inflated. */
async function readPdf(blob: Blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const raw = bytes.toString('latin1');
  let streams = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      streams += m[1];
    }
  }
  return { raw, streams, pages: (raw.match(/\/Type \/Page\b/g) ?? []).length, boxes: [...raw.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number)) };
}

describe('PDF export', () => {
  it('draws one vector page per visible slide at the slide size, with real text, and leaves hidden slides out', { timeout: 30000 }, async () => {
    const content = kitchenSinkPresentation();
    const r = await buildPdf(content, { title: 'Every feature', imageHost: host() });
    const pdf = await readPdf(r.blob);
    expect(r.pages).toBe(content.slides.filter((s) => !s.hidden).length);
    expect(pdf.pages).toBe(r.pages);
    for (const b of pdf.boxes) expect(b).toEqual([0, 0, 720, 405]);
    expect(pdf.streams).toMatch(/\(Every feature\)\s*Tj/);
    expect(pdf.streams).toMatch(/\(Bold\)\s*Tj/);
    expect(pdf.raw).toMatch(/\/BaseFont \/Helvetica-Bold/);
    expect(pdf.raw).toMatch(/\/BaseFont \/Times-Roman/); // the Georgia run
    // Links are clickable.
    expect(pdf.raw).toMatch(/\/URI \(https:\/\/example\.org\/\)/);
    expect(pdf.raw).toMatch(/\/Title \(Every feature\)/);
    const notes = r.report.sentences();
    expect(notes).toEqual(expect.arrayContaining(['1 hidden slide was left out.', 'Transitions and animations are not part of a PDF.']));
    expect(notes.join(' ')).toMatch(/standard fonts .* instead of Georgia/);
  });

  it('makes portrait notes pages with the slide above its notes', { timeout: 30000 }, async () => {
    const content = kitchenSinkPresentation();
    const r = await buildPdf(content, { title: 'x', imageHost: host(), notes: true });
    const pdf = await readPdf(r.blob);
    expect(pdf.boxes[0]).toEqual([0, 0, 540, 720]);
    expect(pdf.streams).toMatch(/\(Slide 1\)\s*Tj/);
    expect(pdf.streams).toMatch(/\(Bullet\)\s*Tj/); // from the notes of slide 1
    expect(pdf.pages).toBe(r.pages);
    expect(r.pages).toBeGreaterThanOrEqual(content.slides.filter((s) => !s.hidden).length);
  });

  it('continues long notes on further pages', { timeout: 30000 }, async () => {
    const p = createPresentation('blank');
    p.slides[0].notes = richTextFromPlain(Array.from({ length: 120 }, (_, i) => `Note line ${i + 1}`).join('\n'));
    const r = await buildPdf(p, { title: 'x', notes: true });
    expect(r.pages).toBeGreaterThan(1);
    expect((await readPdf(r.blob)).streams).toMatch(/\(Note line 120\)\s*Tj/);
  });

  it('starts every slide in the default font and colour: a style or colour used before never carries over', { timeout: 30000 }, async () => {
    const p = createPresentation('blank');
    // Drawn first on each page (a master object), in the box style: upright, regular, black.
    p.masters[0].decorations = [{ id: 'footer', type: 'text', x: 10, y: 500, w: 300, h: 30, rotation: 0, text: richTextFromPlain('Footer'), style: { ...(p.slides[0].elements[0] as TextElement).style, bold: false, italic: false, color: '#000000', autofit: 'none' } }];
    // Laid out last before drawing: italic. Then a notes page sets grey bold text before the second slide is drawn.
    (p.slides[0].elements[0] as TextElement).text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Slanted', marks: [{ type: 'italic' }] }] }] };
    p.slides.push({ ...p.slides[0], id: 'second' });
    p.slides[0].notes = richTextFromPlain('A note');
    for (const notes of [false, true]) {
      const pdf = await readPdf((await buildPdf(p, { title: 'x', notes })).blob);
      // Which font each resource name stands for.
      const fonts = new Map<string, string>();
      for (const [, name, obj] of pdf.raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
        const base = new RegExp(`(?:^|\\n)${obj} 0 obj\\s*<<[^>]*?/BaseFont /([\\w-]+)`).exec(pdf.raw);
        if (base) fonts.set(name, base[1]);
      }
      // The font in effect at each "(Footer) Tj": the last Tf before it.
      const uses: Array<string | undefined> = [];
      let current = '';
      for (const m of pdf.streams.matchAll(/\/(F\d+) [\d.]+ Tf|\(((?:[^()\\]|\\.)*)\) Tj/g)) {
        if (m[1]) current = m[1];
        else if (m[2] === 'Footer') uses.push(fonts.get(current));
      }
      expect(uses, notes ? 'notes pages' : 'slides').toEqual(['Helvetica', 'Helvetica']);
      // Black text is black on every page (0 0 0 rg before the footer).
      let colour = '';
      const colours: string[] = [];
      // Fill colour as "r g b rg" or, for greys, "v g".
      for (const m of pdf.streams.matchAll(/((?:[\d.]+ ){2}[\d.]+) rg|(?<![\d.] )([\d.]+) g\b|\(((?:[^()\\]|\\.)*)\) Tj/g)) {
        if (m[2]) colour = m[2];
        if (m[1]) colour = m[1];
        else if (m[3] === 'Footer') colours.push(colour);
      }
      expect(colours).toHaveLength(2);
      for (const c of colours) expect(c.split(' ').every((v) => Number(v) === 0)).toBe(true);
    }
  });

  it('replaces only the characters the standard fonts cannot show, so the rest of each line stays readable (slides, tables, charts, notes)', { timeout: 30000 }, async () => {
    const content = kitchenSinkPresentation();
    const mixed = 'Hello 日本 Grüße';
    const doc = (t: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }] });
    // A text box, a table cell, a chart title and category, and the notes.
    const tableSlide = content.slides[3];
    tableSlide.hidden = false; // hidden in the fixture
    for (const el of tableSlide.elements) {
      if (el.type === 'table') el.rows[0].cells[0] = { ...el.rows[0].cells[0], text: doc('Cell 日本 Grüße') };
      if (el.type === 'chart') {
        el.title = 'Chart 日本 Grüße';
        el.categories = ['Cat 日本 ü', ...el.categories.slice(1)];
      }
    }
    const box = content.slides[0].elements.find((e) => e.type === 'text') as TextElement;
    box.text = doc(mixed);
    content.slides[0].notes = richTextFromPlain('Note 日本 Grüße');
    for (const notes of [false, true]) {
      const r = await buildPdf(content, { title: 'x', imageHost: host(), notes });
      const pdf = await readPdf(r.blob);
      // No 16-bit strings: jsPDF writes those with a NUL before every ASCII character ("\0H\0e…" or <FEFF…>).
      expect(/\x00[A-Za-z]\x00[A-Za-z]/.test(pdf.streams), 'no 16-bit text').toBe(false);
      expect(/<FEFF/i.test(pdf.streams), 'no 16-bit hex text').toBe(false);
      // Latin-1 (ü, ß) is kept as WinAnsi bytes; only 日本 is replaced.
      const tj = [...pdf.streams.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1]);
      for (const want of ['Hello ?? Grüße', 'Cell ?? Grüße', 'Chart ?? Grüße', 'Cat ?? ü', ...(notes ? ['Note ?? Grüße'] : [])]) {
        const words = want.split(' ');
        // A line may be drawn as one piece or word by word.
        expect(tj.includes(want) || words.every((w) => tj.includes(w)), `${want} (${notes ? 'notes pages' : 'slides'})`).toBe(true);
      }
      // The warning still counts every text that had such characters: box, cell, chart title, category (and notes).
      expect(r.report.count('unsupportedCharacters')).toBeGreaterThanOrEqual(notes ? 5 : 4);
      expect(r.report.sentences().join(' ')).toMatch(/characters the PDF's standard fonts cannot show/);
    }
  });

  it('pdfSafeText keeps WinAnsi text as it is and replaces each other character with one "?"', () => {
    expect(pdfSafeText('Café – “quotes” € ü')).toBe('Café – “quotes” € ü');
    expect(pdfSafeText('Hello 日本 Grüße')).toBe('Hello ?? Grüße');
    expect(pdfSafeText('Smile 😀!')).toBe('Smile ?!'); // one character, two UTF-16 units
    expect(pdfSafeText('Cafe\u0301 Ω')).toBe('Café ?'); // a combining accent is composed first
  });

  it('refuses a presentation with nothing to show', async () => {
    const p = createPresentation('blank');
    await expect(buildPdf({ ...p, slides: [] }, { title: 'x' })).rejects.toThrow('This presentation has no slides.');
    await expect(buildPdf({ ...p, slides: p.slides.map((s) => ({ ...s, hidden: true })) }, { title: 'x' })).rejects.toThrow(/Every slide is hidden/);
  });
});

describe('slide SVG', () => {
  const pictures = (has: boolean): SvgPictures => ({
    picture: () => (has ? { bytes: solidPng(4, 3), type: 'png', width: 4, height: 3, converted: false } : null),
    diagram: () => (has ? solidPng(4, 3) : null),
  });
  const render = (content: PresentationContent, i: number, has = true) => {
    const report = new ExportReport();
    const out = slideSvg(content, content.slides[i], { measure: helveticaMeasure, pictures: pictures(has), report });
    const doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    return { ...out, doc, report };
  };

  it('holds only what svg2pdf draws: no foreignObject, no CSS, no markers', () => {
    const content = kitchenSinkPresentation();
    for (let i = 0; i < content.slides.length; i++) {
      const { svg } = render(content, i);
      expect(svg).not.toMatch(/foreignObject|<style|<marker|class=/);
    }
  });

  it('draws text as positioned pieces in the PDF fonts, with highlight, underline and link areas', () => {
    const { doc, links } = render(kitchenSinkPresentation(), 1);
    const texts = [...doc.getElementsByTagName('text')];
    expect(texts.map((t) => t.textContent)).toEqual(expect.arrayContaining(['Bold', 'italic', 'a link', 'highlighted', 'styled', 'Bullet', 'Nested', 'Third', '•', '–', '3.']));
    expect(texts.find((t) => t.textContent === 'styled')!.getAttribute('font-family')).toBe('times');
    expect(texts.find((t) => t.textContent === 'Bold')!.getAttribute('font-weight')).toBe('bold');
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://example.org/');
    expect(links[0].x).toBeGreaterThan(40); // in slide coordinates, inside the text box at x = 40
  });

  it('draws pictures inline with their crop, and gradients as definitions', () => {
    const { doc } = render(kitchenSinkPresentation(), 1);
    const imgs = [...doc.getElementsByTagName('image')];
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    for (const img of imgs) expect(img.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    const shapes = render(kitchenSinkPresentation(), 2).doc;
    expect(shapes.getElementsByTagName('linearGradient').length).toBeGreaterThan(0);
  });

  it('draws missing pictures and diagrams as labelled frames and counts them', () => {
    const { doc, report } = render(kitchenSinkPresentation(), 1, false);
    const texts = [...doc.getElementsByTagName('text')].map((t) => t.textContent).join(' ');
    expect(texts).toContain('Diagram: The');
    expect(report.count('missingPicture')).toBeGreaterThan(0);
    expect(report.count('missingDiagram')).toBe(1);
  });

  it('draws tables cell by cell and charts from the chart renderer', () => {
    const { doc } = render(kitchenSinkPresentation(), 3);
    const texts = [...doc.getElementsByTagName('text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Name', 'Value', 'Unit', 'Merged', 'cm', 'bar chart', 'Lab A', 'Q1']));
  });

  it('shrinks text set to shrink on overflow', () => {
    const p = createPresentation('blank');
    const title = p.slides[0].elements[0] as TextElement;
    title.text = richTextFromPlain('A title far too long to fit on one line of this box so it must shrink to fit');
    title.style = { ...title.style, autofit: 'shrink', fontSize: 44 };
    const sizes = [...render(p, 0).doc.getElementsByTagName('text')].map((t) => Number(t.getAttribute('font-size')));
    expect(Math.max(...sizes)).toBeLessThan((44 * 96) / 72);
  });
});
