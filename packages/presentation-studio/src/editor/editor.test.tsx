// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { layoutIdFor } from '../layouts';
import { PresentationEditor } from '../PresentationEditor';
import { presentationProblems } from '../safety';
import { plainTextOf, richTextFromPlain, type PresentationContent, type ShapeElement, type TextElement } from '../types';
import { clearClipboardForTests, ELEMENTS_MIME, hasClipboardElements, serializeElements } from './clipboard';

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  clearClipboardForTests();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Three slides titled Intro, Method, Results (the last hidden), the first with notes. */
function threeSlides(): PresentationContent {
  const p = createPresentation('blank');
  const titled = (text: string, notes = '') => {
    const s = json(p.slides[0]);
    s.id = `s-${text}`;
    s.elements = s.elements.map((e) => (e.type === 'text' && e.placeholderId === 'title' ? { ...e, id: `title-${text}`, text: richTextFromPlain(text) } : { ...e, id: `sub-${text}` }));
    s.notes = richTextFromPlain(notes);
    return s;
  };
  p.slides = [titled('Intro', 'Say hello'), titled('Method'), { ...titled('Results'), hidden: true }];
  return p;
}

function setup(content: PresentationContent = threeSlides()) {
  const onChange = vi.fn();
  const view = render(<PresentationEditor initialContent={json(content)} title="Talk" onChange={onChange} />);
  const last = (): PresentationContent => onChange.mock.calls.at(-1)![0];
  return { onChange, last, view };
}

const slideList = () => screen.getByRole('listbox', { name: 'Slides' });
const slideOptions = () => within(slideList()).getAllByRole('option');
const canvas = () => screen.getByRole('listbox', { name: /^Objects on slide/ });
const objects = () => within(canvas()).getAllByRole('option');
const order = (p: PresentationContent) => p.slides.map((s) => s.id);

/** Presses on an object (and lets go without moving). */
function pick(el: HTMLElement, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 100, clientY: 100, ...init });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
}

const liveEditor = (selector: string) => (document.querySelector(selector) as unknown as { editor: Editor }).editor;

describe('slides panel', () => {
  it('lists the slides in a multi-select listbox, and selects with click, Shift+click and Ctrl+click', () => {
    setup();
    expect(slideList().getAttribute('aria-multiselectable')).toBe('true');
    expect(slideOptions().map((o) => o.getAttribute('aria-label'))).toEqual(['Slide 1: Intro', 'Slide 2: Method', 'Slide 3: Results (hidden in the slide show)']);
    fireEvent.click(slideOptions()[2], { shiftKey: true });
    expect(slideOptions().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true', 'true']);
    expect(canvas().getAttribute('aria-label')).toBe('Objects on slide 3');
    fireEvent.click(slideOptions()[1], { ctrlKey: true });
    expect(slideOptions().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'true']);
    fireEvent.click(slideOptions()[1]);
    expect(slideOptions().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(canvas().getAttribute('aria-label')).toBe('Objects on slide 2');
  });

  it('adds a slide after the current one, with the next layout or the one picked', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'New slide' })[0]);
    expect(order(last())).toHaveLength(4);
    expect(last().slides[1].layoutId).toBe(layoutIdFor('titleContent'));
    expect(slideOptions()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getAllByRole('button', { name: 'New slide with layout' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Comparison/ }));
    expect(last().slides[2].layoutId).toBe(layoutIdFor('comparison'));
    expect(last().slides[2].elements.map((e) => e.placeholderId)).toEqual(['title', 'leftHeading', 'left', 'rightHeading', 'right']);
    expect(presentationProblems(last())).toEqual([]);
  });

  it('duplicates (Ctrl+D), deletes (Delete) and undoes, as one history', () => {
    const { last } = setup();
    fireEvent.keyDown(slideOptions()[0], { key: 'd', ctrlKey: true });
    expect(last().slides.map((s) => plainTextOf((s.elements[0] as TextElement).text))).toEqual(['Intro', 'Intro', 'Method', 'Results']);
    expect(last().slides[1].id).not.toBe('s-Intro');
    expect(slideOptions()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(slideOptions()[1], { key: 'Delete' });
    expect(order(last())).toEqual(['s-Intro', 's-Method', 's-Results']);
    fireEvent.click(slideOptions()[0]);
    fireEvent.keyDown(slideOptions()[0], { key: 'Delete' });
    expect(order(last())).toEqual(['s-Method', 's-Results']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(order(last())).toEqual(['s-Intro', 's-Method', 's-Results']);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(order(last())).toHaveLength(4);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(order(last())).toEqual(['s-Intro', 's-Method', 's-Results']);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(order(last())).toEqual(['s-Method', 's-Results']);
  });

  it('reorders with Alt+arrow keys and keeps the focus on the moved slide', () => {
    const { last } = setup();
    fireEvent.keyDown(slideOptions()[0], { key: 'ArrowDown', altKey: true });
    expect(order(last())).toEqual(['s-Method', 's-Intro', 's-Results']);
    fireEvent.keyDown(slideOptions()[1], { key: 'ArrowDown', altKey: true });
    expect(order(last())).toEqual(['s-Method', 's-Results', 's-Intro']);
    fireEvent.keyDown(slideOptions()[2], { key: 'ArrowDown', altKey: true });
    expect(order(last())).toEqual(['s-Method', 's-Results', 's-Intro']);
    fireEvent.keyDown(slideOptions()[2], { key: 'ArrowUp', altKey: true });
    expect(order(last())).toEqual(['s-Method', 's-Intro', 's-Results']);
  });

  it('reorders, hides and shows from the slide menu (button, right click and Shift+F10)', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Slide actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to end' }));
    expect(order(last())).toEqual(['s-Method', 's-Results', 's-Intro']);
    fireEvent.contextMenu(slideOptions()[0], { clientX: 20, clientY: 20 });
    const menu = screen.getByRole('menu', { name: 'Slide' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide slide' }));
    expect(last().slides[0].hidden).toBe(true);
    fireEvent.keyDown(slideOptions()[0], { key: 'F10', shiftKey: true });
    expect(within(screen.getByRole('menu', { name: 'Slide' })).getByRole('menuitem', { name: /^Move up/ })).toHaveProperty('disabled', true);
    fireEvent.click(within(screen.getByRole('menu', { name: 'Slide' })).getByRole('menuitem', { name: 'Show slide' }));
    expect('hidden' in last().slides[0]).toBe(false);
    expect(screen.queryByRole('menu', { name: 'Slide' })).toBeNull();
  });

  it('reorders by dragging a slide with the mouse', () => {
    const { last } = setup();
    slideOptions().forEach((o, i) => {
      o.getBoundingClientRect = () => ({ left: 0, right: 160, top: i * 100, bottom: i * 100 + 90, width: 160, height: 90, x: 0, y: i * 100, toJSON: () => null }) as DOMRect;
    });
    fireEvent.pointerDown(slideOptions()[0], { button: 0, pointerId: 7, pointerType: 'mouse', clientX: 50, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 50, clientY: 230 });
    expect(document.querySelectorAll('[aria-hidden].bg-accent').length).toBe(1);
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 50, clientY: 230 });
    expect(order(last())).toEqual(['s-Method', 's-Intro', 's-Results']);
  });

  it('shows an empty state with a working button when every slide is deleted', () => {
    const { last } = setup();
    fireEvent.keyDown(slideOptions()[0], { key: 'a', ctrlKey: true });
    fireEvent.keyDown(slideOptions()[0], { key: 'Delete' });
    expect(last().slides).toEqual([]);
    expect(screen.getByText('This presentation has no slides.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a slide' }));
    expect(last().slides).toHaveLength(1);
  });
});

