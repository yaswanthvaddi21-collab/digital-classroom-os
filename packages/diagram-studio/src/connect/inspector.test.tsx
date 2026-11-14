// @vitest-environment jsdom
/** The Format panel's connector sections (G-CONNECT): the keyboard route to ports, floating ends, bends and labels. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EdgeInspector } from '../Inspector';
import { DEFAULT_CONNECTOR, styledEdge, type Connector } from '../types';
import { ConnectActionsContext, type ConnectActions } from './context';

const edge = (over: Partial<Connector> = {}): Connector =>
  styledEdge({ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: 'Yes', data: { ...DEFAULT_CONNECTOR }, ...over });

function mount(edges: Connector[]) {
  let current = edges;
  const actions: ConnectActions = {
    readOnly: false,
    grid: 10,
    snapshot: vi.fn(),
    update: vi.fn((id, change) => void (current = current.map((e) => (e.id === id ? change(e) : e)))),
    toast: vi.fn(),
  };
  const view = render(
    <ConnectActionsContext.Provider value={actions}>
      <EdgeInspector edges={edges} onPatch={vi.fn()} onTextFocus={vi.fn()} />
    </ConnectActionsContext.Provider>,
  );
  return { actions, view, edges: () => current };
}

describe('connector Format panel', () => {
  it('shows where each end attaches and changes it in one undo step', () => {
    const { actions, edges } = mount([edge({ data: { ...DEFAULT_CONNECTOR, targetPort: 'perimeter' } })]);
    const start = screen.getByRole('combobox', { name: 'Start attaches at' }) as HTMLSelectElement;
    const end = screen.getByRole('combobox', { name: 'End attaches at' }) as HTMLSelectElement;
    expect(start.value).toBe('right');
    expect(end.value).toBe('perimeter');
    // Eight fixed points plus floating.
    expect(start.querySelectorAll('option')).toHaveLength(9);

    fireEvent.change(start, { target: { value: 'top-left' } });
    expect(actions.snapshot).toHaveBeenCalledTimes(1);
    expect(edges()[0].data!.sourcePort).toEqual({ x: 0, y: 0 });
    fireEvent.change(end, { target: { value: 'bottom' } });
    expect(edges()[0].targetHandle).toBe('b');
    expect(edges()[0].data).not.toHaveProperty('targetPort');
  });

  it('names a point from a diagrams.net file, and a mixed selection', () => {
    mount([edge({ data: { ...DEFAULT_CONNECTOR, sourcePort: { x: 0.25, y: 0 } } }), edge({ id: 'f' })]);
    expect((screen.getByRole('combobox', { name: 'Start attaches at' }) as HTMLSelectElement).value).toBe('mixed');
    expect((screen.getByRole('combobox', { name: 'End attaches at' }) as HTMLSelectElement).value).toBe('left');
  });

  it('shows a custom point with its position', () => {
    mount([edge({ data: { ...DEFAULT_CONNECTOR, sourcePort: { x: 0.25, y: 0 } } })]);
    expect(screen.getByRole('option', { name: 'Start: point at 25%, 0%' })).toBeTruthy();
  });

  it('counts bend points and removes them', () => {
    const { edges } = mount([edge({ data: { ...DEFAULT_CONNECTOR, waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } })]);
    expect(screen.getByText('2 bend points')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove bends' }));
    expect(edges()[0].data).not.toHaveProperty('waypoints');
  });

  it('moves the label along the connector with a slider (one undo step), and back to the middle', () => {
    const { actions, edges } = mount([edge({ data: { ...DEFAULT_CONNECTOR, labelPosition: 0.2 } })]);
    const slider = screen.getByRole('slider', { name: /Label position/ }) as HTMLInputElement;
    expect(slider.value).toBe('20');
    fireEvent.focus(slider);
    fireEvent.change(slider, { target: { value: '30' } });
    fireEvent.change(slider, { target: { value: '35' } });
    expect(actions.snapshot).toHaveBeenCalledTimes(1);
    expect(edges()[0].data!.labelPosition).toBe(0.35);
    fireEvent.click(screen.getByRole('button', { name: 'Middle' }));
    expect(edges()[0].data).not.toHaveProperty('labelPosition');
  });

  it('offers no label position for a connector without a label', () => {
    mount([edge({ label: undefined })]);
    expect(screen.queryByRole('slider', { name: /Label position/ })).toBeNull();
  });
});
