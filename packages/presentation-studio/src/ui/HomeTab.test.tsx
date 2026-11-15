// @vitest-environment jsdom
// Home tab: Underline and Strikethrough on selected boxes with no text (fix "empty-underline").
import type { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRESENTATION_V1_VOCABULARY } from '../compat';
import { createPresentation } from '../create';
import { PresentationEditor } from '../PresentationEditor';
import { presentationProblems } from '../safety';
import { richTextFromPlain, type PresentationContent, type RichTextDoc, type TextElement } from '../types';
import { EMPTY_BOX_MARK_HINT, holdsText } from './HomeTab';

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function setup(content: PresentationContent) {
  const onChange = vi.fn();
  render(<PresentationEditor initialContent={json(content)} title="Talk" onChange={onChange} />);
  const last = (): PresentationContent => onChange.mock.calls.at(-1)![0];
  return { onChange, last };
}

const canvas = () => screen.getByRole('listbox', { name: /^Objects on slide/ });
const objects = () => within(canvas()).getAllByRole('option');
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
function pick(el: HTMLElement, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 100, clientY: 100, ...init });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
}
const marksOf = (doc: RichTextDoc) => JSON.stringify(doc);

describe('Underline and Strikethrough on boxes with no text', () => {
  it('there is no box-level underline or strike style to fall back on (the schema-1 vocabulary is frozen)', () => {
    expect(PRESENTATION_V1_VOCABULARY.textStyleFields).not.toContain('underline');
    expect(PRESENTATION_V1_VOCABULARY.textStyleFields).not.toContain('strike');
    expect(holdsText(richTextFromPlain(''))).toBe(false);
    expect(holdsText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }] })).toBe(false);
    expect(holdsText(richTextFromPlain(' '))).toBe(true);
  });

  it('are disabled, with the reason, for a selected empty placeholder, while Bold and Italic still work', () => {
    const { onChange, last } = setup(createPresentation('blank'));
    pick(objects()[0]); // the empty title placeholder
    for (const name of ['Underline', 'Strikethrough']) {
      const b = button(name);
      expect(b.disabled).toBe(true);
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.title).toBe(`${name}: ${EMPTY_BOX_MARK_HINT}`);
    }
    const before = onChange.mock.calls.length;
    fireEvent.click(button('Underline'));
    fireEvent.click(button('Strikethrough'));
    expect(onChange.mock.calls.length).toBe(before);
    // Bold has a box-level style, so it still applies to the empty box (and to what is typed into it later).
    expect(button('Bold').disabled).toBe(false);
    fireEvent.click(button('Bold'));
    expect((last().slides[0].elements[0] as TextElement).style.bold).toBe(false);
  });

  it('work while the empty box is being edited: the next typed text is underlined and struck through', () => {
    const { last } = setup(createPresentation('blank'));
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'F2' });
    const editor = (document.querySelector('[data-stage] .ProseMirror') as unknown as { editor: Editor }).editor;
    for (const name of ['Underline', 'Strikethrough']) {
      expect(button(name).disabled).toBe(false);
      expect(button(name).hasAttribute('title') && button(name).title.includes(EMPTY_BOX_MARK_HINT)).toBe(false);
      fireEvent.click(button(name));
      expect(button(name).getAttribute('aria-pressed')).toBe('true');
    }
    act(() => void editor.commands.insertContent('Typed'));
    const sub = last().slides[0].elements[1] as TextElement;
    expect(sub.text.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Typed', marks: [{ type: 'strike' }, { type: 'underline' }] }] });
    expect(presentationProblems(last())).toEqual([]);
  });

  it('a box with text keeps toggling them on and off, and the tooltip is the usual one', () => {
    const p = createPresentation('blank');
    (p.slides[0].elements[0] as TextElement).text = richTextFromPlain('Title');
    const { last } = setup(p);
    pick(objects()[0]);
    expect(button('Underline').title).toMatch(/^Underline \(/);
    expect(button('Strikethrough').title).toBe('Strikethrough');
    const t = () => last().slides[0].elements[0] as TextElement;
    fireEvent.click(button('Underline'));
    expect(marksOf(t().text)).toContain('"underline"');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Underline'));
    expect(marksOf(t().text)).not.toContain('"underline"');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('false');
  });

  it('with an empty box and a marked box selected, the marked one decides the state, so the button turns it off', () => {
    const p = createPresentation('blank');
    (p.slides[0].elements[0] as TextElement).text = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Title', marks: [{ type: 'underline' }, { type: 'strike' }] }] }] };
    const { last } = setup(p);
    pick(objects()[0]);
    pick(objects()[1], { shiftKey: true }); // the empty subtitle placeholder joins the selection
    expect(within(canvas()).getAllByRole('option', { selected: true })).toHaveLength(2);
    for (const name of ['Underline', 'Strikethrough']) {
      expect(button(name).disabled).toBe(false);
      expect(button(name).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(button(name));
      expect(button(name).getAttribute('aria-pressed')).toBe('false');
    }
    const title = last().slides[0].elements[0] as TextElement;
    expect(title.text.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Title' }] });
  });
});