describe('canvas', () => {
  it('lists the objects of the slide with names, and shows placeholder prompts only on the canvas', () => {
    setup(createPresentation('blank'));
    expect(objects().map((o) => o.getAttribute('aria-label'))).toEqual(['Title placeholder: empty (Click to add title)', 'Subtitle placeholder: empty (Click to add subtitle)']);
    expect(document.querySelectorAll('[data-prompt]')).toHaveLength(2);
    // Thumbnails (and so the slide show and exports, which draw slides the same way) never show prompts.
    expect(slideList().textContent).not.toMatch(/Click to add/);
  });

  it('selects with a click and Shift+click, nudges with the arrow keys, and clears with Escape', () => {
    const { last } = setup();
    const [title, sub] = objects();
    pick(title);
    expect(title.getAttribute('aria-selected')).toBe('true');
    expect(canvas().getAttribute('aria-activedescendant')).toBe(title.id);
    pick(sub, { shiftKey: true });
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true']);
    const before = threeSlides().slides[0].elements.map((e) => [e.x, e.y]);
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
    fireEvent.keyDown(canvas(), { key: 'ArrowDown', shiftKey: true });
    expect(last().slides[0].elements.map((e) => [e.x, e.y])).toEqual(before.map(([x, y]) => [x + 1, y + 10]));
    // Nudges in a row are one undo step.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements.map((e) => [e.x, e.y])).toEqual(before);
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false']);
  });

  it('moves through the objects with Tab and lets Tab leave after the last one', () => {
    setup();
    expect(fireEvent.keyDown(canvas(), { key: 'Tab' })).toBe(false);
    expect(objects()[0].getAttribute('aria-selected')).toBe('true');
    expect(fireEvent.keyDown(canvas(), { key: 'Tab' })).toBe(false);
    expect(objects()[1].getAttribute('aria-selected')).toBe('true');
    // Not prevented: the browser moves the focus on.
    expect(fireEvent.keyDown(canvas(), { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(canvas(), { key: 'Tab', shiftKey: true })).toBe(false);
    expect(objects()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('selects all, deletes, and duplicates with the keyboard', () => {
    const { last } = setup();
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas(), { key: 'd', ctrlKey: true });
    expect(last().slides[0].elements).toHaveLength(4);
    const copies = last().slides[0].elements.slice(2);
    expect(copies.map((e) => e.placeholderId)).toEqual([undefined, undefined]);
    expect(copies[0].x).toBe(last().slides[0].elements[0].x + 16);
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'true']);
    fireEvent.keyDown(canvas(), { key: 'Delete' });
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['title-Intro', 'sub-Intro']);
  });

  it('moves an object by dragging, snapping to guides (and not with Alt), as one undo step', () => {
    const { last } = setup();
    const title = objects()[0];
    const start = threeSlides().slides[0].elements[0];
    // Without layout the slide is drawn at half size from the page origin: client px = slide px / 2.
    fireEvent.pointerDown(title, { button: 0, pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 210, clientY: 100, altKey: true });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 210, clientY: 100 });
    expect(last().slides[0].elements[0]).toMatchObject({ x: start.x + 20, y: start.y });
    // Dragged near the left edge of the slide: snaps to it, with the guide drawn while dragging.
    const at = last().slides[0].elements[0];
    fireEvent.pointerDown(title, { button: 0, pointerId: 3, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 200 - at.x / 2 + 2, clientY: 100 });
    expect(document.querySelector('[data-guide="x"]')).not.toBeNull();
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 200 - at.x / 2 + 2, clientY: 100 });
    expect(last().slides[0].elements[0].x).toBe(0);
    expect(document.querySelector('[data-guide]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements[0].x).toBe(start.x + 20);
  });

  it('resizes with a handle and rotates with the rotation handle', () => {
    const { last } = setup();
    pick(objects()[1]);
    const start = threeSlides().slides[0].elements[1];
    fireEvent.pointerDown(document.querySelector('[data-handle="e"]')!, { button: 0, pointerId: 4, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 310, clientY: 100, altKey: true });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 310, clientY: 100 });
    expect(last().slides[0].elements[1]).toMatchObject({ x: start.x, w: start.w + 20, h: start.h });
    const el = last().slides[0].elements[1];
    const cx = (el.x + el.w / 2) / 2;
    const cy = (el.y + el.h / 2) / 2;
    // From straight above the centre to straight right of it: a quarter turn.
    fireEvent.pointerDown(document.querySelector('[data-handle="rotate"]')!, { button: 0, pointerId: 5, clientX: cx, clientY: cy - 50 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: cx + 50, clientY: cy });
    fireEvent.pointerUp(window, { pointerId: 5, clientX: cx + 50, clientY: cy });
    expect(last().slides[0].elements[1].rotation).toBe(90);
  });

  it('clicking one of several selected objects selects just it; dragging it moves them all', () => {
    const { last } = setup();
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    pick(objects()[1]);
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    const before = threeSlides().slides[0].elements.map((e) => e.x);
    fireEvent.pointerDown(objects()[1], { button: 0, pointerId: 8, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 105, clientY: 100, altKey: true });
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 105, clientY: 100 });
    expect(last().slides[0].elements.map((e) => e.x)).toEqual(before.map((x) => x + 10));
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true']);
  });

  it('draws a 4:3 presentation on a 4:3 stage', () => {
    const p = createPresentation('blank', { sizeId: '4:3' });
    setup(p);
    const stage = document.querySelector<HTMLElement>('[data-stage]')!;
    // Without layout the slide is drawn at half size.
    expect([stage.style.width, stage.style.height]).toEqual(['480px', '360px']);
  });

  it('selects with a marquee drawn on the empty slide', () => {
    setup();
    const stage = document.querySelector('[data-canvas]')!;
    fireEvent.pointerDown(stage, { button: 0, pointerId: 6, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 6, clientX: 480, clientY: 270 });
    expect(document.querySelector('[data-marquee]')).not.toBeNull();
    fireEvent.pointerUp(window, { pointerId: 6, clientX: 480, clientY: 270 });
    expect(objects().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true']);
  });

  it('locks objects so they cannot be moved, and orders and aligns them from the Arrange menu', () => {
    const { last } = setup();
    pick(objects()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(last().slides[0].elements[0].locked).toBe(true);
    expect(screen.getByRole('button', { name: 'Lock' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-handle]')).toBeNull();
    const x = last().slides[0].elements[0].x;
    fireEvent.keyDown(canvas(), { key: 'ArrowLeft' });
    expect(last().slides[0].elements[0].x).toBe(x);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Bring to front/ }));
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['sub-Intro', 'title-Intro']);
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Align left (to slide)' }));
    expect(last().slides[0].elements[1].x).toBe(0);
    fireEvent.keyDown(canvas(), { key: '[', ctrlKey: true });
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['title-Intro', 'sub-Intro']);
  });

  it('opens the object menu with a right click', () => {
    const { last } = setup();
    fireEvent.pointerDown(objects()[1], { button: 2, pointerId: 1 });
    fireEvent.contextMenu(objects()[1], { clientX: 50, clientY: 50 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name: /^Delete/ }));
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['title-Intro']);
  });
});

