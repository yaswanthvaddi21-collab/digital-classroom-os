import type { ReactFlowInstance } from '@xyflow/react';
import type { Connector, ShapeNode } from '../types';
import type { CanvasControls } from './useCanvas';
import type { Mutations } from './mutations';
import type { DiagramState } from './useDiagramState';

/**
 * What toolbar groups, selection actions, shortcuts and export formats work with: the editor state, every
 * mutation, and a few services. One object per render, so registry entries always see the current diagram.
 */
export type EditorController = DiagramState &
  Mutations &
  CanvasControls & /* @phase5:canvas (G-CANVAS) — useCanvas.ts; some replace mutations of the same name. */ {
    rf: ReactFlowInstance<ShapeNode, Connector>;
    toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
    /** The diagram's title, used for file names. */
    title: string;
    /** Exactly one shape is selected. */
    single: boolean;
    /** Clears selection and editing chrome and waits for a repaint, then hands over the canvas element and its nodes. */
    prepareCapture: () => Promise<{ el: HTMLDivElement; ns: ShapeNode[] }>;
    /** Set by the host when it can open a diagram file as a new diagram. */
    onOpenFile?: () => void;
  };
