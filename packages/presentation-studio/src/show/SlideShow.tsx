import { cn } from '@dcos/ui';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { fitScale } from '../geometry';
import type { PresentationImageHost } from '../hosts';
import type { PresentationContent } from '../types';
import type { PresenterCommand, ShowLink, ShowScreen, ShowSnapshot } from './channel';
import { prefersReducedMotion } from './effects';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange } from './fullscreen';
import { showKeyAction } from './keys';
import { PresenterView, useBoxSize } from './PresenterView';
import { clampPosition, firstPosition, goToSlideNumber, isEnd, lastPosition, nextPosition, previousPosition, visibleSlides, type MoveKind, type ShowPosition } from './sequence';
import { ShowStage, type ShowStageApi, type StagePlay } from './ShowStage';

/**
 * How long the slide show waits for the presenter window to say hello. After that the second window is closed and the
 * show offers the presenter view on its own screen; it never switches by itself, because the audience may be watching
 * this screen (a mirrored projector would show them the notes).
 */
export const HANDSHAKE_MS = 4000;

export type ShowLayout = 'audience' | 'presenter';

export interface SlideShowProps {
  content: PresentationContent;
  imageHost?: PresentationImageHost;
  start: ShowPosition;
  /** 'presenter' = the presenter view inside the show (phones, or when no presenter window could be used). */
  layout: ShowLayout;
  /** The presenter window opened for this show: its link (made before window.open) and window.open's result. */
  presenter?: { link: ShowLink; popup: Window | null; handshakeMs?: number };
  /** Full screen asked for when the show started (its result), or null when it was not asked for. */
  fullscreenAsked: Promise<boolean> | null;
  /** The show ended; `slide` is where it was (index into content.slides), null at the end screen. */
  onExit: (slide: number | null) => void;
}

