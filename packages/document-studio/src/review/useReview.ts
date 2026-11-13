import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canCommentOn, commentBlockReason, commentHighlightCss, commentRange, getCommentState, NEW_COMMENT_EVENT, setCommentMeta, SHOW_COMMENTS_EVENT } from './commentMark';
import { commentsProblem, newCommentId, type CommentReply, type CommentThread } from './comments';
import { isLanguageTag } from './language';

/**
 * The document's review state kept beside the body: comment threads and the document language. Both are saved
 * with the document (top-level `comments` and `language` fields, left out while empty so ordinary documents stay
 * content schema 1).
 */
export interface ReviewState {
  comments: CommentThread[];
  language: string | null;
  /** The stored form, merged into the saved content (undefined fields are not written). */
  fields: { comments: CommentThread[] | undefined; language: string | undefined };
  /** True once anything here was changed in this session (so opening a document never saves). */
  changed: boolean;
  setLanguage(tag: string | null): void;
  updateComments(update: (threads: CommentThread[]) => CommentThread[]): void;
}

export function useReviewState(initial: { comments?: unknown; language?: unknown }): ReviewState {
  const [comments, setComments] = useState<CommentThread[]>(() => (Array.isArray(initial.comments) && !commentsProblem(initial.comments) ? (initial.comments as CommentThread[]) : []));
  const [language, setLanguageState] = useState<string | null>(() => (isLanguageTag(initial.language) ? initial.language : null));
  const [changed, setChanged] = useState(false);
  const fields = useMemo(() => ({ comments: comments.length ? comments : undefined, language: language ?? undefined }), [comments, language]);
  const setLanguage = useCallback((tag: string | null) => {
    setLanguageState(tag && isLanguageTag(tag) ? tag : null);
    setChanged(true);
  }, []);
  const updateComments = useCallback((update: (threads: CommentThread[]) => CommentThread[]) => {
    setComments(update);
    setChanged(true);
  }, []);
  return { comments, language, fields, changed, setLanguage, updateComments };
}

/** The stored top-level fields with the review fields in place: a field that is now empty is left out. */
export function withReviewFields(stored: Record<string, unknown>, fields: ReviewState['fields']): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored, ...fields };
  for (const key of Object.keys(fields)) if (out[key] === undefined) delete out[key];
  return out;
}

/** What the Review tab and the comments panel use. */
export interface ReviewControls {
  state: ReviewState;
  /** The name new comments are written under ('' when none is set in Settings). */
  author: string;
  readOnly: boolean;
  panelOpen: boolean;
  setPanelOpen(open: boolean): void;
  /** The thread shown as current, if any. */
  active: string | null;
  /** True when text is selected that a comment could be added to. */
  canComment: boolean;
  /** Why New comment is unavailable for the current selection (null when it is available). */
  commentHint: string | null;
  /** Shown in the panel when the comment shortcut was used on a selection that cannot take a comment. */
  notice: string | null;
  /** A comment being written for the selected text (the composer is open). */
  composing: boolean;
  /** Starts a comment on the selected text and opens the panel. */
  startComment(): void;
  cancelComment(): void;
  postComment(text: string): void;
  reply(threadId: string, text: string): void;
  editEntry(threadId: string, entryId: string, text: string): void;
  setResolved(threadId: string, resolved: boolean): void;
  deleteThread(threadId: string): void;
  deleteReply(threadId: string, replyId: string): void;
  /** Selects a thread's text and scrolls to it (or just marks it current when its text was deleted). */
  focusThread(threadId: string): void;
  /** Moves to the previous or next open comment in document order. */
  step(dir: 1 | -1): void;
  /** CSS highlighting the text of open threads (and the current one); rendered with the panel. */
  highlightCss: string;
}

const now = () => new Date().toISOString();

