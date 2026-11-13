import type { Editor } from '@tiptap/core';

/**
 * Requests from the document (a double-click on an equation, Enter on a selected one) or from the Insert tab to the
 * editor's object UI (the equation dialog, which the ribbon's object bar hosts). One listener per editor.
 */
export type ObjectEditRequest =
  | { kind: 'equation'; pos: number }
  | { kind: 'new-equation'; display: boolean };

const listeners = new WeakMap<Editor, (request: ObjectEditRequest) => void>();

/** Registers the editor's object UI. Returns the unregister function. */
export function onObjectEditRequest(editor: Editor, listener: (request: ObjectEditRequest) => void) {
  listeners.set(editor, listener);
  return () => {
    if (listeners.get(editor) === listener) listeners.delete(editor);
  };
}

/** Asks the object UI to act. False when no UI is listening (e.g. a read-only view without a ribbon). */
export function requestObjectEdit(editor: Editor, request: ObjectEditRequest): boolean {
  const listener = listeners.get(editor);
  if (!listener) return false;
  listener(request);
  return true;
}
