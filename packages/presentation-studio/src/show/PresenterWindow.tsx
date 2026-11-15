import { useEffect, useRef, useState } from 'react';
import type { PresentationImageHost } from '../hosts';
import type { PresentationContent } from '../types';
import { connectPresenter, type ChannelFactory, type PresenterCommand, type ShowSnapshot } from './channel';
import { showKeyAction } from './keys';
import { PresenterView } from './PresenterView';
import { clampPosition } from './sequence';
import { ShowStage } from './ShowStage';

/** How long the presenter window waits for its slide show before saying it is not linked to one. */
export const PRESENTER_WAIT_MS = 10_000;

export interface PresenterWindowProps {
  /** The show's session id (from the window's address). */
  session: string;
  imageHost?: PresentationImageHost;
  channel?: ChannelFactory;
  waitMs?: number;
}

type State =
  | { phase: 'waiting' }
  | { phase: 'lost' }
  | { phase: 'live'; title: string; content: PresentationContent; snapshot: ShowSnapshot }
  | { phase: 'ended'; title: string }
  /** The show stopped answering without ending (its window was closed or reloaded). */
  | { phase: 'gone'; title: string };

/**
 * The presenter window (Phase 7 SHOW), opened by the slide show with window.open. It links to the show over a
 * BroadcastChannel, shows the presenter view from the show's own copy of the presentation (unsaved edits included),
 * and moves the show with its buttons and keys. It never opens or saves the presentation itself.
 */
export function PresenterWindow({ session, imageHost, channel, waitMs = PRESENTER_WAIT_MS }: PresenterWindowProps) {
  const [state, setState] = useState<State>({ phase: 'waiting' });
  const [closeRefused, setCloseRefused] = useState(false);
  const link = useRef<ReturnType<typeof connectPresenter> | null>(null);
  const digits = useRef('');

  useEffect(() => {
    const l = connectPresenter(
      session,
      {
        onWelcome: (msg) => {
          document.title = `Presenter view: ${msg.title}`;
          setState({ phase: 'live', title: msg.title, content: msg.content, snapshot: { ...msg.state, pos: clampPosition(msg.content, msg.state.pos) } });
        },
        onState: (snapshot) => setState((s) => (s.phase === 'live' ? { ...s, snapshot: { ...snapshot, pos: clampPosition(s.content, snapshot.pos) } } : s)),
        onLost: () => setState((s) => ({ phase: 'gone', title: s.phase === 'live' ? s.title : '' })),
        onEnded: () => {
          setState((s) => ({ phase: 'ended', title: s.phase === 'live' ? s.title : '' }));
          // A window the show opened may close itself.
          try {
            window.close();
          } catch {
            // ignore
          }
        },
      },
      { channel },
    );
    link.current = l;
    const onHide = () => l.close(true);
    window.addEventListener('pagehide', onHide);
    const timer = setTimeout(() => setState((s) => (s.phase === 'waiting' ? { phase: 'lost' } : s)), waitMs);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', onHide);
      l.close();
      link.current = null;
    };
  }, [session, channel, waitMs]);

  const send = (c: PresenterCommand) => link.current?.send(c);

  // The show's keys work here too.
  const live = state.phase === 'live';
  const snapshotRef = useRef<ShowSnapshot | null>(null);
  snapshotRef.current = live ? state.snapshot : null;
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      const a = showKeyAction(e);
      if (!a || a.type === 'fullscreen') return;
      const t = e.target as Element | null;
      if (t?.closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return;
      e.preventDefault();
      if (a.type === 'digit') {
        digits.current = (digits.current + a.digit).slice(-4);
        return;
      }
      const typed = digits.current;
      digits.current = '';
      const screen = snapshotRef.current?.screen ?? 'slide';
      if (a.type === 'enter') send(typed ? { type: 'goto', slide: Number(typed) } : { type: 'next' });
      else if (a.type === 'black') send({ type: 'screen', screen: screen === 'black' ? 'slide' : 'black' });
      else if (a.type === 'white') send({ type: 'screen', screen: screen === 'white' ? 'slide' : 'white' });
      else send({ type: a.type });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  if (state.phase === 'live') {
    const { content, snapshot } = state;
    return (
      <main className="h-[100dvh]" aria-label="Presenter view">
        <PresenterView
          content={content}
          imageHost={imageHost}
          snapshot={snapshot}
          onCommand={send}
          current={(scale) =>
            snapshot.pos.slide < content.slides.length && (
              <ShowStage content={content} imageHost={imageHost} scale={scale} slide={snapshot.pos.slide} built={snapshot.pos.built} play={null} reduced label={`Current: slide ${snapshot.pos.slide + 1}`} />
            )
          }
        />
      </main>
    );
  }

  const message =
    state.phase === 'waiting'
      ? 'Connecting to the slide show…'
      : state.phase === 'ended'
        ? 'The slide show has ended. You can close this window.'
        : state.phase === 'gone'
          ? 'The slide show is no longer running: its window was closed or reloaded. Start the show again from the presentation, then close this window.'
        : 'This presenter view is not linked to a slide show. Start one from a presentation: Slide Show, then Presenter view.';
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-neutral-900 p-6 text-center text-neutral-100" aria-label="Presenter view">
      <p role="status">{message}</p>
      {/* A window the show opened can close itself, even after the show's own window is gone (window.opener is then
          null). If the browser refuses, the page says so rather than leaving a button that does nothing. */}
      {state.phase !== 'waiting' && typeof window !== 'undefined' && !closeRefused && (
        <button
          type="button"
          onClick={() => {
            window.close();
            setTimeout(() => !window.closed && setCloseRefused(true), 300);
          }}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Close this window
        </button>
      )}
      {closeRefused && <p className="text-sm text-neutral-300">The browser did not let this page close its window. Close it with the browser’s own controls.</p>}
    </main>
  );
}
