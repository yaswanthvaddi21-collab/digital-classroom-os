import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Paragraph formatting (Release 0.2.x, schema 2): line spacing, space before/after, indentation (left, right, first
 * line or hanging) on paragraphs and headings, and the named paragraph styles Title, Subtitle and Caption.
 *
 * Units: spacing and indents are stored in points; line spacing as a Word "multiple" (1 = single). Every attribute
 * defaults to null, which means "as before" (the editor's built-in look), so documents that never use these stay
 * exactly as v0.1.0 stored them (schema 1). Each attribute is rendered as a data-* attribute (read back on paste)
 * plus inline CSS, so the editor, the clipboard and the print page all show the same thing.
 */

/** Word's "single" line for Calibri/Carlito is 1.2207 em, so Word multiple m is CSS line-height m × 1.2207. */
export const WORD_SINGLE_LINE = 1.2207;
export const LINE_SPACING_PRESETS = [1, 1.15, 1.5, 2] as const;
export const LINE_SPACING_LIMITS = { min: 0.5, max: 5 } as const;
export const SPACING_LIMITS_PT = { min: 0, max: 200 } as const;
/** Indents may not exceed this (about 35 cm): wider than any page. */
export const INDENT_LIMIT_PT = 1000;
/** Increase/decrease indent moves to the next multiple of half an inch, as Word does. */
export const INDENT_STEP_PT = 36;

/** Named paragraph styles stored on a paragraph (Normal is "no style"; headings, Quote and Code have their own nodes). */
export const PARAGRAPH_STYLES = ['title', 'subtitle', 'caption'] as const;
export type ParagraphStyleName = (typeof PARAGRAPH_STYLES)[number];

/** Every style the Styles list offers, in order, with how it is stored. */
export const NAMED_STYLES = [
  { id: 'normal', label: 'Normal' },
  { id: 'title', label: 'Title' },
  { id: 'subtitle', label: 'Subtitle' },
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
  { id: 'h4', label: 'Heading 4' },
  { id: 'quote', label: 'Quote' },
  { id: 'caption', label: 'Caption' },
  { id: 'code', label: 'Code' },
] as const;
export type NamedStyleId = (typeof NAMED_STYLES)[number]['id'];

const FORMAT_TYPES = ['paragraph', 'heading'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** A finite number within [min, max] (rounded to 0.01), or null. */
export function clampNumber(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return round2(Math.min(max, Math.max(min, n)));
}
const lineSpacingValue = (v: unknown) => clampNumber(v, LINE_SPACING_LIMITS.min, LINE_SPACING_LIMITS.max);
const spacingValue = (v: unknown) => clampNumber(v, SPACING_LIMITS_PT.min, SPACING_LIMITS_PT.max);
const indentValue = (v: unknown) => clampNumber(v, 0, INDENT_LIMIT_PT);
const firstLineValue = (v: unknown) => clampNumber(v, -INDENT_LIMIT_PT, INDENT_LIMIT_PT);
const styleValue = (v: unknown): ParagraphStyleName | null => ((PARAGRAPH_STYLES as readonly unknown[]).includes(v) ? (v as ParagraphStyleName) : null);

/** CSS line-height for a Word line-spacing multiple. */
export const cssLineHeight = (multiple: number) => Math.round(multiple * WORD_SINGLE_LINE * 10000) / 10000;

export interface ParagraphFormat {
  lineSpacing: number | null;
  spaceBefore: number | null;
  spaceAfter: number | null;
  indentLeft: number | null;
  indentRight: number | null;
  /** Positive: first-line indent. Negative: hanging indent. */
  indentFirstLine: number | null;
}
export type IndentPatch = Partial<Pick<ParagraphFormat, 'indentLeft' | 'indentRight' | 'indentFirstLine'>>;

type AttrSpec = {
  parse: (v: unknown) => unknown;
  data: string;
  css: (v: never) => string;
};
const FORMAT_ATTRS: Record<keyof ParagraphFormat, AttrSpec> = {
  lineSpacing: { parse: lineSpacingValue, data: 'data-line-spacing', css: (v: number) => `line-height: ${cssLineHeight(v)}` },
  // Explicit spacing is padding, so it adds up with the neighbouring paragraph's spacing as in Word (margins would collapse).
  spaceBefore: { parse: spacingValue, data: 'data-space-before', css: (v: number) => `margin-top: 0; padding-top: ${v}pt` },
  spaceAfter: { parse: spacingValue, data: 'data-space-after', css: (v: number) => `margin-bottom: 0; padding-bottom: ${v}pt` },
  indentLeft: { parse: indentValue, data: 'data-indent-left', css: (v: number) => `margin-left: ${v}pt` },
  indentRight: { parse: indentValue, data: 'data-indent-right', css: (v: number) => `margin-right: ${v}pt` },
  indentFirstLine: { parse: firstLineValue, data: 'data-indent-first-line', css: (v: number) => `text-indent: ${v}pt` },
};
export const FORMAT_ATTR_NAMES = Object.keys(FORMAT_ATTRS) as Array<keyof ParagraphFormat>;

/** The paragraph-format attributes of a node (paragraph or heading), validated. */
export function formatOf(attrs: Record<string, unknown> | undefined | null): ParagraphFormat {
  const a = attrs ?? {};
  const indentLeft = indentValue(a.indentLeft);
  return {
    lineSpacing: lineSpacingValue(a.lineSpacing),
    spaceBefore: spacingValue(a.spaceBefore),
    spaceAfter: spacingValue(a.spaceAfter),
    indentLeft,
    indentRight: indentValue(a.indentRight),
    indentFirstLine: hangingWithin(firstLineValue(a.indentFirstLine), indentLeft),
  };
}

/**
 * A hanging indent never reaches past the left indent (the first line would start left of the page edge). The
 * commands already keep to this; pasted HTML and stored JSON are held to it here, when read and when shown.
 */
function hangingWithin(first: number | null, left: number | null): number | null {
  if (first === null || first >= 0 || -first <= (left ?? 0)) return first;
  return left ? -left : null;
}
export const paragraphStyleOf = (attrs: Record<string, unknown> | undefined | null) => styleValue(attrs?.paragraphStyle);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      /** Line spacing as a Word multiple (1, 1.15, 1.5, 2 or custom); null returns to the default. */
      setLineSpacing: (multiple: number | null) => ReturnType;
      /** Space before/after in points; null returns to the default. Omitted sides are unchanged. */
      setParagraphSpacing: (spacing: { before?: number | null; after?: number | null }) => ReturnType;
      /** Indents in points (first line: negative for hanging); null removes. Omitted ones are unchanged. */
      setParagraphIndent: (indent: IndentPatch) => ReturnType;
      /** Increase indent: demotes a list item, otherwise moves the left indent to the next half inch. */
      increaseIndent: () => ReturnType;
      /** Decrease indent: promotes a list item, otherwise moves the left indent to the previous half inch. */
      decreaseIndent: () => ReturnType;
      /** Title, Subtitle or Caption on the selected paragraphs; null makes them Normal. */
      setParagraphStyle: (style: ParagraphStyleName | null) => ReturnType;
    };
  }
}

