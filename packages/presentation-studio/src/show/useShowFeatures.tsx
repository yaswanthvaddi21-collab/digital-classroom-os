import { Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { newId } from '../create';
import type { PresentationImageHost } from '../hosts';
import type { PresentationContent } from '../types';
import type { RibbonTab } from '../ui/Ribbon';
import { ToolButton } from '../ui/parts';
import { channelSupported, ShowLink, type ChannelFactory } from './channel';
import { prefersReducedMotion } from './effects';
import { enterFullscreen, exitFullscreen, isFullscreen } from './fullscreen';
import { PreviewOverlay } from './PreviewOverlay';
import { startPosition, type ShowPosition } from './sequence';
import { SlideShow, type ShowLayout } from './SlideShow';
import { AnimationsTab, SlideShowTab, TransitionsTab, type ShowTabContext } from './ShowTabs';

export interface ShowFeaturesOptions {
  content: PresentationContent;
  /** The current slide and the slides and objects selected in the editor. */
  slideId: string | null;
  slideIds: string[];
  elementIds: string[];
  title: string;
  imageHost?: PresentationImageHost;
  /** The address of the app's presenter window for a show session; without it the presenter view stays in the page. */
  presenterUrl?: (session: string) => string;
  /** Changes the content (one undo step; the same group one after another is one step). */
  apply: (change: (c: PresentationContent) => PresentationContent, group?: string) => void;
  /** Makes a slide the current one (where the show ended). */
  selectSlide: (slideId: string) => void;
  setHidden: (hidden: boolean) => void;
  /** The editor's root (F5 works while the focus is in it) and the slide on the canvas (previews cover it). */
  root: RefObject<HTMLElement | null>;
  stageAnchor: () => Element | null;
  /** Tests: the BroadcastChannel, window.open and the handshake time. */
  testing?: { channel?: ChannelFactory; open?: (url: string, name: string, features: string) => Window | null; handshakeMs?: number };
}

interface RunningShow {
  key: number;
  start: ShowPosition;
  layout: ShowLayout;
  presenter?: { link: ShowLink; popup: Window | null; handshakeMs?: number };
  fullscreenAsked: Promise<boolean> | null;
  /** Where the focus goes back to afterwards. */
  returnFocus: HTMLElement | null;
}

/** Follows prefers-reduced-motion. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/** Phones and other touch-only small screens get the presenter view on the same screen, not in a second window. */
function touchOnlySmallScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches && !window.matchMedia('(min-width: 768px)').matches;
  } catch {
    return false;
  }
}

/**
 * Everything the slide show adds to the editor (Phase 7 SHOW): the Transitions, Animations and Slide Show tabs, the
 * "Slide show" button, the show itself (with the presenter window or the in-page presenter view), the canvas previews,
 * and F5 / Shift+F5 / Alt+F5.
 */
