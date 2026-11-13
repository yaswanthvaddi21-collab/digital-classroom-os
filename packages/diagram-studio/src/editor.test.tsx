// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramEditor, type DiagramEditorApi } from './DiagramEditor';
import type { DiagramContent } from './types';

beforeAll(() => {
  // React Flow measures and observes the canvas; jsdom has neither API.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
});

const node = (id: string, label: string, x = 0) => ({ id, position: { x, y: 0 }, width: 120, height: 60, data: { shape: 'rectangle', label } });

function mount(initialContent: unknown, onChange = vi.fn()) {
  const api = createRef<DiagramEditorApi>();
  const view = render(<DiagramEditor initialContent={initialContent} title="Test" apiRef={api} onChange={onChange} />);
  const canvas = view.container.querySelector('.react-flow') as HTMLElement;
  const nodeEl = (id: string) => view.container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const content = () => api.current!.getContent();
  return { api, canvas, nodeEl, content, onChange, ...view };
}

describe('protected diagrams (saved by a newer version)', () => {
  const newer = () => ({
    schemaVersion: 99,
    futureTopLevel: { keep: true },
    nodes: [{ ...node('a', 'Alpha'), futureNodeField: [1, 2, 3] }, node('b', 'Beta', 300)],
    edges: [{ id: 'e1', source: 'a', target: 'b', futureEdgeField: 'x' }],
    viewport: { x: 5, y: 6, zoom: 1 },
    settings: { showGrid: true, snapToGrid: true, autoLayout: 'none', futureSetting: 1 },
  });

  it('reports itself read-only and hands back the original content untouched', () => {
    const input = newer();
    const { api } = mount(input);
    expect(api.current!.isReadOnly()).toBe(true);
    expect(api.current!.getContent()).toBe(input);
    expect(api.current!.getContent()).toEqual(newer());
  });

  it('ignores every way of editing it', () => {
    const input = newer();
    const { api, canvas, nodeEl, container, onChange } = mount(input);

    const shapeButtons = screen.getByRole('complementary', { name: 'Shapes' }).querySelectorAll('button');
    expect(shapeButtons.length).toBeGreaterThan(0);
    shapeButtons.forEach((b) => {
      expect(b.disabled).toBe(true);
      expect(b.getAttribute('draggable')).toBe('false');
      fireEvent.click(b);
    });
    for (const label of ['Show grid', 'Hide grid', 'Snap to grid: on', 'Arrange', 'Duplicate (Ctrl+D)', 'Delete (Del)', 'Add child (Tab)', 'Add sibling (Enter)']) {
      const b = screen.queryByRole('button', { name: label });
      if (!b) continue;
      expect((b as HTMLButtonElement).disabled, label).toBe(true);
      fireEvent.click(b);
    }

    const wrapper = canvas.parentElement!;
    fireEvent.drop(wrapper, { dataTransfer: { getData: () => 'rectangle', types: ['application/x-dcos-shape'] } });
    fireEvent.doubleClick(nodeEl('a'));
    expect(screen.queryByRole('textbox', { name: 'Shape text' })).toBeNull();
    fireEvent.click(nodeEl('a'));
    for (const init of [{ key: 'a', ctrlKey: true }, { key: 'd', ctrlKey: true }, { key: 'v', ctrlKey: true }, { key: 'Tab' }, { key: 'Enter' }, { key: 'F2' }, { key: 'Delete' }, { key: 'ArrowRight', altKey: true, shiftKey: true }]) {
      fireEvent.keyDown(nodeEl('a'), init);
    }
    expect(screen.queryByRole('textbox', { name: 'Shape text' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Format' })).toBeNull();
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(2);

    expect(api.current!.getContent()).toBe(input);
    expect(input).toEqual(newer());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a current diagram is still editable and saved in the current format', () => {
    const { api } = mount({ schemaVersion: 2, nodes: [{ ...node('a', 'Alpha'), stray: 1 }], edges: [] });
    expect(api.current!.isReadOnly()).toBe(false);
    const out = api.current!.getContent();
    expect(out.schemaVersion).toBe(2);
    expect(out.nodes[0]).not.toHaveProperty('stray');
  });
});

describe('inspector undo steps', () => {
  const fillOf = (c: DiagramContent, id: string) => c.nodes.find((n) => n.id === id)?.data.fill;
  const inspector = () => screen.getByRole('complementary', { name: 'Format' });
  const undo = () => fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));

  it('a Text focus does not turn later, unrelated edits into one undo step', () => {
    const { nodeEl, canvas, content } = mount({ schemaVersion: 2, nodes: [node('a', 'A')], edges: [] });
    fireEvent.click(nodeEl('a'));
    fireEvent.focus(inspector().querySelector('textarea')!);
    // Quick connect while the Text box still has focus: a new shape, now selected.
    fireEvent.keyDown(canvas, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(content().nodes).toHaveLength(2);
    const added = content().nodes.find((n) => n.id !== 'a')!.id;
    const before = fillOf(content(), added);
    fireEvent.click(inspector().querySelector('button[aria-label="#dcfce7"]')!);
    expect(fillOf(content(), added)).toBe('#dcfce7');

    undo();
    expect(content().nodes).toHaveLength(2);
    expect(fillOf(content(), added)).toBe(before);
    undo();
    expect(content().nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('typing in the Text box is still one undo step', () => {
    const { nodeEl, content } = mount({ schemaVersion: 2, nodes: [node('a', 'A')], edges: [] });
    fireEvent.click(nodeEl('a'));
    const text = inspector().querySelector('textarea')!;
    fireEvent.focus(text);
    fireEvent.change(text, { target: { value: 'AB' } });
    fireEvent.change(text, { target: { value: 'ABC' } });
    expect(content().nodes[0].data.label).toBe('ABC');
    undo();
    expect(content().nodes[0].data.label).toBe('A');
    expect((screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Escape inside a dialog', () => {
  it('closing the label editor consumes Escape', () => {
    const { nodeEl } = mount({ schemaVersion: 2, nodes: [node('a', 'A')], edges: [] });
    fireEvent.doubleClick(nodeEl('a'));
    const editor = screen.getByRole('textbox', { name: 'Shape text' });
    expect(fireEvent.keyDown(editor, { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Shape text' })).toBeNull();
  });

  it('quick connect consumes Escape only while it has a palette to close', () => {
    const { nodeEl } = mount({ schemaVersion: 2, nodes: [node('a', 'A')], edges: [] });
    fireEvent.click(nodeEl('a'));
    const arrow = screen.getByRole('button', { name: 'Add a connected shape to the right' });
    act(() => arrow.focus());
    expect(screen.getByRole('menu', { name: 'Shapes to add to the right' })).toBeTruthy();
    // Escape from a focused palette shape closes the palette and returns focus to the arrow, without reopening it.
    const item = screen.getAllByRole('menuitem')[0];
    act(() => item.focus());
    expect(fireEvent.keyDown(item, { key: 'Escape' })).toBe(false);
    expect(document.activeElement).toBe(arrow);
    expect(screen.queryByRole('menu', { name: 'Shapes to add to the right' })).toBeNull();
    // Nothing left to close: Escape keeps its normal meaning.
    expect(fireEvent.keyDown(arrow, { key: 'Escape' })).toBe(true);

    act(() => {
      arrow.blur();
      arrow.focus();
    });
    expect(screen.getByRole('menu', { name: 'Shapes to add to the right' })).toBeTruthy();
    expect(fireEvent.keyDown(arrow, { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('menu', { name: 'Shapes to add to the right' })).toBeNull();
  });
});
