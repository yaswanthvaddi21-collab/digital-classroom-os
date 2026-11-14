// @vitest-environment jsdom
/** G-CANVAS in the editor: group, lock, layers, order, inspector fields, clipboard events, shortcut help. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramEditor, type DiagramEditorApi } from '../DiagramEditor';
import type { DiagramContent } from '../types';
import { CANVAS_SHORTCUTS } from './canvasShortcuts';
import { CLIPBOARD_FORMAT, CLIPBOARD_MIME } from './canvasModel';
import { SHORTCUTS } from './shortcuts';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => vi.restoreAllMocks());
// The first editor render loads React Flow; on a busy machine that alone can take several seconds.
vi.setConfig({ testTimeout: 20_000 });

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const node = (id: string, x: number, y: number) => ({ id, position: { x, y }, width: 120, height: 60, data: { ...style, shape: 'rectangle' as const, label: id.toUpperCase() } });
const flat = (): DiagramContent => ({
  schemaVersion: 2,
  nodes: [node('a', 0, 0), node('b', 300, 100), node('c', 700, 0)],
  edges: [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } }],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
});

function mount(initialContent: unknown = flat(), container?: HTMLElement) {
  const api = createRef<DiagramEditorApi>();
  const onChange = vi.fn();
  const view = render(<DiagramEditor initialContent={initialContent} title="Test" apiRef={api} onChange={onChange} />, container ? { container } : undefined);
  const nodeEl = (id: string) => view.container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const canvas = view.container.querySelector('.react-flow') as HTMLElement;
  const key = (init: Record<string, unknown>) => fireEvent.keyDown(nodeEl('a') ?? canvas, init);
  const content = () => api.current!.getContent();
  const format = () => screen.getByRole('complementary', { name: 'Format' });
  return { ...view, api, onChange, nodeEl, canvas, key, content, format };
}
const ids = (c: DiagramContent) => c.nodes.map((n) => n.id);

const clipboardEvent = (type: string, data: Record<string, string> = {}) => {
  const store = { ...data };
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  e.clipboardData = { getData: (t: string) => store[t] ?? '', setData: (t: string, v: string) => void (store[t] = v) };
  return { e, store };
};

describe('group and ungroup', () => {
  it('Ctrl+G groups the selection (schema 3), Ctrl+Shift+G ungroups it (schema 2 again), undo works', () => {
    const { key, content } = mount();
    key({ key: 'a', ctrlKey: true });
    key({ key: 'g', ctrlKey: true });
    const grouped = content();
    expect(grouped.schemaVersion).toBe(3);
    const g = grouped.nodes.find((n) => n.data.shape === 'group')!;
    expect(g).toMatchObject({ position: { x: 0, y: 0 }, width: 820, height: 160 });
    expect(grouped.nodes.filter((n) => n.parentId === g.id).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(grouped.edges).toEqual(flat().edges);

    key({ key: 'g', ctrlKey: true, shiftKey: true });
    expect(content()).toEqual(flat());

    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content().schemaVersion).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content()).toEqual(flat());
  });

  it('the first click on a shape in a group selects the group, the second the shape', () => {
    const { key, nodeEl, format, container } = mount();
    key({ key: 'a', ctrlKey: true });
    key({ key: 'g', ctrlKey: true });
    fireEvent.click(container.querySelector('.react-flow__pane')!);
    expect(screen.queryByRole('complementary', { name: 'Format' })).toBeNull();
    fireEvent.click(nodeEl('b'));
    expect(format().textContent).not.toContain('Fill'); // the group
    expect(screen.getByRole('button', { name: 'Ungroup (Ctrl+Shift+G)' })).toBeTruthy();
    fireEvent.click(nodeEl('b'));
    expect(format().textContent).toContain('Fill'); // the shape inside
    expect(screen.queryByRole('button', { name: 'Ungroup (Ctrl+Shift+G)' })).toBeNull();
  });
});

describe('lock', () => {
  it('a locked shape cannot be deleted, edited or styled; Unlock in the panel brings it back (schema 2)', async () => {
    const { key, nodeEl, content, format } = mount();
    fireEvent.click(nodeEl('a'));
    key({ key: 'l', ctrlKey: true });
    expect(content().nodes[0]).toMatchObject({ id: 'a', locked: true });
    expect(content().schemaVersion).toBe(3);
    expect(nodeEl('a').classList.contains('dcos-locked')).toBe(true);
    expect(nodeEl('a').getAttribute('aria-label')).toBe('Locked: A');
    expect(format().textContent).toContain('Locked shape');
    expect(within(format()).queryByRole('button', { name: '#dcfce7' })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete (Del)' }));
    });
    expect(ids(content())).toEqual(['a', 'b', 'c']);
    fireEvent.doubleClick(nodeEl('a'));
    key({ key: 'F2' });
    expect(screen.queryByRole('textbox', { name: 'Shape text' })).toBeNull();

    fireEvent.click(within(format()).getByRole('button', { name: 'Unlock' }));
    expect(content()).toEqual(flat());
  });

  it('a mixed selection styles only the unlocked shapes', () => {
    const { key, nodeEl, content, format } = mount();
    fireEvent.click(nodeEl('a'));
    key({ key: 'l', ctrlKey: true });
    key({ key: 'a', ctrlKey: true });
    fireEvent.click(within(format()).getByRole('button', { name: '#dcfce7' }));
    expect(content().nodes.map((n) => n.data.fill)).toEqual(['#ffffff', '#dcfce7', '#dcfce7']);
    expect(within(format()).getByRole('button', { name: 'Unlock 1' })).toBeTruthy();
  });
});

describe('the Format panel: link, tooltip and properties', () => {
  it('keeps safe links only, stores tooltip and properties, and undoes them', () => {
    const { nodeEl, content, format } = mount();
    fireEvent.click(nodeEl('b'));
    const link = within(format()).getByRole('textbox', { name: 'Link' });
    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } });
    expect(within(format()).getByRole('alert').textContent).toMatch(/Only web/);
    expect(content().nodes[1].data.link).toBeUndefined();
    fireEvent.change(link, { target: { value: 'https://example.com/x' } });
    expect(content().nodes[1].data.link).toBe('https://example.com/x');
    expect(within(format()).getByRole('link', { name: /Open link/ }).getAttribute('rel')).toBe('noopener noreferrer');

    fireEvent.change(within(format()).getByRole('textbox', { name: 'Tooltip' }), { target: { value: 'Shown on hover' } });
    expect(content().nodes[1].data.tooltip).toBe('Shown on hover');
    expect(nodeEl('b').getAttribute('title')).toBe('Shown on hover');

    fireEvent.change(within(format()).getByRole('textbox', { name: 'New property name' }), { target: { value: 'owner' } });
    fireEvent.change(within(format()).getByRole('textbox', { name: 'New property value' }), { target: { value: 'Ms Rao' } });
    fireEvent.click(within(format()).getByRole('button', { name: 'Add property' }));
    expect(content().nodes[1].data.properties).toEqual({ owner: 'Ms Rao' });
    expect(content().schemaVersion).toBe(3);
    fireEvent.change(within(format()).getByRole('textbox', { name: 'Value of owner' }), { target: { value: 'Mr Iyer' } });
    expect(content().nodes[1].data.properties).toEqual({ owner: 'Mr Iyer' });
    fireEvent.click(within(format()).getByRole('button', { name: 'Remove property owner' }));
    expect(content().nodes[1].data.properties).toBeUndefined();

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content()).toEqual(flat());
  });
});

describe('layers', () => {
  it('adds, hides, locks, reorders and deletes layers; the diagram is schema 2 again with one layer left', () => {
    const { nodeEl, content, container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('region', { name: 'Layers' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add layer' }));
    expect(content().layers!.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2']);
    expect(content().nodes.every((n) => n.layer === 'layer-1')).toBe(true);
    expect(content().schemaVersion).toBe(3);

    // A new shape goes to the current layer (the one just added).
    fireEvent.click(screen.getAllByRole('button', { name: /^Rectangle/ })[0]);
    const added = content().nodes.find((n) => !['a', 'b', 'c'].includes(n.id))!;
    expect(added.layer).toBe(content().layers![1].id);

    fireEvent.click(within(panel).getByRole('button', { name: 'Hide Layer 1' }));
    expect(content().layers![0].visible).toBe(false);
    expect(nodeEl('a')).toBeNull();
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Show Layer 1' }));
    expect(nodeEl('a')).not.toBeNull();

    fireEvent.click(within(panel).getByRole('button', { name: 'Lock Layer 1' }));
    expect(content().layers![0].locked).toBe(true);
    fireEvent.click(nodeEl('a'));
    expect(nodeEl('a').classList.contains('selected')).toBe(false); // not selectable
    fireEvent.click(within(panel).getByRole('button', { name: 'Unlock Layer 1' }));
    fireEvent.click(nodeEl('a'));
    expect(nodeEl('a').classList.contains('selected')).toBe(true);

    // Layer 2 cannot be deleted while it holds the added shape; once the shape is undone, it can.
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Layer 2' }));
    expect((screen.getByRole('menuitem', { name: /Delete layer \(only when empty\)/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Layer 2' }));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content().layers).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Layer 2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete layer' }));
    expect(content()).toEqual(flat());
    expect(content().schemaVersion).toBe(2);
  });

  it('renames a layer and moves the selection to it', () => {
    const { nodeEl, content } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('region', { name: 'Layers' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add layer' }));
    fireEvent.doubleClick(within(panel).getByRole('button', { name: /^Layer 2/ }));
    const name = within(panel).getByRole('textbox', { name: 'Name of Layer 2' });
    fireEvent.change(name, { target: { value: 'Notes' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(content().layers![1].name).toBe('Notes');
    fireEvent.click(nodeEl('c'));
    fireEvent.change(screen.getByRole('complementary', { name: 'Format' }).querySelector('select[aria-label="Layer"]')!, { target: { value: content().layers![1].id } });
    expect(content().nodes.find((n) => n.id === 'c')!.layer).toBe(content().layers![1].id);
    // Moving the top layer down puts it first: its shape is now drawn below the others.
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Notes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(content().layers!.map((l) => l.name)).toEqual(['Notes', 'Layer 1']);
    expect(content().nodes.find((n) => n.id === 'a')!.layer).toBe('layer-1');
  });
});

describe('order and distribute', () => {
  it('sends a shape to the back through the Order menu', () => {
    const { nodeEl, content } = mount();
    fireEvent.click(nodeEl('c'));
    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Send to back/ }));
    expect(ids(content())).toEqual(['c', 'a', 'b']);
    fireEvent.keyDown(nodeEl('c'), { key: ']', code: 'BracketRight', ctrlKey: true });
    expect(ids(content())).toEqual(['a', 'c', 'b']);
  });

  it('distributes three shapes horizontally', () => {
    const { key, content } = mount({ ...flat(), nodes: [node('a', 0, 0), node('b', 100, 0), node('c', 700, 0)] });
    key({ key: 'a', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontally' }));
    expect(content().nodes.map((n) => n.position.x)).toEqual([0, 350, 700]);
  });
});

describe('the system clipboard', () => {
  it('Ctrl+C writes the shapes as this app’s data and as text', () => {
    const { nodeEl, key } = mount();
    fireEvent.click(nodeEl('a'));
    nodeEl('a').focus();
    key({ key: 'c', ctrlKey: true });
    const { e, store } = clipboardEvent('copy');
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(JSON.parse(store['text/plain'])).toMatchObject({ format: CLIPBOARD_FORMAT, nodes: [{ id: 'a' }] });
    expect(store[CLIPBOARD_MIME]).toBe(store['text/plain']);
  });

  it('pastes shapes copied in another diagram (or tab) from the paste event', () => {
    const { nodeEl, key, content } = mount();
    nodeEl('a').focus();
    key({ key: 'v', ctrlKey: true });
    const payload = { format: CLIPBOARD_FORMAT, version: 1, source: 'elsewhere', serial: 1, schemaVersion: 2, nodes: [node('x', 5000, 5000), node('y', 5200, 5000)], edges: [] };
    const { e } = clipboardEvent('paste', { 'text/plain': JSON.stringify(payload) });
    act(() => void document.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    const pasted = content().nodes.slice(3);
    expect(pasted).toHaveLength(2);
    expect(pasted.map((n) => n.data.label)).toEqual(['X', 'Y']);
    expect(pasted.every((n) => !['x', 'y'].includes(n.id))).toBe(true);
  });

  it('Ctrl+X removes the shapes it copied, but not locked ones', async () => {
    const { nodeEl, key, content } = mount();
    fireEvent.click(nodeEl('a'));
    key({ key: 'l', ctrlKey: true });
    key({ key: 'a', ctrlKey: true });
    await act(async () => {
      key({ key: 'x', ctrlKey: true });
    });
    expect(ids(content())).toEqual(['a']);
  });
});

describe('the shortcut help', () => {
  it('? lists every shortcut of the registry', () => {
    const { key } = mount();
    key({ key: '?', shiftKey: true });
    const table = screen.getByRole('table', { name: 'Keyboard shortcuts' });
    expect(within(table).getAllByRole('row')).toHaveLength(SHORTCUTS.length);
    for (const s of SHORTCUTS) expect(table.textContent).toContain(s.description);
  });

  it('every canvas shortcut is in the registry once', () => {
    const all = SHORTCUTS.map((s) => s.id);
    expect(new Set(all).size).toBe(all.length);
    for (const s of CANVAS_SHORTCUTS) expect(all).toContain(s.id);
  });
});

describe('Round 3 fixes', () => {
  it('moving a layer up keeps a shape that names no layer on its layer', () => {
    const { content } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('region', { name: 'Layers' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add layer' }));
    // Make the bottom layer current and add a shape: it is stored without a layer id.
    fireEvent.click(within(panel).getByRole('button', { name: /^Layer 1/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Rectangle/ })[0]);
    const added = content().nodes.find((n) => !['a', 'b', 'c'].includes(n.id))!;
    expect(added.layer ?? 'layer-1').toBe('layer-1');
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Layer 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(content().layers!.map((l) => l.name)).toEqual(['Layer 2', 'Layer 1']);
    expect(content().nodes.find((n) => n.id === added.id)!.layer).toBe('layer-1');
    expect(content().nodes.find((n) => n.id === 'a')!.layer).toBe('layer-1');
  });

  it('a paste whose layer was deleted names no layer, so the diagram stays schema 2', async () => {
    const { nodeEl, key, content } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('region', { name: 'Layers' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add layer' }));
    fireEvent.click(nodeEl('b'));
    fireEvent.change(screen.getByRole('complementary', { name: 'Format' }).querySelector('select[aria-label="Layer"]')!, { target: { value: content().layers![1].id } });
    await act(async () => {
      key({ key: 'x', ctrlKey: true });
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'More for Layer 2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete layer' }));
    expect(content().layers).toBeUndefined();
    nodeEl('a').focus();
    act(() => void key({ key: 'v', ctrlKey: true }));
    const pasted = content().nodes.find((n) => !['a', 'c'].includes(n.id))!;
    expect(pasted.data.label).toBe('B');
    expect(pasted.layer).toBeUndefined();
    expect(content().schemaVersion).toBe(2);
  });

  it('a locked group is not ungrouped, its shapes cannot be styled, and the panel says why', () => {
    const { key, nodeEl, content, format } = mount();
    key({ key: 'a', ctrlKey: true });
    key({ key: 'g', ctrlKey: true });
    key({ key: 'l', ctrlKey: true });
    const g = content().nodes.find((n) => n.data.shape === 'group')!;
    expect(g.locked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Ungroup (Ctrl+Shift+G)' })).toBeNull();
    key({ key: 'g', ctrlKey: true, shiftKey: true });
    expect(content().nodes.some((n) => n.data.shape === 'group')).toBe(true);
    // Enter the group: the shape inside is fixed with it.
    fireEvent.click(nodeEl('b'));
    fireEvent.click(nodeEl('b'));
    expect(nodeEl('b').classList.contains('selected')).toBe(true);
    expect(within(format()).getByText(/inside a locked group/)).toBeTruthy();
    expect(within(format()).queryByRole('button', { name: 'Unlock' })).toBeNull();
  });

  it('the Link field follows undo, and an unsafe entry never leaves a prefix saved', () => {
    const { nodeEl, content, format } = mount();
    fireEvent.click(nodeEl('b'));
    const link = () => within(format()).getByRole('textbox', { name: 'Link' }) as HTMLInputElement;
    fireEvent.focus(link());
    for (const v of ['j', 'ja', 'javascript', 'javascript:', 'javascript:alert(1)']) fireEvent.change(link(), { target: { value: v } });
    fireEvent.blur(link());
    expect(content().nodes[1].data.link).toBeUndefined();
    expect(content()).toEqual(flat());
    fireEvent.focus(link());
    fireEvent.change(link(), { target: { value: 'https://example.com/' } });
    fireEvent.blur(link());
    expect(content().nodes[1].data.link).toBe('https://example.com/');
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content().nodes[1].data.link).toBeUndefined();
    expect(link().value).toBe('');
  });

  it('copying with text selected copies the text, not the shapes', () => {
    const { nodeEl, key } = mount();
    fireEvent.click(nodeEl('a'));
    nodeEl('a').focus();
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Undo' } as Selection);
    key({ key: 'c', ctrlKey: true });
    const store: Record<string, string> = {};
    const e = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    e.clipboardData = { getData: (t: string) => store[t] ?? '', setData: (t: string, v: string) => void (store[t] = v) };
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(store['text/plain']).toBeUndefined();
  });

  it('a paste while focus is on a dialog button does not paste shapes behind the dialog', async () => {
    const { nodeEl, content } = mount();
    fireEvent.click(nodeEl('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Export options…/ })));
    const dialog = (await screen.findByText('Export diagram')).closest('dialog') as HTMLElement;
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();
    const payload = { format: CLIPBOARD_FORMAT, version: 1, source: 'elsewhere', serial: 1, schemaVersion: 2, nodes: [node('x', 5000, 5000)], edges: [] };
    const { e } = clipboardEvent('paste', { 'text/plain': JSON.stringify(payload) });
    act(() => void document.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(false);
    expect(content()).toEqual(flat());
  });

  it('inside the dialog that hosts it (a diagram in a document), the editor keeps its shortcuts, Delete and paste', async () => {
    const host = document.body.appendChild(document.createElement('dialog'));
    host.open = true;
    const { nodeEl, content } = mount(flat(), host);
    fireEvent.click(nodeEl('a'));
    nodeEl('a').focus();
    fireEvent.keyDown(nodeEl('a'), { key: 'd', ctrlKey: true });
    expect(content().nodes).toHaveLength(4); // Ctrl+D duplicated
    const payload = { format: CLIPBOARD_FORMAT, version: 1, source: 'elsewhere', serial: 1, schemaVersion: 2, nodes: [node('x', 5000, 5000)], edges: [] };
    nodeEl('a').focus();
    const { e } = clipboardEvent('paste', { 'text/plain': JSON.stringify(payload) });
    act(() => void document.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(content().nodes).toHaveLength(5); // pasted
    fireEvent.click(nodeEl('c'));
    nodeEl('c').focus();
    await act(async () => {
      fireEvent.keyDown(nodeEl('c'), { key: 'Delete' });
    });
    await vi.waitFor(() => expect(ids(content())).not.toContain('c')); // Delete removed it
    host.remove();
  });

  it('keys pressed in the Export options dialog do not duplicate or delete shapes behind it', async () => {
    const { nodeEl, content } = mount();
    fireEvent.click(nodeEl('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Export options…/ })));
    const dialog = (await screen.findByText('Export diagram')).closest('dialog') as HTMLElement;
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'd', ctrlKey: true });
    expect(content()).toEqual(flat()); // no duplicate
    await act(async () => {
      fireEvent.keyDown(cancel, { key: 'Delete' });
    });
    expect(content()).toEqual(flat()); // the selected shape is still there
    await act(async () => {
      fireEvent.keyDown(cancel, { key: 'Backspace' });
    });
    expect(content()).toEqual(flat());
  });

  it('hidden shapes (from a diagrams.net file) can be shown from the Layers panel, as one undo step', () => {
    const d = flat();
    d.schemaVersion = 3;
    d.nodes[1] = { ...d.nodes[1], hidden: true };
    const { nodeEl, content } = mount(d);
    expect(nodeEl('b')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    const panel = screen.getByRole('region', { name: 'Layers' });
    expect(within(panel).getByText('1 shape is hidden.')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Show hidden shapes' }));
    expect(nodeEl('b')).not.toBeNull();
    expect(content()).toEqual(flat());
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content().nodes[1].hidden).toBe(true);
  });
});
