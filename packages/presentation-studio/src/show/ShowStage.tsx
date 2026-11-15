import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { PresentationImageHost } from '../hosts';
import { SlideView } from '../render/SlideView';
import type { PresentationContent, Transition } from '../types';
import { animate, animationFrames, settled, transitionFrames } from './effects';
import { buildSteps, hiddenElementIds } from './sequence';

/** What to play when `id` changes: a transition into the slide, then (in order) these build steps of it. */
export interface StagePlay {
  id: number;
  transition?: Transition;
  /** Indices of the slide's build steps to animate (they must be counted in `built`). */
  steps: number[];
  /** ms between two steps (the preview plays every step one after another). */
  gap?: number;
}

export interface ShowStageProps {
  content: PresentationContent;
  imageHost?: PresentationImageHost;
  scale: number;
  /** The slide shown (index into content.slides) and how many of its build steps have played. */
  slide: number;
  built: number;
  /** Drawn under the slide while a transition plays: a slide as it was, or black. */
  outgoing?: { slide: number; built: number } | 'black' | null;
  play: StagePlay | null;
  /** Transitions and animations become cuts. */
  reduced: boolean;
  /** Called when everything `play` started has finished (or was finished early). */
  onPlayed?: (id: number) => void;
  /** Accessible name of the slide picture. */
  label?: string;
}

export interface ShowStageApi {
  /** Jumps every running transition and animation to its end. */
  finish: () => void;
}

const cssString = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Hides the objects whose build has not played yet (by their data-element), inside one layer. */
function HiddenObjects({ layer, ids }: { layer: string; ids: Set<string> }) {
  if (!ids.size) return null;
  const rules = [...ids].map((id) => `[data-show-layer="${cssString(layer)}"] [data-element="${cssString(id)}"]{visibility:hidden}`).join('\n');
  return <style>{rules}</style>;
}

const layerStyle: CSSProperties = { position: 'absolute', inset: 0 };

/**
 * One slide of the slide show at a scale, with what has been built so far, and the player of its transition and build
 * animations (Web Animations). Objects of steps still to come are hidden; objects of a step being played start in their
 * first keyframe (fill: backwards) until their delay is over. With reduced motion, or without element.animate, every
 * change is a cut.
 */
export const ShowStage = forwardRef<ShowStageApi, ShowStageProps>(function ShowStage({ content, imageHost, scale, slide, built, outgoing, play, reduced, onPlayed, label }, ref) {
  const uid = useId();
  const inLayer = useRef<HTMLDivElement>(null);
  const outLayer = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);
  const onPlayedRef = useRef(onPlayed);
  onPlayedRef.current = onPlayed;
  const { width, height } = content.size;
  const current = content.slides[slide];

  const finish = () => {
    for (const a of running.current.splice(0)) {
      try {
        a.finish();
      } catch {
        // An animation with an infinite end cannot be finished; there is none here.
      }
    }
  };
  useImperativeHandle(ref, () => ({ finish }), []);

  useLayoutEffect(() => {
    if (!play) return;
    finish();
    const started: Array<Animation | null> = [];
    let base = 0;
    const frames = reduced ? null : transitionFrames(play.transition);
    if (frames && play.transition) {
      const options: KeyframeAnimationOptions = { duration: Math.max(1, play.transition.duration), easing: 'ease-in-out', fill: 'backwards' };
      started.push(animate(inLayer.current, frames.incoming, options));
      if (frames.outgoing) started.push(animate(outLayer.current, frames.outgoing, options));
      base = play.transition.duration;
    }
    if (!reduced && current) {
      const steps = buildSteps(current);
      for (const i of play.steps) {
        const step = steps[i];
        if (!step) continue;
        for (const fx of step.effects) {
          const el = current.elements.find((e) => e.id === fx.elementId);
          const nodes = inLayer.current?.querySelectorAll(`[data-element="${cssString(fx.elementId)}"]`);
          const node = nodes && nodes.length ? nodes[nodes.length - 1] : null;
          if (!el || !node) continue;
          started.push(animate(node, animationFrames(fx.animation, el, content.size), { duration: Math.max(1, fx.duration), delay: base + fx.start, easing: fx.animation.effect === 'appear' ? 'step-end' : 'ease-out', fill: 'backwards' }));
        }
        base += step.duration + (play.gap ?? 0);
      }
    }
    const live = started.filter((a): a is Animation => !!a);
    running.current = live;
    let cancelled = false;
    void settled(live).then(() => {
      if (cancelled) return;
      running.current = running.current.filter((a) => !live.includes(a));
      onPlayedRef.current?.(play.id);
    });
    return () => {
      cancelled = true;
    };
    // Plays once per play id; the slide it plays is the one rendered with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.id]);

  // Animations still running when the stage goes away are stopped.
  useLayoutEffect(() => () => finish(), []);

  const inKey = `${uid}-in`;
  const outKey = `${uid}-out`;
  const outSlide = outgoing && outgoing !== 'black' ? content.slides[outgoing.slide] : null;
  return (
    <div data-show-stage="" style={{ position: 'relative', width: width * scale, height: height * scale, overflow: 'hidden', background: '#000', flexShrink: 0 }}>
      {outgoing === 'black' && <div ref={outLayer} style={{ ...layerStyle, background: '#000' }} />}
      {outSlide && outgoing !== 'black' && (
        <div ref={outLayer} data-show-layer={outKey} style={layerStyle} aria-hidden>
          <HiddenObjects layer={outKey} ids={hiddenElementIds(outSlide, outgoing!.built)} />
          <SlideView key={outSlide.id} content={content} slide={outSlide} scale={scale} imageHost={imageHost} />
        </div>
      )}
      {current && (
        <div ref={inLayer} data-show-layer={inKey} data-show-slide={current.id} style={layerStyle}>
          <HiddenObjects layer={inKey} ids={hiddenElementIds(current, built)} />
          <SlideView key={current.id} content={content} slide={current} scale={scale} imageHost={imageHost} label={label} />
        </div>
      )}
    </div>
  );
});
