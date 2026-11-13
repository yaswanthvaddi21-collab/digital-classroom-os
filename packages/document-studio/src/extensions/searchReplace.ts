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
  /** Only matches that are whole words (not part of a longer word). */
  wholeWord: boolean;
  index: number;
  results: SearchMatch[];
  decorations: DecorationSet;
}

type SearchMeta = Partial<Pick<SearchState, 'term' | 'caseSensitive' | 'wholeWord' | 'index'>>;

/** Letters, digits (any script) and underscore: what a whole-word match may not be next to. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
const isWordChar = (c: string | undefined) => !!c && WORD_CHAR.test(c);

export const searchKey = new PluginKey<SearchState>('dcosSearch');

/**
 * Finds matches per textblock so terms spanning differently-formatted text (e.g. half-bold) are still found.
 * With `wholeWord`, a match must not continue a word on either side (where the term itself starts or ends with a
 * letter or digit), as in Word's "Find whole words only".
 */
export function findMatches(doc: PMNode, term: string, caseSensitive: boolean, wholeWord = false): SearchMatch[] {
  if (!term) return [];
  const needle = caseSensitive ? term : term.toLowerCase();
  const results: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // `positions[i]` is the document position of the i-th UTF-16 unit of `hay`. Lower-casing can change length
    // (Turkish İ becomes two units), so positions are recorded per lowered unit, not per original character.
    let hay = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const t = child.text!;
        for (let i = 0; i < t.length; i++) {
          const unit = caseSensitive ? t[i] : t[i].toLowerCase();
          for (let k = 0; k < unit.length; k++) positions.push(pos + 1 + offset + i);
          hay += unit;
        }
      } else {
        positions.push(pos + 1 + offset);
        hay += '\ufffc';
      }
    });
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const whole = !wholeWord || ((!isWordChar(needle[0]) || !isWordChar(hay[i - 1])) && (!isWordChar(needle[needle.length - 1]) || !isWordChar(hay[i + needle.length])));
      if (!whole) {
        i = hay.indexOf(needle, i + 1);
        continue;
      }
      results.push({ from: positions[i], to: positions[i + needle.length - 1] + 1 });
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return results;
}

function build(doc: PMNode, term: string, caseSensitive: boolean, wholeWord: boolean, index: number): SearchState {
  const results = findMatches(doc, term, caseSensitive, wholeWord);
  const clamped = results.length ? Math.min(Math.max(index, 0), results.length - 1) : 0;
  const decorations = DecorationSet.create(
    doc,
    results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === clamped ? 'dcos-search-match dcos-search-current' : 'dcos-search-match' })),
  );
  return { term, caseSensitive, wholeWord, index: clamped, results, decorations };
}

export const SearchReplace = Extension.create({
  name: 'searchReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_, state) => build(state.doc, '', false, false, 0),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (!meta && !tr.docChanged) return prev;
            const next = { ...prev, ...meta };
            return build(tr.doc, next.term, next.caseSensitive, next.wholeWord, next.index);
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
