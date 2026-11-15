/**
 * The presenter view's link to the slide show (Phase 7 SHOW). The show runs in the editor's window; the presenter view
 * is a second window of the app (window.open), and the two talk over a BroadcastChannel named after a per-show session
 * id. The presenter window says hello until the show answers with the presentation and where it is; after that each
 * side tells the other what changed, so either one can move the show.
 *
 * Messages are checked on arrival (asShowMessage): anything else on the channel is ignored.
 */
import type { PresentationContent } from '../types';
import type { ShowPosition } from './sequence';

export const presenterChannelName = (session: string) => `dcos-present:${session}`;

/** 'black' and 'white' blank the audience's screen (B and W keys). */
export type ShowScreen = 'slide' | 'black' | 'white';

export interface ShowSnapshot {
  pos: ShowPosition;
  screen: ShowScreen;
}

export type PresenterCommand =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'first' }
  | { type: 'last' }
  /** 1-based slide number, as in the slide list. */
  | { type: 'goto'; slide: number }
  | { type: 'screen'; screen: ShowScreen }
  | { type: 'end' };

export type ShowMessage =
  /** Presenter → show, repeated until it is welcomed. */
  | { kind: 'hello' }
  /** Show → presenter: everything the presenter view needs (the content as it is now, unsaved edits included). */
  | { kind: 'welcome'; title: string; content: PresentationContent; state: ShowSnapshot }
  /** Show → presenter, after every move. */
  | { kind: 'state'; state: ShowSnapshot }
  /** Presenter → show. */
  | { kind: 'command'; command: PresenterCommand }
  /** Show → presenter: the show is over. */
  | { kind: 'ended' }
  /** Presenter → show: its window is closing. */
  | { kind: 'bye' }
  /** Presenter → show: are you still there? (sent when the show has been quiet for a while). */
  | { kind: 'ping' }
  /** Show → presenter: the answer to a ping. */
  | { kind: 'alive' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPos = (v: unknown): v is ShowPosition => isObj(v) && Number.isInteger(v.slide) && Number.isInteger(v.built);
const SCREENS: readonly ShowScreen[] = ['slide', 'black', 'white'];
const isSnapshot = (v: unknown): v is ShowSnapshot => isObj(v) && isPos(v.pos) && SCREENS.includes(v.screen as ShowScreen);

function asCommand(v: unknown): PresenterCommand | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'next':
    case 'previous':
    case 'first':
    case 'last':
    case 'end':
      return { type: v.type };
    case 'goto':
      return Number.isInteger(v.slide) ? { type: 'goto', slide: v.slide as number } : null;
    case 'screen':
      return SCREENS.includes(v.screen as ShowScreen) ? { type: 'screen', screen: v.screen as ShowScreen } : null;
    default:
      return null;
  }
}

/** The message, if `data` is one; null for anything else. */
export function asShowMessage(data: unknown): ShowMessage | null {
  if (!isObj(data)) return null;
  switch (data.kind) {
    case 'hello':
    case 'ended':
    case 'bye':
    case 'ping':
    case 'alive':
      return { kind: data.kind };
    case 'state':
      return isSnapshot(data.state) ? { kind: 'state', state: data.state } : null;
    case 'command': {
      const command = asCommand(data.command);
      return command ? { kind: 'command', command } : null;
    }
    case 'welcome':
      return typeof data.title === 'string' && isObj(data.content) && Array.isArray((data.content as { slides?: unknown }).slides) && isSnapshot(data.state)
        ? { kind: 'welcome', title: data.title, content: data.content as unknown as PresentationContent, state: data.state }
        : null;
    default:
      return null;
  }
}

/** The part of BroadcastChannel the link uses (tests pass their own). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
export type ChannelFactory = (name: string) => ChannelLike;

export const browserChannel: ChannelFactory = (name) => new BroadcastChannel(name) as unknown as ChannelLike;

/** Whether this browser can link a presenter window at all. */
export const channelSupported = () => typeof BroadcastChannel === 'function';

export interface ShowLinkOptions {
  session: string;
  title: string;
  /** The content the show plays (sent in every welcome). */
  content: () => PresentationContent;
  /** Where the show starts; afterwards the last state given to sendState. */
  state: ShowSnapshot;
  channel?: ChannelFactory;
}

export interface ShowLinkHandlers {
  onCommand: (command: PresenterCommand) => void;
  /** The presenter window answered (once). */
  onConnected: () => void;
  /** The presenter window said it is closing. */
  onClosed: () => void;
}

/**
 * The show's end of the link, made before the presenter window is opened so no hello is missed. It answers every hello
 * with a welcome (a reloaded presenter window says hello again), passes commands on to its handlers, and sends the
 * position after every move.
 */
export class ShowLink {
  private readonly ch: ChannelLike;
  private connectedOnce = false;
  private open = true;
  private waiters: Array<() => void> = [];
  private handlers: ShowLinkHandlers | null = null;
  private state: ShowSnapshot;

  private readonly onPageHide = () => this.close();

