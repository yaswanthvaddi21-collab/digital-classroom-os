// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPresentation, createSlide } from '../create';
import { clearClipboardForTests } from '../editor/clipboard';
import type { PresentationDiagramHost, PresentationEmbeddedDiagram, PresentationImageHost } from '../hosts';
import { layoutIdFor } from '../layouts';
import { PresentationEditor } from '../PresentationEditor';
import { presentationProblems } from '../safety';
import { plainTextOf, type ChartElement, type DiagramElement, type ImageElement, type PresentationContent, type ShapeElement, type SlideElement, type TableElement } from '../types';
import { pictureDecoder, type DecodedPicture } from './images';

const realDecode = pictureDecoder.decode;
beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS ??= {};
  (globalThis as { CSS: { escape?: (s: string) => string } }).CSS.escape ??= (s: string) => s.replace(/["\\]/g, '\\$&');
});
beforeEach(() => {
  // jsdom cannot decode pictures: every picture is 800 × 400.
  pictureDecoder.decode = async (): Promise<DecodedPicture> => ({ width: 800, height: 400, encode: async (_w, _h, type) => new Blob(['x'], { type }), close: () => undefined });
});
afterEach(() => {
  cleanup();
  clearClipboardForTests();
  pictureDecoder.decode = realDecode;
  vi.restoreAllMocks();
});

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function imageHost(): PresentationImageHost & { stored: Map<string, Blob> } {
  const stored = new Map<string, Blob>();
  let n = 0;
  return {
    stored,
    putAttachment: vi.fn(async (data: Blob, mimeType: string) => {
      const id = `att-${++n}`;
      stored.set(id, data);
      return { id, mimeType, sizeBytes: data.size };
    }),
    loadAttachment: vi.fn(async (id: string) => stored.get(id)),
  };
}

const EMBEDDED: PresentationEmbeddedDiagram = { source: { nodes: [{ id: 'n1' }] }, previewId: 'prev-1', naturalWidth: 400, naturalHeight: 200, title: 'Water cycle' };
function diagramHost(over: Partial<PresentationDiagramHost> = {}): PresentationDiagramHost {
  return {
    templates: [
      { id: 'blank', name: 'Blank canvas' },
      { id: 'flowchart', name: 'Flowchart' },
    ],
    edit: vi.fn(async () => EMBEDDED),
    pickFromLibrary: vi.fn(async () => ({ source: { nodes: [] }, title: 'From library' })),
    importFile: vi.fn(async () => null),
    loadPreview: vi.fn(async () => undefined),
    toDrawio: vi.fn(async () => ''),
    settle: vi.fn(),
    ...over,
  };
}

function setup(content: PresentationContent = createPresentation('blank'), hosts: { image?: PresentationImageHost; diagram?: PresentationDiagramHost } = {}) {
  const onChange = vi.fn();
  render(<PresentationEditor initialContent={json(content)} title="Talk" onChange={onChange} imageHost={hosts.image} diagramHost={hosts.diagram} />);
  const last = (): PresentationContent => onChange.mock.calls.at(-1)![0];
  const elements = () => last().slides[0].elements;
  return { onChange, last, elements };
}

