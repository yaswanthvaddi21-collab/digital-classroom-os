import { Extension, type Editor } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { KatexOptions } from 'katex';
import { requestObjectEdit } from './objectRequests';

/**
 * KaTeX settings for every equation the editor draws (and the equation dialog's preview). `trust` stays off, so
 * LaTeX from a document can never add links, classes or pictures (\href, \htmlClass, \includegraphics).
 * Errors throw, so the node shows its LaTeX in red instead of a half-drawn equation.
 */
export const KATEX_OPTIONS: KatexOptions = { throwOnError: true, trust: false, strict: 'ignore', maxSize: 50, maxExpand: 1000 };

export const EQUATION_TYPES = ['inlineMath', 'blockMath'] as const;
export type EquationType = (typeof EQUATION_TYPES)[number];
export const isEquation = (node: PMNode | null | undefined): node is PMNode => !!node && (EQUATION_TYPES as readonly string[]).includes(node.type.name);

const editKey = new PluginKey('dcosEquationEdit');

/**
 * Equations, written in LaTeX and drawn with KaTeX: inline (`inlineMath`, in a line of text) and display
 * (`blockMath`, on a line of its own, centred). Both store only their LaTeX (`latex`). Typing $$…$$ makes an inline
 * equation and $$$…$$$ on its own line a display one (Tiptap's input rules).
 *
 * Double-click, or Enter on a selected equation, opens the equation dialog (see objectRequests).
 */
export const Equations = Extension.create({
  name: 'equations',

  addExtensions() {
    // As plain text (the clipboard's text/plain), equations keep their LaTeX, as in the TXT export.
    return [
      InlineMath.extend({ renderText: ({ node }) => (node.attrs.latex ? `$${node.attrs.latex}$` : '') }).configure({ katexOptions: KATEX_OPTIONS }),
      BlockMath.extend({ renderText: ({ node }) => (node.attrs.latex ? `\n$$${node.attrs.latex}$$\n` : '') }).configure({ katexOptions: { ...KATEX_OPTIONS, displayMode: true } }),
    ];
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: editKey,
        props: {
          handleDOMEvents: {
            // The native dblclick (after both clicks), not ProseMirror's double-click on mousedown: the dialog opened
            // then would receive the second click on its backdrop and close at once.
            dblclick: (view, event) => {
              if (!editor.isEditable) return false;
              const el = (event.target as Element | null)?.closest?.('[data-type="inline-math"], [data-type="block-math"]');
              if (!el || !view.dom.contains(el)) return false;
              const at = view.posAtDOM(el, 0);
              const pos = [at, at - 1].find((p) => p >= 0 && isEquation(view.state.doc.nodeAt(p)));
              if (pos === undefined) return false;
              event.preventDefault();
              return requestObjectEdit(editor, { kind: 'equation', pos });
            },
          },
          handleKeyDown: (view, event) => {
            const sel = view.state.selection;
            if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (!(sel instanceof NodeSelection) || !isEquation(sel.node) || !editor.isEditable) return false;
            return requestObjectEdit(editor, { kind: 'equation', pos: sel.from });
          },
        },
      }),
    ];
  },
});

/**
 * Inserts an equation at the selection, or, with `pos`, changes the equation there: its LaTeX, and whether it is
 * inline or display (switching replaces the node, so a display equation leaves the line it was in and an inline one
 * goes into a paragraph of its own). One undo step either way.
 */
export function writeEquation(editor: Editor, latex: string, display: boolean, pos?: number): boolean {
  const type = display ? 'blockMath' : 'inlineMath';
  const value = latex.trim();
  if (!value) return false;
  if (pos === undefined) {
    // A selected object (shape, picture, equation, text box) stays: the equation goes after it, as a new shape or
    // text box would, instead of replacing it.
    const { selection } = editor.state;
    if (selection instanceof NodeSelection) return editor.chain().focus().insertContentAt(selection.to, { type, attrs: { latex: value } }).run();
    return editor.chain().focus().insertContent({ type, attrs: { latex: value } }).run();
  }
  const node = editor.state.doc.nodeAt(pos);
  if (!isEquation(node)) return false;
  if (node.type.name === type) {
    return editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: value });
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      })
      .run();
  }
  return editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type, attrs: { latex: value } }).run();
}
