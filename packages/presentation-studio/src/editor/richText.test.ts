import { describe, expect, it } from 'vitest';
import { presentationNovelty } from '../compat';
import { RICH_EVERYTHING } from '../testFixtures';
import { richTextFromPlain, type RichTextDoc } from '../types';
import { allHaveMark, clearParagraphAlign, clearTextStyleAttr, cleanRichText, listKindOf, setListEverywhere, setMarkEverywhere } from './richText';

/** What Tiptap 3 hands back for slide text: attributes the model does not have, and defaults written out. */
const TIPTAP_JSON = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [
        { type: 'text', text: 'Read ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'this', marks: [{ type: 'link', attrs: { href: 'https://example.org', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }] },
        { type: 'text', text: ' now', marks: [{ type: 'textStyle', attrs: { color: '#DC2626', fontFamily: null, fontSize: '28pt', lineHeight: null, backgroundColor: null } }] },
        { type: 'text', text: '!', marks: [{ type: 'textStyle', attrs: { color: null, fontFamily: null, fontSize: null } }, { type: 'highlight', attrs: { color: 'yellow' } }] },
      ],
    },
    { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'One' }] }] }] },
    { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pasted heading' }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '' }, { type: 'hardBreak' }, { type: 'image', attrs: { src: 'x' } }] },
  ],
};

describe('cleanRichText', () => {
  it('keeps only the schema-1 vocabulary, so a saved text box never opens read-only', () => {
    const doc = cleanRichText(TIPTAP_JSON);
    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'this', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] },
            { type: 'text', text: ' now', marks: [{ type: 'textStyle', attrs: { color: '#dc2626', fontSize: '28pt' } }] },
            { type: 'text', text: '!', marks: [{ type: 'highlight', attrs: { color: null } }] },
          ],
        },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'One' }] }] }] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Pasted heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
        { type: 'paragraph', content: [{ type: 'hardBreak' }] },
      ],
    });
    // Before cleaning, Tiptap's link attributes would count as content from a newer version.
    expect(presentationNovelty({ slides: [{ notes: TIPTAP_JSON }] })).not.toBeNull();
    expect(presentationNovelty({ slides: [{ notes: doc }] })).toBeNull();
  });

  it('leaves schema-1 rich text as it is (an empty list of marks is left out)', () => {
    expect(cleanRichText(RICH_EVERYTHING)).toEqual(JSON.parse(JSON.stringify(RICH_EVERYTHING).replace(/,"marks":\[\]/g, '')));
  });

  it('always gives at least one paragraph', () => {
    expect(cleanRichText({ type: 'doc', content: [] })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(cleanRichText(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('formatting a whole text box', () => {
  const mixed: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }, { type: 'text', text: 'b' }] }] };

  it('adds and removes a mark on all text', () => {
    expect(allHaveMark(mixed, 'bold')).toBe(false);
    const on = setMarkEverywhere(mixed, 'bold', true);
    expect(allHaveMark(on, 'bold')).toBe(true);
    const off = setMarkEverywhere(on, 'bold', false);
    expect(off.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] });
    expect(allHaveMark(richTextFromPlain(''), 'bold')).toBe(false);
  });

  it('clears one text style attribute and drops a style mark left empty', () => {
    const doc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '20pt' } }] }, { type: 'text', text: 'y', marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }, { type: 'italic' }] }] }] };
    const out = clearTextStyleAttr(doc, 'color');
    expect(out.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { fontSize: '20pt' } }] }, { type: 'text', text: 'y', marks: [{ type: 'italic' }] }] });
  });

  it('clears paragraph alignment inside lists too', () => {
    const doc: RichTextDoc = { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { textAlign: 'right' } }] }] }, { type: 'paragraph', attrs: { textAlign: 'center' } }] };
    expect(JSON.stringify(clearParagraphAlign(doc))).not.toContain('textAlign');
  });

  it('turns all paragraphs into one list and back', () => {
    const doc = richTextFromPlain('one\ntwo');
    const bullets = setListEverywhere(doc, 'bullet');
    expect(listKindOf(bullets)).toBe('bullet');
    expect(bullets.content[0]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem' }, { type: 'listItem' }] });
    const numbered = setListEverywhere(bullets, 'ordered');
    expect(listKindOf(numbered)).toBe('ordered');
    expect(setListEverywhere(numbered, 'none')).toEqual(doc);
    expect(listKindOf(doc)).toBe('none');
  });
});
