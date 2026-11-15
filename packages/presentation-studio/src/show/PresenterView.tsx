import { cn } from '@dcos/ui';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PresentationImageHost } from '../hosts';
import { fitScale } from '../geometry';
import { RichText } from '../render/RichText';
import { isEmptyRichText, type PresentationContent } from '../types';
import type { PresenterCommand, ShowSnapshot } from './channel';
import { buildsLeft, entryPosition, isEnd, nextSlideIndex } from './sequence';
import { ShowStage } from './ShowStage';

/** The size of an element, following it (the window's size where there is no layout, as in tests). */
export function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = r.width > 0 && r.height > 0 ? { width: r.width, height: r.height } : { width: window.innerWidth || 1024, height: window.innerHeight || 768 };
      setSize((s) => (s.width === next.width && s.height === next.height ? s : next));
    };
    measure();
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { ref, size };
}

/** Elapsed time with pause and reset (the presenter's timer). */
export function useStopwatch() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, (pausedAt ?? now) - startedAt);
  return {
    elapsed,
    paused: pausedAt !== null,
    pause: () => setPausedAt(Date.now()),
    resume: () => {
      if (pausedAt === null) return;
      const at = Date.now();
      setStartedAt((s) => s + (at - pausedAt));
      setPausedAt(null);
      setNow(at);
    },
    reset: () => {
      const at = Date.now();
      setStartedAt(at);
      setNow(at);
      setPausedAt((p) => (p === null ? null : at));
    },
  };
}

/** 0:05, 12:40, 1:02:03 */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span aria-label="Time of day" className="tabular-nums">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

const button = 'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-40';

export interface PresenterViewProps {
  content: PresentationContent;
  imageHost?: PresentationImageHost;
  snapshot: ShowSnapshot;
  /** The current slide at a scale: the live show stage in the page, a still slide in the presenter window. */
  current: (scale: number) => ReactNode;
  onCommand: (command: PresenterCommand) => void;
  /** A line about the link or the show, shown under the header. */
  status?: ReactNode;
}

/**
 * The presenter view: the current slide, the next one, the speaker notes, a timer with pause and reset, the time of
 * day and the slide number, with Previous, Next, Black screen and End show. Used in the presenter window and, on
 * phones (or when no second window can open), inside the slide show itself.
 */
export function PresenterView({ content, imageHost, snapshot, current, onCommand, status }: PresenterViewProps) {
  const { pos, screen } = snapshot;
  const timer = useStopwatch();
  const stage = useBoxSize<HTMLDivElement>();
  const next = nextSlideIndex(content, pos);
  const ended = isEnd(content, pos);
  const left = buildsLeft(content, pos);
  const slide = ended ? null : content.slides[pos.slide];
  const scale = stage.size.width ? fitScale(content.size, { width: stage.size.width, height: stage.size.height }).scale : 0;
  const nextScale = 240 / content.size.width;
  const counter = ended ? `End of slide show (${content.slides.length} slides)` : `Slide ${pos.slide + 1} of ${content.slides.length}`;

  return (
    <div
      data-presenter-view=""
      tabIndex={-1}
      // After a mouse or touch click on a button the focus goes back to the view, so Space and Enter move the show
      // instead of pressing that button again (Pause timer, End show…). After a key press it stays on the button.
      onClick={(e) => {
        if (e.detail > 0 && (e.target as Element).closest?.('button')) (e.currentTarget as HTMLElement).focus({ preventScroll: true });
      }}
      className="flex h-full min-h-0 flex-col bg-neutral-900 text-neutral-100 outline-none"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2 text-sm">
        <span role="status" aria-live="polite" className="font-semibold">
          {counter}
          {left > 0 && <span className="ml-2 font-normal text-neutral-400">({left === 1 ? '1 animation step left on this slide' : `${left} animation steps left on this slide`})</span>}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span aria-label="Time since the show started" className="font-mono text-base tabular-nums">
            {formatElapsed(timer.elapsed)}
          </span>
          <button type="button" className={cn(button, 'h-8 min-w-8 px-2 hover:bg-white/10')} aria-label={timer.paused ? 'Resume timer' : 'Pause timer'} title={timer.paused ? 'Resume timer' : 'Pause timer'} onClick={timer.paused ? timer.resume : timer.pause}>
            {timer.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button type="button" className={cn(button, 'h-8 min-w-8 px-2 hover:bg-white/10')} aria-label="Reset timer" title="Reset timer" onClick={timer.reset}>
            <RotateCcw size={16} />
          </button>
          <span className="text-neutral-400">
            <Clock />
          </span>
        </span>
        {status && <div className="w-full text-xs text-neutral-300">{status}</div>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:flex-row md:overflow-hidden">
        <section aria-label="Current slide" className="flex min-h-[180px] min-w-0 flex-col md:flex-[2]">
          <div ref={stage.ref} className="relative flex min-h-0 flex-1 items-center justify-center">
            {ended ? (
              <div className="flex aspect-video w-full items-center justify-center rounded bg-black text-sm text-neutral-400">End of slide show</div>
            ) : (
              scale > 0 && current(scale)
            )}
            {screen !== 'slide' && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs">{screen === 'black' ? 'The audience sees a black screen' : 'The audience sees a white screen'}</span>}
          </div>
        </section>

        <div className="flex min-h-0 min-w-0 flex-col gap-3 md:flex-1">
          <section aria-label="Next slide" className="shrink-0">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Next</h2>
            {left > 0 ? (
              <p className="text-sm text-neutral-300">The next click plays an animation on this slide.</p>
            ) : next !== null ? (
              <div className="w-fit overflow-hidden rounded border border-white/20">
                <ShowStage content={content} imageHost={imageHost} scale={nextScale} slide={next} built={entryPosition(content, next).built} play={null} reduced label={`Next: slide ${next + 1}`} />
              </div>
            ) : (
              <p className="text-sm text-neutral-300">{ended ? 'Nothing: the next click ends the show.' : 'End of slide show'}</p>
            )}
          </section>
          <section aria-label="Speaker notes" className="min-h-[80px] flex-1 overflow-y-auto rounded-lg bg-black/30 p-3 text-lg leading-relaxed">
            {!slide || isEmptyRichText(slide.notes) ? (
              <p className="text-base text-neutral-400">No notes for this slide.</p>
            ) : (
              <RichText doc={slide.notes} theme={{ ...content.theme, colors: { ...content.theme.colors, hyperlink: 'inherit' } }} />
            )}
          </section>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
        <button type="button" className={cn(button, 'bg-white/10 hover:bg-white/20')} onClick={() => onCommand({ type: 'previous' })}>
          <ChevronLeft size={18} /> Previous
        </button>
        <button type="button" className={cn(button, 'bg-sky-600 text-white hover:bg-sky-500')} onClick={() => onCommand({ type: 'next' })}>
          Next <ChevronRight size={18} />
        </button>
        <button type="button" aria-pressed={screen === 'black'} className={cn(button, screen === 'black' ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')} onClick={() => onCommand({ type: 'screen', screen: screen === 'black' ? 'slide' : 'black' })}>
          <Square size={16} /> Black screen
        </button>
        <button type="button" className={cn(button, 'bg-white/10 hover:bg-red-600')} onClick={() => onCommand({ type: 'end' })}>
          <X size={16} /> End show
        </button>
      </footer>
    </div>
  );
}