describe('text boxes', () => {
  it('edits text in place with one Tiptap editor, as one undo step, saving only schema-1 text', () => {
    const { last } = setup(createPresentation('blank'));
    pick(objects()[0]);
    fireEvent.keyDown(canvas(), { key: 'Enter' });
    const box = screen.getByRole('textbox', { name: 'Text: Click to add title' });
    expect(document.querySelectorAll('[data-stage] .ProseMirror')).toHaveLength(1);
    const editor = liveEditor('[data-stage] .ProseMirror');
    act(() => {
      editor.commands.insertContent('Hello ');
      editor.commands.insertContent({ type: 'text', text: 'world', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] });
    });
    const title = last().slides[0].elements[0] as TextElement;
    expect(plainTextOf(title.text)).toBe('Hello world');
    expect(JSON.stringify(title.text)).not.toMatch(/target|rel|nofollow/);
    expect(presentationProblems(last())).toEqual([]);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(document.querySelector('[data-stage] .ProseMirror')).toBeNull();
    expect(document.activeElement).toBe(canvas());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plainTextOf((last().slides[0].elements[0] as TextElement).text)).toBe('');
  });

  it('formats the text being edited through the ribbon', () => {
    const { last } = setup(createPresentation('blank'));
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'F2' });
    const editor = liveEditor('[data-stage] .ProseMirror');
    act(() => void editor.commands.insertContent('Notes'));
    act(() => void editor.commands.selectAll());
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Font size' }), { target: { value: '28' } });
    const sub = last().slides[0].elements[1] as TextElement;
    expect(sub.text.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Notes', marks: [{ type: 'textStyle', attrs: { fontSize: '28pt' } }, { type: 'italic' }] }] });
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('formats whole selected text boxes when not editing', () => {
    const { last } = setup();
    pick(objects()[0]);
    // The title style is bold: Bold turns it off for the whole box.
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect((last().slides[0].elements[0] as TextElement).style.bold).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    expect(JSON.stringify((last().slides[0].elements[0] as TextElement).text)).toContain('underline');
    fireEvent.change(screen.getByRole('combobox', { name: 'Font' }), { target: { value: 'Georgia' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Autofit' }), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bullets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: /^Accent 2/ }));
    const t = last().slides[0].elements[0] as TextElement;
    expect(t.style).toMatchObject({ font: 'Georgia', autofit: 'none', align: 'right', color: { theme: 'accent2' } });
    expect(t.text.content[0].type).toBe('bulletList');
    expect(presentationProblems(last())).toEqual([]);
  });

  it('inserts a text box from the Insert tab and starts editing it', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text box' }));
    const added = last().slides[0].elements[2] as TextElement;
    expect(added).toMatchObject({ type: 'text', style: { autofit: 'resize' } });
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
  });

  it('shows only the tabs that have working controls', () => {
    setup();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent!);
    expect(tabs.slice(0, 3)).toEqual(['Home', 'Insert', 'Design']);
    // No tab is empty: each one shows controls (Round 2b groups add theirs only with a working control).
    for (const name of tabs) {
      fireEvent.click(screen.getByRole('tab', { name }));
      const bar = screen.getByRole('toolbar', { name });
      expect(within(bar).queryAllByRole('button').length + within(bar).queryAllByRole('combobox').length).toBeGreaterThan(0);
    }
  });
});

