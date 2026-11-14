// @vitest-environment jsdom
/** The editor state reports each real change once, serialising the diagram once per change (audit DS-R8). */
import { act, renderHook } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

const serializeCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../types')>();
  return {
    ...actual,
    serializeDiagram: (...args: Parameters<typeof actual.serializeDiagram>) => {
      serializeCalls.count++;
      return actual.serializeDiagram(...args);
    },
  };
});

const { useDiagramState } = await import('./useDiagramState');
const { diagramTemplates } = await import('../templates');

describe('useDiagramState', () => {
  it('serialises once per change, reports only real changes, and keeps layers in undo', () => {
    const onChange = vi.fn();
    const content = { ...diagramTemplates.find((t) => t.id === 'flowchart')!.build(), schemaVersion: 3, layers: [{ id: 'L', name: 'L', visible: true, locked: false }] };
    const { result } = renderHook(() => useDiagramState(content, onChange), { wrapper: ReactFlowProvider });
    expect(onChange).not.toHaveBeenCalled();

    serializeCalls.count = 0;
    act(() => result.current.setSettings((s) => ({ ...s, showGrid: false })));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(serializeCalls.count).toBe(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ schemaVersion: 3, settings: { showGrid: false }, layers: content.layers });

    // The same values in a new object: compared, not reported.
    serializeCalls.count = 0;
    act(() => result.current.setSettings((s) => ({ ...s })));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(serializeCalls.count).toBe(1);

    // Layers are part of each undo step.
    act(() => result.current.snapshot());
    act(() => result.current.setLayers(undefined));
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ layers: expect.anything() }));
    act(() => result.current.undo());
    expect(result.current.layers).toEqual(content.layers);
    expect(onChange.mock.calls.at(-1)![0].layers).toEqual(content.layers);
  });
});
