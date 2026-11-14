// @vitest-environment jsdom
/**
 * Off-screen previews for diagrams embedded in documents (Phase 6, ADR 0013): drawn from the stored data by the
 * vector renderer, the same drawing as the edit dialog's, and never changing (or handing back) the source.
 *
 * jsdom cannot decode images or draw on a canvas, so Image, object URLs and the canvas are stubbed; everything else
 * (deserialise, serialise, scene, SVG, pixel ratio) is the real code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDiagramPreview } from './preview';
import { diagramTemplates } from './templates';
import { deserializeDiagram, serializeDiagram, type DiagramContent } from './types';
import { renderDiagramSvg } from './vector/renderSvg';

const drawn: Array<{ width: number; height: number }> = [];

beforeEach(() => {
  drawn.length = 0;
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = '';
    set src(_: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal('Image', FakeImage);
  URL.createObjectURL = vi.fn(() => 'blob:svg');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { drawImage: vi.fn() } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    drawn.push({ width: this.width, height: this.height });
    cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const flowchart = () => diagramTemplates.find((t) => t.id === 'flowchart')!.build() as DiagramContent;
/** Freezes every object and array inside, so any write to the source throws (ESM is strict mode). */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}

describe('renderDiagramPreview', () => {
  it('draws a PNG at twice the natural size and the same SVG the editor exports', async () => {
    const source = flowchart();
    const r = (await renderDiagramPreview(source, { title: 'Flow' }))!;
    expect(r.png.type).toBe('image/png');
    expect(r.readOnly).toBe(false);
    expect(r.pixelRatio).toBe(2);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(drawn).toEqual([{ width: Math.round(r.width * 2), height: Math.round(r.height * 2) }]);
    // Same drawing as DiagramEditorApi.renderSvg(): the content the editor would hold for this source.
    const s = deserializeDiagram(source);
    const expected = renderDiagramSvg(serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers), { title: 'Flow' });
    expect(r.svg).toBe(expected.svg);
    expect(r.svg).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(r.svg).toContain('<title>Flow</title>');
    expect([r.width, r.height]).toEqual([expected.width, expected.height]);
  });

  it('a scale other than 2 is honoured', async () => {
    const r = (await renderDiagramPreview(flowchart(), { scale: 1 }))!;
    expect(r.pixelRatio).toBe(1);
    expect(drawn[0]).toEqual({ width: Math.round(r.width), height: Math.round(r.height) });
  });

  it('resolves null when there is nothing to draw', async () => {
    for (const source of [null, undefined, 'diagram', 42, [], {}]) expect(await renderDiagramPreview(source), JSON.stringify(source)).toBeNull();
    expect(await renderDiagramPreview({ schemaVersion: 2, nodes: [], edges: [], viewport: null, settings: {} })).toBeNull();
    // Only hidden shapes: the picture would be empty, as the editor's would.
    const hidden = { schemaVersion: 3, nodes: [{ id: 'h', position: { x: 0, y: 0 }, width: 100, height: 50, hidden: true, data: { ...style, shape: 'rectangle', label: 'H' } }], edges: [] };
    expect(await renderDiagramPreview(hidden)).toBeNull();
    expect(drawn).toEqual([]);
  });

  it('never changes a schema-3 source (deep-frozen) and returns no source', async () => {
    const source = deepFreeze({
      schemaVersion: 3,
      nodes: [
        { id: 'g', position: { x: 0, y: 0 }, width: 300, height: 200, data: { ...style, shape: 'rectangle', label: 'Group', rotation: 15 }, layer: 'l2' },
        { id: 'a', position: { x: 20, y: 20 }, width: 100, height: 50, parentId: 'g', locked: true, data: { ...style, shape: 'ellipse', label: 'A', link: 'https://example.org' } },
      ],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 1 },
      settings: { snapToGrid: true, showGrid: true, autoLayout: 'none', connector: 'smoothstep' },
      layers: [
        { id: 'l1', name: 'Base', visible: true, locked: false },
        { id: 'l2', name: 'Top', visible: true, locked: false },
      ],
    });
    const copy = structuredClone(source);
    const r = (await renderDiagramPreview(source))!;
    expect(r).not.toBeNull();
    expect(source).toEqual(copy);
    expect(Object.keys(r).sort()).toEqual(['height', 'notes', 'pixelRatio', 'png', 'readOnly', 'svg', 'width']);
  });

  it('draws a diagram from a newer version read-only, as far as this version can, without rewriting it', async () => {
    const source = deepFreeze({
      schemaVersion: 99,
      futureField: { keep: true },
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, width: 120, height: 60, futureNodeField: 1, data: { ...style, shape: 'rectangle', label: 'Known' } },
        { id: 'b', position: { x: 200, y: 0 }, width: 120, height: 60, data: { ...style, shape: 'hologram', label: 'Unknown kind', futureData: 'x' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'warp', label: '', data: { color: '#000', width: 1, dashed: false, arrow: 'end' } }],
      viewport: null,
      settings: {},
    });
    const copy = structuredClone(source);
    const r = (await renderDiagramPreview(source, { title: 'Future' }))!;
    expect(r.readOnly).toBe(true);
    expect(r.svg).toContain('Known');
    expect(source).toEqual(copy);
  });

  it('rejects when the browser cannot draw the picture (so callers can report it), rather than resolving an empty one', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null));
    await expect(renderDiagramPreview(flowchart())).rejects.toThrow(/could not create an image/);
  });
});