describe('copy and paste', () => {
  it('copies objects to another slide and to another presentation', () => {
    const first = setup();
    pick(objects()[0]);
    fireEvent.keyDown(canvas(), { key: 'c', ctrlKey: true });
    expect(hasClipboardElements()).toBe(true);
    fireEvent.click(slideOptions()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(first.last().slides[1].elements).toHaveLength(3);
    expect(plainTextOf((first.last().slides[1].elements[2] as TextElement).text)).toBe('Intro');
    first.view.unmount();

    const other = createPresentation('blank');
    const second = setup(other);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(second.last().slides[0].elements).toHaveLength(3);
    expect(plainTextOf((second.last().slides[0].elements[2] as TextElement).text)).toBe('Intro');
  });

  it('cuts with Ctrl+X and pastes with Ctrl+V when the browser sends no clipboard events', async () => {
    const { last } = setup();
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'x', ctrlKey: true });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['title-Intro']);
    fireEvent.keyDown(canvas(), { key: 'v', ctrlKey: true });
    await act(() => new Promise((r) => setTimeout(r, 80)));
    expect(last().slides[0].elements).toHaveLength(2);
    expect(last().slides[0].elements[1].type).toBe('text');
    expect(last().slides[0].elements[1].placeholderId).toBeUndefined();
    // A paste event that arrives takes over from the fallback (no second copy).
    fireEvent.keyDown(canvas(), { key: 'v', ctrlKey: true });
    fireEvent.paste(canvas(), { clipboardData: { types: [ELEMENTS_MIME], getData: (t: string) => (t === ELEMENTS_MIME ? serializeElements([last().slides[0].elements[1]]) : '') } });
    await act(() => new Promise((r) => setTimeout(r, 80)));
    expect(last().slides[0].elements).toHaveLength(3);
  });

  it('pastes objects and plain text from paste events, and cascades pastes on the same place', () => {
    const { last } = setup();
    const shape: ShapeElement = { id: 'sh', type: 'shape', x: 10, y: 10, w: 50, h: 50, rotation: 0, preset: 'ellipse', fill: { type: 'solid', color: '#ff0000' }, line: null };
    const paste = (data: Record<string, string>) =>
      fireEvent.paste(canvas(), { clipboardData: { types: Object.keys(data), getData: (t: string) => data[t] ?? '' } });
    paste({ [ELEMENTS_MIME]: serializeElements([shape]), 'text/plain': '' });
    paste({ [ELEMENTS_MIME]: serializeElements([shape]), 'text/plain': '' });
    const shapes = last().slides[0].elements.filter((e) => e.type === 'shape');
    expect(shapes.map((s) => [s.x, s.y])).toEqual([
      [10, 10],
      [26, 26],
    ]);
    paste({ 'text/plain': 'Line one\r\nLine two' });
    const text = last().slides[0].elements.at(-1) as TextElement;
    expect(plainTextOf(text.text)).toBe('Line one\nLine two');
    expect(presentationProblems(last())).toEqual([]);
  });
});

