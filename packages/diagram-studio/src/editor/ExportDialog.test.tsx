// @vitest-environment jsdom
/** The export options dialog (G-EXPORT) on its own, and reached from the editor's Export menu. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramEditor, type DiagramEditorApi } from '../DiagramEditor';
import type { DiagramContent } from '../types';
import { ExportDialog } from './ExportDialog';
import { EXPORT_FORMATS } from './ExportMenu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.restoreAllMocks());

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const content = (): DiagramContent => ({
  schemaVersion: 2,
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: 'Alpha' } },
    { id: 'b', position: { x: 3000, y: 2000 }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: 'Beta' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } }],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
});

const status = () => screen.getByRole('status').textContent;

describe('ExportDialog', () => {
  it('shows the image size, and the page count for each PDF choice, then exports what was chosen', async () => {
    const onExport = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} content={content()} selection={{ nodes: [], edges: [] }} onExport={onExport} />);
    // Nothing selected: the selection choice is offered but cannot be picked.
    expect((screen.getByRole('radio', { name: /Selection only \(nothing selected\)/ }) as HTMLInputElement).disabled).toBe(true);
    // 3200 × 2140 at 2× is 27 million pixels: lowered to fit 16.7 million.
    expect(status()).toMatch(/pixels \(lowered to 1\.\d+×/);
    fireEvent.click(screen.getByRole('radio', { name: '1×' }));
    expect(status()).toBe('3,200 × 2,140 pixels');
    fireEvent.click(screen.getByRole('radio', { name: 'Transparent' }));

    fireEvent.click(screen.getByRole('radio', { name: 'PDF (vector)' }));
    expect(status()).toMatch(/^1 page, 847 × 566 mm$/);
    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: 'a4' } });
    expect(status()).toMatch(/^1 page, 297 × 210 mm, scaled to \d+%$/);
    fireEvent.click(screen.getByRole('radio', { name: /Actual size/ }));
    expect(status()).toMatch(/^\d+ pages, 297 × 210 mm$/);
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'portrait' } });
    expect(status()).toMatch(/^\d+ pages, 210 × 297 mm$/);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export PDF' })));
    expect(onExport).toHaveBeenCalledWith({ format: 'pdf', page: 'a4', orientation: 'portrait', mode: 'actual-size' });
    expect(onClose).toHaveBeenCalled();
  });

  it('starts with the selection when there is one, and passes PNG options', async () => {
    const onExport = vi.fn(async () => {});
    render(<ExportDialog open onClose={() => {}} content={content()} selection={{ nodes: ['a'], edges: [] }} onExport={onExport} />);
    expect((screen.getByRole('radio', { name: 'Selection only (1 shape)' }) as HTMLInputElement).checked).toBe(true);
    expect(status()).toBe('400 × 280 pixels'); // (120 + 80) × (60 + 80) at 2×
    fireEvent.click(screen.getByRole('radio', { name: '3× (print)' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export PNG' })));
    expect(onExport).toHaveBeenCalledWith({ format: 'png', selection: { nodes: ['a'], edges: [] }, background: 'white', scale: 3 });
  });

  it('says why it cannot export instead of offering a button that fails', () => {
    const hidden = content();
    hidden.nodes = hidden.nodes.map((n) => ({ ...n, hidden: true as const }));
    render(<ExportDialog open onClose={() => {}} content={hidden} selection={{ nodes: [], edges: [] }} onExport={vi.fn()} />);
    expect(status()).toBe('The diagram is empty.');
    expect((screen.getByRole('button', { name: 'Export PNG' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the Export menu', () => {
  it('lists Export options… and exports a vector SVG of the diagram from it', async () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toContain('image-options');
    let saved: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((saved = b as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const api = createRef<DiagramEditorApi>();
    render(<DiagramEditor initialContent={content()} title="Plan" apiRef={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Export options…/ })));
    await screen.findByRole('radio', { name: 'SVG (vector)' });
    fireEvent.click(screen.getByRole('radio', { name: 'SVG (vector)' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export SVG' })));
    await vi.waitFor(() => expect(names).toEqual(['Plan.svg']));
    const svg = await saved!.text();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('foreignObject');
    expect(svg).toContain('>Alpha</text>');
    // The dialog closes once the file is downloaded.
    await vi.waitFor(() => expect(screen.queryByRole('radio', { name: 'SVG (vector)' })).toBeNull());
  });

  it('the one-click SVG entry and the host API draw from the model too', async () => {
    let saved: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((saved = b as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const api = createRef<DiagramEditorApi>();
    render(<DiagramEditor initialContent={content()} title="Plan" apiRef={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /^SVG image/ })));
    await vi.waitFor(() => expect(saved).not.toBeNull());
    expect(await saved!.text()).toContain('>Beta</text>');
    const blob = await api.current!.renderSvg();
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toContain('<title>Plan</title>');
  });
});
