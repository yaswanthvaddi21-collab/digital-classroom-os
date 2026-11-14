// @vitest-environment jsdom
/** Phase 6 (CLIPBOARD): the host's side of pasting Diagram Studio shapes into a document (diagramClipboardHost.ts). */
import { CLIPBOARD_FORMAT, CLIPBOARD_MIME, diagramFromClipboard, NEWER_SHAPES_MESSAGE } from '@dcos/diagram-studio';
import { describe, expect, it, vi } from 'vitest';
import { diagramFromShapes, PASTED_DIAGRAM_TITLE, SHAPES_NOTHING_TO_SHOW } from './diagramClipboardHost';

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const shape = (id: string, x: number) => ({ id, position: { x, y: 0 }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: id.toUpperCase() } });
const payload = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, source: 'ed', serial: 1, schemaVersion: 2, nodes: [shape('a', 0), shape('b', 300)], edges: [], ...extra });
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

function deps(render: (source: unknown) => Promise<unknown> = async () => ({ png, svg: '<svg/>', width: 420, height: 60, pixelRatio: 2, readOnly: false, notes: [] })) {
  const renderDiagramPreview = vi.fn(render);
  return {
    loadStudio: vi.fn(async () => ({ diagramFromClipboard, renderDiagramPreview }) as never),
    putAttachment: vi.fn(async () => 'att-1'),
    toast: vi.fn(),
    renderDiagramPreview,
  };
}

describe('pasting Diagram Studio shapes into a document', () => {
  it('makes a diagram of the shapes with a stored preview', async () => {
    const d = deps();
    const r = await diagramFromShapes((t) => (t === CLIPBOARD_MIME ? payload() : ''), d);
    expect(r).toMatchObject({ previewId: 'att-1', naturalWidth: 420, naturalHeight: 60, title: PASTED_DIAGRAM_TITLE });
    const source = r!.source as { schemaVersion: number; nodes: Array<{ data: { label: string } }> };
    expect(source.nodes.map((n) => n.data.label)).toEqual(['A', 'B']);
    expect(source.schemaVersion).toBe(2);
    expect(d.renderDiagramPreview).toHaveBeenCalledWith(source, { title: PASTED_DIAGRAM_TITLE });
    expect(d.putAttachment).toHaveBeenCalledWith(png);
    expect(d.toast).not.toHaveBeenCalled();
  });

  it('refuses shapes from a newer version with the existing message and stores nothing', async () => {
    const d = deps();
    expect(await diagramFromShapes((t) => (t === 'text/plain' ? payload({ schemaVersion: 99 }) : ''), d)).toBeNull();
    expect(d.toast).toHaveBeenCalledWith(expect.stringContaining(NEWER_SHAPES_MESSAGE), 'error');
    expect(d.putAttachment).not.toHaveBeenCalled();
  });

  it('pastes nothing (and says why) when there is nothing to draw or drawing fails', async () => {
    const none = deps(async () => null);
    expect(await diagramFromShapes((t) => (t === CLIPBOARD_MIME ? payload() : ''), none)).toBeNull();
    expect(none.toast).toHaveBeenCalledWith(SHAPES_NOTHING_TO_SHOW, 'info');
    const fails = deps(async () => {
      throw new Error('canvas too large');
    });
    expect(await diagramFromShapes((t) => (t === CLIPBOARD_MIME ? payload() : ''), fails)).toBeNull();
    expect(fails.toast).toHaveBeenCalledWith(expect.stringContaining('canvas too large'), 'error');
    expect(fails.putAttachment).not.toHaveBeenCalled();
    const empty = deps();
    expect(await diagramFromShapes(() => 'just text', empty)).toBeNull();
    expect(empty.toast).not.toHaveBeenCalled();
  });
});