describe('speaker notes', () => {
  it('edits the notes of the current slide and undoes them with everything else', () => {
    const { last } = setup();
    const notes = screen.getByRole('textbox', { name: 'Speaker notes for slide 1' });
    expect(notes.textContent).toBe('Say hello');
    const editor = liveEditor('.dcos-notes .ProseMirror');
    act(() => void editor.commands.insertContent(' everyone'));
    expect(plainTextOf(last().slides[0].notes)).toMatch(/everyone/);
    fireEvent.blur(notes);
    fireEvent.click(slideOptions()[1]);
    expect(screen.getByRole('textbox', { name: 'Speaker notes for slide 2' }).textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plainTextOf(last().slides[0].notes)).toBe('Say hello');
  });

  it('resizes the notes pane with the keyboard and remembers the height', () => {
    setup();
    const handle = screen.getByRole('separator', { name: 'Resize speaker notes' });
    const before = Number(handle.getAttribute('aria-valuenow'));
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 16);
    expect(localStorage.getItem('dcos.presentation.notesHeight')).toBe(String(before + 16));
  });
});

describe('every control does what it says', () => {
  /** Three shapes side by side on one slide, for arrange commands. */
  function shapes(): PresentationContent {
    const p = createPresentation('blank');
    const shape = (id: string, x: number, y: number): ShapeElement => ({ id, type: 'shape', x, y, w: 100, h: 60, rotation: 0, preset: 'rect', fill: { type: 'solid', color: '#cccccc' }, line: null });
    p.slides[0].elements = [shape('a', 100, 100), shape('b', 300, 150), shape('c', 700, 200)];
    return p;
  }

  it('Home: cut, copy, paste, duplicate and delete buttons', () => {
    const { last } = setup(shapes());
    pick(objects()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(hasClipboardElements()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(last().slides[0].elements.map((e) => [e.x, e.y]).at(-1)).toEqual([116, 116]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(last().slides[0].elements).toHaveLength(3);
    pick(objects()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Cut' }));
    expect(last().slides[0].elements.map((e) => e.id)).toEqual(['a', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(last().slides[0].elements.at(-1)).toMatchObject({ type: 'shape', x: 300, y: 150 });
  });

  it('Home: every Arrange menu item', () => {
    const { last } = setup(shapes());
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    const run = (name: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
      fireEvent.click(screen.getByRole('menuitem', { name }));
      return last().slides[0].elements;
    };
    const at = () => last().slides[0].elements.map((e) => [e.x, e.y]);
    for (const [name, expected] of [
      [/^Align left$/, [[100, 100], [100, 150], [100, 200]]],
      [/^Align centre$/, [[400, 100], [400, 150], [400, 200]]],
      [/^Align right$/, [[700, 100], [700, 150], [700, 200]]],
      [/^Align top$/, [[100, 100], [300, 100], [700, 100]]],
      [/^Align middle$/, [[100, 150], [300, 150], [700, 150]]],
      [/^Align bottom$/, [[100, 200], [300, 200], [700, 200]]],
    ] as const) {
      run(name);
      expect(at()).toEqual(expected);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(at()).toEqual([[100, 100], [300, 150], [700, 200]]);
    }
    expect(run(/^Distribute horizontally/).map((e) => e.x)).toEqual([100, 400, 700]);
    expect(run(/^Distribute vertically/).map((e) => e.y)).toEqual([100, 150, 200]);
    expect(run(/^Rotate right 90°/).map((e) => e.rotation)).toEqual([90, 90, 90]);
    expect(run(/^Rotate left 90°/).map((e) => e.rotation)).toEqual([0, 0, 0]);
    pick(objects()[0]);
    expect(run(/^Bring to front/).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(run(/^Send to back/).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(run(/^Bring forward/).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(run(/^Send backward/).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(run(/^Align centre \(to slide\)$/)[0].x).toBe(430);
    expect(run(/^Align middle \(to slide\)$/)[0].y).toBe(240);
    expect(run(/^Align right \(to slide\)$/)[0].x).toBe(860);
    expect(run(/^Align bottom \(to slide\)$/)[0].y).toBe(480);
    expect(run(/^Align top \(to slide\)$/)[0].y).toBe(0);
  });

  it('Home: strikethrough, numbering, every alignment and the vertical position of whole text boxes', () => {
    const { last } = setup();
    pick(objects()[0]);
    const t = () => last().slides[0].elements[0] as TextElement;
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }));
    expect(JSON.stringify(t().text)).toContain('strike');
    expect(screen.getByRole('button', { name: 'Strikethrough' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Numbering' }));
    expect(t().text.content[0].type).toBe('orderedList');
    fireEvent.click(screen.getByRole('button', { name: 'Numbering' }));
    expect(t().text.content[0].type).toBe('paragraph');
    for (const [name, value] of [['Align left', 'left'], ['Centre', 'center'], ['Align right', 'right'], ['Justify', 'justify']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(t().style.align).toBe(value);
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true');
    }
    fireEvent.change(screen.getByRole('combobox', { name: 'Vertical alignment' }), { target: { value: 'bottom' } });
    expect(t().style.verticalAlign).toBe('bottom');
    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Colour #c00000' }));
    expect(t().style.color).toBe('#c00000');
    fireEvent.click(screen.getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Automatic' }));
    expect(t().style.color).toEqual({ theme: 'dark1' });
    expect(presentationProblems(last())).toEqual([]);
  });

  it('formatting controls are disabled (not dead) when no text box is selected', () => {
    setup(shapes());
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Text colour', 'Bullets', 'Numbering', 'Align left', 'Delete', 'Copy', 'Cut', 'Duplicate', 'Lock']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
    for (const name of ['Font', 'Font size', 'Vertical alignment', 'Autofit']) expect(screen.getByRole('combobox', { name })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Paste' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Arrange/ })).toHaveProperty('disabled', true);
  });

  it('every item of the object menu', () => {
    const { last } = setup(shapes());
    const menu = (target: HTMLElement, name: RegExp) => {
      fireEvent.contextMenu(target, { clientX: 10, clientY: 10 });
      fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name }));
      return last().slides[0].elements;
    };
    pick(objects()[0]);
    fireEvent.contextMenu(objects()[0], { clientX: 10, clientY: 10 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name: /^Copy/ }));
    expect(hasClipboardElements()).toBe(true);
    expect(menu(objects()[0], /^Paste/)).toHaveLength(4);
    expect(menu(objects()[0], /^Duplicate/)).toHaveLength(5);
    pick(objects()[0]);
    expect(menu(objects()[0], /^Bring to front/).at(-1)!.id).toBe('a');
    expect(menu(objects()[4], /^Send to back/)[0].id).toBe('a');
    expect(menu(objects()[0], /^Bring forward/)[1].id).toBe('a');
    expect(menu(objects()[1], /^Send backward/)[0].id).toBe('a');
    expect(menu(objects()[0], /^Lock/)[0].locked).toBe(true);
    expect('locked' in menu(objects()[0], /^Unlock/)[0]).toBe(false);
    expect(menu(objects()[0], /^Cut/)).toHaveLength(4);
    fireEvent.contextMenu(document.querySelector('[data-canvas]')!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }));
    expect(objects().every((o) => o.getAttribute('aria-selected') === 'true')).toBe(true);
  });

  it('every item of the slide menu, from the Slide actions button', () => {
    const { last } = setup();
    const run = (name: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: 'Slide actions' }));
      fireEvent.click(screen.getByRole('menuitem', { name }));
      return last().slides.map((s) => s.id);
    };
    fireEvent.click(slideOptions()[1]);
    expect(run(/^Move up/)).toEqual(['s-Method', 's-Intro', 's-Results']);
    expect(run(/^Move down/)).toEqual(['s-Intro', 's-Method', 's-Results']);
    expect(run(/^Move to start/)).toEqual(['s-Method', 's-Intro', 's-Results']);
    expect(run(/^Move to end/)).toEqual(['s-Intro', 's-Results', 's-Method']);
    expect(run(/^Duplicate slide/)).toHaveLength(4);
    expect(run(/^Delete slide/)).toEqual(['s-Intro', 's-Results', 's-Method']);
    expect(run(/^New slide/)).toHaveLength(4);
    fireEvent.click(slideOptions()[0]);
    run(/^Hide slide/);
    expect(last().slides[0].hidden).toBe(true);
    run(/^Show slide/);
    expect(last().slides[0].hidden).toBeUndefined();
  });

  it('the notes handle resizes with the pointer', () => {
    setup();
    const handle = screen.getByRole('separator', { name: 'Resize speaker notes' });
    const before = Number(handle.getAttribute('aria-valuenow'));
    fireEvent.pointerDown(handle, { button: 0, pointerId: 9, clientY: 500 });
    fireEvent.pointerMove(handle, { pointerId: 9, clientY: 440 });
    fireEvent.pointerUp(handle, { pointerId: 9, clientY: 440 });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 60);
  });
});

describe('saved content', () => {
  it('stays a valid schema-1 presentation after every kind of edit', () => {
    const { last } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'New slide' })[0]);
    pick(objects()[0]);
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.keyDown(slideOptions()[1], { key: 'ArrowDown', altKey: true });
    expect(presentationProblems(last())).toEqual([]);
    expect(last().slides.every((s) => s.notes && Array.isArray(s.elements))).toBe(true);
  });
});

