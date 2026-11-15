// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPresentation } from '../create';
import { kitchenSinkPresentation } from '../testFixtures';
import { richTextFromPlain, type PresentationContent, type TextElement } from '../types';
import { helveticaMeasure } from './metrics';
import { buildPptx } from './pptx';
import { PptxPostError, renumberShapes, replaceTextBody, withoutEmptyCells, withoutEmptyPoints } from './pptxPost';
import { memoryImageHost, solidPng } from './testing';

const host = (extra: Record<string, Uint8Array | string> = {}) =>
  memoryImageHost({
    'attachment-picture': solidPng(64, 48),
    'attachment-diagram': solidPng(96, 64, [22, 163, 74]),
    'attachment-logo': solidPng(8, 8, [220, 38, 38]),
    'attachment-background': solidPng(16, 9, [240, 240, 240]),
    ...extra,
  });

interface Unzipped {
  zip: JSZip;
  names: string[];
  text(path: string): Promise<string>;
  xml(path: string): Promise<Document>;
}

async function unzip(bytes: Uint8Array): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (p: string) => {
    const f = zip.file(p);
    if (!f) throw new Error(`missing ${p}`);
    return f.async('string');
  };
  return {
    zip,
    names: Object.keys(zip.files).filter((n) => !n.endsWith('/')),
    text,
    async xml(p) {
      const doc = new DOMParser().parseFromString(await text(p), 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error(`${p} is not well-formed`);
      return doc;
    },
  };
}

const ids = (doc: Document) => [...doc.getElementsByTagName('p:cNvPr')].map((e) => e.getAttribute('id'));
const slideCount = (u: Unzipped) => u.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;

