/**
 * The slide show's order (Phase 7 SHOW, ADR 0014): which slides it shows, the build steps of each slide (object
 * animations grouped by their triggers), and moving forwards and backwards through both. Pure functions, used by the
 * slide show, the presenter view and the animation preview alike.
 */
import type { Animation, PresentationContent, Slide } from '../types';

/** One object animation inside a build step. `start` is ms after the step begins (its trigger's time plus its delay). */
export interface BuildEffect {
  elementId: string;
  animation: Animation;
  start: number;
  /** ms; 0 for 'appear'. */
  duration: number;
}

/**
 * The animations one click plays (or, when `auto`, that play by themselves as the slide comes in: the slide's first
 * animations start "with previous" or "after previous").
 */
export interface BuildStep {
  auto: boolean;
  effects: BuildEffect[];
  /** ms until the last effect of the step has finished. */
  duration: number;
}

/**
 * Where the show is: `slide` is an index into content.slides (content.slides.length = the black screen at the end),
 * `built` how many of that slide's build steps have played.
 */
export interface ShowPosition {
  slide: number;
  built: number;
}

/** How a move came about, so the show knows what to play: a build, a slide coming in, a cut, or nothing. */
/** 'jump' = straight to a slide (first, last, a number): a cut, then its automatic build. */
export type MoveKind = 'build' | 'slide' | 'jump' | 'back' | 'end' | 'exit' | 'none';

export const effectDuration = (a: Animation) => (a.effect === 'appear' ? 0 : Math.max(0, a.duration));

/** The slide's animations in play order (by `order`, ties in the slide's object order). */
export function animatedElements(slide: Slide) {
  return slide.elements
    .map((el, index) => ({ el, index }))
    .filter((x) => !!x.el.animation)
    .sort((a, b) => a.el.animation!.order - b.el.animation!.order || a.index - b.index)
    .map((x) => x.el);
}

/**
 * The build steps of a slide. "On click" starts a new step. "With previous" starts when the animation before it
 * starts; "after previous" when it has finished. Delays count from that moment. When the first animation is not "on
 * click", the first step plays by itself as the slide comes in (auto).
 */
export function buildSteps(slide: Slide): BuildStep[] {
  const steps: BuildStep[] = [];
  let triggerAt = 0;
  let prevTrigger = 0;
  let prevEnd = 0;
  for (const el of animatedElements(slide)) {
    const a = el.animation!;
    const delay = Math.max(0, a.delay ?? 0);
    const duration = effectDuration(a);
    let step = steps[steps.length - 1];
    if (!step || a.trigger === 'on-click') {
      step = { auto: !step && a.trigger !== 'on-click', effects: [], duration: 0 };
      steps.push(step);
      triggerAt = 0;
    } else if (a.trigger === 'with-previous') {
      triggerAt = prevTrigger;
    } else {
      triggerAt = prevEnd;
    }
    const start = triggerAt + delay;
    step.effects.push({ elementId: el.id, animation: a, start, duration });
    step.duration = Math.max(step.duration, start + duration);
    prevTrigger = triggerAt;
    prevEnd = start + duration;
  }
  return steps;
}

/** The indices of the slides the show plays: every slide that is not hidden. */
export const visibleSlides = (content: PresentationContent) => content.slides.map((s, i) => (s.hidden ? -1 : i)).filter((i) => i >= 0);

export const isEnd = (content: PresentationContent, pos: ShowPosition) => pos.slide >= content.slides.length;

/** Steps that play by themselves when the slide comes in (0 or 1). */
const autoSteps = (slide: Slide) => (buildSteps(slide)[0]?.auto ? 1 : 0);

/** A slide as it is when it comes in: only its automatic step has played. */
export const entryPosition = (content: PresentationContent, slide: number): ShowPosition => ({ slide, built: autoSteps(content.slides[slide]) });

/** A slide with every build played (going back to it). */
export const fullyBuilt = (content: PresentationContent, slide: number): ShowPosition => ({ slide, built: buildSteps(content.slides[slide]).length });

