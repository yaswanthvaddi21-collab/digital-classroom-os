/**
 * Editing transitions and object animations (the Transitions and Animations tabs). Pure functions: they never change
 * their input, untouched slides and objects keep their identity, and optional fields are left out rather than written
 * as undefined (types.ts).
 */
import type { Animation, AnimationEffect, Direction, PresentationContent, Slide, SlideElement, Transition, TransitionType } from '../types';
import { animatedElements } from './sequence';
import { animationHasDirection, hasDirection } from './effects';

/** Transition speeds the tab offers: the three PPTX can store (spd fast, med, slow). */
export const TRANSITION_SPEEDS: ReadonlyArray<{ ms: number; label: string }> = [
  { ms: 500, label: 'Fast (0.5 s)' },
  { ms: 750, label: 'Medium (0.75 s)' },
  { ms: 1000, label: 'Slow (1 s)' },
];
export const DEFAULT_TRANSITION_MS = 750;
export const DEFAULT_ANIMATION_MS = 500;
/** Limits of the duration and delay fields, in ms. */
export const ANIMATION_DURATION_RANGE = { min: 100, max: 10_000 } as const;
export const ANIMATION_DELAY_RANGE = { min: 0, max: 60_000 } as const;

const without = <T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> => {
  const { [key]: _drop, ...rest } = obj;
  void _drop;
  return rest;
};

/** The transition after choosing `type` (null = none: the slide then has no transition at all). */
export function transitionOfType(type: TransitionType, previous?: Transition): Transition | null {
  if (type === 'none') return null;
  const duration = previous?.duration ?? DEFAULT_TRANSITION_MS;
  if (hasDirection(type)) return { type, duration, direction: previous?.direction ?? 'left' };
  if (type === 'split') return { type, duration, orientation: previous?.orientation ?? 'horizontal' };
  return { type, duration };
}

function withTransition(slide: Slide, t: Transition | null): Slide {
  if (!t) return slide.transition === undefined ? slide : without(slide, 'transition');
  return { ...slide, transition: t };
}

/** Changes the transition of the given slides (one result per slide from its current transition). */
export function setTransitions(content: PresentationContent, slideIds: Iterable<string>, change: (current: Transition | undefined) => Transition | null): PresentationContent {
  const ids = new Set(slideIds);
  let changed = false;
  const slides = content.slides.map((s) => {
    if (!ids.has(s.id)) return s;
    const next = withTransition(s, change(s.transition));
    if (JSON.stringify(next.transition) === JSON.stringify(s.transition)) return s;
    changed = true;
    return next;
  });
  return changed ? { ...content, slides } : content;
}

/** Gives every slide the same transition (a copy of `t`; null removes every transition). */
export function applyTransitionToAll(content: PresentationContent, t: Transition | null): PresentationContent {
  return setTransitions(
    content,
    content.slides.map((s) => s.id),
    () => (t ? { ...t } : null),
  );
}

/** Orders 1…n in play order, so ties (pasted copies) and gaps (removed animations) disappear. */
function renumber(slide: Slide): Slide {
  const order = new Map(animatedElements(slide).map((el, i) => [el.id, i + 1]));
  let changed = false;
  const elements = slide.elements.map((el) => {
    const n = order.get(el.id);
    if (!n || el.animation!.order === n) return el;
    changed = true;
    return { ...el, animation: { ...el.animation!, order: n } };
  });
  return changed ? { ...slide, elements } : slide;
}

