import type { Editor } from '@tiptap/core';
import type { AlignMode, DistributeMode, ZOrder } from '../editor/arrange';
import type { ContentTools } from '../elements/useContentTools';
import type { PresentationContent, Slide, SlideElement, TextElement } from '../types';

/**
 * What the ribbon tabs get from the editor: the state they show and the commands they run. Every command is one undo
 * step in the editor's single history.
 * @phase7:DESIGN @phase7:CONTENT @phase7:SHOW — tabs added by later groups take this context too; add the state and
 * commands they need here.
 */
export interface RibbonContext {
  content: PresentationContent;
  slide: Slide | null;
  /** The selected objects on the current slide. */
  selected: SlideElement[];
  /** The text boxes formatting applies to: the one being edited, else the selected text boxes. */
  textTargets: TextElement[];
  /** The live text editor while a text box is being edited (formatting then applies to its selection). */
  editor: Editor | null;

  canPaste: boolean;
  paste: () => void;
  copy: () => void;
  cut: () => void;
  duplicate: () => void;
  remove: () => void;

  newSlide: (layoutId?: string) => void;
  insertTextBox: () => void;

  /** Changes the text boxes in textTargets as a whole (one undo step). */
  formatBoxes: (change: (el: TextElement) => TextElement) => void;

  reorder: (how: ZOrder) => void;
  canReorder: (how: ZOrder) => boolean;
  align: (mode: AlignMode) => void;
  distribute: (mode: DistributeMode) => void;
  rotateBy: (deg: number) => void;
  setLocked: (locked: boolean) => void;

  /** CONTENT (Round 2b): pictures, shapes, tables, charts and diagrams (elements/useContentTools.tsx). */
  contentTools?: ContentTools;
}