  constructor(private readonly options: ShowLinkOptions) {
    this.state = options.state;
    this.ch = (options.channel ?? browserChannel)(presenterChannelName(options.session));
    this.ch.onmessage = (e) => this.receive(asShowMessage(e.data));
    // The show's window closing or reloading ends the show for the presenter window too (it would otherwise keep
    // showing buttons that move nothing).
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  get session() {
    return this.options.session;
  }

  get connected() {
    return this.connectedOnce;
  }

  get closed() {
    return !this.open;
  }

  /** Who hears commands and the link's news from now on (null: nobody). */
  listen(handlers: ShowLinkHandlers | null) {
    this.handlers = handlers;
  }

  private receive(msg: ShowMessage | null) {
    if (!msg || !this.open) return;
    if (msg.kind === 'hello') {
      this.ch.postMessage({ kind: 'welcome', title: this.options.title, content: this.options.content(), state: this.state } satisfies ShowMessage);
      if (!this.connectedOnce) {
        this.connectedOnce = true;
        this.handlers?.onConnected();
        for (const w of this.waiters.splice(0)) w();
      }
    } else if (msg.kind === 'ping') {
      // Answered at once (an event, not a timer, so a show window the browser throttles still answers).
      this.ch.postMessage({ kind: 'alive' } satisfies ShowMessage);
    } else if (msg.kind === 'command') {
      this.handlers?.onCommand(msg.command);
    } else if (msg.kind === 'bye') {
      this.handlers?.onClosed();
    }
  }

  /** Resolves true once the presenter window has said hello, false after `ms` without one (or once closed). */
  waitForHello(ms: number): Promise<boolean> {
    if (this.connectedOnce) return Promise.resolve(true);
    if (!this.open) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve(this.connectedOnce);
      }, ms);
      const done = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.waiters.push(done);
    });
  }

  /** Remembers where the show is (for later welcomes) and tells the presenter window. */
  sendState(state: ShowSnapshot) {
    this.state = state;
    if (this.open && this.connectedOnce) this.ch.postMessage({ kind: 'state', state } satisfies ShowMessage);
  }

  /** Tells the presenter window the show is over, and stops listening. */
  close() {
    if (!this.open) return;
    try {
      this.ch.postMessage({ kind: 'ended' } satisfies ShowMessage);
    } catch {
      // The channel may already be gone.
    }
    this.open = false;
    this.handlers = null;
    this.ch.onmessage = null;
    this.ch.close();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
  }
}

/** How often a quiet show is asked whether it is still there, and how long without any answer means it is gone. */
export const PRESENTER_PING_MS = 1500;
export const PRESENTER_LOST_MS = 5000;

export interface PresenterLinkHandlers {
  onWelcome: (msg: Extract<ShowMessage, { kind: 'welcome' }>) => void;
  onState: (state: ShowSnapshot) => void;
  onEnded: () => void;
  /** The show stopped answering (its window was closed, reloaded or crashed without saying so). */
  onLost?: () => void;
}

/**
 * The presenter window's end: says hello every `every` ms until welcomed, then follows the show. Returns `send` for
 * commands and `close`.
 */
export function connectPresenter(session: string, handlers: PresenterLinkHandlers, options: { channel?: ChannelFactory; every?: number; pingMs?: number; lostMs?: number } = {}) {
  const ch = (options.channel ?? browserChannel)(presenterChannelName(session));
  let welcomed = false;
  let open = true;
  let heard = Date.now();
  /** When the first ping since the show was last heard went out (wall time); null when none is waiting for an answer. */
  let pingedAt: number | null = null;
  const hear = () => {
    heard = Date.now();
    pingedAt = null;
  };
  const hello = () => open && !welcomed && ch.postMessage({ kind: 'hello' } satisfies ShowMessage);
  const timer = setInterval(hello, options.every ?? 400);
  // Once linked: a show quiet for a while is asked whether it is still there; a ping left unanswered for the rest of
  // the window (lostMs - pingMs, measured from when it was sent) means the show is gone (its window closed without a
  // goodbye), and the presenter window says so instead of offering dead buttons.
  // Silence alone never counts as loss: a hidden presenter window's timers can be throttled to one tick a minute
  // (Chrome's intensive throttling, Safari's hidden tabs), so the first tick after such a gap finds a long quiet
  // stretch although the show is there. That tick only sends a ping; the show answers it at once (a message event,
  // which is not throttled), and only a ping that has stayed unanswered for the window is loss.
  const pingMs = options.pingMs ?? PRESENTER_PING_MS;
  const lostMs = options.lostMs ?? PRESENTER_LOST_MS;
  const answerMs = Math.max(0, lostMs - pingMs);
  const watch = setInterval(() => {
    if (!open || !welcomed) return;
    const now = Date.now();
    if (now - heard < pingMs) return;
    if (pingedAt !== null && now - heard >= lostMs && now - pingedAt >= answerMs) {
      handlers.onLost?.();
      stop();
      return;
    }
    if (pingedAt === null) pingedAt = now;
    ch.postMessage({ kind: 'ping' } satisfies ShowMessage);
  }, Math.max(100, Math.floor(pingMs / 2)));
  ch.onmessage = (e) => {
    const msg = asShowMessage(e.data);
    if (!msg || !open) return;
    if (msg.kind === 'welcome') {
      welcomed = true;
      hear();
      clearInterval(timer);
      handlers.onWelcome(msg);
    } else if (!welcomed) return;
    // Only the show's own messages count as hearing from it (another presenter window's hello or ping does not).
    if (msg.kind === 'state' || msg.kind === 'ended' || msg.kind === 'alive') hear();
    if (msg.kind === 'state') handlers.onState(msg.state);
    else if (msg.kind === 'ended') handlers.onEnded();
  };
  hello();
  const stop = () => {
    open = false;
    clearInterval(timer);
    clearInterval(watch);
    ch.onmessage = null;
    ch.close();
  };
  return {
    send: (command: PresenterCommand) => open && welcomed && ch.postMessage({ kind: 'command', command } satisfies ShowMessage),
    /** Stops following the show; with `bye`, tells it this window is closing. */
    close: (bye = false) => {
      if (!open) return;
      clearInterval(timer);
      clearInterval(watch);
      if (bye) {
        try {
          ch.postMessage({ kind: 'bye' } satisfies ShowMessage);
        } catch {
          // ignore
        }
      }
      open = false;
      ch.onmessage = null;
      ch.close();
    },
  };
}