function onSlide(content: PresentationContent, slideId: string, change: (s: Slide) => Slide): PresentationContent {
  let changed = false;
  const slides = content.slides.map((s) => {
    if (s.id !== slideId) return s;
    const next = renumber(change(s));
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...content, slides } : content;
}

function withAnimation(el: SlideElement, a: Animation | null): SlideElement {
  if (!a) return el.animation === undefined ? el : (without(el, 'animation') as SlideElement);
  return { ...el, animation: a };
}

/** Animation with the effect changed: a direction only for effects that have one. */
function effectChanged(a: Animation, effect: AnimationEffect): Animation {
  const base: Animation = { ...without(a, 'direction'), effect };
  return animationHasDirection(effect) ? { ...base, direction: a.direction ?? 'down' } : base;
}

/**
 * Sets the entrance effect of the given objects (null removes their animation). Objects that had no animation are
 * added at the end of the slide's sequence, on click, in the slide's object order.
 */
export function setAnimationEffect(content: PresentationContent, slideId: string, ids: Iterable<string>, effect: AnimationEffect | null): PresentationContent {
  const want = new Set(ids);
  return onSlide(content, slideId, (slide) => {
    let next = slide.elements.reduce((max, el) => Math.max(max, el.animation?.order ?? 0), 0);
    let changed = false;
    const elements = slide.elements.map((el) => {
      if (!want.has(el.id)) return el;
      let a: Animation | null;
      if (!effect) a = null;
      else if (el.animation) a = el.animation.effect === effect ? el.animation : effectChanged(el.animation, effect);
      else a = effectChanged({ effect, order: ++next, trigger: 'on-click', duration: DEFAULT_ANIMATION_MS }, effect);
      const out = withAnimation(el, a);
      if (out !== el) changed = true;
      return out;
    });
    return changed ? { ...slide, elements } : slide;
  });
}

export interface AnimationPatch {
  trigger?: Animation['trigger'];
  /** ms */
  duration?: number;
  /** ms; 0 removes the delay. */
  delay?: number;
  direction?: Direction;
}

const clamp = (v: number, r: { min: number; max: number }) => Math.round(Math.min(r.max, Math.max(r.min, v)));

/** Changes the timing or direction of the given objects' animations (objects without one are left alone). */
export function updateAnimations(content: PresentationContent, slideId: string, ids: Iterable<string>, patch: AnimationPatch): PresentationContent {
  const want = new Set(ids);
  return onSlide(content, slideId, (slide) => {
    let changed = false;
    const elements = slide.elements.map((el) => {
      const a = el.animation;
      if (!want.has(el.id) || !a) return el;
      let next: Animation = { ...a };
      if (patch.trigger) next.trigger = patch.trigger;
      if (patch.duration !== undefined && Number.isFinite(patch.duration)) next.duration = clamp(patch.duration, ANIMATION_DURATION_RANGE);
      if (patch.delay !== undefined && Number.isFinite(patch.delay)) {
        const d = clamp(patch.delay, ANIMATION_DELAY_RANGE);
        next = d ? { ...next, delay: d } : without(next, 'delay');
      }
      if (patch.direction && animationHasDirection(a.effect)) next.direction = patch.direction;
      if (JSON.stringify(next) === JSON.stringify(a)) return el;
      changed = true;
      return { ...el, animation: next };
    });
    return changed ? { ...slide, elements } : slide;
  });
}

/** Moves one object's animation earlier (-1) or later (+1) in the slide's sequence. */
export function moveAnimation(content: PresentationContent, slideId: string, id: string, delta: -1 | 1): PresentationContent {
  return onSlide(content, slideId, (slide) => {
    const seq = animatedElements(slide).map((el) => el.id);
    const i = seq.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= seq.length) return slide;
    [seq[i], seq[j]] = [seq[j], seq[i]];
    const order = new Map(seq.map((x, k) => [x, k + 1]));
    return { ...slide, elements: slide.elements.map((el) => (order.has(el.id) ? { ...el, animation: { ...el.animation!, order: order.get(el.id)! } } : el)) };
  });
}

/** An object's place in its slide's sequence (1-based) and the sequence length, or null when it is not animated. */
export function animationPlace(slide: Slide, id: string): { index: number; count: number } | null {
  const seq = animatedElements(slide);
  const i = seq.findIndex((el) => el.id === id);
  return i < 0 ? null : { index: i + 1, count: seq.length };
}
