// @vitest-environment jsdom
/**
 * Round 3: PowerPoint export edge cases the verifier found. Each used to fail the export ("Export failed") or write
 * something PowerPoint shows wrongly.
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide } from '../create';
import { layoutIdFor } from '../layouts';
import { richTextFromPlain, type ChartElement, type PresentationContent, type TableElement, type TextElement } from '../types';
import { newChart } from '../elements/defaults';
import { newTable } from '../elements/table';
import { helveticaMeasure } from './metrics';
import { buildPptx } from './pptx';
import { withoutMissingOverrides } from './pptxPost';
import { memoryImageHost, solidPng } from './testing';

const build = async (p: PresentationContent) => {
  const r = await buildPptx(p, { title: 'x', imageHost: memoryImageHost({ pic: solidPng(40, 30) }), measure: helveticaMeasure });
  const zip = await JSZip.loadAsync(r.bytes);
  const read = (name: string) => zip.file(name)!.async('string');
  const names = Object.keys(zip.files);
  return { r, zip, read, names };
};

describe('PowerPoint export edge cases', () => {
  it('a chart with no series or no categories is written as a labelled frame, not an export failure', async () => {
    const p = createPresentation('blank');
    const chart = (id: string, series: ChartElement['series'], categories: string[]): ChartElement => ({ ...newChart(id, 'column', { x: 100, y: 100, w: 300, h: 200 }), title: 'Marks', showTitle: true, series, categories });
    p.slides[0].elements.push(chart('c1', [], ['A', 'B']), chart('c2', [{ name: 'S', values: [] }], []));
    const { read, names } = await build(p);
    const xml = await read('ppt/slides/slide1.xml');
    expect(xml.match(/<a:t>Chart: Marks \(no data\)<\/a:t>/g)).toHaveLength(2);
    expect(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(false);
  });

  it('a layout named DEFAULT is kept apart from PptxGenJS’s own DEFAULT layout', async () => {
    const p = createPresentation('blank');
    const title = p.slides[0].elements[0] as TextElement;
    // A text decoration on the layout named DEFAULT, and a slide using that layout.
    p.layouts[2] = { ...p.layouts[2], name: 'DEFAULT', decorations: [{ ...title, id: 'deco', placeholderId: undefined, text: richTextFromPlain('On the layout') }] };
    p.slides.push({ ...p.slides[0], id: 'on-default', layoutId: p.layouts[2].id, elements: [] });
    title.text = richTextFromPlain('Hello');
    const { read, names } = await build(p);
    expect(await read('ppt/slides/slide1.xml')).toContain('Hello');
    const layouts = await Promise.all(names.filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).map(read));
    expect(layouts.filter((x) => x.includes('<a:t>On the layout</a:t>'))).toHaveLength(1);
  });

  it('text that reads exactly like an export marker is written as text', async () => {
    const p = createPresentation('blank');
    (p.slides[0].elements[0] as TextElement).text = richTextFromPlain('DCOSTXT4X');
    (p.slides[0].elements[1] as TextElement).text = richTextFromPlain('dcosobj1');
    const { read } = await build(p);
    const xml = await read('ppt/slides/slide1.xml');
    expect(xml).toContain('>DCOSTXT4X<');
    expect(xml).toContain('>dcosobj1<');
  });

  it("a table's frame is the size of its grid", async () => {
    const p = createPresentation('blank');
    const t: TableElement = newTable('t', 2, 2, { x: 100, y: 100, w: 280, h: 80 });
    expect([t.columns, t.rows.map((r) => r.height)]).toEqual([[140, 140], [40, 40]]);
    p.slides[0].elements.push(t);
    const { read } = await build(p);
    const xml = await read('ppt/slides/slide1.xml');
    const frame = /<p:graphicFrame[\s>][\s\S]*?<\/p:graphicFrame>/.exec(xml)![0];
    expect(/<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(frame)!.slice(1)).toEqual([String(280 * 9525), String(80 * 9525)]);
  });

  it('a picture placed into a picture placeholder has no empty placeholder written over it', async () => {
    const p = createPresentation('blank');
    const s = createSlide(p, layoutIdFor('pictureCaption'));
    const ph = p.layouts.find((l) => l.id === layoutIdFor('pictureCaption'))!.placeholders.find((x) => x.kind === 'picture')!;
    s.elements.push({ id: 'img', type: 'image', x: ph.x, y: ph.y, w: ph.w, h: ph.h, rotation: 0, placeholderId: ph.id, attachmentId: 'pic', fit: 'cover', alt: 'A cell', naturalWidth: 40, naturalHeight: 30 } as never);
    p.slides = [s];
    const { read, names } = await build(p);
    const slide = await read('ppt/slides/slide1.xml');
    expect(slide).toContain('<p:pic>');
    // Only text placeholders on the slide (title and caption), none of the picture's size.
    const phs = [...slide.matchAll(/<p:ph([^>]*)\/>/g)].map((m) => m[1]);
    expect(phs.every((a) => /type="(title|body)"|^ idx=/.test(a) || a === '')).toBe(true);
    expect(slide.match(/<p:sp>/g)?.length ?? 0).toBeLessThanOrEqual(2);
    // And no layout carries a placeholder without a type of the picture's kind.
    for (const n of names.filter((x) => /slideLayouts\/slideLayout\d+\.xml$/.test(x))) expect(await read(n)).not.toMatch(/type="pic"|type="tbl"/);
  });
});

describe('the package declares only parts it has', () => {
  it('[Content_Types].xml has no override for a missing part (PptxGenJS declared slideMaster2…9)', async () => {
    const p = createPresentation('blank');
    const { read, names } = await build(p);
    const types = await read('[Content_Types].xml');
    const declared = [...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(5);
    for (const part of declared) expect(names, part).toContain(part);
    expect(declared).toContain('ppt/slideMasters/slideMaster1.xml');
    expect(withoutMissingOverrides('<Types><Override PartName="/a.xml" ContentType="x"/><Override PartName="/b.xml" ContentType="y"/></Types>', new Set(['a.xml']))).toBe('<Types><Override PartName="/a.xml" ContentType="x"/></Types>');
  });
});
