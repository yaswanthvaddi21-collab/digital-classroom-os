// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { documentExtensions } from './index';
import { findMatches, getSearchState, replaceAll, replaceCurrent, setSearch, stepSearch } from './searchReplace';
import { collectHeadings } from './tableOfContents';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const make = (content: JSONContent | string) => {
  editor = new Editor({ extensions: documentExtensions(), content });
  return editor;
};

describe('find and replace', () => {
  it('finds matches across differently formatted text and is case-insensitive by default', () => {
    const e = make('<p>The <strong>Cat</strong>alog lists cats.</p><p>CAT</p>');
    const matches = findMatches(e.state.doc, 'cat', false);
    expect(matches).toHaveLength(3);
    expect(e.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('Cat');
    expect(findMatches(e.state.doc, 'cat', true)).toHaveLength(1);
    expect(findMatches(e.state.doc, '', false)).toEqual([]);
  });

  it('steps through matches and wraps around', () => {
    const e = make('<p>a b a b a</p>');
    setSearch(e, { term: 'a', caseSensitive: false, index: 0 });
    expect(getSearchState(e.state).results).toHaveLength(3);
    stepSearch(e, 1);
    stepSearch(e, 1);
    stepSearch(e, 1);
    expect(getSearchState(e.state).index).toBe(0);
    stepSearch(e, -1);
    expect(getSearchState(e.state).index).toBe(2);
  });

  it('replaces the current match and then all matches, leaving no stale results', () => {
    const e = make('<p>red red red</p>');
    setSearch(e, { term: 'red', caseSensitive: false, index: 0 });
    replaceCurrent(e, 'blue');
    expect(e.getText()).toBe('blue red red');
    expect(getSearchState(e.state).results).toHaveLength(2);
    expect(replaceAll(e, 'green!')).toBe(2);
    expect(e.getText()).toBe('blue green! green!');
    expect(getSearchState(e.state).results).toHaveLength(0);
  });

  it('replaces with an empty string by deleting', () => {
    const e = make('<p>keep drop keep</p>');
    setSearch(e, { term: ' drop', caseSensitive: false, index: 0 });
    replaceAll(e, '');
    expect(e.getText()).toBe('keep keep');
  });
});

describe('table of contents', () => {
  it('collects non-empty headings in order with their levels', () => {
    const e = make('<h1>Intro</h1><p>x</p><h2>Part A</h2><h3></h3><h4>Detail</h4>');
    expect(collectHeadings(e.state.doc).map((h) => [h.level, h.text])).toEqual([
      [1, 'Intro'],
      [2, 'Part A'],
      [4, 'Detail'],
    ]);
  });
});

describe('page break', () => {
  it('survives an HTML round trip and is inserted after the cursor with a following paragraph', () => {
    const e = make('<p>before</p>');
    e.commands.focus('end');
    e.commands.setPageBreak();
    const json = e.getJSON();
    expect(json.content?.map((n) => n.type)).toEqual(['paragraph', 'pageBreak', 'paragraph']);
    const html = e.getHTML();
    expect(html).toContain('data-type="page-break"');
    e.commands.setContent(html);
    expect(e.getJSON().content?.some((n) => n.type === 'pageBreak')).toBe(true);
  });
});