const canvas = () => screen.getByRole('listbox', { name: /^Objects on slide/ });
const objects = () => within(canvas()).getAllByRole('option');
const object = (name: RegExp) => within(canvas()).getByRole('option', { name });
const insertTab = () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
  return screen.getByRole('toolbar', { name: 'Insert' });
};
const inspector = (kind: string) => screen.getByRole('complementary', { name: `${kind} settings` });
const pick = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
};
const liveEditor = (selector: string) => (document.querySelector(selector) as unknown as { editor: Editor }).editor;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
/** The next file picker gets `file` (jsdom cannot show one). */
function nextFile(file: File | null) {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementationOnce(function (this: HTMLInputElement) {
    if (file) Object.defineProperty(this, 'files', { value: [file], configurable: true });
    queueMicrotask(() => (file ? this.onchange?.(new Event('change')) : this.dispatchEvent(new Event('cancel'))));
  });
}
const png = (name = 'mitochondria.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
const setField = (scope: HTMLElement, label: string | RegExp, value: string) => {
  const input = within(scope).getByLabelText(label) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
/** The chart data dialog (the app's Dialog names itself with its heading). */
const chartDialog = () => screen.getByRole('heading', { name: 'Edit chart data' }).closest('dialog') as HTMLElement;
const choose = (scope: HTMLElement, label: string | RegExp, value: string) => fireEvent.change(within(scope).getByRole('combobox', { name: label }), { target: { value } });

describe('the Insert tab', () => {
  it('shows picture and diagram controls only when the app supplies their hosts', () => {
    setup();
    let bar = insertTab();
    expect(within(bar).queryByRole('button', { name: 'Picture' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Diagram' })).toBeNull();
    for (const name of ['Shapes', 'Table', 'Chart']) expect(within(bar).getByRole('button', { name })).toBeTruthy();
    cleanup();
    setup(undefined, { image: imageHost(), diagram: diagramHost() });
    bar = insertTab();
    expect(within(bar).getByRole('button', { name: 'Picture' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Diagram' })).toBeTruthy();
  });
});

describe('pictures', () => {
  it('inserts a picture from a file through the image host, selected, with alt text from the file name', async () => {
    const host = imageHost();
    const { elements, last } = setup(undefined, { image: host });
    nextFile(png());
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Picture' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'image')).toBe(true));
    const img = elements().find((e): e is ImageElement => e.type === 'image')!;
    expect(img).toMatchObject({ attachmentId: 'att-1', mimeType: 'image/png', naturalWidth: 800, naturalHeight: 400, fit: 'contain', alt: 'mitochondria' });
    expect(img.w / img.h).toBeCloseTo(2, 1);
    expect(host.putAttachment).toHaveBeenCalledTimes(1);
    expect(object(/^Picture: mitochondria/).getAttribute('aria-selected')).toBe('true');
    expect(presentationProblems(last())).toEqual([]);
    // One undo step takes it away again.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements.some((e) => e.type === 'image')).toBe(false);
  });

  it('a cancelled file picker adds nothing; a file that is not a picture is refused with a message', async () => {
    const { onChange } = setup(undefined, { image: imageHost() });
    nextFile(null);
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Picture' }));
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    nextFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Insert' })).getByRole('button', { name: 'Picture' }));
    await flush();
    await flush();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pastes and drops picture files onto the slide', async () => {
    const { elements } = setup(undefined, { image: imageHost() });
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', { value: { files: [png('pasted.png')], items: [], types: ['Files'], getData: () => '' } });
    act(() => void canvas().dispatchEvent(paste));
    await waitFor(() => expect(elements().filter((e) => e.type === 'image')).toHaveLength(1));
    expect(paste.defaultPrevented).toBe(true);
    const frame = document.querySelector('[data-canvas]')!;
    fireEvent.drop(frame, { dataTransfer: { files: [png('dropped.png')], types: ['Files'] }, clientX: 10, clientY: 10 });
    await waitFor(() => expect(elements().filter((e) => e.type === 'image')).toHaveLength(2));
    expect((elements().at(-1) as ImageElement).alt).toBe('dropped');
  });

  it('crops, fits, gives alt text, matches proportions and replaces from the inspector (each one undo step)', async () => {
    const host = imageHost();
    const { elements, last } = setup(undefined, { image: host });
    nextFile(png());
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Picture' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'image')).toBe(true));
    const panel = inspector('Picture');
    const img = () => elements().find((e): e is ImageElement => e.type === 'image')!;
    setField(panel, 'Left', '10');
    setField(panel, 'Bottom', '20');
    expect(img().crop).toEqual({ left: 0.1, top: 0, right: 0, bottom: 0.2 });
    choose(panel, 'Fit', 'cover');
    expect(img().fit).toBe('cover');
    const altBox = within(panel).getByLabelText('Alt text');
    fireEvent.focus(altBox);
    fireEvent.change(altBox, { target: { value: 'A mito' } });
    fireEvent.change(altBox, { target: { value: 'A mitochondrion' } });
    expect(img().alt).toBe('A mitochondrion');
    fireEvent.click(within(panel).getByRole('button', { name: 'Match the picture’s proportions' }));
    // 800 × 400 with 10% off the left and 20% off the bottom: 720 × 320.
    expect(img().w / img().h).toBeCloseTo(720 / 320, 1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset crop' }));
    expect(img().crop).toBeUndefined();
    // Typing the alt text was one step: undo the reset, the proportions, then the alt text in one go.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(img().alt).toBe('mitochondria');
    expect(img().fit).toBe('cover');
    nextFile(png('nucleus.png'));
    fireEvent.click(within(inspector('Picture')).getByRole('button', { name: 'Replace picture…' }));
    await waitFor(() => expect(img().attachmentId).toBe('att-2'));
    expect(img().crop).toBeUndefined();
    expect(presentationProblems(last())).toEqual([]);
  });

  it('fills an empty picture placeholder; its button is on the canvas only, and comes back when the picture goes', async () => {
    const p = createPresentation('blank');
    p.slides = [createSlide(p, layoutIdFor('pictureCaption'))];
    const { elements } = setup(p, { image: imageHost() });
    const button = screen.getByRole('button', { name: 'Insert picture into the placeholder' });
    expect(document.querySelectorAll('[data-empty-placeholder]')).toHaveLength(1);
    // Thumbnails never show it.
    expect(within(screen.getByRole('listbox', { name: 'Slides' })).queryByText('Click the icon to add a picture')).toBeNull();
    nextFile(png());
    fireEvent.click(button);
    await waitFor(() => expect(elements().some((e) => e.type === 'image')).toBe(true));
    const img = elements().find((e): e is ImageElement => e.type === 'image')!;
    const ph = p.layouts.find((l) => l.id === layoutIdFor('pictureCaption'))!.placeholders.find((x) => x.kind === 'picture')!;
    expect(img).toMatchObject({ placeholderId: 'picture', fit: 'cover', x: ph.x, y: ph.y, w: ph.w, h: ph.h });
    expect(screen.queryByRole('button', { name: 'Insert picture into the placeholder' })).toBeNull();
    fireEvent.keyDown(canvas(), { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Insert picture into the placeholder' })).toBeTruthy();
  });

  it('fills chart and table placeholders of a layout', () => {
    const p = createPresentation('blank');
    const layout = p.layouts.find((l) => l.id === layoutIdFor('twoContent'))!;
    layout.placeholders.push({ ...layout.placeholders[1], id: 'c1', kind: 'chart', prompt: 'Click the icon to add a chart' }, { ...layout.placeholders[2], id: 't1', kind: 'table', prompt: 'Click the icon to add a table' });
    p.slides = [createSlide(p, layout.id)];
    const { elements, last } = setup(p);
    fireEvent.click(screen.getByRole('button', { name: 'Insert chart into the placeholder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert table into the placeholder' }));
    expect(elements().find((e) => e.type === 'chart')?.placeholderId).toBe('c1');
    expect(elements().find((e) => e.type === 'table')?.placeholderId).toBe('t1');
    expect(presentationProblems(last())).toEqual([]);
  });
});

describe('shapes', () => {
  it('inserts every kind from the gallery, types text inside, and sets fill, line and flips', () => {
    const { elements, last } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Shapes' }));
    const gallery = screen.getByRole('dialog', { name: 'Shapes' });
    expect(within(gallery).getAllByRole('button')).toHaveLength(23);
    fireEvent.click(within(gallery).getByRole('button', { name: 'Rounded rectangle' }));
    const shape = () => elements().find((e): e is ShapeElement => e.type === 'shape')!;
    expect(shape().preset).toBe('roundRect');
    // Double-click: the shape's own text editor.
    fireEvent.doubleClick(object(/^Shape/));
    const editor = liveEditor('[data-shape-text-editor] .ProseMirror');
    act(() => void editor.commands.insertContent('Start here'));
    expect(plainTextOf(shape().text)).toBe('Start here');
    // The ribbon's text formatting works on it while it is edited.
    fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    act(() => void editor.commands.selectAll());
    fireEvent.click(screen.getByRole('button', { name: /^Bold/ }));
    expect(JSON.stringify(shape().text)).toContain('"bold"');
    choose(screen.getByRole('toolbar', { name: 'Home' }), 'Vertical alignment', 'bottom');
    expect(shape().textStyle?.verticalAlign).toBe('bottom');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Text: Type text in the shape' }), { key: 'Escape' });
    expect(document.querySelector('[data-shape-text-editor]')).toBeNull();
    const panel = inspector('Shape');
    choose(panel, 'Shape', 'star5');
    choose(panel, 'Fill', 'theme:accent3');
    choose(panel, 'Line', '');
    fireEvent.click(within(panel).getByLabelText('Flip horizontally'));
    expect(shape()).toMatchObject({ preset: 'star5', fill: { type: 'solid', color: { theme: 'accent3' } }, line: null, flipH: true });
    choose(panel, 'Fill', '');
    expect(shape().fill).toEqual({ type: 'none' });
    expect(presentationProblems(last())).toEqual([]);
  });

  it('lines get arrowheads and no fill or text', () => {
    const { elements } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Shapes' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Shapes' })).getByRole('button', { name: 'Line' }));
    const panel = inspector('Shape');
    expect(within(panel).queryByLabelText('Fill')).toBeNull();
    choose(panel, 'End', 'triangle');
    choose(panel, 'Line width', '3');
    choose(panel, 'Dash', 'dash');
    expect((elements().at(-1) as ShapeElement).line).toMatchObject({ tailEnd: 'triangle', width: 3, dash: 'dash' });
    expect(within(panel).queryByRole('button', { name: 'Edit text' })).toBeNull();
  });
});

describe('tables', () => {
  it('inserts a table of the picked size, edits cells with Tab (adding a row at the end) and undoes', () => {
    const { elements, last } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table of 2 rows by 3 columns' }));
    const table = () => elements().find((e): e is TableElement => e.type === 'table')!;
    expect([table().rows.length, table().columns.length]).toEqual([2, 3]);
    fireEvent.doubleClick(object(/^Table/));
    const cell = () => screen.getByRole('textbox', { name: /^Cell, row/ });
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 1, column 1');
    act(() => void liveEditor('[data-table-editor] .ProseMirror').commands.insertContent('Name'));
    fireEvent.keyDown(cell(), { key: 'Tab' });
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 1, column 2');
    act(() => void liveEditor('[data-table-editor] .ProseMirror').commands.insertContent('Mark'));
    fireEvent.keyDown(cell(), { key: 'Tab', shiftKey: true });
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 1, column 1');
    expect(table().rows[0].cells.map((c) => plainTextOf(c.text))).toEqual(['Name', 'Mark', '']);
    // Click a cell; Tab from the last cell adds a row.
    fireEvent.pointerDown(document.querySelector('[data-cell="1:2"]')!);
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 2, column 3');
    fireEvent.keyDown(cell(), { key: 'Tab' });
    expect(table().rows).toHaveLength(3);
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 3, column 1');
    fireEvent.keyDown(cell(), { key: 'Escape' });
    expect(document.querySelector('[data-table-editor]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(table().rows).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plainTextOf(table().rows[0].cells[1].text)).toBe('');
    expect(presentationProblems(last())).toEqual([]);
  });

  it('inserts a table by typing its size', () => {
    const { elements } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    const pop = screen.getByRole('dialog', { name: 'Insert table' });
    fireEvent.change(within(pop).getByLabelText('Rows'), { target: { value: '5' } });
    fireEvent.change(within(pop).getByLabelText('Columns'), { target: { value: '2' } });
    fireEvent.click(within(pop).getByRole('button', { name: 'Insert' }));
    const t = elements().find((e): e is TableElement => e.type === 'table')!;
    expect([t.rows.length, t.columns.length]).toEqual([5, 2]);
  });

  it('every table control of the inspector works: style, rows and columns, fill and borders', () => {
    const { elements, last } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table of 3 rows by 3 columns' }));
    const table = () => elements().find((e): e is TableElement => e.type === 'table')!;
    const panel = () => inspector('Table');
    fireEvent.click(within(panel()).getByLabelText('Header row'));
    fireEvent.click(within(panel()).getByLabelText('Banded rows'));
    fireEvent.click(within(panel()).getByLabelText('First column'));
    choose(panel(), 'Text size', '18');
    expect(table().style).toMatchObject({ headerRow: false, bandedRows: false, firstColumn: true });
    expect(table().style.text.fontSize).toBe(18);
    fireEvent.click(within(panel()).getByLabelText('Header row'));
    choose(panel(), 'Header fill', 'theme:accent2');
    expect(table().style.headerFill).toEqual({ theme: 'accent2' });
    // Not editing: the buttons work on the ends of the table.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Row at end' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Column at start' }));
    expect([table().rows.length, table().columns.length]).toEqual([4, 4]);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete last row' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete last column' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Row at top' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Column at end' }));
    expect([table().rows.length, table().columns.length]).toEqual([4, 4]);
    choose(panel(), 'Cell fill', '#ffc000');
    expect(table().rows.every((r) => r.cells.every((c) => c.fill === '#ffc000'))).toBe(true);
    // Editing: the buttons work at the active cell, fill and borders on the selected cells.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit cells' }));
    fireEvent.pointerDown(document.querySelector('[data-cell="1:1"]')!);
    fireEvent.pointerDown(document.querySelector('[data-cell="2:2"]')!, { shiftKey: true });
    choose(panel(), 'Cell fill', '');
    const filled = table().rows.map((r) => r.cells.map((c) => (c.fill ? 1 : 0)).join('')).join('/');
    expect(filled).toBe('1111/1001/1001/1111');
    choose(panel(), 'Borders', 'outside');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Apply borders' }));
    expect(table().rows[1].cells[1].borders).toMatchObject({ top: expect.any(Object), left: expect.any(Object) });
    expect(table().rows[0].cells[0].borders).toBeUndefined();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Row above' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Row below' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Column left' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Column right' }));
    expect([table().rows.length, table().columns.length]).toEqual([6, 6]);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete row' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete column' }));
    expect([table().rows.length, table().columns.length]).toEqual([5, 5]);
    choose(panel(), 'Line', '');
    expect(table().style.border).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Done editing cells' }));
    expect(document.querySelector('[data-table-editor]')).toBeNull();
    expect(table().h).toBe(table().rows.reduce((a, r) => a + r.height, 0));
    expect(presentationProblems(last())).toEqual([]);
  });

  it('a table resized with a handle keeps its columns and rows in step with its box', () => {
    const { elements } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table of 2 rows by 2 columns' }));
    const before = elements().find((e): e is TableElement => e.type === 'table')!;
    const handle = document.querySelector('[data-handle="e"]')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 50, clientY: 0, altKey: true });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 50, clientY: 0, altKey: true });
    const after = elements().find((e): e is TableElement => e.type === 'table')!;
    // Half size stage in tests: 50 screen px = 100 slide px.
    expect(after.w).toBe(before.w + 100);
    expect(after.columns.reduce((a, b) => a + b, 0)).toBe(after.w);
  });
});

