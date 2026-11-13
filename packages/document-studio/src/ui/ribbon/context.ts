import type { Editor } from '@tiptap/core';
import type { DiagramHost } from '../../extensions/diagramEmbed';
import type { ReviewControls } from '../../review/useReview';
import type { EditorMode, PageSettings } from '../../types';

/** Everything a ribbon tab may use. Tabs read what they need; the workspace fills it in. */
export interface RibbonContext {
  editor: Editor;
  mode: EditorMode;
  /** Advanced mode shows every control; Simple shows a curated core. */
  advanced: boolean;
  page: PageSettings;
  /** Text width of the page in CSS pixels (inserted diagrams never exceed it). */
  textWidthPx: number;
  diagramHost?: DiagramHost;
  spellcheck: boolean;
  onInsertImage(): void;
  onToggleFind(): void;
  onPageSetup(): void;
  onToggleSpellcheck(): void;
  /** Switches the ribbon to another tab. */
  showTab(id: string): void;
  /** Comments and the document language (Review tab). Absent in the protected view. */
  review?: ReviewControls;
  // @phase4:ribbon-context — add what new tabs or controls need here (and fill it in DocumentEditor).
  /** Replaces the page settings (Layout tab: size, orientation, columns, header and footer, page numbers). Saves. */
  onPageChange?(page: PageSettings): void;
}

/** Opens the link popover (Ctrl/⌘+K). */
export const OPEN_LINK_EVENT = 'dcos:open-link';
