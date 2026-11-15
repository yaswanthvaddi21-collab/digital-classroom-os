/**
 * The editor's state: the content, what is selected, and one undo history for every change (slides, objects, text and
 * notes). Content changes are reported to the app through onChange (which saves them); selection changes are not.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationContent } from '../types';
import { UndoStack } from './history';

export interface EditorSelection {
  /** The slide on the stage. */
  slideId: string | null;
  /** The slides selected in the slides panel (always includes slideId when there is one). */
  slideIds: string[];
  /** The selected objects on the current slide. */
  elementIds: string[];
}

export interface EditorState {
  content: PresentationContent;
  selection: EditorSelection;
}

export interface ApplyOptions {
  /**
   * Changes with the same group, one after another, are one undo step (typing into a text box, a drag). A change
   * without a group, or with another group, starts a new step.
   */
  group?: string;
  /** The selection after the change. */
  select?: Partial<EditorSelection>;
  /**
   * The change completes the last step instead of making one (a text box resized to fit its text after the change
   * that made it overflow): undo takes both back together. The current group, if any, goes on.
   */
  amend?: boolean;
}

/** The selection made valid for `content`: existing slides and objects only, the current slide always selected. */
export function normalizeSelection(content: PresentationContent, sel: EditorSelection, previousIndex = 0): EditorSelection {
  const ids = new Set(content.slides.map((s) => s.id));
  let slideId = sel.slideId && ids.has(sel.slideId) ? sel.slideId : null;
  if (!slideId && content.slides.length) slideId = content.slides[Math.min(Math.max(0, previousIndex), content.slides.length - 1)].id;
  const slideIds = sel.slideIds.filter((id) => ids.has(id));
  if (slideId && !slideIds.includes(slideId)) slideIds.push(slideId);
  const slide = content.slides.find((s) => s.id === slideId);
  const elementIds = slide && slideId === sel.slideId ? sel.elementIds.filter((id) => slide.elements.some((e) => e.id === id)) : [];
  return { slideId, slideIds: slideId ? slideIds : [], elementIds };
}

const sameSelection = (a: EditorSelection, b: EditorSelection) =>
  a.slideId === b.slideId && a.slideIds.length === b.slideIds.length && a.slideIds.every((id, i) => id === b.slideIds[i]) && a.elementIds.length === b.elementIds.length && a.elementIds.every((id, i) => id === b.elementIds[i]);

export function useEditorModel(initial: PresentationContent, onChange: (content: PresentationContent) => void) {
  const [state, setState] = useState<EditorState>(() => ({ content: initial, selection: normalizeSelection(initial, { slideId: null, slideIds: [], elementIds: [] }) }));
  const ref = useRef(state);
  const history = useRef(new UndoStack<EditorState>());
  const group = useRef<string | null>(null);
  /** The snapshot pushed when the current group started. */
  const groupBase = useRef<EditorState | null>(null);
  const [, setHistoryVersion] = useState(0);

  const commit = useCallback((next: EditorState) => {
    ref.current = next;
    setState(next);
  }, []);

  /** Changes the content (one undo step, or part of the current group's step) and/or the selection. */
  const apply = useCallback(
    (change: (content: PresentationContent) => PresentationContent, options: ApplyOptions = {}) => {
      const cur = ref.current;
      const content = change(cur.content);
      const index = cur.content.slides.findIndex((s) => s.id === cur.selection.slideId);
      const selection = normalizeSelection(content, { ...cur.selection, ...options.select }, index);
      if (content === cur.content && sameSelection(selection, cur.selection)) return;
      if (content !== cur.content && !options.amend) {
        if (!options.group || options.group !== group.current) {
          history.current.push(cur);
          groupBase.current = cur;
          setHistoryVersion((v) => v + 1);
        }
        group.current = options.group ?? null;
      } else if (content === cur.content) {
        // Selecting something else ends a run of nudges (or any group): the next change is its own step.
        group.current = null;
      }
      commit({ content, selection });
    },
    [commit],
  );

  /** Changes only the selection (never an undo step). */
  const select = useCallback((sel: Partial<EditorSelection>) => apply((c) => c, { select: sel }), [apply]);

  /**
   * Ends the current group, so the next change is its own undo step. With dropIfUnchanged, a group that ended where it
   * started (typing undone inside the text box) leaves no step behind.
   */
  const endGroup = useCallback((options: { dropIfUnchanged?: boolean } = {}) => {
    const base = group.current ? groupBase.current : null;
    group.current = null;
    groupBase.current = null;
    if (options.dropIfUnchanged && base && JSON.stringify(base.content) === JSON.stringify(ref.current.content) && history.current.dropLast(base)) {
      setHistoryVersion((v) => v + 1);
    }
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.undo(ref.current);
    group.current = null;
    if (!prev) return false;
    commit(prev);
    setHistoryVersion((v) => v + 1);
    return true;
  }, [commit]);

  const redo = useCallback(() => {
    const next = history.current.redo(ref.current);
    group.current = null;
    if (!next) return false;
    commit(next);
    setHistoryVersion((v) => v + 1);
    return true;
  }, [commit]);

  // Every content change (including undo and redo) is handed to the app, which saves it.
  const reported = useRef(initial);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (state.content === reported.current) return;
    reported.current = state.content;
    onChangeRef.current(state.content);
  }, [state.content]);

  return {
    state,
    /** The latest state, for event handlers that run between renders. */
    latest: () => ref.current,
    apply,
    select,
    endGroup,
    undo,
    redo,
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
  };
}

export type EditorModel = ReturnType<typeof useEditorModel>;
