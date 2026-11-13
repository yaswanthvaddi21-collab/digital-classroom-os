import { mergeAttributes, Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { safeChoice, safeColor, safeNumber } from './objectAttrs';
import { blockInsertPos, findInserted } from './objectCommands';

export const TEXT_BOX_WRAPS = ['inline', 'left', 'right'] as const;
export type TextBoxWrap = (typeof TEXT_BOX_WRAPS)[number];
export const TEXT_BOX_WRAP_LABELS: Record<TextBoxWrap, string> = { inline: 'In line with text', left: 'Float left', right: 'Float right' };

export interface TextBoxAttrs {
  /** In line with the text (a block of its own), or floated to the left or right with text wrapping round it. */
  float: TextBoxWrap;
  /** Width in CSS pixels; null fills the text width (in line) or 240 px (floated). */
  width: number | null;
  /** Background, #rrggbb or 'none'. */
  fill: string;
  /** Border colour, #rrggbb or 'none'. */
  borderColor: string;
  /** Border width in CSS pixels. */
  borderWidth: number;
}

export const TEXT_BOX_DEFAULTS: TextBoxAttrs = { float: 'inline', width: null, fill: 'none', borderColor: '#64748b', borderWidth: 1 };
export const TEXT_BOX_FLOAT_WIDTH = 240;
export const TEXT_BOX_MIN = 60;
export const TEXT_BOX_MAX = 2000;

/** The stored attributes, checked (see objectAttrs). */
export function readTextBox(attrs: Record<string, unknown> | undefined): TextBoxAttrs {
  const a = attrs ?? {};
  const width = a.width === null || a.width === undefined || a.width === '' ? null : safeNumber(a.width, TEXT_BOX_MIN, TEXT_BOX_MAX, NaN);
  return {
    float: safeChoice(a.float, TEXT_BOX_WRAPS, TEXT_BOX_DEFAULTS.float),
    width: width === null || Number.isNaN(width) ? null : Math.round(width),
    fill: safeColor(a.fill, TEXT_BOX_DEFAULTS.fill),
    borderColor: safeColor(a.borderColor, TEXT_BOX_DEFAULTS.borderColor),
    borderWidth: safeNumber(a.borderWidth, 0, 8, TEXT_BOX_DEFAULTS.borderWidth),
  };
}

/** The width shown and exported: the stored width, or the default for the wrapping. */
export const textBoxWidth = (b: TextBoxAttrs) => b.width ?? (b.float === 'inline' ? null : TEXT_BOX_FLOAT_WIDTH);

/** Inline CSS for a text box, from checked attributes only. */
export function textBoxStyle(attrs: Record<string, unknown> | undefined): string {
  const b = readTextBox(attrs);
  const width = textBoxWidth(b);
  return [
    width ? `width: ${width}px` : '',
    `background: ${b.fill === 'none' ? 'transparent' : b.fill}`,
    b.borderColor === 'none' || !b.borderWidth ? 'border: 1px dashed transparent' : `border: ${b.borderWidth}px solid ${b.borderColor}`,
  ]
    .filter(Boolean)
    .join('; ');
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textBox: {
      /** Puts the selected paragraphs in a text box, or inserts an empty one, and places the cursor inside. */
      insertTextBox: () => ReturnType;
    };
  }
}

const dataName = (k: string) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * A text box: a block with its own rich content (paragraphs, lists, pictures…), a border and fill, a width, and
 * in-line or floated (left/right, text wrapping round it) placement. Exported to Word as a one-cell table, which
 * Word, LibreOffice and Pages all open, floated with Word's table positioning when the box floats.
 */
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: false,

  addAttributes() {
    const attr = <K extends keyof TextBoxAttrs>(k: K, read: (v: string) => unknown = (v) => v) => ({
      default: TEXT_BOX_DEFAULTS[k],
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(dataName(k));
        return v === null || v === '' ? TEXT_BOX_DEFAULTS[k] : read(v);
      },
      renderHTML: (attrs: Record<string, unknown>) => (attrs[k] === null || attrs[k] === undefined ? {} : { [dataName(k)]: String(attrs[k]) }),
    });
    return {
      float: attr('float'),
      width: attr('width', (v) => safeNumber(v, TEXT_BOX_MIN, TEXT_BOX_MAX, NaN) || null),
      fill: attr('fill'),
      borderColor: attr('borderColor'),
      borderWidth: attr('borderWidth', (v) => safeNumber(v, 0, 8, TEXT_BOX_DEFAULTS.borderWidth)),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="text-box"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const b = readTextBox(node.attrs);
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'text-box', class: `dcos-textbox dcos-textbox-${b.float}`, style: textBoxStyle(node.attrs) }), 0];
  },

  addCommands() {
    return {
      insertTextBox:
        () =>
        ({ state, chain, commands }) => {
          const { $from, $to, empty } = state.selection;
          // Paragraphs that are selected go into the box (when they can be wrapped as they are).
          if (!empty && $from.blockRange($to) && commands.wrapIn(this.name)) return true;
          // After the selection or the cursor's paragraph (never splitting its text, nor replacing a selected object).
          const at = blockInsertPos(state);
          let first = 0;
          return chain()
            .command(({ tr }) => {
              first = tr.steps.length;
              return true;
            })
            .insertContentAt(at, { type: this.name, content: [{ type: 'paragraph' }] })
            .command(({ tr }) => {
              // The cursor goes into the new box's paragraph.
              const pos = findInserted(tr, first, this.name);
              if (pos >= 0) tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
              return true;
            })
            .run();
        },
    };
  },
});
