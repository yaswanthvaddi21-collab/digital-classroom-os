import type { JSONContent } from '@tiptap/core';
import { ExternalHyperlink, TextRun, type ParagraphChild } from 'docx';
import { exportHref } from '../../links';
import { wrapCommentRuns } from '../../review/docx';
import { NOTES } from '../report';
import { inlineMathHandler } from './insert'; // G-INSERT
import type { Ctx, DocxApi, InlineHandler, RunStyle } from './context';
import { runStyle } from './marks';

/** Inline nodes other than text. Unknown inline nodes are skipped. */
export const INLINE_HANDLERS: Record<string, InlineHandler> = {
  hardBreak: () => [new TextRun({ break: 1 })],
  // @phase4:docx-inlines — register new inline nodes here.
  inlineMath: inlineMathHandler, // G-INSERT: a Word equation in the line (see docx/insert.ts)
};

/**
 * Adds siblings around the Word runs of one text node (e.g. comment range starts and ends), in order. A wrapper
 * returns the runs it was given, with anything it adds before or after them.
 */
export const TEXT_RUN_WRAPPERS: Array<(node: JSONContent, runs: ParagraphChild[], ctx: Ctx) => ParagraphChild[]> = [
  wrapCommentRuns, // G-REVIEW: comment ranges
  // @phase4:docx-run-wrappers — register further text-run wrappers here.
];

function textRun(n: JSONContent, ctx: Ctx, extra: RunStyle): ParagraphChild {
  const style = { ...extra, ...runStyle(n.marks, ctx) };
  const link = n.marks?.find((m) => m.type === 'link');
  if (link?.attrs?.href) {
    // Only addresses the editor allows (no javascript: from a crafted file); others become plain text (audit DS-7).
    const href = exportHref(link.attrs.href);
    if (href) return new ExternalHyperlink({ link: href, children: [new TextRun({ ...style, text: n.text ?? '', style: 'Hyperlink' })] });
    ctx.report.once(`link:${String(link.attrs.href)}`, NOTES.unsafeLink);
  }
  return new TextRun({ ...style, text: n.text ?? '' });
}

export function inlines(nodes: JSONContent[] = [], ctx: Ctx, extra: RunStyle = {}, api: DocxApi): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === 'text') out.push(...TEXT_RUN_WRAPPERS.reduce((runs, wrap) => wrap(n, runs, ctx), [textRun(n, ctx, extra)]));
    else if (n.type && INLINE_HANDLERS[n.type]) out.push(...INLINE_HANDLERS[n.type](n, ctx, extra, api));
  }
  return out;
}