/** Messages shown at the top of the show, each for a few seconds (several can show at once). */
function useNotice() {
  const [notices, setNotices] = useState<Array<{ text: string; id: number }>>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const show = useCallback((text: string) => {
    const id = ++seq.current;
    setNotices((n) => [...n.filter((x) => x.text !== text), { text, id }].slice(-3));
    const t = setTimeout(() => {
      timers.current.delete(t);
      setNotices((n) => n.filter((x) => x.id !== id));
    }, 6000);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);
  return { notices, show };
}

/** Keeps the screen awake during the show where the browser can (Screen Wake Lock API). */
function useWakeLock() {
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }) : null;
    if (!nav?.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let done = false;
    nav.wakeLock.request('screen').then(
      (l) => (done ? void l.release().catch(() => undefined) : (lock = l)),
      () => undefined,
    );
    return () => {
      done = true;
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, textarea');

/**
 * The slide show (Phase 7 SHOW): a modal dialog over the whole page, full screen where the browser allows. Keys,
 * clicks, taps (left third back) and swipes move it; hidden slides are skipped; a black screen ends it. Transitions and
 * build animations play with Web Animations, as cuts with reduced motion. With a presenter window, every move is sent
 * to it and its buttons move the show.
 */
export function SlideShow({ content, imageHost, start, layout: initialLayout, presenter, fullscreenAsked, onExit }: SlideShowProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const stage = useRef<ShowStageApi>(null);
  
  const [screen, setScreen] = useState<ShowScreen>('slide');
  const [layout, setLayout] = useState<ShowLayout>(initialLayout);
  // The first slide comes in with its transition (from black) and its automatic build, as in PowerPoint.
  const first = clampPosition(content, start);
  const [play, setPlay] = useState<StagePlay | null>(() => ({ id: 1, transition: content.slides[first.slide]?.transition, steps: first.built > 0 ? [0] : [] }));
  const [outgoing, setOutgoing] = useState<{ slide: number; built: number } | 'black' | null>(() => (content.slides[first.slide]?.transition ? 'black' : null));
  const [digits, setDigits] = useState('');
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [controls, setControls] = useState(true);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [announce, setAnnounce] = useState(() => `Slide show. Slide ${first.slide + 1} of ${content.slides.length}`);
  const [pos, setPos] = useState<ShowPosition>(first);
  const { notices, show: say } = useNotice();
  const box = useBoxSize<HTMLDivElement>();
  useWakeLock();

  const posRef = useRef(pos);
  posRef.current = pos;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const playSeq = useRef(1);
  const ended = useRef(false);
  /** Full screen was on during this show (so leaving it with the browser's own Escape ends the show). */
  const ownsFullscreen = useRef(false);
  const leavingOnPurpose = useRef(false);
  const visibleCount = visibleSlides(content).length;

  // ── Moving ──────────────────────────────────────────────────────────────────────────────────────

  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    stage.current?.finish();
    presenter?.link.close();
    if (ownsFullscreen.current && isFullscreen()) {
      leavingOnPurpose.current = true;
      void exitFullscreen();
    }
    const d = dialog.current;
    if (d?.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
    const p = posRef.current;
    onExit(isEnd(content, p) ? null : p.slide);
  }, [content, onExit, presenter]);

  const move = useCallback(
    (kind: MoveKind, next: ShowPosition) => {
      if (kind === 'exit') return end();
      if (kind === 'none') return;
      stage.current?.finish();
      const from = posRef.current;
      const id = ++playSeq.current;
      if (kind === 'slide' && !isEnd(content, from)) {
        setOutgoing({ slide: from.slide, built: from.built });
        setPlay({ id, transition: content.slides[next.slide].transition, steps: next.built > 0 ? [0] : [] });
      } else if (kind === 'slide' || kind === 'jump') {
        setOutgoing(null);
        setPlay({ id, steps: next.built > 0 ? [0] : [] });
      } else if (kind === 'build') {
        setOutgoing(null);
        setPlay({ id, steps: [next.built - 1] });
      } else {
        setOutgoing(null);
        setPlay(null);
      }
      posRef.current = next;
      setPos(next);
      if (next.slide !== from.slide) setAnnounce(isEnd(content, next) ? 'End of slide show. Click or press an arrow key to exit.' : `Slide ${next.slide + 1} of ${content.slides.length}`);
    },
    [content, end],
  );

  /** A blanked screen comes back first; the next press then moves. */
  const unblank = () => {
    if (screenRef.current === 'slide') return false;
    screenRef.current = 'slide';
    setScreen('slide');
    setAnnounce('Back to the slide');
    return true;
  };

  const actions = {
    next: () => {
      if (unblank()) return;
      const r = nextPosition(content, posRef.current);
      move(r.kind, r.pos);
    },
    previous: () => {
      if (unblank()) return;
      const r = previousPosition(content, posRef.current);
      move(r.kind, r.pos);
    },
    first: () => {
      unblank();
      const p = firstPosition(content);
      if (p) move('jump', p);
    },
    last: () => {
      unblank();
      const p = lastPosition(content);
      if (p) move('jump', p);
    },
    goto: (n: number) => {
      unblank();
      const p = goToSlideNumber(content, n);
      if (p) move('jump', p);
      else say(`There is no slide ${n}.`);
    },
    screen: (s: ShowScreen) => {
      const next = screenRef.current === s ? 'slide' : s;
      screenRef.current = next;
      setScreen(next);
      setAnnounce(next === 'black' ? 'Black screen. Press B to come back.' : next === 'white' ? 'White screen. Press W to come back.' : 'Back to the slide');
    },
    fullscreen: () => {
      if (isFullscreen()) {
        leavingOnPurpose.current = true;
        void exitFullscreen();
        return;
      }
      if (!fullscreenSupported()) {
        say('Full screen is not available in this browser. The slide show fills the window.');
        return;
      }
      void enterFullscreen().then((ok) => !ok && say('Full screen was not allowed. Press F to try again.'));
    },
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const onCommand = useCallback((c: PresenterCommand) => {
    const a = actionsRef.current;
    if (c.type === 'next') a.next();
    else if (c.type === 'previous') a.previous();
    else if (c.type === 'first') a.first();
    else if (c.type === 'last') a.last();
    else if (c.type === 'goto') a.goto(c.slide);
    else if (c.type === 'screen') {
      if (c.screen === 'slide') unblank();
      else a.screen(c.screen);
    } else if (c.type === 'end') endRef.current();
  }, []);
  const endRef = useRef(end);
  endRef.current = end;

  // ── The dialog, full screen, reduced motion ─────────────────────────────────────────────────────

  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    surface.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let live = true;
    if (fullscreenAsked) {
      void fullscreenAsked.then((ok) => {
        if (!live || ended.current) return;
        if (ok) return;
        say(fullscreenSupported() ? 'Press F for full screen.' : 'Full screen is not available in this browser. The slide show fills the window.');
      });
    }
    return () => {
      live = false;
    };
  }, [fullscreenAsked, say]);

  useEffect(
    () =>
      onFullscreenChange(() => {
        const on = isFullscreen();
        setFullscreen(on);
        if (on) {
          ownsFullscreen.current = true;
          // The full-screen page joins the top layer after the show's dialog (WebKit then draws the editor over the
          // show): opening the dialog again puts it back on top. Its 'close' event, which comes later, is ignored
          // because the dialog is open again by then.
          const d = dialog.current;
          if (d?.open && typeof d.showModal === 'function' && !ended.current) {
            d.close();
            d.showModal();
            surface.current?.focus({ preventScroll: true });
          }
          return;
        }
        // Leaving full screen with the browser's own Escape ends the show, as in PowerPoint and Keynote.
        if (ownsFullscreen.current && !leavingOnPurpose.current) endRef.current();
        leavingOnPurpose.current = false;
      }),
    [],
  );
  useEffect(() => {
    if (isFullscreen()) ownsFullscreen.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // ── The presenter window ────────────────────────────────────────────────────────────────────────

  const [linkState, setLinkState] = useState<'none' | 'waiting' | 'connected' | 'closed'>(presenter ? 'waiting' : 'none');
  /** Why no presenter window could be used: the show then asks before showing the presenter view on this screen. */
  const [offerHere, setOfferHere] = useState<string | null>(null);
  useEffect(() => {
    if (!presenter) return;
    const { link, popup } = presenter;
    let live = true;
    link.listen({
      onCommand: (c) => onCommand(c),
      onConnected: () => undefined,
      onClosed: () => {
        if (!live) return;
        setLinkState('closed');
        say('The presenter window was closed. The slide show goes on here.');
      },
    });
    if (!popup) {
      setLinkState('none');
      setOfferHere('The browser did not open a second window for the presenter view.');
      link.close();
      return;
    }
    void link.waitForHello(presenter.handshakeMs ?? HANDSHAKE_MS).then((ok) => {
      if (!live || ended.current) return;
      if (ok) {
        setLinkState('connected');
        say('The presenter view is open in the other window.');
        return;
      }
      setLinkState('none');
      try {
        popup.close();
      } catch {
        // ignore
      }
      link.close();
      setOfferHere('The presenter window did not respond, so it was closed.');
    });
    return () => {
      live = false;
      link.listen(null);
    };
  }, [presenter, onCommand, say]);

  // Every move reaches the presenter window.
  useEffect(() => {
    presenter?.link.sendState({ pos, screen });
  }, [presenter, linkState, pos, screen]);

  // The controls hide after a few seconds without the mouse moving.
  useEffect(() => {
    if (!controls) return;
    const t = setTimeout(() => setControls(false), 3000);
    return () => clearTimeout(t);
  }, [controls, pos]);

  // ── Input ───────────────────────────────────────────────────────────────────────────────────────

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // The editor under the show (undo, save, F5…) never hears keys pressed in it, and F5 does not reload the page.
    e.stopPropagation();
    const action = showKeyAction(e);
    if (!action) {
      // F5 would reload the page; Ctrl/⌘+S and P would open the browser's Save page and Print dialogs over the show
      // (the editor's own Save never hears keys pressed in the show).
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && /^[sp]$/i.test(e.key))) e.preventDefault();
      return;
    }
    if (isControl(e.target) && (e.key === 'Enter' || e.key === ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    if (action.type === 'digit') {
      setDigits((d) => (d + action.digit).slice(-4));
      return;
    }
    const typed = digits;
    setDigits('');
    switch (action.type) {
      case 'enter':
        if (typed) actions.goto(Number(typed));
        else actions.next();
        break;
      case 'next':
        actions.next();
        break;
      case 'previous':
        actions.previous();
        break;
      case 'first':
        actions.first();
        break;
      case 'last':
        actions.last();
        break;
      case 'black':
        actions.screen('black');
        break;
      case 'white':
        actions.screen('white');
        break;
      case 'fullscreen':
        actions.fullscreen();
        break;
      case 'end':
        end();
        break;
    }
  };

  const down = useRef<{ x: number; y: number; type: string } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (isControl(e.target)) return;
    // Any touch or click brings the controls back for a few seconds (touch screens have no hover).
    setControls(true);
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || isControl(e.target)) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.type !== 'mouse') {
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) actions.next();
        else actions.previous();
        return;
      }
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
      // A tap on the left third goes back; anywhere else goes on.
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && e.clientX < r.left + r.width / 3) actions.previous();
      else actions.next();
      return;
    }
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
    actions.next();
  };

  // ── Drawing ─────────────────────────────────────────────────────────────────────────────────────

  const atEnd = isEnd(content, pos);
  const label = atEnd ? 'End of slide show' : `Slide ${pos.slide + 1} of ${content.slides.length}`;
  const stageFor = (scale: number) => (
    <div className="relative">
      <ShowStage
        ref={stage}
        content={content}
        imageHost={imageHost}
        scale={scale}
        slide={pos.slide}
        built={pos.built}
        outgoing={outgoing}
        play={play}
        reduced={reduced}
        onPlayed={(id) => id === playSeq.current && setOutgoing(null)}
        label={label}
      />
      {screen !== 'slide' && <div data-show-blank={screen} aria-hidden className="absolute inset-0" style={{ background: screen === 'black' ? '#000' : '#fff' }} />}
    </div>
  );
  const scale = box.size.width ? fitScale(content.size, box.size).scale : 0;
  const snapshot: ShowSnapshot = { pos, screen };

  return (
    <dialog
      ref={dialog}
      aria-label="Slide show"
      data-slide-show={layout}
      onCancel={(e) => {
        e.preventDefault();
        end();
      }}
      onClose={() => {
        // Closed and opened again at once to stay above the full-screen page (see onFullscreenChange): not an end.
        if (dialog.current?.open) return;
        end();
      }}
      onKeyDown={onKeyDown}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-black p-0 text-white outline-none backdrop:bg-black"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
      <div role="status" className="pointer-events-none absolute left-1/2 top-4 z-20 flex max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2">
        {notices.map((n) => (
          <p key={n.id} className="rounded-lg bg-black/80 px-4 py-2 text-center text-sm text-white shadow-lg ring-1 ring-white/20">
            {n.text}
          </p>
        ))}
      </div>
      {offerHere && layout === 'audience' && (
        <div role="group" aria-label="Presenter view" data-presenter-offer="" className="absolute left-1/2 top-4 z-30 flex w-[min(34rem,92vw)] -translate-x-1/2 flex-col gap-3 rounded-lg bg-neutral-900/95 p-4 text-sm text-white shadow-xl ring-1 ring-white/20">
          <p>
            {offerHere} You can show the presenter view (notes, timer and next slide) on this screen instead. Only do this if the audience cannot see this screen.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-sky-400" onClick={() => {
                setOfferHere(null);
                setTimeout(() => surface.current?.focus({ preventScroll: true }), 0);
              }}>
              Keep the audience view
            </button>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-3 py-1.5 hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-400"
              onClick={() => {
                setOfferHere(null);
                setLayout('presenter');
                // The keys go on moving the show from the presenter layout.
                setTimeout(() => surface.current?.focus({ preventScroll: true }), 0);
              }}
            >
              Presenter view on this screen
            </button>
          </div>
        </div>
      )}
      {digits && (
        <div aria-live="polite" className="absolute right-4 top-4 z-20 rounded bg-black/80 px-3 py-1 font-mono text-lg">
          Go to slide {digits}…
        </div>
      )}

      {layout === 'presenter' ? (
        <div ref={surface} tabIndex={-1} className="h-full outline-none" data-show-surface="">
          <PresenterView
            content={content}
            imageHost={imageHost}
            snapshot={snapshot}
            onCommand={onCommand}
            status={visibleCount < content.slides.length ? `${content.slides.length - visibleCount} hidden ${content.slides.length - visibleCount === 1 ? 'slide is' : 'slides are'} skipped.` : undefined}
            current={(s) => (
              <div className="touch-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp} data-show-tap="">
                {stageFor(s)}
              </div>
            )}
          />
        </div>
      ) : (
        <div
          ref={(el) => {
            surface.current = el;
            (box.ref as { current: HTMLDivElement | null }).current = el;
          }}
          tabIndex={-1}
          data-show-surface=""
          data-show-tap=""
          className="relative flex h-full w-full touch-none select-none items-center justify-center outline-none"
          style={{ cursor: controls ? 'default' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={(e) => e.pointerType === 'mouse' && !controls && setControls(true)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {atEnd ? (
            <p className="px-6 text-center text-base text-neutral-300">End of slide show. Click to exit.</p>
          ) : (
            scale > 0 && stageFor(scale)
          )}
          <div
            role="toolbar"
            aria-label="Slide show controls"
            onFocus={() => setControls(true)}
            className={cn('absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-black/70 p-1 text-sm text-white shadow-lg ring-1 ring-white/15 transition-opacity focus-within:opacity-100', controls ? 'opacity-100' : 'opacity-0')}
          >
            <ShowButton label="Previous" onClick={actions.previous}>
              <ChevronLeft size={18} />
            </ShowButton>
            <span className="px-2 tabular-nums" aria-hidden>
              {atEnd ? 'End' : `${pos.slide + 1} / ${content.slides.length}`}
            </span>
            <ShowButton label="Next" onClick={actions.next}>
              <ChevronRight size={18} />
            </ShowButton>
            {fullscreenSupported() && (
              <ShowButton label={fullscreen ? 'Leave full screen' : 'Full screen'} onClick={actions.fullscreen}>
                {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </ShowButton>
            )}
            <ShowButton label="End show" onClick={end}>
              <X size={18} />
            </ShowButton>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * A button of the show's controls. After a mouse or touch click the focus goes back to the slide, so Space and Enter
 * move the show again instead of pressing the button once more; after a key press it stays on the button.
 */
function ShowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        onClick();
        if (e.detail > 0) (e.currentTarget.closest('[data-show-surface]') as HTMLElement | null)?.focus({ preventScroll: true });
      }}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-sky-400">
      {children}
    </button>
  );
}
