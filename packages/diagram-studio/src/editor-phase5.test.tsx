// @vitest-environment jsdom
/** Phase 5 Round 1 in the editor: schema 3 opens editable, new fields survive editing, the menu and shared markers. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramEditor, type DiagramEditorApi } from './DiagramEditor';
import { SHORTCUTS } from './editor/shortcuts';
import { SELECTION_ACTIONS } from './editor/selectionActions';
import { TOOLBAR_GROUPS } from './editor/Toolbar';
import { EXPORT_FORMATS } from './editor/ExportMenu';
import type { DiagramContent } from './types';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
});
afterEach(() => vi.restoreAllMocks());

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const schema3 = (): DiagramContent => ({
  schemaVersion: 3,
  layers: [{ id: 'L1', name: 'Base', visible: true, locked: false }],
  nodes: [
    { id: 'g', position: { x: 0, y: 0 }, width: 400, height: 200, data: { ...style, shape: 'group', label: '' } },
    { id: 'a', position: { x: 20, y: 20 }, width: 120, height: 60, parentId: 'g', locked: true, layer: 'L1', data: { ...style, shape: 'rectangle', label: 'A', rotation: 15, link: 'https://example.com', tooltip: 'tip', properties: { k: 'v' } } },
    { id: 'b', position: { x: 600, y: 0 }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: 'B' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end', waypoints: [{ x: 300, y: 100 }], labelPosition: 0.3 } }],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
});

function mount(initialContent: unknown, extra: { onOpenFile?: () => void } = {}) {
  const api = createRef<DiagramEditorApi>();
  const onChange = vi.fn();
  const view = render(<DiagramEditor initialContent={initialContent} title="Test" apiRef={api} onChange={onChange} {...extra} />);
  const nodeEl = (id: string) => view.container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  return { api, onChange, nodeEl, content: () => api.current!.getContent(), ...view };
}

describe('schema 3 in this build', () => {
  it('opens a schema-3 diagram for editing and saves every field back unchanged', () => {
    const { api, content, onChange } = mount(schema3());
    expect(api.current!.isReadOnly()).toBe(false);
    expect(content()).toEqual(schema3());
    expect(onChange).not.toHaveBeenCalled(); // opening is not an edit
  });

  it('still opens schema 4 read-only and hands it back untouched', () => {
    const newer = { ...schema3(), schemaVersion: 4, futureTop: 1 };
    const { api } = mount(newer);
    expect(api.current!.isReadOnly()).toBe(true);
    expect(api.current!.getContent()).toBe(newer);
  });

  it('keeps the new fields through an edit, undo and redo', () => {
    const { nodeEl, content } = mount(schema3());
    fireEvent.click(nodeEl('b'));
    fireEvent.click(screen.getByRole('complementary', { name: 'Format' }).querySelector('button[aria-label="#dcfce7"]')!);
    expect(content().nodes.find((n) => n.id === 'b')!.data.fill).toBe('#dcfce7');
    expect(content().schemaVersion).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content()).toEqual(schema3());
    fireEvent.click(screen.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }));
    const redone = content();
    expect(redone.nodes.find((n) => n.id === 'a')).toEqual(schema3().nodes[1]);
    expect(redone.edges).toEqual(schema3().edges);
    expect(redone.layers).toEqual(schema3().layers);
  });

  it('copies and pastes a shape with its rotation, link, tooltip and properties', () => {
    const { nodeEl, content, container } = mount(schema3());
    // G-CANVAS: the first click on a shape in a group selects the group; the second selects the shape (diagrams.net).
    fireEvent.click(nodeEl('a'));
    fireEvent.click(nodeEl('a'));
    const canvas = container.querySelector('.react-flow') as HTMLElement;
    fireEvent.keyDown(canvas, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'v', ctrlKey: true });
    const nodes = content().nodes;
    expect(nodes).toHaveLength(4);
    const copy = nodes.find((n) => !['g', 'a', 'b'].includes(n.id))!;
    expect(copy.data).toMatchObject({ rotation: 15, link: 'https://example.com', tooltip: 'tip', properties: { k: 'v' } });
    expect(copy).toMatchObject({ locked: true, layer: 'L1' });
    // Copied without its group: placed at its canvas position (plus the paste offset), outside the group.
    expect(copy.parentId).toBeUndefined();
    expect(copy.position).toEqual({ x: 60, y: 60 });
  });
});

describe('the Format panel for groups', () => {
  it('shows no Fill or Border controls for a group, which draws neither', () => {
    const { nodeEl } = mount(schema3());
    fireEvent.click(nodeEl('g'));
    const panel = screen.getByRole('complementary', { name: 'Format' });
    expect(panel.textContent).toContain('Text');
    expect(panel.textContent).not.toContain('Fill');
    expect(panel.querySelector('[aria-label="Border width"]')).toBeNull();
    fireEvent.click(nodeEl('b'));
    expect(panel.textContent).toContain('Fill');
    expect(panel.querySelector('[aria-label="Border width"]')).not.toBeNull();
  });
});

describe('the editor menu', () => {
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Export' }));

  it('offers the native file, and Open file… only when the host can open files', () => {
    mount(schema3());
    openMenu();
    expect(screen.getByRole('menuitem', { name: /Classroom OS diagram \(\.dcosdiagram\)/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Open file…/ })).toBeNull();
  });

  it('Open file… asks the host to open a file', () => {
    const onOpenFile = vi.fn();
    mount(schema3(), { onOpenFile });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Open file…/ }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('the native export downloads <title>.dcosdiagram holding the diagram as stored', async () => {
    let saved: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((saved = b as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    mount(schema3());
    openMenu();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /\.dcosdiagram/ })));
    expect(names).toEqual(['Test.dcosdiagram']);
    const file = JSON.parse(await saved!.text());
    expect(file).toMatchObject({ format: 'dcos-diagram', version: 1, title: 'Test' });
    expect(file.diagram).toEqual(schema3());
  });
});

describe('shared connector markers (TD-21)', () => {
  it('defines each end decoration once per colour, however many connectors use it', () => {
    const many = schema3();
    many.nodes = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, position: { x: i * 200, y: 0 }, width: 120, height: 60, data: { ...style, shape: 'rectangle' as const, label: `${i}` } }));
    many.layers = undefined;
    many.edges = Array.from({ length: 39 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i}`,
      target: `n${i + 1}`,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'straight' as const,
      label: '',
      data: { color: i % 2 ? '#475569' : '#ff0000', width: 2, dashed: false, arrow: i === 0 ? ('both' as const) : ('end' as const) },
    }));
    const { container } = mount(many);
    const markers = [...container.querySelectorAll('marker')];
    // arrow in two colours (the first connector's start arrow is the same red arrow).
    expect(markers).toHaveLength(2);
    expect(new Set(markers.map((m) => m.id)).size).toBe(2);
    // Every reference a drawn connector makes points at one of them.
    for (const path of container.querySelectorAll('[marker-end], [marker-start]')) {
      for (const attr of ['marker-end', 'marker-start']) {
        const ref = path.getAttribute(attr);
        if (ref) expect(markers.some((m) => ref === `url(#${m.id})`), ref).toBe(true);
      }
    }
  });
});

describe('registries', () => {
  it('have unique ids, and every shortcut says what it does', () => {
    for (const list of [SHORTCUTS, SELECTION_ACTIONS, TOOLBAR_GROUPS, EXPORT_FORMATS]) expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    for (const s of SHORTCUTS) expect(s.keys && s.description, s.id).toBeTruthy();
  });
});
