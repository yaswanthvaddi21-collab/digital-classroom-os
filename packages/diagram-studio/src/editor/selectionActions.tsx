import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { ADD_LANE_ACTION } from '../library/editorActions';
import { CANVAS_SELECTION_ACTIONS } from './canvasActions';
import type { EditorController } from './controller';

/**
 * Actions on the current selection (align, and later group, lock, z-order, distribute …). The toolbar shows the
 * ones whose `when` holds, as icon buttons; a context menu can list the same entries.
 */
export interface SelectionAction {
  id: string;
  label: string;
  icon: ReactNode;
  when: (ctx: EditorController) => boolean;
  run: (ctx: EditorController) => void;
}

const twoOrMore = (ctx: EditorController) => ctx.selectedNodes.length > 1 && !ctx.readOnly;

export const SELECTION_ACTIONS: SelectionAction[] = [
  { id: 'align-left', label: 'Align left', icon: <AlignStartVertical size={16} />, when: twoOrMore, run: (ctx) => ctx.align('left') },
  { id: 'align-center', label: 'Align centre', icon: <AlignCenterVertical size={16} />, when: twoOrMore, run: (ctx) => ctx.align('center') },
  { id: 'align-right', label: 'Align right', icon: <AlignEndVertical size={16} />, when: twoOrMore, run: (ctx) => ctx.align('right') },
  { id: 'align-top', label: 'Align top', icon: <AlignStartHorizontal size={16} />, when: twoOrMore, run: (ctx) => ctx.align('top') },
  { id: 'align-middle', label: 'Align middle', icon: <AlignCenterHorizontal size={16} />, when: twoOrMore, run: (ctx) => ctx.align('middle') },
  { id: 'align-bottom', label: 'Align bottom', icon: <AlignEndHorizontal size={16} />, when: twoOrMore, run: (ctx) => ctx.align('bottom') },
  ADD_LANE_ACTION, // @phase5:shapes (G-SHAPES) — BPMN: add a lane to the selected pool (library/editorActions.tsx).
  // @phase5:selection-actions — group/ungroup, lock/unlock, z-order, distribute …
  ...CANVAS_SELECTION_ACTIONS, // @phase5:canvas (G-CANVAS) — distribute, group, ungroup, lock, unlock (canvasActions.tsx).
];

/** The selection actions that apply right now. */
export const selectionActionsFor = (ctx: EditorController) => SELECTION_ACTIONS.filter((a) => a.when(ctx));
