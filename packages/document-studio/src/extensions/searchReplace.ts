import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  term: string;
  caseSensitive: boolean;
  index: number;
  results: SearchMatch[];
  decorations: DecorationSet;
}

type SearchMeta = Partial<Pick<SearchState, 'term' | 'caseSensitive' | 'index'>>;

export const searchKey = new PluginKey<SearchState>('dcosSearch');

/** Finds matches per textblock so terms spanning differently-formatted text (e.g. half-bold) are still found. */
export function findMatches(doc: PMNode, term: string, caseSensitive: boolean): SearchMatch[] {
  if (!term) return [];
  const needle = caseSensitive ? term : term.toLowerCase();
  const results: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        positions.push(pos + 1 + offset);
        text += '￼';
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      results.push({ from: positions[i], to: positions[i + needle.length - 1] + 1 });
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return results;
}

function build(doc: PMNode, term: string, caseSensitive: boolean, index: number): SearchState {
  const results = findMatches(doc, term, caseSensitive);
  const clamped = results.length ? Math.min(Math.max(index, 0), results.length - 1) : 0;
  const decorations = DecorationSet.create(
    doc,
    results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === clamped ? 'dcos-search-match dcos-search-current' : 'dcos-search-match' })),
  );
  return { term, caseSensitive, index: clamped, results, decorations };
}

export const SearchReplace = Extension.create({
  name: 'searchReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_, state) => build(state.doc, '', false, 0),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...meta };
            return build(tr.doc, next.term, next.caseSensitive, next.index);
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export const getSearchState = (state: EditorState) => searchKey.getState(state)!;

export function setSearch(editor: Editor, meta: SearchMeta) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, meta));
}

function reveal(editor: Editor) {
  const s = getSearchState(editor.state);
  const match = s.results[s.index];
  if (!match) return;
  // Scroll the match into view without moving focus out of the find bar.
  const dom = editor.view.domAtPos(match.from).node;
  (dom instanceof Element ? dom : dom.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function stepSearch(editor: Editor, dir: 1 | -1) {
  const s = getSearchState(editor.state);
  if (!s.results.length) return;
  setSearch(editor, { index: (s.index + dir + s.results.length) % s.results.length });
  reveal(editor);
}

export function replaceCurrent(editor: Editor, replacement: string) {
  const s = getSearchState(editor.state);
  const match = s.results[s.index];
  if (!match) return;
  const tr = editor.state.tr;
  if (replacement) tr.insertText(replacement, match.from, match.to);
  else tr.delete(match.from, match.to);
  editor.view.dispatch(tr);
  reveal(editor);
}

export function replaceAll(editor: Editor, replacement: string): number {
  const s = getSearchState(editor.state);
  if (!s.results.length) return 0;
  const tr = editor.state.tr;
  // Replace from the end so earlier positions stay valid.
  for (const m of [...s.results].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  editor.view.dispatch(tr);
  return s.results.length;
}