describe('PowerPoint export: the kitchen-sink presentation', () => {
  let u: Unzipped;
  let content: PresentationContent;
  let notes: string[];
  beforeAll(async () => {
    content = kitchenSinkPresentation();
    const r = await buildPptx(content, { title: 'Every feature', imageHost: host(), measure: helveticaMeasure });
    notes = r.report.sentences();
    u = await unzip(r.bytes);
  });

  it('has one slide part per slide, the slide size and a content type for every part', async () => {
    expect(slideCount(u)).toBe(content.slides.length);
    const pres = await u.xml('ppt/presentation.xml');
    const size = pres.getElementsByTagName('p:sldSz')[0];
    expect([size.getAttribute('cx'), size.getAttribute('cy')]).toEqual(['9144000', '5143500']);
    expect(pres.getElementsByTagName('p:sldId')).toHaveLength(content.slides.length);
    const types = await u.text('[Content_Types].xml');
    for (const n of u.names.filter((x) => /^ppt\/(slides\/slide|notesSlides\/notesSlide|charts\/chart|slideLayouts\/slideLayout)\d+\.xml$/.test(x))) expect(types).toContain(`PartName="/${n}"`);
    expect(types).toContain('Extension="xlsx"');
  });

  it('is well-formed XML throughout and every relationship points at a part that exists', async () => {
    for (const n of u.names.filter((x) => /\.(xml|rels)$/.test(x))) await u.xml(n);
    for (const rels of u.names.filter((x) => x.endsWith('.rels'))) {
      const doc = await u.xml(rels);
      const base = rels.replace(/_rels\/[^/]*\.rels$/, '');
      for (const r of doc.getElementsByTagName('Relationship')) {
        if (r.getAttribute('TargetMode') === 'External') continue;
        const target = r.getAttribute('Target')!;
        const path = target.startsWith('/') ? target.slice(1) : new URL(target, `http://x/${base}`).pathname.slice(1);
        expect(u.names, `${rels} → ${target}`).toContain(path);
      }
    }
  });

  it('leaves no marker behind and writes one <a:pPr> per paragraph', async () => {
    for (const n of u.names.filter((x) => /^ppt\/(slides|slideLayouts|notesSlides)\/[^/]+\.xml$/.test(x))) {
      const xml = await u.text(n);
      expect(xml, n).not.toMatch(/DCOSTXT|dcosobj/);
      const doc = await u.xml(n);
      for (const p of doc.getElementsByTagName('a:p')) expect(p.getElementsByTagName('a:pPr').length, n).toBeLessThanOrEqual(1);
    }
  });

  it('gives every shape on a slide a unique id', async () => {
    for (let i = 1; i <= content.slides.length; i++) {
      const all = ids(await u.xml(`ppt/slides/slide${i}.xml`));
      expect(new Set(all).size, `slide ${i}`).toBe(all.length);
    }
  });

  it('fills the layout placeholders: the title is a real title placeholder with the slide text', async () => {
    const doc = await u.xml('ppt/slides/slide1.xml');
    const title = [...doc.getElementsByTagName('p:sp')].find((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'title')!;
    expect(title.getElementsByTagName('p:cNvPr')[0].getAttribute('name')).toBe('Title');
    expect(title.getElementsByTagName('a:t')[0].textContent).toBe('Every feature');
    const layout = await u.text('ppt/slideLayouts/slideLayout2.xml');
    expect(layout).toContain('<p:cSld name="Title slide"');
    expect(layout).toContain('Click to add title');
  });

  it('writes formatted text, links with their relationships, and pictures with crop and alt text', async () => {
    const xml = await u.text('ppt/slides/slide2.xml');
    expect(xml).toContain('<a:t>Bold</a:t>');
    expect(xml).toMatch(/<a:hlinkClick r:id="(rIdDcosL\d+)"\/>/);
    const rels = await u.text('ppt/slides/_rels/slide2.xml.rels');
    expect(rels).toContain('Target="https://example.org/" TargetMode="External"');
    // Cover fit + crop: 10 % cut at left and right, the rest of the cover crop at top and bottom.
    const doc = await u.xml('ppt/slides/slide2.xml');
    const pic = [...doc.getElementsByTagName('p:pic')].find((p) => p.getElementsByTagName('p:cNvPr')[0].getAttribute('name') === 'Bench photo')!;
    expect(pic.getElementsByTagName('p:cNvPr')[0].getAttribute('descr')).toBe('A lab bench');
    const src = pic.getElementsByTagName('a:srcRect')[0];
    expect([src.getAttribute('l'), src.getAttribute('r')]).toEqual(['10000', '10000']);
    expect(Number(src.getAttribute('t'))).toBeGreaterThan(0);
    // A picture background.
    expect(xml).toMatch(/<p:bg><p:bgPr><a:blipFill/);
  });

  it('writes the diagram as a PNG that carries the diagram data', async () => {
    const doc = await u.xml('ppt/slides/slide2.xml');
    const pic = [...doc.getElementsByTagName('p:pic')].find((p) => p.getElementsByTagName('p:cNvPr')[0].getAttribute('name') === 'Process')!;
    expect(pic.getElementsByTagName('p:cNvPr')[0].getAttribute('descr')).toBe('The process');
    const rid = pic.getElementsByTagName('a:blip')[0].getAttribute('r:embed');
    const rels = await u.xml('ppt/slides/_rels/slide2.xml.rels');
    const target = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)!.getAttribute('Target')!;
    const png = await u.zip.file(`ppt/${target.replace('../', '')}`)!.async('uint8array');
    expect(new TextDecoder('latin1').decode(png.subarray(0, 200))).toContain('iTXtdcos-diagram');
  });

  it('writes every media part as a real PNG, JPEG or GIF', async () => {
    const media = u.names.filter((n) => n.startsWith('ppt/media/'));
    expect(media.length).toBeGreaterThan(0);
    for (const m of media) {
      const b = await u.zip.file(m)!.async('uint8array');
      const png = b[0] === 0x89 && b[1] === 0x50;
      const jpeg = b[0] === 0xff && b[1] === 0xd8;
      const gif = b[0] === 0x47 && b[1] === 0x49;
      expect(png || jpeg || gif, m).toBe(true);
    }
  });

  it('writes preset shapes with gradients, dashes, flips, rotation and arrowheads', async () => {
    const doc = await u.xml('ppt/slides/slide3.xml');
    const geoms = [...doc.getElementsByTagName('a:prstGeom')].map((g) => g.getAttribute('prst'));
    for (const p of ['rect', 'roundRect', 'ellipse', 'star5', 'heart', 'wedgeRoundRectCallout', 'line', 'rightArrow']) expect(geoms).toContain(p);
    expect(doc.getElementsByTagName('a:gradFill').length).toBeGreaterThan(0);
    const xml = await u.text('ppt/slides/slide3.xml');
    expect(xml).toContain('flipH="1" flipV="1"');
    expect(xml).toMatch(/rot="900000"/);
    expect(xml).toContain('<a:prstDash val="sysDot"/>');
    expect(xml).toMatch(/<a:headEnd type="oval"/);
    expect(xml).toMatch(/<a:tailEnd type="triangle"/);
  });

  it('writes transitions and animations after <p:clrMapOvr>, in schema order, aimed at shapes that exist', async () => {
    for (let i = 1; i <= content.slides.length; i++) {
      const doc = await u.xml(`ppt/slides/slide${i}.xml`);
      const order = [...doc.documentElement.children].map((c) => c.tagName);
      const expected = ['p:cSld', 'p:clrMapOvr', 'p:transition', 'p:timing'].filter((t) => order.includes(t));
      expect(order, `slide ${i}`).toEqual(expected);
      const shapes = new Set(ids(doc));
      for (const t of doc.getElementsByTagName('p:spTgt')) expect(shapes.has(t.getAttribute('spid'))).toBe(true);
    }
    const kinds = await Promise.all(content.slides.map(async (_, i) => (await u.xml(`ppt/slides/slide${i + 1}.xml`)).getElementsByTagName('p:transition')[0]?.firstElementChild?.tagName ?? 'none'));
    expect(kinds).toEqual(['p:fade', 'p:push', 'p:split', 'none', 'none', 'p:fade', 'p:push', 'p:wipe', 'p:cover', 'p:split', 'p:zoom']);
    const shapesSlide = await u.xml('ppt/slides/slide3.xml');
    expect(shapesSlide.querySelectorAll('[presetClass="entr"]')).toHaveLength(content.slides[2].elements.length);
  });

  it('marks hidden slides hidden', async () => {
    expect((await u.xml('ppt/slides/slide4.xml')).documentElement.getAttribute('show')).toBe('0');
    expect((await u.xml('ppt/slides/slide3.xml')).documentElement.getAttribute('show')).toBeNull();
  });

  it('writes a native table with merged cells, fills and borders', async () => {
    const doc = await u.xml('ppt/slides/slide4.xml');
    const tbl = doc.getElementsByTagName('a:tbl')[0];
    expect(tbl.getElementsByTagName('a:gridCol')).toHaveLength(3);
    expect(tbl.getElementsByTagName('a:tr')).toHaveLength(3);
    const merged = [...tbl.getElementsByTagName('a:tc')].find((c) => c.getAttribute('gridSpan') === '2')!;
    expect(merged.textContent).toContain('Merged');
    expect(merged.getElementsByTagName('a:tcPr')[0].getAttribute('anchor')).toBe('ctr');
    expect(await u.text('ppt/slides/slide4.xml')).toContain('<a:srgbClr val="FDE68A"/>');
  });

  it('writes native charts with their data, one part and one workbook each, and leaves missing values out', async () => {
    const charts = u.names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    expect(charts).toHaveLength(5);
    const all = (await Promise.all(charts.map((c) => u.text(c)))).join('\n');
    for (const tag of ['c:barChart', 'c:lineChart', 'c:pieChart', 'c:doughnutChart']) expect(all).toContain(`<${tag}>`);
    expect(all).toContain('<c:barDir val="bar"/>');
    expect(all).toContain('<c:barDir val="col"/>');
    expect(all).toContain('<c:grouping val="stacked"/>');
    expect(all).toContain('<c:holeSize val="50"/>');
    expect(all).not.toMatch(/<c:v><\/c:v>/);
    expect(all).toContain('<c:v>Lab A</c:v>');
    expect(u.names.filter((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n))).toHaveLength(5);
    const book = await JSZip.loadAsync(await u.zip.file(u.names.find((n) => n.endsWith('.xlsx'))!)!.async('uint8array'));
    expect(await book.file('xl/worksheets/sheet1.xml')!.async('string')).not.toMatch(/<v><\/v>/);
  });

  it('writes speaker notes as paragraphs with their formatting', async () => {
    const doc = await u.xml('ppt/notesSlides/notesSlide1.xml');
    const body = [...doc.getElementsByTagName('p:sp')].find((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body')!;
    expect(body.getElementsByTagName('a:p')).toHaveLength(4);
    expect(body.textContent).toContain('Bullet');
    expect(await u.text('ppt/notesSlides/_rels/notesSlide1.xml.rels')).toContain('https://example.org/');
  });

  it('writes the theme colours and fonts, and the master on every layout', async () => {
    const theme = await u.text('ppt/theme/theme1.xml');
    expect(theme).toContain('<a:clrScheme name="Classroom"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>');
    expect(theme).toContain('<a:accent1><a:srgbClr val="2563EB"/></a:accent1>');
    expect(theme).toMatch(/<a:majorFont><a:latin typeface="Arial"/);
    const layouts = u.names.filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n));
    // PptxGenJS's own default layout plus the presentation's eight.
    expect(layouts).toHaveLength(content.layouts.length + 1);
    const titleContent = await u.text(layouts.find((l) => l.endsWith('slideLayout3.xml'))!);
    expect(titleContent).toContain('<p:cSld name="Title and content"');
    expect(titleContent).toContain('<a:gradFill'); // the layout's gradient background
    expect(titleContent).toContain('<a:off x="0" y="5048250"/>'); // the master's decoration bar
  });

  it('says what it approximated, and nothing it did not', () => {
    expect(notes).toEqual(expect.arrayContaining([expect.stringMatching(/^1 diagram was written as a picture, with the diagram's data kept inside it\.$/), expect.stringMatching(/fast, medium or slow/), expect.stringMatching(/master's objects are written onto each layout/)]));
    expect(notes.join(' ')).not.toMatch(/imported|import it|open it again/i);
  });
});

