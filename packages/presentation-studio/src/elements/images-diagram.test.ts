import { describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { elementProblem, presentationProblems } from '../safety';
import type { DiagramElement } from '../types';
import { fitInBox, fitOnSlide, newDiagram, newShape, withEditedDiagram } from './defaults';
import { applyRecoveredPresentationDiagram } from './diagram';
import { altFromFileName, MAX_PICTURE_BYTES, pictureFiles, preparePicture, storePicture, type DecodedPicture } from './images';
import { SHAPE_PRESETS } from '../types';

function fakeDecoder(width: number, height: number) {
  const encode = vi.fn(async (w: number, h: number, type: string) => new Blob([`${w}x${h}`], { type }));
  const close = vi.fn();
  const decode = vi.fn(async (): Promise<DecodedPicture> => ({ width, height, encode, close }));
  return { decode, encode, close };
}
const file = (type: string, size = 10, name = 'pic') => new File([new Uint8Array(size)], name, { type });

describe('pictures', () => {
  it('keeps PNG, JPEG and GIF pictures as they are when they are small enough', async () => {
    const d = fakeDecoder(800, 600);
    const f = file('image/jpeg');
    const p = await preparePicture(f, d.decode);
    expect(p).toEqual({ blob: f, mimeType: 'image/jpeg', width: 800, height: 600 });
    expect(d.encode).not.toHaveBeenCalled();
    expect(d.close).toHaveBeenCalled();
  });

  it('makes very large pictures smaller and stores other formats as PNG', async () => {
    const big = fakeDecoder(4800, 2400);
    const p = await preparePicture(file('image/png'), big.decode);
    expect([p.width, p.height, p.mimeType]).toEqual([2400, 1200, 'image/png']);
    expect(big.encode).toHaveBeenCalledWith(2400, 1200, 'image/png');
    const webp = fakeDecoder(100, 50);
    const q = await preparePicture(file('image/webp'), webp.decode);
    expect(q.mimeType).toBe('image/png');
    expect(webp.encode).toHaveBeenCalledWith(100, 50, 'image/png');
  });

  it('refuses files that are not pictures or are over 15 MB', async () => {
    const d = fakeDecoder(10, 10);
    await expect(preparePicture(file('application/pdf'), d.decode)).rejects.toThrow(/picture file/);
    await expect(preparePicture(file('image/png', MAX_PICTURE_BYTES + 1), d.decode)).rejects.toThrow(/15 MB/);
    expect(d.decode).not.toHaveBeenCalled();
  });

  it('stores the picture through the image host and hands back what an image element needs', async () => {
    const host = { putAttachment: vi.fn(async (_b: Blob, mimeType: string) => ({ id: 'att-1', mimeType, sizeBytes: 10 })), loadAttachment: vi.fn() };
    const got = await storePicture(host, file('image/gif'), fakeDecoder(30, 20).decode);
    expect(got).toEqual({ attachmentId: 'att-1', mimeType: 'image/gif', width: 30, height: 20 });
    expect(host.putAttachment).toHaveBeenCalledWith(expect.any(Blob), 'image/gif');
  });

  it('reads picture files from a transfer, and suggests alt text only from meaningful file names', () => {
    const png = file('image/png', 1, 'a.png');
    const txt = file('text/plain', 1, 'b.txt');
    expect(pictureFiles({ files: [png, txt] } as unknown as DataTransfer)).toEqual([png]);
    expect(pictureFiles(null)).toEqual([]);
    expect(altFromFileName('cell_division-diagram.png')).toBe('cell division diagram');
    expect(altFromFileName('IMG_2041.JPG')).toBe('');
    expect(altFromFileName('Screenshot 2026-11-14 at 10.00.00.png')).toBe('');
    expect(altFromFileName('20261114.jpg')).toBe('');
  });

  it('fits pictures on the slide (never enlarged) and into placeholder boxes', () => {
    const size = { width: 960, height: 540 } as const;
    expect(fitOnSlide(size, { width: 200, height: 100 })).toEqual({ x: 380, y: 220, w: 200, h: 100 });
    const big = fitOnSlide(size, { width: 4000, height: 2000 });
    expect(big.w).toBeLessThanOrEqual(576);
    expect(big.h).toBeLessThanOrEqual(324);
    expect(fitInBox({ x: 100, y: 100, w: 200, h: 200 }, { width: 400, height: 200 })).toEqual({ x: 100, y: 150, w: 200, h: 100 });
  });
});

describe('shapes', () => {
  it('every preset makes a valid shape; lines have no fill and no text', () => {
    for (const p of SHAPE_PRESETS) {
      const s = newShape(`s-${p}`, p, { width: 960, height: 540 });
      expect(elementProblem(s)).toBeNull();
      if (p === 'line') {
        expect(s.fill).toEqual({ type: 'none' });
        expect(s.text).toBeUndefined();
      } else expect(s.textStyle?.align).toBe('center');
    }
  });
});

describe('diagrams', () => {
  const embedded = { source: { nodes: [1] }, previewId: 'p1', naturalWidth: 400, naturalHeight: 200, title: 'Flow' };

  it('places a new diagram at its proportions, and an edited one keeps its place and width', () => {
    const el = newDiagram('d1', embedded, { width: 960, height: 540 });
    expect(elementProblem(el)).toBeNull();
    expect(el.w / el.h).toBeCloseTo(2, 1);
    const moved: DiagramElement = { ...el, x: 10, y: 20, w: 300, h: 150, alt: 'A flow', svgPreviewId: 'old-svg' };
    const edited = withEditedDiagram(moved, { source: { nodes: [1, 2] }, previewId: 'p2', naturalWidth: 300, naturalHeight: 300, title: 'Flow 2' });
    expect(edited).toMatchObject({ x: 10, y: 20, w: 300, h: 300, previewId: 'p2', title: 'Flow 2', alt: 'A flow', svgPreviewId: null });
  });

  it('recovers kept dialog edits over the diagram they were opened on, else onto the last slide', () => {
    const p = createPresentation('blank');
    const d = { ...newDiagram('d1', embedded, p.size), x: 5 };
    p.slides[0] = { ...p.slides[0], elements: [...p.slides[0].elements, d] };
    const result = { source: { nodes: [9] }, previewId: 'p9', naturalWidth: 100, naturalHeight: 100, title: 'Edited' };
    const replaced = applyRecoveredPresentationDiagram(p, { source: embedded.source, previewId: 'p1', naturalWidth: 400, naturalHeight: 200, title: 'Flow' }, result);
    expect(replaced.placed).toBe('replaced');
    const after = replaced.content.slides[0].elements.find((e) => e.id === 'd1') as DiagramElement;
    expect(after).toMatchObject({ x: 5, previewId: 'p9', title: 'Edited' });
    expect(presentationProblems(replaced.content)).toEqual([]);

    const appended = applyRecoveredPresentationDiagram(p, { source: { other: true }, previewId: 'zz', naturalWidth: 1, naturalHeight: 1, title: '' }, result, () => 'new-d');
    expect(appended.placed).toBe('appended');
    expect(appended.content.slides[0].elements.at(-1)).toMatchObject({ id: 'new-d', type: 'diagram', previewId: 'p9' });
    // The first diagram is left as it was.
    expect((appended.content.slides[0].elements.find((e) => e.id === 'd1') as DiagramElement).previewId).toBe('p1');

    const empty = { ...createPresentation('blank'), slides: [] };
    let n = 0;
    const onNew = applyRecoveredPresentationDiagram(empty, null, result, () => `id-${++n}`);
    expect(onNew.content.slides).toHaveLength(1);
    expect(onNew.content.slides[0].elements.some((e) => e.type === 'diagram')).toBe(true);
    expect(presentationProblems(onNew.content)).toEqual([]);
  });

  it('refuses to change a presentation this version opens read-only', () => {
    const newer = { ...createPresentation('blank'), schemaVersion: 2 };
    expect(() => applyRecoveredPresentationDiagram(newer, null, embedded)).toThrow();
  });
});