/** The paragraphs and headings a command applies to: every one the selection touches. */
export function selectedBlocks(state: EditorState): Array<{ node: PMNode; pos: number }> {
  const out: Array<{ node: PMNode; pos: number }> = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, Math.max(to, from), (node, pos) => {
      if ((FORMAT_TYPES as readonly string[]).includes(node.type.name)) {
        if (!seen.has(pos)) {
          seen.add(pos);
          out.push({ node, pos });
        }
        return false;
      }
      return true;
    });
  }
  // An empty selection at a block boundary may touch nothing: use the cursor's own textblock.
  if (!out.length) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if ((FORMAT_TYPES as readonly string[]).includes(node.type.name)) {
        out.push({ node, pos: $from.before(d) });
        break;
      }
    }
  }
  return out;
}

function updateBlocks(
  tr: Transaction,
  state: EditorState,
  patch: (node: PMNode, inListItem: boolean) => Record<string, unknown> | null,
  types: readonly string[] = FORMAT_TYPES,
) {
  let changed = false;
  for (const { node, pos } of selectedBlocks(state)) {
    if (!types.includes(node.type.name)) continue;
    const attrs = patch(node, state.doc.resolve(pos).parent.type.name === 'listItem');
    if (!attrs) continue;
    const next = { ...node.attrs, ...attrs };
    if (Object.keys(attrs).every((k) => node.attrs[k] === next[k])) continue;
    // Positions come from the transaction's current document (commands in a chain see it), so no mapping.
    tr.setNodeMarkup(pos, undefined, next);
    changed = true;
  }
  return changed;
}

