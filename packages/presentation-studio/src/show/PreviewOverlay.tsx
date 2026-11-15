import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PresentationImageHost } from '../hosts';
import type { PresentationContent } from '../types';
import { buildSteps, fullyBuilt } from './sequence';
import { ShowStage } from './ShowStage';

export interface PreviewOverlayProps {
  content: PresentationContent;
  imageHost?: PresentationImageHost;
  /** Index into content.slides. */
  slide: number;
  what: 'transition' | 'animations';
  reduced: boolean;
  /** The element the preview covers (the slide on the canvas). */
  anchor: () => Element | null;
  onDone: () => void;
}

/** Pause after the last effect before the preview goes away. */
const LINGER_MS = 400;
/** Gap between two build steps in the animation preview. */
const STEP_GAP_MS = 400;

/**
 * Plays a slide's transition (from the slide before it, or from black) or all its animations one step after another,
 * over the slide on the canvas, then goes away. A click or Escape stops it early. It changes nothing.
 */
export function PreviewOverlay({ content, imageHost, slide, what, reduced, anchor, onDone }: PreviewOverlayProps) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor()?.getBoundingClientRect();
    const W = content.size.width;
    const H = content.size.height;
    if (r && r.width > 0 && r.height > 0) setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    else {
      // No layout (tests) or no canvas: a centred preview at half size.
      const width = W / 2;
      setRect({ left: Math.max(0, ((window.innerWidth || W) - width) / 2), top: 16, width, height: (H * width) / W });
    }
  }, [anchor, content.size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onDone();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);

  // Once everything has played, the preview lingers a moment and goes.
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    if (!played) return;
    const t = setTimeout(onDone, LINGER_MS);
    return () => clearTimeout(t);
  }, [played, onDone]);

  const s = content.slides[slide];
  if (!s || !rect) return null;
  const steps = buildSteps(s);
  const scale = rect.width / content.size.width;
  const isTransition = what === 'transition';
  return createPortal(
    <div
      data-show-preview={what}
      role="status"
      aria-label={isTransition ? 'Previewing the transition' : 'Previewing the animations'}
      onPointerDown={(e) => {
        e.preventDefault();
        onDone();
      }}
      style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 60, cursor: 'pointer' }}
    >
      <ShowStage
        content={content}
        imageHost={imageHost}
        scale={scale}
        slide={slide}
        built={steps.length}
        outgoing={isTransition ? (slide > 0 ? fullyBuilt(content, slide - 1) : 'black') : null}
        play={isTransition ? { id: 1, transition: s.transition, steps: [] } : { id: 1, steps: steps.map((_, i) => i), gap: STEP_GAP_MS }}
        reduced={reduced}
        onPlayed={() => setPlayed(true)}
      />
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">Preview: click to stop</span>
    </div>,
    document.body,
  );
}