describe('PowerPoint export: details', () => {
  it('keeps a moved title placeholder where the user put it', async () => {
    const p = createPresentation('blank', { newId: (() => { let n = 0; return () => `id${++n}`; })() });
    const title = p.slides[0].elements.find((e) => e.placeholderId === 'title') as TextElement;
    title.x = 10;
    title.y = 20;
    title.rotation = 90;
    title.text = richTextFromPlain('Moved');
    const u = await unzip((await buildPptx(p, { title: 'x', measure: helveticaMeasure })).bytes);
    const doc = await u.xml('ppt/slides/slide1.xml');
    const sp = [...doc.getElementsByTagName('p:sp')].find((s) => s.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'title')!;
    const xfrm = sp.getElementsByTagName('a:xfrm')[0];
    expect(xfrm.getAttribute('rot')).toBe('5400000');
    expect([xfrm.getElementsByTagName('a:off')[0].getAttribute('x'), xfrm.getElementsByTagName('a:off')[0].getAttribute('y')]).toEqual(['95250', '190500']);
  });

  it('writes a second text linked to the same placeholder (a pasted copy) as a text box', async () => {
    const p = createPresentation('blank');
    const title = p.slides[0].elements.find((e) => e.placeholderId === 'title') as TextElement;
    title.text = richTextFromPlain('First');
    p.slides[0].elements.push({ ...title, id: 'copy', y: title.y + 100, text: richTextFromPlain('Copy') });
    const doc = await (await unzip((await buildPptx(p, { title: 'x', measure: helveticaMeasure })).bytes)).xml('ppt/slides/slide1.xml');
    const titles = [...doc.getElementsByTagName('p:sp')].filter((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'title');
    expect(titles).toHaveLength(1);
    expect(titles[0].textContent).toBe('First');
    expect([...doc.getElementsByTagName('a:t')].map((t) => t.textContent)).toContain('Copy');
  });

  it('says so when a table on a layout cannot be written', async () => {
    const p = kitchenSinkPresentation();
    const table = p.slides[3].elements.find((e) => e.type === 'table')!;
    p.layouts[0].decorations = [table];
    const r = await buildPptx(p, { title: 'x', imageHost: host(), measure: helveticaMeasure });
    expect(r.report.sentences()).toContain('1 table on a master or layout was left out (PowerPoint layouts made by this export cannot hold tables).');
  });

  it('writes 4:3 presentations at 10 × 7.5 inches', async () => {
    const u = await unzip((await buildPptx(createPresentation('blank', { sizeId: '4:3' }), { title: 'x', measure: helveticaMeasure })).bytes);
    const size = (await u.xml('ppt/presentation.xml')).getElementsByTagName('p:sldSz')[0];
    expect([size.getAttribute('cx'), size.getAttribute('cy')]).toEqual(['9144000', '6858000']);
  });

  it('shows a missing picture as a labelled frame and says so', async () => {
    const r = await buildPptx(kitchenSinkPresentation(), { title: 'x', imageHost: memoryImageHost({}), measure: helveticaMeasure });
    const u = await unzip(r.bytes);
    expect(await u.text('ppt/slides/slide2.xml')).toContain('Picture not on this device: A lab bench');
    expect(r.report.sentences().join(' ')).toMatch(/pictures? (is|are) not on this device/);
    expect(r.report.sentences().join(' ')).toMatch(/diagram has no picture on this device/);
  });

  it('writes the shrink scale for text set to shrink on overflow', async () => {
    const p = createPresentation('blank');
    const title = p.slides[0].elements[0] as TextElement;
    title.text = richTextFromPlain('A title far too long to fit on one line of this box, so it must shrink to fit inside it');
    title.style = { ...title.style, autofit: 'shrink' };
    const xml = await (await unzip((await buildPptx(p, { title: 'x', measure: helveticaMeasure })).bytes)).text('ppt/slides/slide1.xml');
    const scale = Number(/<a:normAutofit fontScale="(\d+)"\/>/.exec(xml)?.[1]);
    expect(scale).toBeGreaterThan(20000);
    expect(scale).toBeLessThan(100000);
  });
});

describe('post-processing guards', () => {
  it('throws instead of writing a file without the user\'s text when PptxGenJS output changes', () => {
    expect(() => replaceTextBody('<p:sld></p:sld>', { marker: 'DCOSTXT1X', body: '<p:txBody></p:txBody>' })).toThrow(PptxPostError);
  });

  it('renumbers shape ids in document order and keeps the group root', () => {
    expect(renumberShapes('<p:cNvPr id="1" name=""/><p:cNvPr id="3" name="a"/><p:cNvPr id="3" name="b"/>')).toBe('<p:cNvPr id="1" name=""/><p:cNvPr id="2" name="a"/><p:cNvPr id="3" name="b"/>');
  });

  it('drops empty chart points and workbook cells (missing values)', () => {
    expect(withoutEmptyPoints('<c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v></c:v></c:pt>')).toBe('<c:pt idx="0"><c:v>3</c:v></c:pt>');
    expect(withoutEmptyCells('<c r="B2"><v>3</v></c><c r="B3"><v></v></c>')).toBe('<c r="B2"><v>3</v></c>');
  });
});
