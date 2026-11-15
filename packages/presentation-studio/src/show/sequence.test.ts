import { describe, expect, it } from 'vitest';
import { createPresentation } from '../create';

const BLANK_LAYOUT = createPresentation('blank').slides[0].layoutId;
import { richTextFromPlain, type Animation, type PresentationContent, type Slide, type TextElement } from '../types';
import { textStyle } from '../layouts';
import {
  buildSteps,
  buildsLeft,
  clampPosition,
  entryPosition,
  goToSlideNumber,
  hiddenElementIds,
  lastPosition,
  nextPosition,
  nextSlideIndex,
  previousPosition,
  startPosition,
  visibleSlides,
} from './sequence';

const box = (id: string, animation?: Animation): TextElement => ({ id, type: 'text', x: 0, y: 0, w: 100, h: 50, rotation: 0, text: richTextFromPlain(id), style: textStyle(), ...(animation ? { animation } : {}) });
const anim = (order: number, trigger: Animation['trigger'], duration = 500, delay?: number, effect: Animation['effect'] = 'fade'): Animation => ({ effect, order, trigger, duration, ...(delay ? { delay } : {}) });

function slideWith(id: string, elements: TextElement[], hidden = false): Slide {
  return { id, layoutId: BLANK_LAYOUT, elements, notes: richTextFromPlain(''), ...(hidden ? { hidden: true } : {}) };
}

function deck(...slides: Slide[]): PresentationContent {
  return { ...createPresentation('blank'), slides };
}

describe('build steps', () => {
  it('groups animations by trigger: on click starts a step, with previous starts together, after previous waits', () => {
    const s = slideWith('s', [box('a', anim(1, 'on-click', 400)), box('b', anim(2, 'with-previous', 300, 100)), box('c', anim(3, 'after-previous', 200)), box('d', anim(4, 'on-click')), box('plain')]);
    const steps = buildSteps(s);
    expect(steps).toHaveLength(2);
    expect(steps[0].auto).toBe(false);
    expect(steps[0].effects.map((e) => [e.elementId, e.start, e.duration])).toEqual([
      ['a', 0, 400],
      ['b', 100, 300],
      // after b (which ends at 400)
      ['c', 400, 200],
    ]);
    expect(steps[0].duration).toBe(600);
    expect(steps[1].effects.map((e) => e.elementId)).toEqual(['d']);
  });

  it('plays the first step by itself when the first animation does not wait for a click', () => {
    const s = slideWith('s', [box('a', anim(1, 'after-previous', 300, 200)), box('b', anim(2, 'on-click'))]);
    const steps = buildSteps(s);
    expect(steps.map((x) => x.auto)).toEqual([true, false]);
    expect(steps[0].effects[0].start).toBe(200);
    expect(entryPosition(deck(s), 0)).toEqual({ slide: 0, built: 1 });
  });

  it('orders by `order`, ties in object order; appear takes no time', () => {
    const s = slideWith('s', [box('late', anim(5, 'on-click')), box('x', anim(2, 'on-click', 900, 0, 'appear')), box('y', anim(2, 'after-previous'))]);
    const steps = buildSteps(s);
    expect(steps.map((x) => x.effects.map((e) => e.elementId))).toEqual([['x', 'y'], ['late']]);
    expect(steps[0].effects[0].duration).toBe(0);
    expect(steps[0].effects[1].start).toBe(0);
  });

  it('hides the objects whose step has not played', () => {
    const s = slideWith('s', [box('a', anim(1, 'on-click')), box('b', anim(2, 'on-click')), box('c')]);
    expect([...hiddenElementIds(s, 0)]).toEqual(['a', 'b']);
    expect([...hiddenElementIds(s, 1)]).toEqual(['b']);
    expect(hiddenElementIds(s, 2).size).toBe(0);
  });
});

describe('moving through the show', () => {
  const one = slideWith('one', [box('t1'), box('b1', anim(1, 'on-click'))]);
  const two = slideWith('two', [box('t2')], true);
  const three = slideWith('three', [box('t3'), box('b3', anim(1, 'with-previous'))]);
  const p = deck(one, two, three);

  it('skips hidden slides, plays builds first, then shows the end screen, then exits', () => {
    expect(visibleSlides(p)).toEqual([0, 2]);
    let pos = startPosition(p)!;
    expect(pos).toEqual({ slide: 0, built: 0 });
    let r = nextPosition(p, pos);
    expect(r).toEqual({ pos: { slide: 0, built: 1 }, kind: 'build' });
    r = nextPosition(p, r.pos);
    // Slide 2 is hidden; slide 3's first step plays by itself.
    expect(r).toEqual({ pos: { slide: 2, built: 1 }, kind: 'slide' });
    r = nextPosition(p, r.pos);
    expect(r).toEqual({ pos: { slide: 3, built: 0 }, kind: 'end' });
    expect(nextPosition(p, r.pos).kind).toBe('exit');
    pos = r.pos;
    expect(previousPosition(p, pos)).toEqual({ pos: { slide: 2, built: 1 }, kind: 'back' });
  });

  it('goes back through builds (never the automatic one), then to the slide before fully built', () => {
    expect(previousPosition(p, { slide: 0, built: 1 })).toEqual({ pos: { slide: 0, built: 0 }, kind: 'back' });
    expect(previousPosition(p, { slide: 0, built: 0 }).kind).toBe('none');
    // Slide 3's automatic step is not taken back: back goes to slide 1 with its build played.
    expect(previousPosition(p, { slide: 2, built: 1 })).toEqual({ pos: { slide: 0, built: 1 }, kind: 'back' });
  });

  it('starts from the current slide, or the next shown one when it is hidden', () => {
    expect(startPosition(p, 'three')).toEqual({ slide: 2, built: 1 });
    expect(startPosition(p, 'two')).toEqual({ slide: 2, built: 1 });
    expect(startPosition(deck(one, slideWith('h', [], true)), 'h')).toEqual({ slide: 0, built: 0 });
    expect(startPosition(deck(slideWith('h', [], true)))).toBeNull();
  });

  it('jumps by slide number (a hidden slide too), to the last slide, and says what comes next', () => {
    expect(goToSlideNumber(p, 2)).toEqual({ slide: 1, built: 0 });
    expect(goToSlideNumber(p, 9)).toBeNull();
    expect(goToSlideNumber(p, 0)).toBeNull();
    expect(lastPosition(p)).toEqual({ slide: 2, built: 1 });
    expect(nextSlideIndex(p, { slide: 0, built: 1 })).toBe(2);
    expect(nextSlideIndex(p, { slide: 2, built: 1 })).toBeNull();
    expect(buildsLeft(p, { slide: 0, built: 0 })).toBe(1);
    expect(buildsLeft(p, { slide: 3, built: 0 })).toBe(0);
  });

  it('clamps positions that no longer fit', () => {
    expect(clampPosition(p, { slide: 9, built: 4 })).toEqual({ slide: 3, built: 0 });
    expect(clampPosition(p, { slide: 0, built: 9 })).toEqual({ slide: 0, built: 1 });
    expect(clampPosition(p, { slide: -1, built: -1 })).toEqual({ slide: 0, built: 0 });
  });
});
