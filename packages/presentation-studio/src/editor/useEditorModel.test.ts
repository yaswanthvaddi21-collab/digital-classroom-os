// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { layoutIdFor } from '../layouts';
import { UndoStack } from './history';
import { addSlide, deleteSlides, nudgeElements } from './model';
import { normalizeSelection, useEditorModel } from './useEditorModel';

describe('UndoStack', () => {
  it('undoes and redoes snapshots, drops redo on a new change, and keeps at most `limit`', () => {
    const s = new UndoStack<number>(2);
    s.push(1);
    s.push(2);
    s.push(3);
    expect(s.undo(4)).toBe(3);
    expect(s.undo(3)).toBe(2);
    expect(s.undo(2)).toBeUndefined();
    expect(s.redo(2)).toBe(3);
    s.push(9);
    expect(s.canRedo).toBe(false);
    // dropLast forgets the last snapshot only when it is the one given.
    expect(s.dropLast(3)).toBe(false);
    expect(s.dropLast(9)).toBe(true);
    expect(s.undo(5)).toBe(2);
  });
});

describe('useEditorModel', () => {
  const setup = () => {
    const initial = createPresentation('blank');
    const onChange = vi.fn();
    const hook = renderHook(() => useEditorModel(initial, onChange));
    return { initial, onChange, hook };
  };

  it('starts on the first slide and reports nothing until the content changes', () => {
    const { initial, onChange, hook } = setup();
    expect(hook.result.current.state.selection).toEqual({ slideId: initial.slides[0].id, slideIds: [initial.slides[0].id], elementIds: [] });
    expect(onChange).not.toHaveBeenCalled();
    act(() => hook.result.current.select({ elementIds: [initial.slides[0].elements[0].id] }));
    expect(onChange).not.toHaveBeenCalled();
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('makes every change one undo step, and changes of one group one step together', () => {
    const { initial, onChange, hook } = setup();
    const slideId = initial.slides[0].id;
    const el = initial.slides[0].elements[0].id;
    act(() => hook.result.current.apply((c) => addSlide(c, layoutIdFor('blank')).content));
    expect(hook.result.current.state.content.slides).toHaveLength(2);
    expect(onChange).toHaveBeenLastCalledWith(hook.result.current.state.content);
    // Three nudges in one group are one step.
    for (let i = 0; i < 3; i++) act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 1, 0), { group: 'nudge' }));
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(initial.slides[0].elements[0].x + 3);
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(initial.slides[0].elements[0].x);
    expect(hook.result.current.state.content.slides).toHaveLength(2);
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content).toBe(initial);
    expect(onChange).toHaveBeenLastCalledWith(initial);
    expect(hook.result.current.canUndo).toBe(false);
    act(() => void hook.result.current.redo());
    expect(hook.result.current.state.content.slides).toHaveLength(2);
    expect(hook.result.current.canRedo).toBe(true);
  });

  it('starts a new step after endGroup, even in the same group', () => {
    const { initial, hook } = setup();
    const slideId = initial.slides[0].id;
    const el = initial.slides[0].elements[0].id;
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 1, 0), { group: 'g' }));
    act(() => hook.result.current.endGroup());
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 1, 0), { group: 'g' }));
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(initial.slides[0].elements[0].x + 1);
  });

  it('ends a group when the selection changes, so two runs of nudges are two steps', () => {
    const { initial, hook } = setup();
    const slideId = initial.slides[0].id;
    const [a, b] = initial.slides[0].elements.map((e) => e.id);
    const x0 = initial.slides[0].elements[0].x;
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [a], 1, 0), { group: 'nudge:a' }));
    act(() => hook.result.current.select({ elementIds: [b] }));
    act(() => hook.result.current.select({ elementIds: [a] }));
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [a], 1, 0), { group: 'nudge:a' }));
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(x0 + 1);
  });

  it('amends the last step without a new one, and drops a group that ended where it started', () => {
    const { initial, hook } = setup();
    const slideId = initial.slides[0].id;
    const el = initial.slides[0].elements[0].id;
    const x0 = initial.slides[0].elements[0].x;
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 5, 0)));
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 0, 7), { amend: true }));
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content).toBe(initial);
    expect(hook.result.current.canUndo).toBe(false);
    act(() => void hook.result.current.redo());
    // A group whose changes cancel out leaves no step: undo goes to the step before it.
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 1, 0), { group: 'text' }));
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], -1, 0), { group: 'text' }));
    act(() => hook.result.current.endGroup({ dropIfUnchanged: true }));
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(x0);
    expect(hook.result.current.canUndo).toBe(false);
    // A group that changed something keeps its step.
    act(() => void hook.result.current.redo());
    act(() => hook.result.current.apply((c) => nudgeElements(c, slideId, [el], 1, 0), { group: 'text2' }));
    act(() => hook.result.current.endGroup({ dropIfUnchanged: true }));
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.content.slides[0].elements[0].x).toBe(x0 + 5);
  });

  it('restores the selection with the content on undo', () => {
    const { initial, hook } = setup();
    const first = initial.slides[0].id;
    let added = '';
    act(() =>
      hook.result.current.apply((c) => {
        const r = addSlide(c, layoutIdFor('blank'));
        added = r.slideId;
        return r.content;
      }),
    );
    act(() => hook.result.current.select({ slideId: added, slideIds: [added] }));
    act(() => hook.result.current.apply((c) => deleteSlides(c, [added])));
    expect(hook.result.current.state.selection.slideId).toBe(first);
    act(() => void hook.result.current.undo());
    expect(hook.result.current.state.selection.slideId).toBe(added);
  });
});

describe('normalizeSelection', () => {
  it('keeps only existing slides and objects, and falls back to the slide at the old position', () => {
    const p = createPresentation('blank');
    const a = p.slides[0].id;
    const two = addSlide(p, layoutIdFor('blank')).content;
    const b = two.slides[1].id;
    expect(normalizeSelection(two, { slideId: 'gone', slideIds: ['gone', b], elementIds: ['x'] }, 1)).toEqual({ slideId: b, slideIds: [b], elementIds: [] });
    expect(normalizeSelection(two, { slideId: a, slideIds: [], elementIds: [p.slides[0].elements[0].id, 'x'] })).toEqual({ slideId: a, slideIds: [a], elementIds: [p.slides[0].elements[0].id] });
    expect(normalizeSelection({ ...two, slides: [] }, { slideId: a, slideIds: [a], elementIds: [] })).toEqual({ slideId: null, slideIds: [], elementIds: [] });
  });
});
