import { describe, expect, it } from 'vitest';
import { createPresentation } from '../create';

const BLANK_LAYOUT = createPresentation('blank').slides[0].layoutId;
import { textStyle } from '../layouts';
import { presentationProblems } from '../safety';
import { richTextFromPlain, type PresentationContent, type Slide, type TextElement } from '../types';
import { animationPlace, applyTransitionToAll, moveAnimation, setAnimationEffect, setTransitions, transitionOfType, updateAnimations } from './animationModel';

const box = (id: string): TextElement => ({ id, type: 'text', x: 0, y: 0, w: 100, h: 50, rotation: 0, text: richTextFromPlain(id), style: textStyle() });
const slide = (id: string, ids: string[]): Slide => ({ id, layoutId: BLANK_LAYOUT, elements: ids.map(box), notes: richTextFromPlain('') });
const deck = (): PresentationContent => ({ ...createPresentation('blank'), slides: [slide('s1', ['a', 'b', 'c']), slide('s2', ['d'])] });
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('transitions', () => {
  it('chooses a type with sensible options, keeping the duration; none removes the field', () => {
    expect(transitionOfType('push')).toEqual({ type: 'push', duration: 750, direction: 'left' });
    expect(transitionOfType('split', { type: 'fade', duration: 500 })).toEqual({ type: 'split', duration: 500, orientation: 'horizontal' });
    expect(transitionOfType('fade', { type: 'push', duration: 1000, direction: 'up' })).toEqual({ type: 'fade', duration: 1000 });
    expect(transitionOfType('none')).toBeNull();
  });

  it('changes only the given slides, leaves the others untouched, and writes no undefined', () => {
    const p = deck();
    const before = json(p);
    const q = setTransitions(p, ['s1'], (t) => transitionOfType('wipe', t));
    expect(p).toEqual(before);
    expect(q.slides[0].transition).toEqual({ type: 'wipe', duration: 750, direction: 'left' });
    expect(q.slides[1]).toBe(p.slides[1]);
    const r = setTransitions(q, ['s1'], () => null);
    expect('transition' in r.slides[0]).toBe(false);
    expect(setTransitions(r, ['s1'], () => null)).toBe(r);
    expect(presentationProblems(q)).toEqual([]);
  });

  it('applies one transition to every slide (copies, not one shared object)', () => {
    const q = applyTransitionToAll(deck(), { type: 'cover', duration: 500, direction: 'down' });
    expect(q.slides.map((s) => s.transition)).toEqual([
      { type: 'cover', duration: 500, direction: 'down' },
      { type: 'cover', duration: 500, direction: 'down' },
    ]);
    expect(q.slides[0].transition).not.toBe(q.slides[1].transition);
    expect(applyTransitionToAll(q, null).slides.every((s) => !('transition' in s))).toBe(true);
  });
});

describe('animations', () => {
  it('adds animations at the end of the sequence, on click, with a direction only where the effect has one', () => {
    const p = deck();
    let q = setAnimationEffect(p, 's1', ['b'], 'fly-in');
    q = setAnimationEffect(q, 's1', ['a', 'c'], 'fade');
    const [a, b, c] = q.slides[0].elements;
    expect(b.animation).toEqual({ effect: 'fly-in', order: 1, trigger: 'on-click', duration: 500, direction: 'down' });
    expect(a.animation).toEqual({ effect: 'fade', order: 2, trigger: 'on-click', duration: 500 });
    expect(c.animation!.order).toBe(3);
    // Changing the effect keeps the timing; fade has no direction.
    q = updateAnimations(q, 's1', ['b'], { trigger: 'after-previous', duration: 1200, delay: 300 });
    q = setAnimationEffect(q, 's1', ['b'], 'fade');
    expect(q.slides[0].elements[1].animation).toEqual({ effect: 'fade', order: 1, trigger: 'after-previous', duration: 1200, delay: 300 });
    expect(presentationProblems(q)).toEqual([]);
    expect(p.slides[0].elements.every((e) => !e.animation)).toBe(true);
  });

  it('removes animations and numbers the rest 1…n again', () => {
    let q = setAnimationEffect(deck(), 's1', ['a', 'b', 'c'], 'appear');
    q = setAnimationEffect(q, 's1', ['a'], null);
    expect('animation' in q.slides[0].elements[0]).toBe(false);
    expect(q.slides[0].elements.slice(1).map((e) => e.animation!.order)).toEqual([1, 2]);
  });

  it('clamps durations and delays, drops a zero delay, and ignores a direction the effect has not got', () => {
    let q = setAnimationEffect(deck(), 's1', ['a'], 'fade');
    q = updateAnimations(q, 's1', ['a'], { duration: 99_999, delay: -5, direction: 'left' });
    expect(q.slides[0].elements[0].animation).toEqual({ effect: 'fade', order: 1, trigger: 'on-click', duration: 10_000 });
    q = updateAnimations(q, 's1', ['a'], { duration: 1 });
    expect(q.slides[0].elements[0].animation!.duration).toBe(100);
    // Objects without an animation are left alone.
    expect(updateAnimations(q, 's1', ['b'], { duration: 900 })).toBe(q);
  });

  it('moves an animation earlier or later, and tells its place', () => {
    let q = setAnimationEffect(deck(), 's1', ['a', 'b', 'c'], 'zoom');
    expect(animationPlace(q.slides[0], 'c')).toEqual({ index: 3, count: 3 });
    q = moveAnimation(q, 's1', 'c', -1);
    expect(animationPlace(q.slides[0], 'c')).toEqual({ index: 2, count: 3 });
    expect(animationPlace(q.slides[0], 'b')).toEqual({ index: 3, count: 3 });
    expect(moveAnimation(q, 's1', 'a', -1)).toBe(q);
    expect(animationPlace(q.slides[1], 'd')).toBeNull();
  });

  it('turns tied orders from pasted copies into a clean sequence on the next change', () => {
    const p = deck();
    p.slides[0].elements = p.slides[0].elements.map((e) => ({ ...e, animation: { effect: 'fade', order: 1, trigger: 'on-click', duration: 500 } }));
    const q = updateAnimations(p, 's1', ['c'], { duration: 600 });
    expect(q.slides[0].elements.map((e) => e.animation!.order)).toEqual([1, 2, 3]);
  });
});