describe('charts', () => {
  it('inserts each chart type drawn from its data, and edits the data in the grid (one undo step)', () => {
    const { elements, last } = setup();
    for (const name of ['Column chart', 'Bar chart', 'Line chart', 'Pie chart', 'Doughnut chart']) {
      fireEvent.click(within(insertTab()).getByRole('button', { name: 'Chart' }));
      fireEvent.click(screen.getByRole('menuitem', { name }));
    }
    expect(Array.from(document.querySelectorAll('[data-stage] [data-chart]')).map((n) => n.getAttribute('data-chart'))).toEqual(['column', 'bar', 'line', 'pie', 'doughnut']);
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    pick(objects().find((o) => o.getAttribute('aria-label')?.startsWith('Chart'))!);
    fireEvent.doubleClick(objects().find((o) => o.getAttribute('aria-label')?.startsWith('Chart'))!);
    const dialog = chartDialog();
    fireEvent.change(within(dialog).getByLabelText('Class A, Week 1'), { target: { value: '1,5' } });
    fireEvent.change(within(dialog).getByLabelText('Name of series 2'), { target: { value: 'Class Z' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add series' }));
    fireEvent.change(within(dialog).getByLabelText('Series 3, Week 2'), { target: { value: '7' } });
    fireEvent.change(within(dialog).getByLabelText('Colour of series Series 3'), { target: { value: 'theme:accent6' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    fireEvent.change(within(dialog).getByLabelText('Category 5'), { target: { value: 'Week 5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove category Week 1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save data' }));
    const c = elements().find((e): e is ChartElement => e.type === 'chart')!;
    expect(c.categories).toEqual(['Week 2', 'Week 3', 'Week 4', 'Week 5']);
    expect(c.series.map((s) => s.name)).toEqual(['Class A', 'Class Z', 'Series 3']);
    expect(c.series[2]).toEqual({ name: 'Series 3', values: [7, null, null, null], color: { theme: 'accent6' } });
    expect(presentationProblems(last())).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((elements().find((e) => e.type === 'chart') as ChartElement).series).toHaveLength(2);
  });

  it('refuses a value that is not a number and changes nothing on Cancel', () => {
    const { elements, onChange } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Column chart' }));
    const calls = onChange.mock.calls.length;
    fireEvent.click(within(inspector('Chart')).getByRole('button', { name: 'Edit data…' }));
    const dialog = chartDialog();
    fireEvent.change(within(dialog).getByLabelText('Class B, Week 3'), { target: { value: 'lots' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save data' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/“lots”.*not a number/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Edit chart data' })).toBeNull();
    expect(onChange.mock.calls.length).toBe(calls);
    expect((elements().find((e) => e.type === 'chart') as ChartElement).series[1].values[2]).toBe(69);
  });

  it('every chart control of the inspector works', () => {
    const { elements, last } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Column chart' }));
    const c = () => elements().find((e): e is ChartElement => e.type === 'chart')!;
    const panel = () => inspector('Chart');
    fireEvent.click(within(panel()).getByLabelText('Stacked'));
    expect(c().stacked).toBe(true);
    const title = within(panel()).getByLabelText('Title');
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'Average marks' } });
    fireEvent.click(within(panel()).getByLabelText('Show title'));
    choose(panel(), 'Legend', 'right');
    fireEvent.click(within(panel()).getByLabelText('Show values'));
    choose(panel(), 'Text size', '16');
    expect(c()).toMatchObject({ title: 'Average marks', showTitle: false, legend: 'right', showValues: true, fontSize: 16 });
    choose(panel(), 'Type', 'pie');
    expect(c().chartType).toBe('pie');
    expect(c().stacked).toBeUndefined();
    expect(within(panel()).queryByLabelText('Stacked')).toBeNull();
    expect(presentationProblems(last())).toEqual([]);
  });
});

describe('diagrams', () => {
  it('inserts a new diagram from a template through the app, and tells the app it is on the slide', async () => {
    const host = diagramHost();
    const { elements } = setup(undefined, { diagram: host });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Diagram' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['New diagram', 'New from “Flowchart”', 'From my diagrams…', 'From a diagrams.net file…']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'New from “Flowchart”' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'diagram')).toBe(true));
    expect(host.edit).toHaveBeenCalledWith(null, { templateId: 'flowchart', title: 'Flowchart' });
    const d = elements().find((e): e is DiagramElement => e.type === 'diagram')!;
    expect(d).toMatchObject({ source: EMBEDDED.source, previewId: 'prev-1', title: 'Water cycle', svgPreviewId: null, alt: null });
    expect(host.settle).toHaveBeenCalledWith(EMBEDDED, true);
  });

  it('inserts from the library; a cancelled dialog adds nothing', async () => {
    const host = diagramHost({ edit: vi.fn(async () => null) });
    const { onChange } = setup(undefined, { diagram: host });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Diagram' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'From my diagrams…' }));
    await waitFor(() => expect(host.edit).toHaveBeenCalledWith(null, { source: { nodes: [] }, title: 'From library' }));
    await flush();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('double-click edits a diagram in place (same place and width), from the menu and the inspector too', async () => {
    const edited: PresentationEmbeddedDiagram = { source: { nodes: [{ id: 'n2' }] }, previewId: 'prev-2', naturalWidth: 300, naturalHeight: 300, title: 'Rain', svgPreviewId: 'svg-2' };
    const host = diagramHost();
    const { elements } = setup(undefined, { diagram: host });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Diagram' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New diagram' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'diagram')).toBe(true));
    expect(host.edit).toHaveBeenLastCalledWith(null, undefined);
    const before = elements().find((e): e is DiagramElement => e.type === 'diagram')!;
    vi.mocked(host.edit).mockResolvedValueOnce(edited);
    fireEvent.doubleClick(object(/^Diagram/));
    await waitFor(() => expect((elements().find((e) => e.type === 'diagram') as DiagramElement).previewId).toBe('prev-2'));
    expect(host.edit).toHaveBeenLastCalledWith({ source: EMBEDDED.source, previewId: 'prev-1', naturalWidth: 400, naturalHeight: 200, title: 'Water cycle', svgPreviewId: null });
    const after = elements().find((e): e is DiagramElement => e.type === 'diagram')!;
    expect(after).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.w, svgPreviewId: 'svg-2', title: 'Rain' });
    expect(host.settle).toHaveBeenLastCalledWith(edited, true);
    // Alt text from the inspector; "Edit diagram…" from the inspector opens the editor again.
    const alt = within(inspector('Diagram')).getByLabelText('Alt text');
    fireEvent.focus(alt);
    fireEvent.change(alt, { target: { value: 'Rain falls' } });
    expect((elements().find((e) => e.type === 'diagram') as DiagramElement).alt).toBe('Rain falls');
    vi.mocked(host.edit).mockResolvedValueOnce(null);
    fireEvent.click(within(inspector('Diagram')).getByRole('button', { name: 'Edit diagram…' }));
    await waitFor(() => expect(host.edit).toHaveBeenCalledTimes(3));
  });

  it('a diagram removed while its editor was open is not put back; the app is told so', async () => {
    let finish: (d: PresentationEmbeddedDiagram) => void = () => undefined;
    const host = diagramHost();
    const { elements } = setup(undefined, { diagram: host });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Diagram' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New diagram' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'diagram')).toBe(true));
    vi.mocked(host.edit).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    fireEvent.doubleClick(object(/^Diagram/));
    fireEvent.keyDown(canvas(), { key: 'Delete' });
    expect(elements().some((e) => e.type === 'diagram')).toBe(false);
    await act(async () => finish({ ...EMBEDDED, previewId: 'prev-3' }));
    await flush();
    expect(host.settle).toHaveBeenLastCalledWith(expect.objectContaining({ previewId: 'prev-3' }), false);
    expect(elements().some((e) => e.type === 'diagram')).toBe(false);
  });
});

