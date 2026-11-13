import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NUMBER_FORMAT_LABELS } from '../pageLayout';
import { describeBreak, readBreakAttrs, SECTION_BREAK, type SectionBreakAttrs } from '../sections';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionBreak: {
      /** Starts a new section at the cursor (always at the top level of the document). */
      insertSectionBreak: (attrs?: Partial<SectionBreakAttrs>) => ReturnType;
      /** Changes the settings of the section break at `pos`. */
      updateSectionBreak: (pos: number, attrs: Partial<SectionBreakAttrs>) => ReturnType;
    };
  }
}

/** One stored attribute, kept in the HTML clipboard as data-<name> (JSON for numbers, text otherwise). */
function attr(name: string, html: string, kind: 'text' | 'number') {
  return {
    [name]: {
      default: name === 'breakType' ? 'nextPage' : null,
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(html);
        if (v === null || v === '') return name === 'breakType' ? 'nextPage' : null;
        if (kind === 'number') {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return v;
      },
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] === null || attrs[name] === undefined ? {} : { [html]: String(attrs[name]) }),
    },
  };
}

/** Where the selection is: the index of its section (0 = first) and the position of each top-level break. */
export function sectionAt(state: EditorState): { index: number; breaks: Array<{ pos: number; node: PMNode }> } {
  const breaks: Array<{ pos: number; node: PMNode }> = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name === SECTION_BREAK) breaks.push({ pos: offset, node });
  });
  const at = state.selection.from;
  // A selected break belongs to the section it starts.
  const index = breaks.filter((b) => b.pos < at || (b.pos === at && state.selection instanceof NodeSelection)).length;
  return { index, breaks };
}

const labelKey = new PluginKey<DecorationSet>('dcosSectionLabels');

/** Labels every break on screen ("Section 2 · Next page · Landscape"), and marks breaks that have no effect. */
function labels(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  let section = 1;
  doc.forEach((node, offset) => {
    if (node.type.name !== SECTION_BREAK) return;
    section += 1;
    const text = `Section break — section ${section}: ${describeBreak(readBreakAttrs(node.attrs), (f) => NUMBER_FORMAT_LABELS[f])}`;
    decorations.push(Decoration.node(offset, offset + node.nodeSize, { 'data-label': text, 'aria-label': text, title: text }));
  });
  doc.descendants((node, pos, parent) => {
    if (node.type.name !== SECTION_BREAK || parent === doc) return true;
    const text = 'Section break — no effect inside a table, list or quote. Move it outside to start a new section.';
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-label': text, 'aria-label': text, title: text, class: 'is-nested' }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * A section break (Layout ▸ Breaks). Its attributes describe the section that starts after it; null means "same
 * as before" (see sections.ts). A new node type, so documents that use it are content schema 2.
 */
export const SectionBreak = Node.create({
  name: SECTION_BREAK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ...attr('breakType', 'data-break', 'text'),
      ...attr('orientation', 'data-orientation', 'text'),
      ...attr('columns', 'data-columns', 'number'),
      ...attr('columnSpacing', 'data-column-spacing', 'number'),
      ...attr('numberFormat', 'data-number-format', 'text'),
      ...attr('numberStart', 'data-number-start', 'number'),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'section-break', class: 'dcos-section-break', role: 'separator' })];
  },

  renderText({ node }) {
    return `\n[Section break: ${node.attrs.breakType === 'continuous' ? 'continuous' : 'next page'}]\n`;
  },

  addCommands() {
    return {
      insertSectionBreak:
        (attrs = {}) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[SECTION_BREAK];
          const sel = state.selection;
          const $from = sel.$from;
          let at: number;
          if ($from.depth === 0) at = sel instanceof NodeSelection ? sel.to : sel.from;
          else if ($from.depth === 1 && $from.parent.isTextblock && sel.empty) {
            // Splits the paragraph at the cursor, as Word does: the text after the cursor starts the new section.
            if ($from.parentOffset === 0) at = $from.before(1);
            else if ($from.parentOffset === $from.parent.content.size) at = $from.after(1);
            else {
              if (dispatch) tr.split($from.pos);
              at = $from.pos + 1;
            }
          } else at = $from.after(1); // inside a table, list or quote: after it, at the top level
          if (!dispatch) return true;
          tr.insert(at, type.create({ ...attrs }));
          const after = at + 1;
          const next = tr.doc.resolve(after).nodeAfter;
          if (!next || !next.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          tr.scrollIntoView();
          return true;
        },
      updateSectionBreak:
        (pos, attrs) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== SECTION_BREAK) return false;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: labelKey,
        state: {
          init: (_config, state) => labels(state.doc),
          apply: (tr: Transaction, old: DecorationSet) => (tr.docChanged ? labels(tr.doc) : old),
        },
        props: {
          decorations: (state) => labelKey.getState(state),
        },
      }),
    ];
  },
});