export function useShowFeatures(o: ShowFeaturesOptions) {
  const { content, slideId, slideIds, elementIds } = o;
  const reduced = useReducedMotion();
  const [show, setShow] = useState<RunningShow | null>(null);
  const [preview, setPreview] = useState<{ key: number; what: 'transition' | 'animations'; slide: number } | null>(null);
  const seq = useRef(0);
  const optionsRef = useRef(o);
  optionsRef.current = o;
  const presenterWindow = !!o.presenterUrl && channelSupported() && !touchOnlySmallScreen();

  /** Starts the show. Runs inside the click or key press, so full screen and the second window are allowed. */
  const start = useCallback(
    (from: 'beginning' | 'current' | { slideId: string }, withPresenter = false) => {
      const opts = optionsRef.current;
      const c = opts.content;
      const begin = startPosition(c, from === 'beginning' ? null : from === 'current' ? opts.slideId : from.slideId);
      if (!begin || show) return;
      setPreview(null);
      const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const key = ++seq.current;
      let layout: ShowLayout = 'audience';
      let presenter: RunningShow['presenter'];
      if (withPresenter) {
        const canWindow = !!opts.presenterUrl && channelSupported() && !touchOnlySmallScreen();
        if (canWindow) {
          const session = newId();
          // The link listens before the window opens, so its first hello is heard.
          const link = new ShowLink({ session, title: opts.title, channel: opts.testing?.channel, content: () => c, state: { pos: begin, screen: 'slide' } });
          const open = opts.testing?.open ?? ((url: string, name: string, features: string) => window.open(url, name, features));
          let popup: Window | null = null;
          try {
            popup = open(opts.presenterUrl!(session), `dcos-presenter-${session}`, 'popup=yes,width=1100,height=720');
          } catch {
            popup = null;
          }
          presenter = { link, popup, handshakeMs: opts.testing?.handshakeMs };
        } else {
          layout = 'presenter';
        }
      }
      // Full screen needs the click: asked for now, even when opening the window has already used the click up (the
      // show then says "Press F").
      const fullscreenAsked = enterFullscreen();
      setShow({ key, start: begin, layout, presenter, fullscreenAsked, returnFocus });
    },
    [show],
  );

  const exit = useCallback((slide: number | null) => {
    setShow((s) => {
      const target = s?.returnFocus;
      setTimeout(() => target?.isConnected && target.focus(), 0);
      return null;
    });
    const s = slide === null ? null : optionsRef.current.content.slides[slide];
    if (s) optionsRef.current.selectSlide(s.id);
  }, []);

  // If the editor goes away during a show (the browser's Back button), the presenter window is told and full screen
  // ends. (Only on the editor's own unmount: the show's link is made by a click, never during a mount.)
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(
    () => () => {
      const s = showRef.current;
      if (!s) return;
      s.presenter?.link.close();
      if (isFullscreen()) void exitFullscreen();
    },
    [],
  );

  // F5, Shift+F5 and Alt+F5 while the focus is in the editor (or nowhere). F5 would otherwise reload the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5' || e.ctrlKey || e.metaKey) return;
      const t = e.target as Node | null;
      const root = optionsRef.current.root.current;
      if (!(t === document.body || (t && root?.contains(t)))) return;
      e.preventDefault();
      if (e.altKey) start('current', true);
      else start(e.shiftKey ? 'current' : 'beginning');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  const index = content.slides.findIndex((s) => s.id === slideId);
  const slide = index >= 0 ? content.slides[index] : null;
  const ctx: ShowTabContext = {
    content,
    slide,
    slideIds,
    selected: slide ? slide.elements.filter((e) => elementIds.includes(e.id)) : [],
    apply: o.apply,
    preview: (what) => index >= 0 && setPreview({ key: ++seq.current, what, slide: index }),
    reduced,
  };

  const tabs: RibbonTab[] = [
    { id: 'transitions', label: 'Transitions', content: <TransitionsTab {...ctx} /> },
    { id: 'animations', label: 'Animations', content: <AnimationsTab {...ctx} /> },
    {
      id: 'slideshow',
      label: 'Slide Show',
      content: <SlideShowTab content={content} slide={slide} slideIds={slideIds} start={(from, p) => start(from, p)} presenterWindow={presenterWindow} setHidden={o.setHidden} reduced={reduced} />,
    },
  ];

  const anyVisible = content.slides.some((s) => !s.hidden);
  const trailing: ReactNode = (
    <ToolButton label="Slide show" shortcut="F5" text="Slide show" disabled={!anyVisible} title={anyVisible ? 'Play the slide show from the first slide (F5)' : 'Every slide is hidden. Show a slide first.'} onClick={() => start('beginning')}>
      <Play size={16} />
    </ToolButton>
  );

  const closePreview = useCallback(() => setPreview(null), []);
  const overlays: ReactNode = (
    <>
      {preview && !show && <PreviewOverlay key={preview.key} content={content} imageHost={o.imageHost} slide={preview.slide} what={preview.what} reduced={reduced} anchor={o.stageAnchor} onDone={closePreview} />}
      {show && <SlideShow key={show.key} content={content} imageHost={o.imageHost} start={show.start} layout={show.layout} presenter={show.presenter} fullscreenAsked={show.fullscreenAsked} onExit={exit} />}
    </>
  );

  return { tabs, trailing, overlays, playFrom: (id: string) => start({ slideId: id }), running: !!show };
}