/**
 * Where a show started from `fromSlideId` begins: that slide, or when it is hidden the next slide that is not (else the
 * last one before it). Without `fromSlideId`, the first slide that is not hidden. Null when every slide is hidden.
 */
export function startPosition(content: PresentationContent, fromSlideId?: string | null): ShowPosition | null {
  const visible = visibleSlides(content);
  if (!visible.length) return null;
  const from = fromSlideId ? content.slides.findIndex((s) => s.id === fromSlideId) : -1;
  if (from < 0) return entryPosition(content, visible[0]);
  const at = visible.find((i) => i >= from) ?? visible[visible.length - 1];
  return entryPosition(content, at);
}

/** The next click: the next build step, else the next slide that is not hidden, else the end screen, else leave. */
export function nextPosition(content: PresentationContent, pos: ShowPosition): { pos: ShowPosition; kind: MoveKind } {
  if (isEnd(content, pos)) return { pos, kind: 'exit' };
  const steps = buildSteps(content.slides[pos.slide]);
  if (pos.built < steps.length) return { pos: { slide: pos.slide, built: pos.built + 1 }, kind: 'build' };
  const next = visibleSlides(content).find((i) => i > pos.slide);
  if (next === undefined) return { pos: { slide: content.slides.length, built: 0 }, kind: 'end' };
  return { pos: entryPosition(content, next), kind: 'slide' };
}

/**
 * Back one: the last build step is taken back (never the automatic one), else the slide before (not hidden) is shown
 * with every build played. From the end screen, the last slide. At the first slide nothing happens.
 */
export function previousPosition(content: PresentationContent, pos: ShowPosition): { pos: ShowPosition; kind: MoveKind } {
  const visible = visibleSlides(content);
  if (isEnd(content, pos)) {
    const last = visible[visible.length - 1];
    return last === undefined ? { pos, kind: 'none' } : { pos: fullyBuilt(content, last), kind: 'back' };
  }
  if (pos.built > autoSteps(content.slides[pos.slide])) return { pos: { slide: pos.slide, built: pos.built - 1 }, kind: 'back' };
  const prev = [...visible].reverse().find((i) => i < pos.slide);
  if (prev === undefined) return { pos, kind: 'none' };
  return { pos: fullyBuilt(content, prev), kind: 'back' };
}

/** Straight to a slide (1-based number, as in the slide list; a hidden slide is shown when asked for by number). */
export function goToSlideNumber(content: PresentationContent, n: number): ShowPosition | null {
  if (!Number.isInteger(n) || n < 1 || n > content.slides.length) return null;
  return entryPosition(content, n - 1);
}

export const firstPosition = (content: PresentationContent) => startPosition(content);

export function lastPosition(content: PresentationContent): ShowPosition | null {
  const visible = visibleSlides(content);
  return visible.length ? entryPosition(content, visible[visible.length - 1]) : null;
}

/** The slide that comes after the current one in the show (for the presenter view), or null at the end. */
export function nextSlideIndex(content: PresentationContent, pos: ShowPosition): number | null {
  if (isEnd(content, pos)) return null;
  return visibleSlides(content).find((i) => i > pos.slide) ?? null;
}

/** Clicks left on this slide before the next slide comes. */
export function buildsLeft(content: PresentationContent, pos: ShowPosition): number {
  if (isEnd(content, pos)) return 0;
  return Math.max(0, buildSteps(content.slides[pos.slide]).length - pos.built);
}

/** The objects not shown yet at this position: those whose build step has not played. */
export function hiddenElementIds(slide: Slide, built: number): Set<string> {
  const ids = new Set<string>();
  buildSteps(slide).forEach((step, i) => {
    if (i >= built) for (const e of step.effects) ids.add(e.elementId);
  });
  return ids;
}

/** A position made valid for content (a slide that is gone, or more builds than the slide has). */
export function clampPosition(content: PresentationContent, pos: ShowPosition): ShowPosition {
  if (pos.slide >= content.slides.length) return { slide: content.slides.length, built: 0 };
  const slide = Math.max(0, pos.slide);
  return { slide, built: Math.max(0, Math.min(pos.built, buildSteps(content.slides[slide]).length)) };
}
