import { describe, expect, it } from 'vitest';
import { presentationProblems } from '../safety';
import { createPresentation } from '../create';
import { layoutIdFor, textStyle } from '../layouts';
import { emptyRichText, richTextFromPlain, type PresentationContent, type SlideElement, type TextElement } from '../types';
import {
  addSlide,
  deleteElements,
  deleteSlides,
  duplicateSlides,
  inSlideOrder,
  insertElements,
  moveSlides,
  moveSlidesBy,
  nextLayoutId,
  nudgeElements,
  setGeometry,
  setLocked,
  setNotes,
  setSlidesHidden,
  updateElements,
} from './model';

const counter = (prefix = 'n') => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

/** Five slides s1…s5 on Title and content, each with one text box t<i>. */
function deck(): PresentationContent {
  const p = createPresentation('blank', { newId: counter('base') });
  p.slides = [1, 2, 3, 4, 5].map((i) => ({
    id: `s${i}`,
    layoutId: layoutIdFor('titleContent'),
    elements: [{ id: `t${i}`, type: 'text', x: 10 * i, y: 20, w: 100, h: 40, rotation: 0, text: richTextFromPlain(`Slide ${i}`), style: textStyle() } as TextElement],
    notes: emptyRichText(),
  }));
  return p;
}
const order = (p: PresentationContent) => p.slides.map((s) => s.id);

describe('slides', () => {
  it('adds a slide on a layout at a position, with its text placeholders, and leaves the input alone', () => {
    const p = deck();
    const before = JSON.stringify(p);
    const r = addSlide(p, layoutIdFor('twoContent'), 2, counter('new'));
    expect(JSON.stringify(p)).toBe(before);
    expect(order(r.content)).toEqual(['s1', 's2', r.slideId, 's3', 's4', 's5']);
    const added = r.content.slides[2];
    expect(added.layoutId).toBe(layoutIdFor('twoContent'));
    expect(added.elements.map((e) => e.placeholderId)).toEqual(['title', 'left', 'right']);
    // Untouched slides keep their identity (cheap undo snapshots, no thumbnail redraw).
    expect(r.content.slides[0]).toBe(p.slides[0]);
    expect(presentationProblems(r.content)).toEqual([]);
  });

  it('picks "Title and content" after a title slide and the same layout after any other slide', () => {
    const p = createPresentation('blank');
    expect(nextLayoutId(p, p.slides[0])).toBe(layoutIdFor('titleContent'));
    expect(nextLayoutId(p, { ...p.slides[0], layoutId: layoutIdFor('twoContent') })).toBe(layoutIdFor('twoContent'));
    expect(nextLayoutId(p, undefined)).toBe(layoutIdFor('titleContent'));
    expect(nextLayoutId(p, { ...p.slides[0], layoutId: 'gone' })).toBe(layoutIdFor('titleContent'));
  });

  it('duplicates slides after the last of them, with new ids for the slides and their objects', () => {
    const p = deck();
    const r = duplicateSlides(p, ['s4', 's2'], counter('copy'));
    expect(order(r.content)).toEqual(['s1', 's2', 's3', 's4', 'copy-1', 'copy-3', 's5']);
    expect(r.slideIds).toEqual(['copy-1', 'copy-3']);
    const copy = r.content.slides[4];
    expect(copy.elements[0].id).toBe('copy-2');
    expect(copy.elements[0]).toMatchObject({ x: 20, text: richTextFromPlain('Slide 2') });
    // A deep copy: changing the copy cannot change the original.
    (copy.elements[0] as TextElement).text.content.push({ type: 'paragraph' });
    expect((p.slides[1].elements[0] as TextElement).text.content).toHaveLength(1);
    expect(duplicateSlides(p, ['nope']).content).toBe(p);
  });

  it('deletes slides', () => {
    const p = deck();
    expect(order(deleteSlides(p, ['s2', 's5']))).toEqual(['s1', 's3', 's4']);
    expect(deleteSlides(p, ['x'])).toBe(p);
    expect(deleteSlides(p, order(p)).slides).toEqual([]);
  });

  it('moves slides to a drop position between slides, keeping their order', () => {
    const p = deck();
    expect(order(moveSlides(p, ['s1'], 3))).toEqual(['s2', 's3', 's1', 's4', 's5']);
    expect(order(moveSlides(p, ['s5'], 0))).toEqual(['s5', 's1', 's2', 's3', 's4']);
    expect(order(moveSlides(p, ['s4', 's2'], 5))).toEqual(['s1', 's3', 's5', 's2', 's4']);
    expect(order(moveSlides(p, ['s2', 's4'], 0))).toEqual(['s2', 's4', 's1', 's3', 's5']);
    // Dropping a slide next to itself changes nothing.
    expect(moveSlides(p, ['s3'], 2)).toBe(p);
    expect(moveSlides(p, ['s3'], 3)).toBe(p);
    expect(moveSlides(p, [], 0)).toBe(p);
    expect(order(moveSlides(p, ['s1'], 99))).toEqual(['s2', 's3', 's4', 's5', 's1']);
  });

  it('moves selected slides one place up or down as a block, and not past the ends', () => {
    const p = deck();
    expect(order(moveSlidesBy(p, ['s3'], -1))).toEqual(['s1', 's3', 's2', 's4', 's5']);
    expect(order(moveSlidesBy(p, ['s3'], 1))).toEqual(['s1', 's2', 's4', 's3', 's5']);
    expect(order(moveSlidesBy(p, ['s3', 's2'], 1))).toEqual(['s1', 's4', 's2', 's3', 's5']);
    expect(moveSlidesBy(p, ['s1'], -1)).toBe(p);
    expect(moveSlidesBy(p, ['s5'], 1)).toBe(p);
    expect(inSlideOrder(p, ['s5', 's1', 'x'])).toEqual(['s1', 's5']);
  });

  it('hides and shows slides, leaving the field out when shown', () => {
    const p = deck();
    const hidden = setSlidesHidden(p, ['s2', 's3'], true);
    expect(hidden.slides.map((s) => !!s.hidden)).toEqual([false, true, true, false, false]);
    const shown = setSlidesHidden(hidden, ['s2'], false);
    expect('hidden' in shown.slides[1]).toBe(false);
    expect(setSlidesHidden(p, ['s1'], false)).toBe(p);
  });

  it('keeps notes per slide', () => {
    const p = deck();
    const notes = richTextFromPlain('Say hello');
    const next = setNotes(p, 's2', notes);
    expect(next.slides[1].notes).toBe(notes);
    expect(next.slides[0]).toBe(p.slides[0]);
  });
});