describe('object menu, inspector and keyboard', () => {
  it('the object menu has each kind’s own item, and they work', async () => {
    const { elements } = setup(undefined, { image: imageHost(), diagram: diagramHost() });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Column chart' }));
    fireEvent.contextMenu(object(/^Chart/), { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit chart data…' }));
    expect(chartDialog()).toBeTruthy();
    fireEvent.click(within(chartDialog()).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table of 2 rows by 2 columns' }));
    fireEvent.contextMenu(object(/^Table/), { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit cells' }));
    expect(document.querySelector('[data-table-editor]')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Cell/ }), { key: 'Escape' });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Shapes' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Shapes' })).getByRole('button', { name: 'Oval' }));
    fireEvent.contextMenu(object(/^Shape/), { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit text' }));
    expect(document.querySelector('[data-shape-text-editor]')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Text: Type text in the shape' }), { key: 'Escape' });
    nextFile(png());
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Picture' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'image')).toBe(true));
    nextFile(png('cell.png'));
    fireEvent.contextMenu(object(/^Picture/), { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace picture…' }));
    await waitFor(() => expect((elements().find((e) => e.type === 'image') as ImageElement).attachmentId).toBe('att-2'));
  });

  it('Enter opens the selected object’s contents, and position, size and rotation can be typed', () => {
    const { elements } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Shapes' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Shapes' })).getByRole('button', { name: 'Rectangle' }));
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    expect(document.querySelector('[data-shape-text-editor]')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Text: Type text in the shape' }), { key: 'Escape' });
    const panel = inspector('Shape');
    setField(panel, 'X', '12');
    setField(panel, 'Y', '34');
    setField(panel, 'Width', '200');
    setField(panel, 'Height', '100');
    setField(panel, 'Rotation', '370');
    expect(elements().at(-1)).toMatchObject({ x: 12, y: 34, w: 200, h: 100, rotation: 10 });
    // Escape in a field puts the stored value back.
    const x = within(panel).getByLabelText('X') as HTMLInputElement;
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '999' } });
    fireEvent.keyDown(x, { key: 'Escape' });
    fireEvent.blur(x);
    expect(elements().at(-1)!.x).toBe(12);
  });

  it('locked objects show their settings disabled; text boxes get fill and outline', () => {
    const { elements } = setup();
    pick(objects()[0]);
    const panel = inspector('Text box');
    choose(panel, 'Fill', 'theme:light2');
    choose(panel, 'Line', '#c00000');
    expect(elements()[0]).toMatchObject({ fill: { type: 'solid', color: { theme: 'light2' } }, line: { color: '#c00000' } });
    setField(panel, 'Fill opacity', '50');
    expect((elements()[0] as Extract<SlideElement, { type: 'text' }>).fill).toMatchObject({ opacity: 0.5 });
    choose(panel, 'Fill', '');
    choose(panel, 'Line', '');
    expect(elements()[0]).not.toHaveProperty('fill');
    expect(elements()[0]).not.toHaveProperty('line');
    fireEvent.contextMenu(objects()[0], { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock' }));
    expect((within(inspector('Text box')).getByLabelText('X') as HTMLInputElement).disabled).toBe(true);
  });

  it('the inspector is always beside the slide (so selecting never resizes the slide under the pointer)', () => {
    setup();
    const hint = () => screen.getByRole('complementary', { name: 'Object settings' });
    expect(hint().textContent).toMatch(/Select an object/);
    pick(objects()[0]);
    expect(screen.queryByRole('complementary', { name: 'Object settings' })).toBeNull();
    expect(inspector('Text box')).toBeTruthy();
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    expect(hint().textContent).toMatch(/Several objects/);
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(hint().textContent).toMatch(/Select an object/);
  });

  it('the inspector folds away on phones until opened', () => {
    const mq = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => mq));
    try {
      setup();
      pick(objects()[0]);
      const toggle = within(inspector('Text box')).getByRole('button', { name: 'Text box' });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(within(inspector('Text box')).queryByLabelText('X')).toBeNull();
      fireEvent.click(toggle);
      expect(within(inspector('Text box')).getByLabelText('X')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Round 3 fixes', () => {
  it('deleting the row or column of the cell being edited keeps editing the nearest cell (no crash)', () => {
    const { elements, last } = setup();
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert a table of 3 rows by 2 columns' }));
    const table = () => elements().find((e): e is TableElement => e.type === 'table')!;
    fireEvent.doubleClick(object(/^Table/));
    // The last row's last cell.
    fireEvent.pointerDown(document.querySelector('[data-cell="2:1"]')!);
    const cell = () => screen.getByRole('textbox', { name: /^Cell, row/ });
    act(() => void liveEditor('[data-table-editor] .ProseMirror').commands.insertContent('Typed'));
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 3, column 2');
    fireEvent.click(within(inspector('Table')).getByRole('button', { name: 'Delete row' }));
    expect(table().rows).toHaveLength(2);
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 2, column 2');
    fireEvent.click(within(inspector('Table')).getByRole('button', { name: 'Delete column' }));
    expect(table().columns).toHaveLength(1);
    expect(cell().getAttribute('aria-label')).toBe('Cell, row 2, column 1');
    // Typing goes on in the cell that is now edited, and the deletes undo.
    act(() => void liveEditor('[data-table-editor] .ProseMirror').commands.insertContent('More'));
    expect(plainTextOf(table().rows[1].cells[0].text)).toContain('More');
    fireEvent.keyDown(cell(), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect([table().rows.length, table().columns.length]).toEqual([3, 2]);
    expect(presentationProblems(last())).toEqual([]);
  });

  it('a locked chart or diagram does not open its data or its editor on double-click or Enter', async () => {
    const host = diagramHost();
    const { elements } = setup(undefined, { diagram: host });
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Chart' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Line chart' }));
    fireEvent.contextMenu(object(/^Chart/), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock' }));
    const calls = () => elements().filter((e) => e.type === 'chart').map((e) => JSON.stringify(e));
    const before = calls();
    fireEvent.doubleClick(object(/^Chart/));
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    expect(screen.queryByRole('heading', { name: 'Edit chart data' })).toBeNull();
    expect(calls()).toEqual(before);
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Diagram' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New diagram' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'diagram')).toBe(true));
    fireEvent.contextMenu(object(/^Diagram/), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock' }));
    const edits = vi.mocked(host.edit).mock.calls.length;
    fireEvent.doubleClick(object(/^Diagram/));
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    await flush();
    expect(vi.mocked(host.edit).mock.calls.length).toBe(edits);
  });

  it('a crop the picture cannot take is limited in the field itself (the field never shows a refused value)', async () => {
    const host = imageHost();
    const { elements } = setup(undefined, { image: host });
    nextFile(png());
    fireEvent.click(within(insertTab()).getByRole('button', { name: 'Picture' }));
    await waitFor(() => expect(elements().some((e) => e.type === 'image')).toBe(true));
    const panel = inspector('Picture');
    const img = () => elements().find((e): e is ImageElement => e.type === 'image')!;
    setField(panel, 'Left', '60');
    setField(panel, 'Right', '60');
    // 5% stays visible: Right can only be 35 with Left at 60, and the field says so.
    expect(img().crop).toMatchObject({ left: 0.6, right: 0.35 });
    expect((within(panel).getByLabelText('Right') as HTMLInputElement).value).toBe('35');
    // Without alt text the inspector says what that means, without claiming exports mark it decorative.
    const alt = within(panel).getByLabelText('Alt text');
    fireEvent.focus(alt);
    fireEvent.change(alt, { target: { value: '' } });
    expect(panel.textContent).toContain('no alt text: screen readers and exported files get no description');
    expect(panel.textContent).not.toMatch(/decorative/);
  });

  it('on a tablet-width window the inspector sits below the slide, folded, so the slide keeps its size', () => {
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(min-width: 768px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    try {
      setup();
      pick(objects()[0]);
      const panel = inspector('Text box');
      expect(within(panel).getByRole('button', { name: 'Text box' }).getAttribute('aria-expanded')).toBe('false');
      // The slide list is still the wide column.
      expect(screen.getByRole('listbox', { name: 'Slides' }).getAttribute('aria-orientation')).toBe('vertical');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
