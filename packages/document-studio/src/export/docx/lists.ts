import type { JSONContent } from '@tiptap/core';
import { AlignmentType, LevelFormat, Paragraph } from 'docx';
import type { Block, Ctx, DocxApi } from './context';
import { listContinuationIndent, styledListReference, styledNumbering } from './format'; // G-FORMAT
import { paragraphLook } from './paragraph';

export function list(node: JSONContent, ctx: Ctx, api: DocxApi, level: number, ordered: boolean): Block[] {
  const instance = ++ctx.listInstance;
  // A numbered list that starts at N gets a numbering definition starting at N (shared by all lists starting at N).
  const start = ordered ? Math.max(1, Number(node.attrs?.start) || 1) : 1;
  // G-FORMAT: a list with a bullet style or number format has its own numbering definition.
  const styled = styledListReference(node, ordered, start, ctx);
  if (start !== 1 && !styled) ctx.orderedStarts.add(start);
  const reference = styled ?? (!ordered ? 'dcos-bullet' : start === 1 ? 'dcos-ordered' : `dcos-ordered-from-${start}`);
  if (start !== 1) noteStartLevel(ctx, reference, level);
  const out: Block[] = [];
  for (const item of node.content ?? []) {
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...list(child, ctx, api, Math.min(level + 1, 8), child.type === 'orderedList'));
      } else if (child.type === 'paragraph') {
        out.push(
          new Paragraph({
            children: api.inlines(child.content, ctx),
            ...paragraphLook(child, first ? level : undefined),
            // Continuation paragraphs in the same item are indented but not numbered (keeping their own indents).
            ...(first ? { numbering: { reference, level, instance } } : { indent: listContinuationIndent(child, level) }),
          }),
        );
        first = false;
      } else {
        // Images, tables, code and quotes inside a list item are kept, not dropped (audit CODE-4).
        out.push(...api.blocks([child], ctx));
        first = false;
      }
    }
  }
  return out;
}

export const listLevels = (ordered: boolean, start = 1) =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    start: level === 0 ? start : 1,
    format: ordered ? [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3] : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

/**
 * A list that starts at N is written at the level of its nesting depth (w:ilvl), but its definition used to carry N
 * on level 0 only, so a nested list starting at 4 began at 1 in Word. The levels a list starting at N is actually
 * used at are noted here, and get N as their start too. Unused levels are left as they were, so documents without
 * such a nested list export exactly as before.
 */
const startLevels = new WeakMap<Ctx, Map<string, Set<number>>>();
function noteStartLevel(ctx: Ctx, reference: string, level: number) {
  let map = startLevels.get(ctx);
  if (!map) startLevels.set(ctx, (map = new Map()));
  map.set(reference, (map.get(reference) ?? new Set()).add(level));
}
function withStartLevels<L extends { level: number; start: number }>(ctx: Ctx, reference: string, levels: L[]): L[] {
  const used = startLevels.get(ctx)?.get(reference);
  if (!used) return levels;
  return levels.map((l) => (used.has(l.level) ? { ...l, start: levels[0].start } : l));
}

/** The numbering definitions the converted body used. */
export function numberingConfig(ctx: Ctx) {
  return [
    { reference: 'dcos-bullet', levels: listLevels(false) },
    { reference: 'dcos-ordered', levels: listLevels(true) },
    ...[...ctx.orderedStarts].map((start) => ({ reference: `dcos-ordered-from-${start}`, levels: withStartLevels(ctx, `dcos-ordered-from-${start}`, listLevels(true, start)) })),
    ...styledNumbering(ctx).map((d) => ({ ...d, levels: withStartLevels(ctx, d.reference, d.levels) })), // G-FORMAT
  ];
}