describe('objects', () => {
  it('sets geometry rounded to whole pixels and degrees, and only where it changed', () => {
    const p = deck();
    const next = setGeometry(p, 's1', new Map([['t1', { x: 10.4, y: 30.6, w: 99.5, h: 40, rotation: 45.2 }]]));
    expect(next.slides[0].elements[0]).toMatchObject({ x: 10, y: 31, w: 100, h: 40, rotation: 45 });
    expect(setGeometry(p, 's1', new Map([['t1', { x: 10, y: 20, w: 100, h: 40 }]]))).toBe(p);
  });

  it('nudges unlocked objects only', () => {
    const p = setLocked(deck(), 's1', ['t1'], true);
    expect(nudgeElements(p, 's1', ['t1'], 5, 0)).toBe(p);
    const q = deck();
    expect(nudgeElements(q, 's1', ['t1'], 5, -2).slides[0].elements[0]).toMatchObject({ x: 15, y: 18 });
  });

  it('locks and unlocks, leaving the field out when unlocked', () => {
    const p = deck();
    const locked = setLocked(p, 's1', ['t1'], true);
    expect(locked.slides[0].elements[0].locked).toBe(true);
    expect('locked' in setLocked(locked, 's1', ['t1'], false).slides[0].elements[0]).toBe(false);
  });

  it('inserts copies with new ids, an offset, and no placeholder link', () => {
    const p = deck();
    const source: SlideElement = { ...p.slides[0].elements[0], placeholderId: 'title' };
    const r = insertElements(p, 's2', [source], 16, counter('paste'));
    expect(r.ids).toEqual(['paste-1']);
    const pasted = r.content.slides[1].elements[1];
    expect(pasted).toMatchObject({ id: 'paste-1', x: 26, y: 36, w: 100, h: 40 });
    expect(pasted.placeholderId).toBeUndefined();
    expect(source.placeholderId).toBe('title');
    expect(insertElements(p, 's2', []).content).toBe(p);
  });

  it('changes and deletes objects by id', () => {
    const p = deck();
    expect(updateElements(p, 's1', ['t1'], (e) => e)).toBe(p);
    expect(updateElements(p, 's1', ['t1'], (e) => ({ ...e, name: 'Title' })).slides[0].elements[0].name).toBe('Title');
    expect(deleteElements(p, 's1', ['t1']).slides[0].elements).toEqual([]);
    expect(deleteElements(p, 's1', ['x'])).toBe(p);
    expect(updateElements(p, 'missing', ['t1'], (e) => ({ ...e, x: 0 }))).toBe(p);
  });
});
