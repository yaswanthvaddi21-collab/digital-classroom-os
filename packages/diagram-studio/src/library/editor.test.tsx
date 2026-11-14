// @vitest-environment jsdom
/** G-SHAPES in the editor: the library panel, Add lane, Add event, the Arrange entries and connector notations. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { ToastProvider } from '@dcos/ui';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramEditor, type DiagramEditorApi } from '../DiagramEditor';
import { ConnectActionsContext, type ConnectActions } from '../connect/context';
import { EdgeInspector } from '../Inspector';
import { diagramTemplates } from '../templates';
import { DEFAULT_CONNECTOR, styledEdge, type Connector } from '../types';
import { SHAPE_CATEGORIES } from './categories';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;
});

function mount(initialContent: unknown) {
  const api = createRef<DiagramEditorApi>();
  const view = render(<DiagramEditor initialContent={initialContent} title="Test" apiRef={api} onChange={vi.fn()} />);
  const nodeEl = (id: string) => view.container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  return { api, nodeEl, content: () => api.current!.getContent(), ...view };
}
const template = (id: string) => diagramTemplates.find((t) => t.id === id)!.build();
const library = () => screen.getByRole('complementary', { name: 'Shapes' });

describe('shape library panel', () => {
  it('shows one category at a time, all of them, or search results across categories', () => {
    mount(template('flowchart'));
    const lib = within(library());
    expect(lib.getByRole('button', { name: /^Process/ })).toBeTruthy();
    expect(lib.queryByRole('button', { name: /^Router/ })).toBeNull();
    fireEvent.change(lib.getByRole('combobox', { name: 'Shape category' }), { target: { value: 'network' } });
    expect(lib.getAllByRole('button')).toHaveLength(11);
    fireEvent.change(lib.getByRole('combobox', { name: 'Shape category' }), { target: { value: 'all' } });
    expect(lib.getAllByRole('button')).toHaveLength(SHAPE_CATEGORIES.reduce((n, c) => n + c.entries.length, 0));
    fireEvent.change(lib.getByRole('searchbox', { name: 'Search shapes' }), { target: { value: 'lifeline' } });
    expect(lib.getAllByRole('button').map((b) => b.textContent)).toEqual(['Lifeline']);
    expect(lib.getByText('1 shape found')).toBeTruthy();
    expect((lib.getByRole('combobox', { name: 'Shape category' }) as HTMLSelectElement).disabled).toBe(true);
  });

  it('adds a shape from the library, and Enter in the search adds the first result', () => {
    const { content } = mount(template('flowchart'));
    const lib = within(library());
    const search = lib.getByRole('searchbox', { name: 'Search shapes' });
    fireEvent.change(search, { target: { value: 'parallel gateway' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(content().nodes.at(-1)!.data.shape).toBe('bpmnParallel');
    expect(content().schemaVersion).toBe(3);
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
  });

  it('is disabled, search and category included, on a protected diagram', () => {
    mount({ ...template('flowchart'), schemaVersion: 99 });
    const lib = within(library());
    expect((lib.getByRole('searchbox', { name: 'Search shapes' }) as HTMLInputElement).disabled).toBe(true);
    expect((lib.getByRole('combobox', { name: 'Shape category' }) as HTMLSelectElement).disabled).toBe(true);
    expect(lib.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('BPMN, timeline and mind map actions', () => {
  it('Add lane appears for a pool or one of its lanes, adds a lane, and undoes in one step', () => {
    const { nodeEl, content } = mount(template('bpmn'));
    expect(screen.queryByRole('button', { name: 'Add lane' })).toBeNull();
    fireEvent.click(nodeEl('write'));
    expect(screen.queryByRole('button', { name: 'Add lane' })).toBeNull();
    fireEvent.click(nodeEl('teacher'));
    fireEvent.click(screen.getByRole('button', { name: 'Add lane' }));
    expect(content().nodes.filter((n) => n.data.shape === 'bpmnLane')).toHaveLength(3);
    expect(content().nodes.find((n) => n.id === 'pool')!.height).toBe(660);
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(content().nodes.filter((n) => n.data.shape === 'bpmnLane')).toHaveLength(2);
    expect(content().nodes.find((n) => n.id === 'pool')!.height).toBe(440);
  });

  it('Add event is shown only with a timeline, and adds an evenly spaced date and its event', () => {
    mount(template('flowchart'));
    expect(screen.queryByRole('button', { name: 'Add event' })).toBeNull();
    document.body.innerHTML = '';
    const { content } = mount(template('timeline'));
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    const dates = content()
      .nodes.filter((n) => n.data.shape === 'timelineDate')
      .sort((a, b) => a.position.x - b.position.x);
    expect(dates).toHaveLength(6);
    expect(dates.at(-1)!.data.label).toBe('New date');
    const gaps = dates.slice(1).map((d, i) => d.position.x - dates[i].position.x);
    expect(new Set(gaps).size).toBe(1);
    expect(content().nodes.some((n) => n.data.label === 'New event')).toBe(true);
    // The new date's text is open for typing.
    expect(screen.getByRole('textbox', { name: 'Shape text' })).toBeTruthy();
  });

  it('Arrange offers the mind map and timeline layouts', async () => {
    const { content } = mount(template('mindmap'));
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    expect(screen.getByRole('menuitem', { name: 'Timeline: even spacing' }).hasAttribute('disabled') || screen.getByRole('menuitem', { name: 'Timeline: even spacing' }).getAttribute('aria-disabled') === 'true').toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Mind map: radial' })));
    const c = content();
    expect(c.edges.every((e) => e.type === 'default')).toBe(true);
    expect(c.settings.autoLayout).toBe('none');
  });
});

describe('locked shapes and layouts (Round 3)', () => {
  it('Mind map and timeline arrangements, and Add event, leave a locked shape where it is', async () => {
    const mind = template('mindmap');
    const lockedId = mind.edges[0].target;
    const at = mind.nodes.find((n) => n.id === lockedId)!.position;
    mind.nodes = mind.nodes.map((n) => (n.id === lockedId ? { ...n, locked: true } : n));
    const { content } = mount(mind);
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Mind map: two sides' })));
    expect(content().nodes.find((n) => n.id === lockedId)!.position).toEqual(at);
    expect(content().nodes.some((n) => n.id !== lockedId && JSON.stringify(n.position) !== JSON.stringify(mind.nodes.find((m) => m.id === n.id)!.position))).toBe(true);

    document.body.innerHTML = '';
    const tl = template('timeline');
    const date = tl.nodes.find((n) => n.data.shape === 'timelineDate')!;
    tl.nodes = tl.nodes.map((n) => (n.id === date.id ? { ...n, locked: true, position: { x: n.position.x + 7, y: n.position.y + 3 } } : n));
    const t = mount(tl);
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(t.content().nodes.find((n) => n.id === date.id)!.position).toEqual({ x: date.position.x + 7, y: date.position.y + 3 });
  });

  it('Add lane is not offered while the pool or a lane is locked', () => {
    const bpmn = template('bpmn');
    bpmn.nodes = bpmn.nodes.map((n) => (n.id === 'pool' ? { ...n, locked: true } : n));
    const { nodeEl } = mount(bpmn);
    fireEvent.click(nodeEl('teacher'));
    expect(screen.queryByRole('button', { name: 'Add lane' })).toBeNull();
  });
});

describe('timeline arrangement notes', () => {
  it('says when Arrange removes a plain line between dates that are not neighbours, and Undo brings it back', async () => {
    const tl = template('timeline');
    const dates = tl.nodes.filter((n) => n.data.shape === 'timelineDate').sort((a, b) => a.position.x - b.position.x);
    expect(dates.length).toBeGreaterThanOrEqual(3);
    const line = styledEdge({ id: 'mine', source: dates[0].id, target: dates[2].id, type: 'straight', data: { ...DEFAULT_CONNECTOR, arrow: 'none' } });
    tl.edges = [...tl.edges, line as unknown as (typeof tl.edges)[number]];
    const api = createRef<DiagramEditorApi>();
    render(
      <ToastProvider>
        <DiagramEditor initialContent={tl} title="Test" apiRef={api} onChange={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Timeline: even spacing' })));
    expect(api.current!.getContent().edges.some((e) => e.id === 'mine')).toBe(false);
    expect(await screen.findByText(/Removed 1 plain line between dates that are no longer next to each other/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Undo/ })));
    expect(api.current!.getContent().edges.some((e) => e.id === 'mine')).toBe(true);
  });
});

describe('connector notations in the Format panel', () => {
  const edge = (data: Partial<Connector['data']> = {}, type = 'smoothstep'): Connector =>
    styledEdge({ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type, data: { ...DEFAULT_CONNECTOR, ...data } });
  const actions: ConnectActions = { readOnly: false, grid: 10, snapshot: vi.fn(), update: vi.fn(), toast: vi.fn() };
  const inspector = (edges: Connector[], onPatch = vi.fn()) => {
    render(
      <ConnectActionsContext.Provider value={actions}>
        <EdgeInspector edges={edges} onPatch={onPatch} onTextFocus={vi.fn()} />
      </ConnectActionsContext.Provider>,
    );
    return { onPatch, select: screen.getByRole('combobox', { name: 'Connector notation' }) as HTMLSelectElement };
  };

  it('applies a notation as one undoable change of the line type, dash and ends', () => {
    const { onPatch, select } = inspector([edge()]);
    expect(select.options[0].textContent).toBe('BPMN sequence flow'); // the default connector already is one
    fireEvent.change(select, { target: { value: 'uml-return' } });
    expect(onPatch).toHaveBeenCalledWith({ type: 'straight', data: { dashed: true, startMarker: 'none', endMarker: 'open-arrow' } }, { snapshot: true });
  });

  it('names the notation a connector already has, or Custom', () => {
    expect(inspector([edge({ dashed: true, startMarker: 'circle', endMarker: 'triangle' })]).select.options[0].textContent).toBe('BPMN message flow');
    document.body.innerHTML = '';
    expect(inspector([edge({ startMarker: 'diamond', endMarker: 'crow-many' })]).select.options[0].textContent).toBe('Custom');
  });
});
