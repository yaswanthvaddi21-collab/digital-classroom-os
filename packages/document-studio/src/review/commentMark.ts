import { Mark, mergeAttributes } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { isCommentId } from './comments';

/**
 * Plugin state. Highlights of open threads are CSS rules on the marks' spans (see commentHighlightCss), so that
 * opening a document dispatches nothing: a transaction on open would let other plugins (e.g. the trailing
 * paragraph) change, and so save, a document the user has not touched.
 */
export interface CommentPluginState {
  /** The thread shown as current (cursor inside its text, or picked in the panel). */
  active: string | null;
  /** Text selected for a comment that is still being written (kept in step with edits). */
  pending: { from: number; to: number } | null;
  decorations: DecorationSet;
}

type Meta = { active?: string | null; pending?: { from: number; to: number } | null };

export interface CommentStorage {
  /** Ids of the threads this document has (open or resolved), kept up to date by the workspace. */
  known: Set<string>;
  /**
   * Ids of threads deleted in this session. If an undo brings back text that still carries such a thread's mark
   * (text deleted, then its thread deleted, then Ctrl+Z), the mark is taken off again: it would have no thread, could
   * not be seen or removed, and would keep the document at schema 2.
   */
  deleted: Set<string>;
}

/**
 * Whether a comment can be put on [from, to): some non-blank text there must be able to carry the mark. A code
 * block's text takes no marks, and an equation or line break alone is not text, so a comment on either would be a
 * thread with nothing to point at.
 */
export function canCommentOn(state: EditorState, from: number, to: number): boolean {
  const type = state.schema.marks.comment;
  if (!type || to <= from) return false;
  let ok = false;
  state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (ok) return false;
    // Only text counts: commentRange, the panel and the DOCX/ODT anchors all look for marked text, so a selection
    // holding just an inline equation or a line break would leave a thread with nothing to point at.
    if (node.isText && parent?.type.allowsMarkType(type) && (node.text ?? '').slice(Math.max(0, from - pos), to - pos).trim()) ok = true;
    return !ok;
  });
  return ok;
}

/** Why a comment cannot be added to the current selection (shown to the user), or null when it can. */
export function commentBlockReason(state: EditorState): string | null {
  const { from, to, empty } = state.selection;
  if (empty) return 'Select some text to comment on.';
  if (canCommentOn(state, from, to)) return null;
  return 'A comment needs text to attach to. An equation, a line break or a code block on its own cannot take one: include some of the text around it in the selection.';
}

export const commentKey = new PluginKey<CommentPluginState>('dcosComments');

/** Opens the comment composer (Ctrl/⌘+Alt+M), handled by the workspace. */
export const NEW_COMMENT_EVENT = 'dcos:new-comment';
/** Clicking commented text shows its thread in the comments panel. */
export const SHOW_COMMENTS_EVENT = 'dcos:show-comments';

const idsAt = (node: PMNode) => node.marks.filter((m) => m.type.name === 'comment' && isCommentId(m.attrs.commentId)).map((m) => m.attrs.commentId as string);

/** Comment ids at a position (the text just before it, as typing would continue it, and just after). */
export function commentIdsAt(state: EditorState, pos = state.selection.head): string[] {
  const $pos = state.doc.resolve(pos);
  const ids = new Set<string>();
  for (const node of [$pos.nodeBefore, $pos.nodeAfter]) if (node?.isText) idsAt(node).forEach((id) => ids.add(id));
  return [...ids];
}

/** Where a thread's text is: from its first to its last marked character, or null when it has none. */
export function commentRange(doc: PMNode, id: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  doc.descendants((node, pos) => {
    if (node.isText && idsAt(node).includes(id)) {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
  });
  return from < 0 ? null : { from, to };
}

/**
 * CSS that highlights the text of open threads, and more strongly the current one. Ids are restricted to
 * [A-Za-z0-9_-] (isCommentId), so they are safe inside the attribute selectors.
 */
export function commentHighlightCss(openIds: string[], active: string | null): string {
  const sel = (ids: string[]) => ids.filter(isCommentId).map((id) => `.dcos-doc span[data-comment-id="${id}"]`).join(', ');
  const rules: string[] = [];
  if (openIds.some(isCommentId)) rules.push(`${sel(openIds)} { background: rgba(250, 204, 21, 0.28); border-bottom: 2px solid rgba(202, 138, 4, 0.75); }`);
  if (isCommentId(active)) rules.push(`${sel([active])} { background: rgba(250, 204, 21, 0.55); border-bottom: 2px solid #ca8a04; }`);
  return rules.join('\n');
}

/** Removes comment marks whose thread this document does not have (text pasted from another document). */
function keepKnown(fragment: Fragment, known: Set<string>): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((node) => {
    const marks = node.marks.filter((m) => m.type.name !== 'comment' || known.has(m.attrs.commentId));
    let next = marks.length === node.marks.length ? node : node.mark(marks);
    if (!next.isText && next.content.size) next = next.copy(keepKnown(next.content, known));
    out.push(next);
  });
  return Fragment.from(out);
}

