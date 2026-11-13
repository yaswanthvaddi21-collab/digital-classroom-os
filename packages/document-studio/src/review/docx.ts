/**
 * DOCX export of the Review features: comments as real Word comments (comments.xml, with replies and the resolved
 * state in commentsExtended.xml), and the document language as Word's default proofing language.
 */
import type { JSONContent } from '@tiptap/core';
import { CommentRangeEnd, CommentRangeStart, CommentReference, Paragraph, TextRun, type ICommentOptions, type ParagraphChild } from 'docx';
import type { Ctx } from '../export/docx/context';
import type { DocumentContributor } from '../export/docx/document';
import { NOTES } from '../export/report';
import { commentIdsOf, commentsProblem, initialsOf, orderThreads, UNKNOWN_AUTHOR, type CommentThread } from './comments';
import { isLanguageTag } from './language';

interface ExportedComment {
  thread: CommentThread;
  /** Word comment id (w:id) of the thread; its replies follow it. */
  num: number;
  /** Text runs carrying the thread's mark in the body. */
  total: number;
  emitted: number;
  ended: boolean;
}

interface CommentExport {
  byId: Map<string, ExportedComment>;
  order: ExportedComment[];
  detached: CommentThread[];
}

/**
 * Keyed by the export's own bookmark allocator: it is created once per buildDocx call and shared by the copies of
 * the context that table cells and other nested content use, so a comment spanning into a cell is one comment.
 */
const exports = new WeakMap<object, CommentExport>();

function threadsOf(ctx: Ctx): CommentThread[] {
  const raw = (ctx.content as { comments?: unknown }).comments;
  return Array.isArray(raw) && !commentsProblem(raw) ? (raw as CommentThread[]) : [];
}

/** Per-export state: Word ids in text order, and how many runs each comment covers (counted before conversion). */
function stateOf(ctx: Ctx): CommentExport {
  let s = exports.get(ctx.bookmarkId);
  if (s) return s;
  const threads = threadsOf(ctx);
  const doc = ctx.content.doc;
  const { anchored, detached } = orderThreads(threads, doc);
  const totals = new Map<string, number>();
  const walk = (n: JSONContent) => {
    if (n.type === 'text') for (const id of commentIdsOf(n)) totals.set(id, (totals.get(id) ?? 0) + 1);
    else n.content?.forEach(walk);
  };
  walk(doc);
  const byId = new Map<string, ExportedComment>();
  const order: ExportedComment[] = [];
  let next = 0;
  for (const thread of anchored) {
    const c = { thread, num: next, total: totals.get(thread.id) ?? 0, emitted: 0, ended: false };
    next += 1 + thread.replies.length;
    byId.set(thread.id, c);
    order.push(c);
  }
  s = { byId, order, detached };
  exports.set(ctx.bookmarkId, s);
  return s;
}

/**
 * Wraps a text node's runs in the ranges of the comments it carries: the range starts before the comment's first
 * run and ends (with Word's comment reference) after its last, so a comment over several paragraphs, list items
 * or table cells is one Word comment. Registered in TEXT_RUN_WRAPPERS (export/docx/inlines.ts).
 */
export function wrapCommentRuns(node: JSONContent, children: ParagraphChild[], ctx: Ctx): ParagraphChild[] {
  const ids = commentIdsOf(node);
  if (!ids.length) return children;
  const s = stateOf(ctx);
  const before: ParagraphChild[] = [];
  const after: ParagraphChild[] = [];
  for (const id of ids) {
    const c = s.byId.get(id);
    if (!c || c.ended) continue;
    if (c.emitted === 0) before.push(new CommentRangeStart(c.num));
    c.emitted += 1;
    if (c.emitted >= c.total) {
      after.unshift(new CommentRangeEnd(c.num), new TextRun({ children: [new CommentReference(c.num)] }));
      c.ended = true;
    }
  }
  return [...before, ...children, ...after];
}

const paragraphsOf = (text: string) => text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }));

/** Writes the comments (and closes any range whose last run a converter left out, at the end of the body). */
export const commentsContributor: DocumentContributor = (options, ctx) => {
  const s = stateOf(ctx);
  if (!s.order.length && !s.detached.length) return;
  const unclosed = s.order.filter((c) => c.emitted > 0 && !c.ended);
  if (unclosed.length) {
    const sections = options.sections as Array<{ children: unknown[] }>;
    sections[sections.length - 1]?.children.push(
      new Paragraph({ children: unclosed.flatMap((c) => [new CommentRangeEnd(c.num), new TextRun({ children: [new CommentReference(c.num)] })]) }),
    );
    unclosed.forEach((c) => (c.ended = true));
  }
  const exported = s.order.filter((c) => c.emitted > 0);
  const children: ICommentOptions[] = [];
  for (const { thread, num } of exported) {
    const entry = (e: CommentThread | CommentThread['replies'][number], id: number, parentId?: number): ICommentOptions => {
      const author = e.author || UNKNOWN_AUTHOR;
      const date = new Date(e.createdAt);
      return { id, author, initials: initialsOf(author), date: Number.isNaN(date.getTime()) ? undefined : date, children: paragraphsOf(e.text), parentId, resolved: thread.resolved };
    };
    children.push(entry(thread, num));
    thread.replies.forEach((r, i) => children.push(entry(r, num + 1 + i, num)));
  }
  if (children.length) options.comments = { children };
  const left = s.detached.length + (s.order.length - exported.length);
  if (left) NOTES.commentsLeftOut(ctx.report, left);
  // docx writes the resolved state (commentsExtended.xml) only for documents that have a reply.
  const threaded = exported.some((c) => c.thread.replies.length);
  const resolvedOpen = threaded ? 0 : exported.filter((c) => c.thread.resolved).length;
  if (resolvedOpen) NOTES.resolvedCommentsOpen(ctx.report, resolvedOpen);
};

const EAST_ASIAN = ['zh', 'ja', 'ko'];
const RIGHT_TO_LEFT = ['ar', 'he', 'fa', 'ur'];

/** The document language as Word's default language (w:lang in the document defaults), which Word proofs in. */
export const languageContributor: DocumentContributor = (options, ctx) => {
  const lang = (ctx.content as { language?: unknown }).language;
  if (!isLanguageTag(lang)) return;
  const primary = lang.split('-')[0].toLowerCase();
  const language = EAST_ASIAN.includes(primary) ? { eastAsia: lang } : RIGHT_TO_LEFT.includes(primary) ? { bidirectional: lang } : { value: lang };
  const styles = options.styles ?? {};
  const defaults = styles.default ?? {};
  const document = defaults.document ?? {};
  options.styles = { ...styles, default: { ...defaults, document: { ...document, run: { ...document.run, language } } } };
};