/** Connects the review state to the editor: highlights, the composer, the language attribute, commands. */
export function useReviewControls(editor: Editor | null, state: ReviewState, opts: { authorName?: string; readOnly: boolean }): ReviewControls {
  const [panelOpen, setPanelOpen] = useState(false);
  // Stored as typed in Settings ('' when no name is set; shown as "Unknown author").
  const author = opts.authorName?.trim().slice(0, 200) ?? '';
  const { comments, updateComments } = state;
  const view = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return { active: null, pending: false, canComment: false, hint: null as string | null };
      const s = getCommentState(e.state);
      const hint = commentBlockReason(e.state);
      return { active: s?.active ?? null, pending: !!s?.pending, canComment: hint === null, hint };
    },
  }) ?? { active: null, pending: false, canComment: false, hint: null };
  const [notice, setNotice] = useState<string | null>(null);
  // The notice answers one refused attempt; it goes once the selection can take a comment or a comment starts.
  useEffect(() => {
    if (view.canComment || view.pending) setNotice(null);
  }, [view.canComment, view.pending]);

  // Threads this document has: their marks are kept when text is pasted, and clicking them shows the thread.
  if (editor && !editor.isDestroyed && editor.storage.comment) editor.storage.comment.known = new Set(comments.map((t) => t.id));
  const highlightCss = useMemo(() => commentHighlightCss(comments.filter((t) => !t.resolved).map((t) => t.id), view.active), [comments, view.active]);

  // The document language on the text: the browser's spell checker follows `lang` where it supports it.
  useEffect(() => {
    if (!editor) return;
    const apply = () => {
      if (editor.isDestroyed) return;
      let dom: HTMLElement;
      try {
        dom = editor.view.dom;
      } catch {
        return;
      }
      if (state.language) dom.setAttribute('lang', state.language);
      else dom.removeAttribute('lang');
    };
    apply();
    editor.on('mount', apply);
    return () => {
      editor.off('mount', apply);
    };
  }, [editor, state.language]);

  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const startComment = useCallback(() => {
    if (!editor || opts.readOnly) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || !canCommentOn(editor.state, from, to)) {
      // The shortcut has no disabled state to look at, so say why nothing was started.
      setNotice(commentBlockReason(editor.state));
      setPanelOpen(true);
      return;
    }
    setNotice(null);
    setCommentMeta(editor.view, { pending: { from, to }, active: null });
    setPanelOpen(true);
  }, [editor, opts.readOnly]);

  useEffect(() => {
    const onKey = () => startComment();
    const show = () => setPanelOpen(true);
    window.addEventListener(NEW_COMMENT_EVENT, onKey);
    window.addEventListener(SHOW_COMMENTS_EVENT, show);
    return () => {
      window.removeEventListener(NEW_COMMENT_EVENT, onKey);
      window.removeEventListener(SHOW_COMMENTS_EVENT, show);
    };
  }, [startComment]);

  const cancelComment = useCallback(() => {
    if (editor && !editor.isDestroyed && getCommentState(editor.state)?.pending) setCommentMeta(editor.view, { pending: null });
  }, [editor]);

  const postComment = useCallback(
    (text: string) => {
      if (!editor || !text.trim()) return;
      const pending = getCommentState(editor.state)?.pending;
      if (!pending) return;
      // Ids of threads deleted in this session are not reused (their marks are being kept off the text).
      const taken = [...commentsRef.current.flatMap((t) => [t.id, ...t.replies.map((r) => r.id)]), ...(editor.storage.comment?.deleted ?? [])];
      const id = newCommentId(taken);
      // The edit that adds the mark saves at once; the thread follows in the next save (the review fields' effect).
      // Nothing to mark (e.g. the text became a code block meanwhile): no thread without an anchor.
      if (!editor.chain().addComment(id, pending).run()) {
        setCommentMeta(editor.view, { pending: null });
        return;
      }
      updateComments((threads) => [...threads, { id, author, createdAt: now(), text: text.trim(), resolved: false, replies: [] }]);
      setCommentMeta(editor.view, { pending: null, active: id });
    },
    [editor, author, updateComments],
  );

  const reply = useCallback(
    (threadId: string, text: string) => {
      if (!text.trim()) return;
      const taken = commentsRef.current.flatMap((t) => [t.id, ...t.replies.map((r) => r.id)]);
      const entry: CommentReply = { id: newCommentId(taken), author, createdAt: now(), text: text.trim() };
      updateComments((threads) => threads.map((t) => (t.id === threadId ? { ...t, replies: [...t.replies, entry] } : t)));
    },
    [author, updateComments],
  );

  const editEntry = useCallback(
    (threadId: string, entryId: string, text: string) => {
      if (!text.trim()) return;
      const edit = <T extends CommentReply>(e: T): T => (e.text === text.trim() ? e : { ...e, text: text.trim(), editedAt: now() });
      updateComments((threads) =>
        threads.map((t) => (t.id !== threadId ? t : t.id === entryId ? edit(t) : { ...t, replies: t.replies.map((r) => (r.id === entryId ? edit(r) : r)) })),
      );
    },
    [updateComments],
  );

  const setResolved = useCallback(
    (threadId: string, resolved: boolean) => updateComments((threads) => threads.map((t) => (t.id === threadId ? { ...t, resolved } : t))),
    [updateComments],
  );

  const deleteThread = useCallback(
    (threadId: string) => {
      updateComments((threads) => threads.filter((t) => t.id !== threadId));
      if (editor && !editor.isDestroyed) {
        editor.storage.comment?.deleted.add(threadId);
        editor.commands.removeComment(threadId);
        if (getCommentState(editor.state)?.active === threadId) setCommentMeta(editor.view, { active: null });
      }
    },
    [editor, updateComments],
  );

  const deleteReply = useCallback(
    (threadId: string, replyId: string) => updateComments((threads) => threads.map((t) => (t.id === threadId ? { ...t, replies: t.replies.filter((r) => r.id !== replyId) } : t))),
    [updateComments],
  );

  const focusThread = useCallback(
    (threadId: string) => {
      if (!editor || editor.isDestroyed) return;
      const range = commentRange(editor.state.doc, threadId);
      if (!range) {
        setCommentMeta(editor.view, { active: threadId });
        return;
      }
      editor.chain().setTextSelection(range).run();
      setCommentMeta(editor.view, { active: threadId });
      const dom = editor.view.domAtPos(range.from).node;
      (dom instanceof Element ? dom : dom.parentElement)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    },
    [editor],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!editor) return;
      const open = new Set(commentsRef.current.filter((t) => !t.resolved).map((t) => t.id));
      const order: Array<{ id: string; from: number }> = [];
      const seen = new Set<string>();
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        for (const m of node.marks) {
          const id = m.attrs.commentId as string;
          if (m.type.name === 'comment' && open.has(id) && !seen.has(id)) {
            seen.add(id);
            order.push({ id, from: pos });
          }
        }
        return false;
      });
      if (!order.length) return;
      const current = getCommentState(editor.state)?.active;
      const i = order.findIndex((o) => o.id === current);
      const head = editor.state.selection.from;
      const next =
        i >= 0
          ? order[(i + dir + order.length) % order.length]
          : dir === 1
            ? (order.find((o) => o.from >= head) ?? order[0])
            : ([...order].reverse().find((o) => o.from < head) ?? order[order.length - 1]);
      focusThread(next.id);
      setPanelOpen(true);
    },
    [editor, focusThread],
  );

  // Closing the panel abandons a comment that is still being written (its selection highlight goes too).
  const showPanel = useCallback(
    (open: boolean) => {
      if (!open) cancelComment();
      setPanelOpen(open);
    },
    [cancelComment],
  );

  return {
    state,
    author,
    readOnly: opts.readOnly,
    panelOpen,
    setPanelOpen: showPanel,
    active: view.active,
    canComment: view.canComment && !opts.readOnly,
    commentHint: opts.readOnly ? 'This document is read-only.' : view.hint,
    notice,
    composing: view.pending,
    startComment,
    cancelComment,
    postComment,
    reply,
    editEntry,
    setResolved,
    deleteThread,
    deleteReply,
    focusThread,
    step,
    highlightCss,
  };
}
