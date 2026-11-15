// @vitest-environment jsdom
/**
 * Round 3: picture backgrounds keep their fit in both exports. PptxGenJS stretched every picture background (the
 * PPTX now crops for 'cover' and insets for 'contain'), and the PDF stretched JPEG backgrounds (their size was
 * unknown; it is now read from the JPEG header).
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createPresentation } from '../create';
import type { Background, PresentationContent } from '../types';
import { AssetLoader, gifSize, jpegSize } from './assets';
import { helveticaMeasure } from './metrics';
import { backgroundFit, buildPptx } from './pptx';
import { ExportReport } from './report';
import { slideSvg } from './slideSvg';
import { memoryImageHost, solidPng } from './testing';

/** The start of a baseline JPEG of w × h: SOI, an APP0 segment, then the SOF0 frame header. */
function jpegHead(w: number, h: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Uint8Array.from([0xff, 0xd8, ...app0, 0xff, 0xff /* a fill byte */, ...sof0.slice(1), 0xff, 0xd9]);
}
const gifHead = (w: number, h: number) => Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0]);

function withBackground(bg: Background): PresentationContent {
  const p = createPresentation('blank');
  p.slides[0] = { ...p.slides[0], background: bg };
  return p;
}

describe('picture sizes', () => {
  it('reads JPEG and GIF sizes from their headers', () => {
    expect(jpegSize(jpegHead(640, 480))).toEqual({ width: 640, height: 480 });
    expect(jpegSize(jpegHead(3000, 2000))).toEqual({ width: 3000, height: 2000 });
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(jpegSize(solidPng(2, 2))).toBeNull();
    expect(gifSize(gifHead(300, 200))).toEqual({ width: 300, height: 200 });
  });

  it('the export loader gives JPEG pictures their size', async () => {
    const loader = new AssetLoader({ imageHost: memoryImageHost({ photo: jpegHead(640, 480) }) });
    expect(await loader.picture('photo', { gif: false })).toMatchObject({ type: 'jpeg', width: 640, height: 480 });
  });
});

describe('PDF: picture backgrounds', () => {
  it('a JPEG background set to cover is fitted like a PNG one, not stretched', async () => {
    const loader = new AssetLoader({ imageHost: memoryImageHost({ jpg: jpegHead(640, 480), png: solidPng(640, 480) }) });
    const imageOf = async (id: string) => {
      const pic = await loader.picture(id, { gif: false });
      const content = withBackground({ type: 'image', attachmentId: id, fit: 'cover' });
      const out = slideSvg(content, content.slides[0], { measure: helveticaMeasure, pictures: { picture: () => pic, diagram: () => null }, report: new ExportReport() });
      const img = new DOMParser().parseFromString(out.svg, 'image/svg+xml').getElementsByTagName('image')[0];
      return ['x', 'y', 'width', 'height'].map((a) => Number(img.getAttribute(a)));
    };
    expect(await imageOf('png')).toEqual([0, -90, 960, 720]);
    expect(await imageOf('jpg')).toEqual([0, -90, 960, 720]);
  });
});

describe('PPTX: picture backgrounds', () => {
  it('works out the crop (cover) and the insets (contain) from the picture and slide proportions', () => {
    const slide = { width: 960, height: 540 };
    // 640 × 480 (4:3) on 16:9: cover cuts 12.5% off top and bottom; contain leaves 12.5% empty left and right.
    expect(backgroundFit('cover', { width: 640, height: 480 }, slide)).toEqual({ crop: { l: 0, t: 0.125, r: 0, b: 0.125 } });
    expect(backgroundFit('contain', { width: 640, height: 480 }, slide)).toEqual({ inset: { l: 0.125, t: 0, r: 0.125, b: 0 } });
    // A panorama (4:1) on 16:9.
    const pano = backgroundFit('cover', { width: 4000, height: 1000 }, slide)!;
    expect(pano.crop!.l).toBeCloseTo((1 - 16 / 9 / 4) / 2, 6);
    expect(backgroundFit('contain', { width: 4000, height: 1000 }, slide)!.inset!.t).toBeCloseTo((1 - 16 / 9 / 4) / 2, 6);
    expect(backgroundFit('stretch', { width: 640, height: 480 }, slide)).toBeNull();
    expect(backgroundFit('cover', {}, slide)).toBeNull();
    expect(backgroundFit('cover', { width: 1920, height: 1080 }, slide)).toBeNull();
  });

  const bgXml = async (bg: Background, files: Record<string, Uint8Array>, part = 'ppt/slides/slide1.xml', where: 'slide' | 'layout' = 'slide') => {
    const p = createPresentation('blank');
    if (where === 'slide') p.slides[0] = { ...p.slides[0], background: bg };
    else p.layouts = p.layouts.map((l) => ({ ...l, background: bg }));
    const r = await buildPptx(p, { title: 'x', imageHost: memoryImageHost(files), measure: helveticaMeasure });
    const zip = await JSZip.loadAsync(r.bytes);
    const xml = await zip.file(part)!.async('string');
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
    return /<p:bg>[\s\S]*?<\/p:bg>/.exec(xml)![0];
  };

  it('writes cover as a cropped picture and contain as an inset one, on slides and layouts; stretch stays stretched', async () => {
    const files = { pic: solidPng(640, 480), jpg: jpegHead(640, 480) };
    expect(await bgXml({ type: 'image', attachmentId: 'pic', fit: 'cover' }, files)).toContain('<a:srcRect l="0" t="12500" r="0" b="12500"/><a:stretch><a:fillRect/></a:stretch>');
    expect(await bgXml({ type: 'image', attachmentId: 'pic', fit: 'contain' }, files)).toContain('<a:srcRect/><a:stretch><a:fillRect l="12500" t="0" r="12500" b="0"/></a:stretch>');
    expect(await bgXml({ type: 'image', attachmentId: 'pic', fit: 'stretch' }, files)).toContain('<a:srcRect/><a:stretch><a:fillRect/></a:stretch>');
    expect(await bgXml({ type: 'image', attachmentId: 'jpg', fit: 'cover' }, files)).toContain('<a:srcRect l="0" t="12500" r="0" b="12500"/>');
    expect(await bgXml({ type: 'image', attachmentId: 'pic', fit: 'cover' }, files, 'ppt/slideLayouts/slideLayout2.xml', 'layout')).toContain('<a:srcRect l="0" t="12500" r="0" b="12500"/>');
  });
});