const pendingDecorations = (doc: PMNode, pending: CommentPluginState['pending']) =>
  pending && pending.to > pending.from ? DecorationSet.create(doc, [Decoration.inline(pending.from, pending.to, { class: 'dcos-comment-pending' })]) : DecorationSet.empty;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Marks the selection (or `range`) as the text of comment thread `id`. */
      addComment: (id: string, range?: { from: number; to: number }) => ReturnType;
      /** Removes thread `id`'s mark from the whole document (not undoable: the thread is deleted with it). */
      removeComment: (id: string) => ReturnType;
    };
  }
  interface Storage {
    comment: CommentStorage;
  }
}

/**
 * The text a comment is about. The mark holds only the thread id (stored as data-comment-id in HTML, so copy and
 * paste within the document keep it); the thread is in the document's `comments` field. Comments may overlap.
 */
export const CommentMark = Mark.create<Record<string, never>, CommentStorage>({
  name: 'comment',
  inclusive: false,
  excludes: '',

  addStorage() {
    return { known: new Set<string>(), deleted: new Set<string>() };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => {
          const id = el.getAttribute('data-comment-id');
          return isCommentId(id) ? id : null;
        },
        renderHTML: (attrs) => (isCommentId(attrs.commentId) ? { 'data-comment-id': attrs.commentId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]', consuming: false, getAttrs: (el) => (isCommentId((el as HTMLElement).getAttribute('data-comment-id')) ? null : false) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'dcos-comment' }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      addComment:
        (id, range) =>
        ({ state, tr, dispatch }) => {
          const ranges = range ? [range] : state.selection.ranges.map((r) => ({ from: r.$from.pos, to: r.$to.pos }));
          if (!isCommentId(id) || !ranges.some((r) => canCommentOn(state, r.from, r.to))) return false;
          if (dispatch) for (const r of ranges) if (r.to > r.from) tr.addMark(r.from, r.to, this.type.create({ commentId: id }));
          return true;
        },
      removeComment:
        (id) =>
        ({ tr, dispatch }) => {
          let found = false;
          tr.doc.descendants((node, pos) => {
            const mark = node.marks.find((m) => m.type === this.type && m.attrs.commentId === id);
            if (mark) {
              found = true;
              if (dispatch) tr.removeMark(pos, pos + node.nodeSize, mark);
            }
          });
          if (found && dispatch) tr.setMeta('addToHistory', false);
          return found;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-m': () => {
        if (!this.editor.isEditable || this.editor.state.selection.empty) return false;
        window.dispatchEvent(new Event(NEW_COMMENT_EVENT));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<CommentPluginState>({
        key: commentKey,
        state: {
          init: () => ({ active: null, pending: null, decorations: DecorationSet.empty }),
          apply(tr: Transaction, prev, _old, state) {
            const meta = tr.getMeta(commentKey) as Meta | undefined;
            if (!meta && !tr.docChanged && !tr.selectionSet) return prev;
            let { active, pending } = prev;
            if (pending && tr.docChanged) {
              const from = tr.mapping.map(pending.from, 1);
              const to = tr.mapping.map(pending.to, -1);
              pending = to > from ? { from, to } : null;
            }
            if (meta && 'pending' in meta) pending = meta.pending ?? null;
            if (meta && 'active' in meta) active = meta.active ?? null;
            else if (tr.selectionSet) active = commentIdsAt(state).find((id) => storage.known.has(id)) ?? null;
            if (active === prev.active && pending === prev.pending && !tr.docChanged) return prev;
            return { active, pending, decorations: pending === prev.pending && !tr.docChanged ? prev.decorations : pendingDecorations(state.doc, pending) };
          },
        },
        props: {
          decorations: (state) => commentKey.getState(state)?.decorations,
          handleClick: (view, pos) => {
            if (commentIdsAt(view.state, pos).some((id) => storage.known.has(id))) window.dispatchEvent(new Event(SHOW_COMMENTS_EVENT));
            return false;
          },
          // Comments only travel with their threads: pasted text keeps the marks of threads this document has.
          transformPasted: (slice: Slice) => new Slice(keepKnown(slice.content, storage.known), slice.openStart, slice.openEnd),
        },
        // Undo can bring back the mark of a thread deleted meanwhile: take it off again (only ids deleted in this
        // session, so a document as stored is never changed on open).
        appendTransaction: (trs, _old, state) => {
          if (!storage.deleted.size || !trs.some((t) => t.docChanged)) return null;
          const type = state.schema.marks.comment;
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            for (const m of node.marks) {
              if (m.type === type && storage.deleted.has(m.attrs.commentId) && !storage.known.has(m.attrs.commentId)) {
                tr ??= state.tr;
                tr.removeMark(pos, pos + node.nodeSize, m);
              }
            }
          });
          return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});

export const getCommentState = (state: EditorState) => commentKey.getState(state);

export function setCommentMeta(view: EditorView, meta: Meta) {
  view.dispatch(view.state.tr.setMeta(commentKey, meta).setMeta('addToHistory', false));
}
