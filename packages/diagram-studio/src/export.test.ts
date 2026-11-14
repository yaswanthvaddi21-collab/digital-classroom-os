// @vitest-environment jsdom
/** Image exports stay within canvas limits (audit DS-R4) and say when they had to lower the resolution. */
import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ pixelRatio: number; width: number; height: number }> = [];
vi.mock('html-to-image', () => ({
  toPng: vi.fn(async (_el: HTMLElement, o: { pixelRatio: number; width: number; height: number }) => {
    calls.push({ pixelRatio: o.pixelRatio, width: o.width, height: o.height });
    // A 1×1 transparent PNG.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }),
  toSvg: vi.fn(async () => 'data:image/svg+xml,<svg/>'),
}));

const { cappedPixelRatio, MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE, renderPdf, renderPng, resolutionNote, TOO_LARGE_FOR_IMAGE } = await import('./export');

const flow = () => {
  const el = document.createElement('div');
  el.innerHTML = '<div class="react-flow__viewport"></div>';
  return el;
};
const nodes = (w: number, h: number) => [{ id: 'a', position: { x: 0, y: 0 }, width: w, height: h, data: {} }];

describe('cappedPixelRatio', () => {
  it('keeps the requested ratio when the image fits', () => {
    expect(cappedPixelRatio(1000, 800, 2)).toBe(2);
    expect(cappedPixelRatio(1000, 800, 3)).toBe(3);
  });

  it('lowers the ratio so the bitmap stays within the pixel and side limits', () => {
    for (const [w, h] of [
      [5600, 2900],
      [20000, 300],
      [4096, 4096],
      [100000, 100000],
    ]) {
      const r = cappedPixelRatio(w, h, 2);
      expect(r).toBeLessThan(2);
      expect(r).toBeGreaterThan(0);
      expect(Math.ceil(w * r) * Math.ceil(h * r)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 2 * (w + h));
      expect(w * r).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
      expect(h * r).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    }
  });
});

describe('renderPng and renderPdf', () => {
  it('draw a large diagram at a lower ratio and report it', async () => {
    calls.length = 0;
    const r = await renderPng(flow(), nodes(3000, 2500) as never);
    expect(r.requestedPixelRatio).toBe(2);
    expect(r.pixelRatio).toBeLessThan(2);
    expect(calls[0].pixelRatio).toBe(r.pixelRatio);
    expect(calls[0].width * calls[0].pixelRatio * calls[0].height * calls[0].pixelRatio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(resolutionNote(r)).toMatch(new RegExp(`too large for a 2× image, so it was drawn at ${r.pixelRatio}×`));

    const pdf = await renderPdf(flow(), nodes(3000, 2500) as never);
    expect(pdf.requestedPixelRatio).toBe(3);
    expect(pdf.pixelRatio).toBeLessThan(1.5);
    expect(calls[1].pixelRatio).toBe(pdf.pixelRatio);

    // Below 1×, the diagram is scaled down inside the intermediate image, so that image fits a canvas too.
    const huge = await renderPng(flow(), nodes(9000, 4000) as never);
    expect(huge.pixelRatio).toBeLessThan(1);
    expect(calls[2].pixelRatio).toBe(1);
    expect(calls[2].width * calls[2].height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(calls[2].width).toBe(Math.round(huge.width * huge.pixelRatio));
    expect(huge.width).toBe(9080); // the natural size is still reported unscaled
    expect((await pdf.blob.slice(0, 4).text())).toBe('%PDF');
  });

  it('turn a browser refusing the drawing into a readable reason', async () => {
    const { toPng } = await import('html-to-image');
    vi.mocked(toPng).mockRejectedValueOnce(new Event('error'));
    await expect(renderPng(flow(), nodes(100, 100) as never)).rejects.toThrow(TOO_LARGE_FOR_IMAGE);
    vi.mocked(toPng).mockRejectedValueOnce(new TypeError('Load failed'));
    await expect(renderPdf(flow(), nodes(100, 100) as never)).rejects.toThrow(/could not draw this diagram as an image/);
    vi.mocked(toPng).mockRejectedValueOnce(new Error('Diagram canvas not found'));
    await expect(renderPng(flow(), nodes(100, 100) as never)).rejects.toThrow('Diagram canvas not found');
  });

  it('leave a normal diagram at full resolution, with no note', async () => {
    calls.length = 0;
    const r = await renderPng(flow(), nodes(800, 600) as never);
    expect(r.pixelRatio).toBe(2);
    expect(calls[0].pixelRatio).toBe(2);
    expect(resolutionNote(r)).toBeNull();
  });
});
