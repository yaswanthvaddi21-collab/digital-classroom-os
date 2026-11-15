/**
 * What transitions and object animations look like in the slide show (Phase 7 SHOW): Web Animations keyframes for
 * each model type, matching the PPTX effects they export to (ADR 0014). No animation library is needed.
 *
 * Direction words follow the model (types.ts): a transition's direction is the way the new slide moves (push 'left' =
 * the new slide comes in from the right, PPTX dir="l"); an animation's direction is where the object comes from
 * (fly-in 'up' = from the top).
 */
import type { Animation as ObjectAnimation, Direction, PresentationSize, SlideElement, Transition, TransitionType } from '../types';

export interface TransitionFrames {
  incoming: Keyframe[];
  /** Keyframes of the slide going out; left out = it stays where it is under the incoming one. */
  outgoing?: Keyframe[];
}

const translate = (x: string, y: string) => `translate(${x}, ${y})`;

/** Where a slide moving in `dir` starts (as a translate of the whole stage). */
function offStage(dir: Direction, sign = 1) {
  const s = (v: string) => (sign < 0 ? `-${v}` : v);
  switch (dir) {
    case 'left':
      return translate(s('100%'), '0');
    case 'right':
      return translate(sign < 0 ? '100%' : '-100%', '0');
    case 'up':
      return translate('0', s('100%'));
    case 'down':
      return translate('0', sign < 0 ? '100%' : '-100%');
  }
}

/** The clip a wipe in `dir` (the way the edge moves) starts from. */
function wipeStart(dir: Direction) {
  switch (dir) {
    case 'left':
      return 'inset(0 0 0 100%)';
    case 'right':
      return 'inset(0 100% 0 0)';
    case 'up':
      return 'inset(100% 0 0 0)';
    case 'down':
      return 'inset(0 0 100% 0)';
  }
}

const FULL = 'inset(0 0 0 0)';
const HOME = translate('0', '0');

/** The keyframes of a slide transition, or null for a cut ('none', or no transition). */
export function transitionFrames(t: Transition | undefined): TransitionFrames | null {
  if (!t || t.type === 'none') return null;
  const dir = t.direction ?? 'left';
  switch (t.type) {
    case 'fade':
      return { incoming: [{ opacity: 0 }, { opacity: 1 }] };
    case 'push':
      return { incoming: [{ transform: offStage(dir) }, { transform: HOME }], outgoing: [{ transform: HOME }, { transform: offStage(dir, -1) }] };
    case 'cover':
      return { incoming: [{ transform: offStage(dir) }, { transform: HOME }] };
    case 'wipe':
      return { incoming: [{ clipPath: wipeStart(dir) }, { clipPath: FULL }] };
    case 'split':
      return { incoming: [{ clipPath: (t.orientation ?? 'horizontal') === 'horizontal' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)' }, { clipPath: FULL }] };
    case 'zoom':
      return { incoming: [{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }] };
  }
}

/** Transition types, with the names the Transitions tab shows. */
export const TRANSITION_NAMES: Readonly<Record<TransitionType, string>> = { none: 'None', fade: 'Fade', push: 'Push', wipe: 'Wipe', cover: 'Cover', split: 'Split', zoom: 'Zoom' };
export const TRANSITION_TYPES = Object.keys(TRANSITION_NAMES) as TransitionType[];
/** Transitions that move in a direction (the others have none, except split's orientation). */
export const hasDirection = (type: TransitionType) => type === 'push' || type === 'wipe' || type === 'cover';

/** The keyframes of an object's entrance. `size` is the slide size; the object's own rotation is kept throughout. */
export function animationFrames(a: ObjectAnimation, el: Pick<SlideElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>, size: PresentationSize): Keyframe[] {
  const rot = el.rotation ? ` rotate(${el.rotation}deg)` : '';
  const dir = a.direction ?? 'down';
  switch (a.effect) {
    case 'appear':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'fade':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'zoom':
      return [{ transform: `${rot} scale(0.1)`.trim(), opacity: 0 }, { transform: `${rot} scale(1)`.trim(), opacity: 1 }];
    case 'fly-in': {
      // From just outside the slide's edge on that side.
      const margin = 20;
      const from =
        dir === 'left' ? translate(`${-(el.x + el.w + margin)}px`, '0px') : dir === 'right' ? translate(`${size.width - el.x + margin}px`, '0px') : dir === 'up' ? translate('0px', `${-(el.y + el.h + margin)}px`) : translate('0px', `${size.height - el.y + margin}px`);
      return [{ transform: `${from}${rot}` }, { transform: `translate(0px, 0px)${rot}` }];
    }
    case 'wipe': {
      // The object is revealed starting from the side it comes from.
      const start = dir === 'left' ? 'inset(0 100% 0 0)' : dir === 'right' ? 'inset(0 0 0 100%)' : dir === 'up' ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)';
      return [{ clipPath: start }, { clipPath: FULL }];
    }
  }
}

export const ANIMATION_NAMES: Readonly<Record<ObjectAnimation['effect'], string>> = { appear: 'Appear', fade: 'Fade', 'fly-in': 'Fly in', zoom: 'Zoom', wipe: 'Wipe' };
export const animationHasDirection = (effect: ObjectAnimation['effect']) => effect === 'fly-in' || effect === 'wipe';

/** Whether the system asks for reduced motion: transitions and animations then become cuts. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** element.animate when the engine has it (null otherwise: the change is then a cut). */
export function animate(el: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  try {
    return (el as HTMLElement).animate(frames, options);
  } catch {
    return null;
  }
}

/** Resolves when every animation has finished or been cancelled. */
export function settled(animations: Array<Animation | null>): Promise<void> {
  return Promise.all(animations.filter((a): a is Animation => !!a).map((a) => a.finished.then(() => undefined, () => undefined))).then(() => undefined);
}