describe('verifier fixes (Round 2a)', () => {
  /** A stand-in for the system clipboard (what copy events write and paste events read). */
  function systemClipboard(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      data,
      get types() {
        return Object.keys(data);
      },
      getData: (t: string) => data[t] ?? '',
      setData: (t: string, v: string) => {
        data[t] = v;
      },
      clear() {
        for (const k of Object.keys(data)) delete data[k];
      },
    };
  }
  /** A browser copy command: it fires a copy event whose clipboard is `board` (cleared first, as browsers do). */
  function withCopyCommand(board: ReturnType<typeof systemClipboard>) {
    (document as unknown as { execCommand: (c: string) => boolean }).execCommand = vi.fn((cmd: string) => {
      if (cmd !== 'copy') return false;
      board.clear();
      const ev = new Event('copy', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: board });
      (document.activeElement ?? document.body).dispatchEvent(ev);
      return true;
    });
  }
  afterEach(() => {
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    vi.restoreAllMocks();
  });
  const pasteFrom = (board: ReturnType<typeof systemClipboard>) => fireEvent.paste(canvas(), { clipboardData: board });
  const lastText = (p: PresentationContent) => plainTextOf((p.slides[0].elements.at(-1) as TextElement).text);

  it('object-menu and ribbon Copy and Cut also fill the system clipboard, so Ctrl/⌘+V pastes them, not older text', () => {
    const board = systemClipboard({ 'text/plain': 'stale text from elsewhere' });
    withCopyCommand(board);
    const { last } = setup();
    // (A) Right click > Copy on the title, then a paste event (⌘V) with the system clipboard.
    pick(objects()[0]);
    fireEvent.contextMenu(objects()[0], { clientX: 10, clientY: 10 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name: /^Copy/ }));
    expect(board.data[ELEMENTS_MIME]).toBeTruthy();
    expect(board.data['text/plain']).toBe('Intro');
    pasteFrom(board);
    expect(last().slides[0].elements).toHaveLength(3);
    expect(lastText(last())).toBe('Intro');
    // (B) The ribbon's Copy does the same.
    board.clear();
    board.setData('text/plain', 'stale text from elsewhere');
    pick(objects()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(board.data[ELEMENTS_MIME]).toBeTruthy();
    pasteFrom(board);
    expect(last().slides[0].elements.at(-1)!.id).not.toBe('sub-Intro');
    expect(last().slides[0].elements.at(-1)).toMatchObject({ type: 'text', x: threeSlides().slides[0].elements[1].x + 16 });
    // Menu Cut: the objects go, and ⌘V brings them back.
    pick(objects()[0]);
    fireEvent.contextMenu(objects()[0], { clientX: 10, clientY: 10 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name: /^Cut/ }));
    expect(last().slides[0].elements.map((e) => e.id)).not.toContain('title-Intro');
    pasteFrom(board);
    expect(lastText(last())).toBe('Intro');
  });

  it('a paste event with an older copy of this tab loses to a newer copy that only the in-app clipboard got', () => {
    const board = systemClipboard();
    const { last } = setup();
    // (C) ⌘C on the subtitle fills the system clipboard through its copy event…
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'c', ctrlKey: true });
    fireEvent.copy(canvas(), { clipboardData: board });
    expect(board.data[ELEMENTS_MIME]).toContain('sub-Intro');
    // …then the menu copies the title in a browser without a copy command (no copy event, no system clipboard).
    pick(objects()[0]);
    fireEvent.contextMenu(objects()[0], { clientX: 10, clientY: 10 });
    fireEvent.click(within(screen.getByRole('menu', { name: 'Object' })).getByRole('menuitem', { name: /^Copy/ }));
    pasteFrom(board);
    expect(lastText(last())).toBe('Intro');
    // A copy from another tab (no stamp of this one) is pasted as it is.
    board.clear();
    const shape: ShapeElement = { id: 'other', type: 'shape', x: 5, y: 5, w: 40, h: 40, rotation: 0, preset: 'rect', fill: { type: 'solid', color: '#00ff00' }, line: null };
    board.setData(ELEMENTS_MIME, serializeElements([shape], { tab: 'another-tab', seq: 1 }));
    pasteFrom(board);
    expect(last().slides[0].elements.at(-1)).toMatchObject({ type: 'shape', x: 5, y: 5 });
  });

  /** A layout stand-in: text needs lines × 1.2 em, a line holding (box width / (font px × 0.5)) characters. */
  function fakeTextLayout() {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const area = this.parentElement;
      const box = area?.parentElement;
      const fs = parseFloat(area?.style.fontSize ?? '');
      const w = parseFloat(box?.style.width ?? '');
      if (!(fs > 0) || !(w > 0) || !this.textContent) return 0;
      const lines = Math.max(1, Math.ceil((this.textContent.length * fs * 0.5) / (w - 20)));
      return Math.round(lines * fs * 1.2);
    });
  }
  const needed = (chars: number, pt: number, w: number) => Math.ceil(Math.round(Math.max(1, Math.ceil((chars * pt * (96 / 72) * 0.5) / (w - 20))) * pt * (96 / 72) * 1.2) + 12);

  it("'Resize box to fit text' grows the box when it changes outside editing: font size, the autofit choice, a narrower box", () => {
    fakeTextLayout();
    const p = createPresentation('blank');
    const sentence = 'A text box with a sentence that wraps';
    p.slides[0].elements.push({ id: 'box', type: 'text', x: 100, y: 100, w: 400, h: 40, rotation: 0, text: richTextFromPlain(sentence), style: { ...(p.slides[0].elements[1] as TextElement).style, fontSize: 18, autofit: 'none', padding: [6, 10, 6, 10] } });
    const { last } = setup(p);
    const box = () => last().slides[0].elements.find((e) => e.id === 'box') as TextElement;
    pick(objects()[2]);
    // (1) Choosing the autofit option fits the box at once.
    fireEvent.change(screen.getByRole('combobox', { name: 'Autofit' }), { target: { value: 'resize' } });
    expect(box().style.autofit).toBe('resize');
    expect(box().h).toBe(needed(sentence.length, 18, 400));
    // (2) A bigger font size from the ribbon grows it, as one undo step with the size.
    fireEvent.change(screen.getByRole('combobox', { name: 'Font size' }), { target: { value: '40' } });
    expect(box().style.fontSize).toBe(40);
    expect(box().h).toBe(needed(sentence.length, 40, 400));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(box().style.fontSize).toBe(18);
    expect(box().h).toBe(needed(sentence.length, 18, 400));
    // (3) Narrowing the box with the east handle makes it taller.
    fireEvent.pointerDown(document.querySelector('[data-handle="e"]')!, { button: 0, pointerId: 4, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 200, clientY: 100, altKey: true });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 200, clientY: 100, altKey: true });
    expect(box().w).toBe(200);
    expect(box().h).toBe(needed(sentence.length, 18, 200));
    // Opening another slide and coming back changes nothing.
    const before = last();
    fireEvent.click(screen.getAllByRole('button', { name: 'New slide' })[0]);
    fireEvent.click(slideOptions()[0]);
    expect(last().slides[0]).toBe(before.slides[0]);
  });

  it('dragging a slide that is not selected selects it alone and makes it current', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[1]);
    slideOptions().forEach((o, i) => {
      o.getBoundingClientRect = () => ({ left: 0, right: 160, top: i * 100, bottom: i * 100 + 90, width: 160, height: 90, x: 0, y: i * 100, toJSON: () => null }) as DOMRect;
    });
    // Slide 3 (Results) dragged above slide 2.
    fireEvent.pointerDown(slideOptions()[2], { button: 0, pointerId: 7, pointerType: 'mouse', clientX: 50, clientY: 240 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 50, clientY: 120 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 50, clientY: 120 });
    expect(order(last())).toEqual(['s-Intro', 's-Results', 's-Method']);
    expect(slideOptions().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(slideOptions()[1].getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(slideOptions()[1], { key: 'Delete' });
    expect(order(last())).toEqual(['s-Intro', 's-Method']);
  });

  it('Shift+click selects from the current slide after New slide made it current', () => {
    setup();
    fireEvent.click(slideOptions()[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'New slide' })[0]);
    expect(slideOptions()[1].getAttribute('aria-current')).toBe('true');
    fireEvent.click(slideOptions()[3], { shiftKey: true });
    expect(slideOptions().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'true', 'true']);
  });

  it('the Undo button while editing undoes the typing session, and Redo brings it back', () => {
    const { last } = setup(createPresentation('blank'));
    const sub = () => plainTextOf((last().slides[0].elements[1] as TextElement).text);
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'F2' });
    act(() => void liveEditor('[data-stage] .ProseMirror').commands.insertContent('World'));
    expect(sub()).toBe('World');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(sub()).toBe('');
    expect(document.querySelector('[data-stage] .ProseMirror')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(sub()).toBe('World');
  });

  it('typing undone inside the text box leaves no empty step: the Undo button then undoes the change before it', () => {
    const { last } = setup(createPresentation('blank'));
    const title = () => last().slides[0].elements[0] as TextElement;
    pick(objects()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(title().style.align).toBe('right');
    pick(objects()[1]);
    fireEvent.keyDown(canvas(), { key: 'F2' });
    const editor = liveEditor('[data-stage] .ProseMirror');
    act(() => void editor.commands.insertContent('World'));
    act(() => void editor.commands.undo());
    expect(plainTextOf((last().slides[0].elements[1] as TextElement).text)).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(title().style.align).not.toBe('right');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(title().style.align).toBe('right');
  });

  it('two runs of nudges with other selections between them are two undo steps', () => {
    const { last } = setup();
    const start = threeSlides().slides[0].elements[0];
    fireEvent.keyDown(canvas(), { key: 'Tab' });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
    fireEvent.keyDown(canvas(), { key: 'Tab' });
    fireEvent.keyDown(canvas(), { key: 'Tab', shiftKey: true });
    for (let i = 0; i < 2; i++) fireEvent.keyDown(canvas(), { key: 'ArrowDown' });
    expect(last().slides[0].elements[0]).toMatchObject({ x: start.x + 3, y: start.y + 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements[0]).toMatchObject({ x: start.x + 3, y: start.y });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements[0]).toMatchObject({ x: start.x, y: start.y });
  });

  it('Arrange: align, distribute and rotate are disabled when every selected object is locked', () => {
    const p = createPresentation('blank');
    p.slides[0].elements = (['a', 'b', 'c'] as const).map((id, i): ShapeElement => ({ id, type: 'shape', x: 100 + i * 200, y: 100 + i * 50, w: 100, h: 60, rotation: 0, preset: 'rect', fill: { type: 'solid', color: '#cccccc' }, line: null }));
    setup(p);
    fireEvent.keyDown(canvas(), { key: 'a', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByRole('button', { name: /Arrange/ }));
    for (const name of [/^Align left$/, /^Align centre$/, /^Align right$/, /^Align top$/, /^Align middle$/, /^Align bottom$/, /^Distribute horizontally/, /^Distribute vertically/, /^Rotate right 90°/, /^Rotate left 90°/]) {
      expect(screen.getByRole('menuitem', { name })).toHaveProperty('disabled', true);
    }
    expect(screen.getByRole('menuitem', { name: /^Bring to front/ })).toBeTruthy();
  });
});
