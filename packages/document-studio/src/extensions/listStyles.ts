import { Extension, type CommandProps } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

/**
 * List styles (Release 0.2.x, schema 2): the bullet glyph of a bulleted list and the number format of a numbered
 * list. The start number uses orderedList.start, which v0.1.0 already stored.
 *
 * Both attributes default to null, meaning the editor's level-based default (•/◦/▪ and 1./a./i.), so existing lists
 * are unchanged. A style applies to the list's own items; lists nested inside keep their own setting.
 */

export const BULLET_STYLES = [
  { id: 'disc', label: 'Filled circle', glyph: '•', css: 'disc' },
  { id: 'circle', label: 'Hollow circle', glyph: '◦', css: 'circle' },
  { id: 'square', label: 'Square', glyph: '▪', css: 'square' },
  { id: 'dash', label: 'Dash', glyph: '–', css: '"–  "' },
  { id: 'arrow', label: 'Arrow', glyph: '→', css: '"→  "' },
] as const;
export type BulletStyle = (typeof BULLET_STYLES)[number]['id'];

export const NUMBER_FORMATS = [
  { id: 'decimal', label: '1, 2, 3', css: 'decimal' },
  { id: 'lower-alpha', label: 'a, b, c', css: 'lower-alpha' },
  { id: 'upper-alpha', label: 'A, B, C', css: 'upper-alpha' },
  { id: 'lower-roman', label: 'i, ii, iii', css: 'lower-roman' },
  { id: 'upper-roman', label: 'I, II, III', css: 'upper-roman' },
] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number]['id'];

/** Largest start number offered (Word allows up to 32767). */
export const MAX_LIST_START = 32767;

export const bulletStyleOf = (v: unknown): BulletStyle | null => (BULLET_STYLES.some((s) => s.id === v) ? (v as BulletStyle) : null);
export const numberFormatOf = (v: unknown): NumberFormat | null => (NUMBER_FORMATS.some((s) => s.id === v) ? (v as NumberFormat) : null);
export const bulletGlyph = (style: BulletStyle) => BULLET_STYLES.find((s) => s.id === style)!.glyph;

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  for (const [value, letters] of table) while (n >= value) (out += letters), (n -= value);
  return out;
}
function alpha(n: number): string {
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/** The number n written in a list number format, as the browser and Word write it (a…z, aa…; i, ii…). */
export function formatListNumber(n: number, format: NumberFormat): string {
  if (n <= 0 || format === 'decimal') return String(n);
  switch (format) {
    case 'lower-alpha':
      return alpha(n);
    case 'upper-alpha':
      return alpha(n).toUpperCase();
    case 'lower-roman':
      return roman(n);
    case 'upper-roman':
      return roman(n).toUpperCase();
  }
}

/** Clamps a start number to what Word and the browser accept. */
export const listStartOf = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_LIST_START, Math.max(1, n)) : 1;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyles: {
      /** Bullet glyph of the list at the cursor (making the selection a bulleted list first); null for the default. */
      setBulletStyle: (style: BulletStyle | null) => ReturnType;
      /** Number format of the list at the cursor (making the selection a numbered list first); null for the default. */
      setNumberFormat: (format: NumberFormat | null) => ReturnType;
      /** Start number of the numbered list at the cursor. */
      setListStart: (start: number) => ReturnType;
    };
  }
}

/** The innermost list of a type around the cursor. */
export function listAt(state: EditorState, type: 'bulletList' | 'orderedList') {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') return node.type.name === type ? { node, pos: $from.before(d) } : null;
  }
  return null;
}

export const ListStyles = Extension.create({
  name: 'listStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['bulletList'],
        attributes: {
          bulletStyle: {
            default: null,
            parseHTML: (el: HTMLElement) => bulletStyleOf(el.getAttribute('data-bullet-style')),
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = bulletStyleOf(attrs.bulletStyle);
              // Styled by a CSS rule on the data attribute (listStyleCss), not inline: Tiptap reads an inline
              // list-style-type back into orderedList.type, which would change the stored list on paste.
              return v ? { 'data-bullet-style': v } : {};
            },
          },
        },
      },
      {
        types: ['orderedList'],
        attributes: {
          numberFormat: {
            default: null,
            parseHTML: (el: HTMLElement) => numberFormatOf(el.getAttribute('data-number-format')),
            renderHTML: (attrs: Record<string, unknown>) => {
              const v = numberFormatOf(attrs.numberFormat);
              return v ? { 'data-number-format': v } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const setOn =
      (type: 'bulletList' | 'orderedList', attrs: Record<string, unknown>, toggle: 'toggleBulletList' | 'toggleOrderedList' | null) =>
      ({ state, chain }: CommandProps) => {
        if (!listAt(state, type)) {
          if (!toggle) return false;
          return chain()[toggle]().command(({ tr, state: next }) => {
            const list = listAt(next, type);
            if (!list) return false;
            tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, ...attrs });
            return true;
          }).run();
        }
        return chain()
          .command(({ tr, state: next }) => {
            const list = listAt(next, type)!;
            tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, ...attrs });
            return true;
          })
          .run();
      };
    return {
      setBulletStyle: (style) => (props) => setOn('bulletList', { bulletStyle: style === null ? null : bulletStyleOf(style) }, 'toggleBulletList')(props),
      setNumberFormat: (format) => (props) => setOn('orderedList', { numberFormat: format === null ? null : numberFormatOf(format) }, 'toggleOrderedList')(props),
      setListStart: (start) => (props) => setOn('orderedList', { start: listStartOf(start) }, null)(props),
    };
  },
});

/** The marker of item i (0-based) of a list in plain text: "• ", "3. ", "c. ", "→ " (G-FORMAT styles included). */
export function listMarkerText(list: { type?: string; attrs?: Record<string, unknown> }, i: number): string {
  if (list.type === 'orderedList') {
    const n = (Number(list.attrs?.start) || 1) + i;
    const format = numberFormatOf(list.attrs?.numberFormat);
    return `${format ? formatListNumber(n, format) : n}. `;
  }
  const style = bulletStyleOf(list.attrs?.bulletStyle);
  return `${style ? bulletGlyph(style) : '•'} `;
}

/** Editor and print CSS for styled lists (inserted into documentContentCss). Applies to the list's own items only. */
export const listStyleCss = [
  ...BULLET_STYLES.map((b) => `.dcos-doc ul[data-bullet-style="${b.id}"] { list-style-type: ${b.css}; }`),
  ...NUMBER_FORMATS.map((f) => `.dcos-doc ol[data-number-format="${f.id}"] { list-style-type: ${f.css}; }`),
].join('\n');
