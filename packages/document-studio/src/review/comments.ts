import type { JSONContent } from '@tiptap/core';

/**
 * Comments. The commented text carries a `comment` mark holding the thread's id; the threads themselves (author,
 * time, text, replies, resolved) are stored beside the body in the document content's `comments` field. A thread
 * whose text has been deleted stays stored (so undo brings the comment back) and is listed as "on deleted text".
 *
 * This module has no imports from types.ts, so types.ts can register the field's check (CONTENT_FIELDS).
 */
export interface CommentReply {
  id: string;
  author: string;
  /** ISO 8601 time the reply was written. */
  createdAt: string;
  text: string;
  /** ISO 8601 time of the last edit, if edited. */
  editedAt?: string;
}

export interface CommentThread extends CommentReply {
  resolved: boolean;
  replies: CommentReply[];
}

/** Ids are stored in the body (mark attribute) and in the thread list: short, and safe in HTML and CSS. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT = 20_000;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v: unknown) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

const REPLY_FIELDS = ['id', 'author', 'createdAt', 'text', 'editedAt'];
const THREAD_FIELDS = [...REPLY_FIELDS, 'resolved', 'replies'];

function entryProblem(v: unknown, fields: string[], what: string): string | null {
  if (!isObject(v)) return `a ${what} is not valid`;
  const extra = Object.keys(v).filter((k) => !fields.includes(k) && v[k] !== undefined);
  if (extra.length) return `a ${what} has fields this version does not know (${extra.join(', ')})`;
  if (typeof v.id !== 'string' || !ID.test(v.id)) return `a ${what} has an invalid id`;
  if (typeof v.author !== 'string' || v.author.length > 200) return `a ${what} has an invalid author`;
  if (!isTime(v.createdAt)) return `a ${what} has an invalid time`;
  if (v.editedAt !== undefined && !isTime(v.editedAt)) return `a ${what} has an invalid edit time`;
  if (typeof v.text !== 'string' || v.text.length > MAX_TEXT) return `a ${what} has invalid text`;
  return null;
}

/**
 * Checks a stored `comments` field (CONTENT_FIELDS): returns a problem, or null when this version can keep it
 * exactly. Anything else opens the document in the protected view, so a save can never drop part of it.
 */
export function commentsProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'the comments are not a list';
  const ids = new Set<string>();
  for (const thread of value) {
    const problem = entryProblem(thread, THREAD_FIELDS, 'comment');
    if (problem) return problem;
    const t = thread as Record<string, unknown>;
    if (typeof t.resolved !== 'boolean') return 'a comment has an invalid resolved state';
    if (!Array.isArray(t.replies)) return 'a comment has invalid replies';
    for (const reply of t.replies) {
      const p = entryProblem(reply, REPLY_FIELDS, 'comment reply');
      if (p) return p;
      if (ids.has((reply as CommentReply).id)) return 'two comments share an id';
      ids.add((reply as CommentReply).id);
    }
    if (ids.has(t.id as string)) return 'two comments share an id';
    ids.add(t.id as string);
  }
  return null;
}

export const isCommentId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

/** A new id, unique within `taken`. */
export function newCommentId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

/** Initials for Word's comment balloons: "Ada Lovelace" → "AL". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 3)
    .map((p) => Array.from(p)[0]!.toUpperCase())
    .join('');
}

/** Shown when no name is set in Settings. */
export const UNKNOWN_AUTHOR = 'Unknown author';

/** The comment ids each text node carries, in document order (comment marks on anything but text are ignored). */
export function commentIdsOf(node: JSONContent): string[] {
  return (node.marks ?? []).filter((m) => m.type === 'comment' && isCommentId(m.attrs?.commentId)).map((m) => m.attrs!.commentId as string);
}

/** Every comment id used in a document body, in the order its text first appears, with its text. */
export function commentAnchors(doc: JSONContent): Map<string, { text: string; count: number }> {
  const out = new Map<string, { text: string; count: number }>();
  const walk = (n: JSONContent) => {
    if (n.type === 'text') {
      for (const id of commentIdsOf(n)) {
        const a = out.get(id) ?? { text: '', count: 0 };
        a.text += n.text ?? '';
        a.count += 1;
        out.set(id, a);
      }
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/** Threads in the order their text appears in the document; threads whose text was deleted come last. */
export function orderThreads(threads: CommentThread[], doc: JSONContent): { anchored: CommentThread[]; detached: CommentThread[] } {
  const anchors = [...commentAnchors(doc).keys()];
  const rank = new Map(anchors.map((id, i) => [id, i]));
  const anchored = threads.filter((t) => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const detached = threads.filter((t) => !rank.has(t.id));
  return { anchored, detached };
}

/** A plain-text list of the comments, for the end of a TXT export. Empty when there are none. */
export function commentsAppendix(threads: CommentThread[] | undefined, doc: JSONContent): string {
  if (!threads?.length) return '';
  const anchors = commentAnchors(doc);
  const { anchored, detached } = orderThreads(threads, doc);
  const lines = ['Comments', ''];
  const entry = (r: CommentReply) => `${r.author || UNKNOWN_AUTHOR} (${r.createdAt.slice(0, 10)}): ${r.text.replace(/\s*\n\s*/g, ' ')}`;
  [...anchored, ...detached].forEach((t, i) => {
    const on = anchors.get(t.id)?.text.trim();
    lines.push(`[${i + 1}] ${on ? `On “${on.length > 80 ? `${on.slice(0, 79)}…` : on}”` : 'On deleted text'}${t.resolved ? ' (resolved)' : ''}`);
    lines.push(`    ${entry(t)}`);
    for (const r of t.replies) lines.push(`    Reply — ${entry(r)}`);
    lines.push('');
  });
  return lines.join('\n');
}