const inList = (state: EditorState) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'listItem') return true;
  return false;
};

/**
 * Keeps a first-line/hanging indent from moving text left of the page edge (left + first line ≥ 0). A paragraph in a
 * list item takes no first-line or hanging indent: its number or bullet already hangs, and Word could not show both.
 */
function withIndent(node: PMNode, patch: IndentPatch, inListItem = false) {
  const cur = formatOf(node.attrs);
  const left = patch.indentLeft !== undefined ? indentValue(patch.indentLeft) : cur.indentLeft;
  const right = patch.indentRight !== undefined ? indentValue(patch.indentRight) : cur.indentRight;
  let first = patch.indentFirstLine !== undefined ? firstLineValue(patch.indentFirstLine) : cur.indentFirstLine;
  if (first !== null && first < 0 && -first > (left ?? 0)) first = -(left ?? 0);
  if (inListItem) first = null;
  return { indentLeft: left || null, indentRight: right || null, indentFirstLine: first || null };
}

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    const attributes = Object.fromEntries(
      Object.entries(FORMAT_ATTRS).map(([name, spec]) => [
        name,
        {
          default: null,
          keepOnSplit: true,
          parseHTML: (el: HTMLElement) =>
            name === 'indentFirstLine'
              ? hangingWithin(firstLineValue(el.getAttribute(spec.data)), indentValue(el.getAttribute(FORMAT_ATTRS.indentLeft.data)))
              : spec.parse(el.getAttribute(spec.data)),
          renderHTML: (attrs: Record<string, unknown>) => {
            const v = name === 'indentFirstLine' ? formatOf(attrs).indentFirstLine : spec.parse(attrs[name]);
            return v === null ? {} : { [spec.data]: String(v), style: spec.css(v as never) };
          },
        },
      ]),
    );
    return [
      { types: [...FORMAT_TYPES], attributes },
      {
        types: ['paragraph'],
        attributes: {
          paragraphStyle: {
            default: null,
            // Like Word's "next style": pressing Enter after a Title starts a Normal paragraph.
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => styleValue(el.getAttribute('data-paragraph-style')),
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = styleValue(attrs.paragraphStyle);
              return v ? { 'data-paragraph-style': v } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (multiple) =>
        ({ tr, state, dispatch }) => {
          const v = multiple === null ? null : lineSpacingValue(multiple);
          if (multiple !== null && v === null) return false;
          const changed = updateBlocks(tr, state, () => ({ lineSpacing: v }));
          if (changed) dispatch?.(tr);
          return changed;
        },
      setParagraphSpacing:
        (spacing) =>
        ({ tr, state, dispatch }) => {
          const attrs: Record<string, unknown> = {};
          if (spacing.before !== undefined) attrs.spaceBefore = spacing.before === null ? null : spacingValue(spacing.before);
          if (spacing.after !== undefined) attrs.spaceAfter = spacing.after === null ? null : spacingValue(spacing.after);
          const changed = updateBlocks(tr, state, () => attrs);
          if (changed) dispatch?.(tr);
          return changed;
        },
      setParagraphIndent:
        (indent) =>
        ({ tr, state, dispatch }) => {
          const changed = updateBlocks(tr, state, (node, inListItem) => withIndent(node, indent, inListItem));
          if (changed) dispatch?.(tr);
          return changed;
        },
      increaseIndent:
        () =>
        ({ state, commands, tr, dispatch }) => {
          if (inList(state)) return commands.sinkListItem('listItem');
          const changed = updateBlocks(tr, state, (node) => {
            const left = formatOf(node.attrs).indentLeft ?? 0;
            const next = Math.min(INDENT_LIMIT_PT, (Math.floor(left / INDENT_STEP_PT + 1e-6) + 1) * INDENT_STEP_PT);
            return withIndent(node, { indentLeft: next });
          });
          if (changed) dispatch?.(tr);
          return changed;
        },
      decreaseIndent:
        () =>
        ({ state, commands, tr, dispatch }) => {
          if (inList(state)) return commands.liftListItem('listItem');
          const changed = updateBlocks(tr, state, (node) => {
            const left = formatOf(node.attrs).indentLeft ?? 0;
            if (left <= 0) return null;
            const next = Math.max(0, (Math.ceil(left / INDENT_STEP_PT - 1e-6) - 1) * INDENT_STEP_PT);
            return withIndent(node, { indentLeft: next });
          });
          if (changed) dispatch?.(tr);
          return changed;
        },
      setParagraphStyle:
        (style) =>
        ({ tr, state, dispatch }) => {
          const v = style === null ? null : styleValue(style);
          if (style !== null && v === null) return false;
          const changed = updateBlocks(tr, state, () => ({ paragraphStyle: v }), ['paragraph']);
          if (changed) dispatch?.(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Word's shortcuts for indent and outdent. Ctrl on every platform: on a Mac, ⌘M minimises the window.
      'Ctrl-m': () => this.editor.commands.increaseIndent(),
      'Ctrl-Shift-m': () => this.editor.commands.decreaseIndent(),
    };
  },
});

/** Whether a paragraph at `pos` is directly inside a list item (it then takes no first-line or hanging indent). */
export const isListParagraph = (state: EditorState, pos: number) => state.doc.resolve(pos).parent.type.name === 'listItem';

/** The block the cursor is in (paragraph or heading), with its position, or null (e.g. inside a code block). */
export function currentBlock(state: EditorState): { node: PMNode; pos: number; depth: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if ((FORMAT_TYPES as readonly string[]).includes(node.type.name)) return { node, pos: $from.before(d), depth: d };
  }
  return null;
}

/** The named style of the block at the cursor, as the Styles list shows it. */
export function currentNamedStyle(editor: Editor): NamedStyleId {
  const { $from } = editor.state.selection;
  let inQuote = false;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'blockquote') inQuote = true;
  const parent = $from.parent;
  if (parent.type.name === 'codeBlock') return 'code';
  if (parent.type.name === 'heading') return `h${Math.min(Math.max(Number(parent.attrs.level) || 1, 1), 4)}` as NamedStyleId;
  if (parent.type.name === 'paragraph') {
    const style = paragraphStyleOf(parent.attrs);
    if (style) return style;
    if (inQuote) return 'quote';
  }
  return 'normal';
}

/**
 * Applies a named style to the selected blocks. Headings, Quote and Code use the nodes v0.1.0 already had (heading,
 * blockquote, code block); Title, Subtitle and Caption are paragraphs with a style.
 */
export function applyNamedStyle(editor: Editor, id: NamedStyleId): boolean {
  const chain = () => editor.chain().focus();
  const leaveQuote = () => (editor.isActive('blockquote') ? chain().lift('blockquote').run() : true);
  switch (id) {
    case 'quote':
      chain().setParagraph().setParagraphStyle(null).run();
      return editor.isActive('blockquote') || chain().wrapIn('blockquote').run();
    case 'code':
      leaveQuote();
      return chain().setCodeBlock().run();
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      leaveQuote();
      return chain().setHeading({ level: Number(id.slice(1)) as 1 | 2 | 3 | 4 }).run();
    case 'normal':
      leaveQuote();
      return chain().setParagraph().setParagraphStyle(null).run();
    default:
      leaveQuote();
      return chain().setParagraph().setParagraphStyle(id).run();
  }
}
