import type { Editor } from '@tiptap/core';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

/** The part of the document that the steps from `firstStep` on replaced, in the final document's positions. */
export function changedRange(tr: Transaction, firstStep: number): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  for (let i = firstStep; i < tr.steps.length; i++) {
    const rest = tr.mapping.slice(i + 1);
    tr.mapping.maps[i].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, rest.map(newStart, -1));
      to = Math.max(to, rest.map(newEnd, 1));
    });
  }
  return from <= to ? { from, to } : null;
}

/**
 * The position of the first `typeName` node the steps from `firstStep` on inserted (-1 if none). Tiptap may place
 * a block before or after the paragraph the cursor was in, so the inserted range is read from the steps themselves.
 */
export function findInserted(tr: Transaction, firstStep: number, typeName: string): number {
  const range = changedRange(tr, firstStep);
  if (!range) return -1;
  let found = -1;
  tr.doc.nodesBetween(range.from, Math.min(range.to, tr.doc.content.size), (child, pos) => {
    if (found >= 0) return false;
    if (pos >= range.from && child.type.name === typeName) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Changes attributes of the `typeName` node at `pos`. Atoms (equations, shapes, pictures) stay selected, so their
 * tools stay open; the change is one undo step.
 */
export function updateNodeAt(editor: Editor, pos: number, typeName: string, patch: Record<string, unknown>): boolean {
  return editor
    .chain()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || node.type.name !== typeName) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
      if (node.isAtom) tr.setSelection(NodeSelection.create(tr.doc, pos));
      return true;
    })
    .run();
}

/** Deletes the `typeName` node at `pos` and puts the cursor where it was. */
export function deleteNodeAt(editor: Editor, pos: number, typeName: string): boolean {
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || node.type.name !== typeName) return false;
      tr.delete(pos, pos + node.nodeSize);
      return true;
    })
    .run();
}

/**
 * Where a new block object (shape, text box) goes: after the selection when something is selected; after the
 * paragraph the cursor is in, so its text is not split in two; at the cursor in an empty paragraph (which it
 * replaces).
 */
export function blockInsertPos(state: EditorState): number {
  const { selection } = state;
  if (!selection.empty) return selection.to;
  const { $from } = selection;
  if ($from.parent.isTextblock && $from.parent.content.size > 0 && $from.depth > 0) return $from.after();
  return selection.from;
}
