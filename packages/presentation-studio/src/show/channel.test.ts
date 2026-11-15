import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { asShowMessage, connectPresenter, PRESENTER_LOST_MS, PRESENTER_PING_MS, presenterChannelName, ShowLink } from './channel';
import { memoryChannels } from './testChannels';

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.useRealTimers());

describe('messages', () => {
  it('accepts only well-formed messages', () => {
    expect(asShowMessage({ kind: 'hello' })).toEqual({ kind: 'hello' });
    expect(asShowMessage({ kind: 'command', command: { type: 'goto', slide: 3 } })).toEqual({ kind: 'command', command: { type: 'goto', slide: 3 } });
    expect(asShowMessage({ kind: 'command', command: { type: 'goto', slide: '3' } })).toBeNull();
    expect(asShowMessage({ kind: 'command', command: { type: 'screen', screen: 'red' } })).toBeNull();
    expect(asShowMessage({ kind: 'state', state: { pos: { slide: 1, built: 0 }, screen: 'black' } })).not.toBeNull();
    expect(asShowMessage({ kind: 'state', state: { pos: { slide: 1.5, built: 0 }, screen: 'slide' } })).toBeNull();
    expect(asShowMessage({ kind: 'welcome', title: 'T', content: { slides: 'no' }, state: { pos: { slide: 0, built: 0 }, screen: 'slide' } })).toBeNull();
    expect(asShowMessage('hello')).toBeNull();
    expect(asShowMessage({ kind: 'other' })).toBeNull();
    expect(presenterChannelName('abc')).toBe('dcos-present:abc');
  });
});

describe('the link between the show and the presenter window', () => {
  it('shakes hands, then keeps both sides in step, and ends', async () => {
    const net = memoryChannels();
    const content = createPresentation('blank');
    const link = new ShowLink({ session: 's1', title: 'Talk', content: () => content, state: { pos: { slide: 0, built: 0 }, screen: 'slide' }, channel: net.factory });
    const show = { commands: [] as unknown[], connected: 0, closed: 0 };
    link.listen({ onCommand: (c) => show.commands.push(c), onConnected: () => show.connected++, onClosed: () => show.closed++ });
    const waiting = link.waitForHello(1000);

    const seen = { welcome: null as unknown, states: [] as unknown[], ended: 0 };
    const presenter = connectPresenter('s1', { onWelcome: (m) => (seen.welcome = m), onState: (s) => seen.states.push(s), onEnded: () => seen.ended++ }, { channel: net.factory, every: 5 });
    expect(await waiting).toBe(true);
    await flush();
    expect(show.connected).toBe(1);
    expect(seen.welcome).toMatchObject({ kind: 'welcome', title: 'Talk', state: { pos: { slide: 0, built: 0 }, screen: 'slide' } });

    // Show → presenter.
    link.sendState({ pos: { slide: 0, built: 1 }, screen: 'black' });
    await flush();
    expect(seen.states).toEqual([{ pos: { slide: 0, built: 1 }, screen: 'black' }]);
    // Presenter → show.
    presenter.send({ type: 'next' });
    presenter.send({ type: 'goto', slide: 2 });
    await flush();
    expect(show.commands).toEqual([{ type: 'next' }, { type: 'goto', slide: 2 }]);

    // A presenter window that reloads is welcomed again, with where the show is now (the link remembers it).
    const again = { welcome: null as { state: unknown } | null };
    const second = connectPresenter('s1', { onWelcome: (m) => (again.welcome = m), onState: () => undefined, onEnded: () => undefined }, { channel: net.factory, every: 5 });
    await flush();
    await flush();
    expect(again.welcome?.state).toEqual({ pos: { slide: 0, built: 1 }, screen: 'black' });
    expect(show.connected).toBe(1);
    second.close();

    // The presenter window closing says bye (only when asked to: a quiet close is for effect clean-up).
    presenter.close(true);
    await flush();
    expect(show.closed).toBe(1);

    link.close();
    expect(link.closed).toBe(true);
    expect(net.sent.at(-1)).toEqual({ name: 'dcos-present:s1', data: { kind: 'ended' } });
  });

  it('tells the presenter window when the show ends', async () => {
    const net = memoryChannels();
    const content = createPresentation('blank');
    const link = new ShowLink({ session: 's2', title: 'T', content: () => content, state: { pos: { slide: 0, built: 0 }, screen: 'slide' }, channel: net.factory });
    let ended = 0;
    const p = connectPresenter('s2', { onWelcome: () => undefined, onState: () => undefined, onEnded: () => ended++ }, { channel: net.factory, every: 5 });
    await link.waitForHello(1000);
    link.close();
    await flush();
    expect(ended).toBe(1);
    p.close();
    expect(net.open()).toBe(0);
  });

  it('gives up waiting when no presenter window says hello', async () => {
    vi.useFakeTimers();
    const net = memoryChannels();
    const link = new ShowLink({ session: 's3', title: 'T', content: () => createPresentation('blank'), state: { pos: { slide: 0, built: 0 }, screen: 'slide' }, channel: net.factory });
    const waiting = link.waitForHello(2000);
    vi.advanceTimersByTime(2001);
    expect(await waiting).toBe(false);
    link.close();
    expect(await link.waitForHello(10)).toBe(false);
  });

  it('a presenter window sends no commands before it is welcomed', () => {
    const net = memoryChannels();
    const p = connectPresenter('s4', { onWelcome: () => undefined, onState: () => undefined, onEnded: () => undefined }, { channel: net.factory, every: 1000 });
    p.send({ type: 'next' });
    expect(net.sent.map((m) => (m.data as { kind: string }).kind)).toEqual(['hello']);
    p.close();
  });
});

describe('a show that goes away without ending (Round 3)', () => {
  const content = createPresentation('blank');
  const start = { pos: { slide: 0, built: 0 }, screen: 'slide' as const };

  it("the show's window closing or reloading (pagehide) ends the show for the presenter window", async () => {
    // (Node: a stand-in window that can fire pagehide.)
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const net = memoryChannels();
    const link = new ShowLink({ session: 'ph', title: 'Talk', content: () => content, state: start, channel: net.factory });
    link.listen({ onCommand: () => undefined, onConnected: () => undefined, onClosed: () => undefined });
    const seen = { ended: 0, lost: 0 };
    const presenter = connectPresenter('ph', { onWelcome: () => undefined, onState: () => undefined, onEnded: () => seen.ended++, onLost: () => seen.lost++ }, { channel: net.factory, every: 5 });
    expect(await link.waitForHello(1000)).toBe(true);
    win.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(link.closed).toBe(true);
    expect(seen).toEqual({ ended: 1, lost: 0 });
    presenter.close();
    vi.unstubAllGlobals();
  });

  it('a quiet show is pinged and answers; a show that never answers is reported lost', async () => {
    vi.useFakeTimers();
    const net = memoryChannels();
    const link = new ShowLink({ session: 'hb', title: 'Talk', content: () => content, state: start, channel: net.factory });
    link.listen({ onCommand: () => undefined, onConnected: () => undefined, onClosed: () => undefined });
    const seen = { lost: 0 };
    const presenter = connectPresenter('hb', { onWelcome: () => undefined, onState: () => undefined, onEnded: () => undefined, onLost: () => seen.lost++ }, { channel: net.factory, every: 5, pingMs: 1000, lostMs: 3000 });
    await vi.advanceTimersByTimeAsync(10);
    expect(link.connected).toBe(true);
    // A long quiet stretch with the show still there: pings are answered, nothing is lost.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(net.sent.some((m) => (m.data as { kind: string }).kind === 'ping')).toBe(true);
    expect(net.sent.some((m) => (m.data as { kind: string }).kind === 'alive')).toBe(true);
    expect(seen.lost).toBe(0);
    // The show's window vanishes without a word (a crash: no pagehide, no 'ended').
    (link as unknown as { ch: { onmessage: unknown; close: () => void } }).ch.onmessage = null;
    await vi.advanceTimersByTimeAsync(3500);
    expect(seen.lost).toBe(1);
    // Lost once only, and the presenter's end of the link is closed.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen.lost).toBe(1);
    presenter.close();
    link.close();
  });

  it('another presenter window saying hello or ping does not count as the show being there', async () => {
    vi.useFakeTimers();
    const net = memoryChannels();
    const link = new ShowLink({ session: 'two', title: 'Talk', content: () => content, state: start, channel: net.factory });
    link.listen({ onCommand: () => undefined, onConnected: () => undefined, onClosed: () => undefined });
    const seen = { lost: 0 };
    const presenter = connectPresenter('two', { onWelcome: () => undefined, onState: () => undefined, onEnded: () => undefined, onLost: () => seen.lost++ }, { channel: net.factory, every: 5, pingMs: 1000, lostMs: 3000 });
    await vi.advanceTimersByTimeAsync(10);
    (link as unknown as { ch: { onmessage: unknown } }).ch.onmessage = null;
    const other = net.factory(presenterChannelName('two'));
    const chatter = setInterval(() => other.postMessage({ kind: 'ping' }), 200);
    await vi.advanceTimersByTimeAsync(3500);
    clearInterval(chatter);
    expect(seen.lost).toBe(1);
    presenter.close();
    link.close();
    other.close();
  });
});

describe('a presenter window whose timers the browser throttles (Round 3 fix)', () => {
  const content = createPresentation('blank');
  const start = { pos: { slide: 0, built: 0 }, screen: 'slide' as const };
  // The watch ticks every pingMs / 2; a hidden window's tick can come a minute late (Chrome's intensive throttling,
  // Safari's hidden tabs). Simulated as the wall clock jumping with no tick, then a single tick.
  const tick = Math.floor(PRESENTER_PING_MS / 2);
  const throttledMinute = async () => {
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(tick);
  };

  const linkUp = async (session: string) => {
    const net = memoryChannels();
    const link = new ShowLink({ session, title: 'Talk', content: () => content, state: start, channel: net.factory });
    link.listen({ onCommand: () => undefined, onConnected: () => undefined, onClosed: () => undefined });
    const seen = { lost: 0, welcomed: 0 };
    const presenter = connectPresenter(session, { onWelcome: () => seen.welcomed++, onState: () => undefined, onEnded: () => undefined, onLost: () => seen.lost++ }, { channel: net.factory });
    await vi.advanceTimersByTimeAsync(10);
    expect(seen.welcomed).toBe(1);
    return { net, link, seen, presenter };
  };

  it('a live show is not declared lost on the first tick after a long throttled gap', async () => {
    vi.useFakeTimers();
    const { net, link, seen, presenter } = await linkUp('throttled');
    // A normal minute with the window visible: pings are answered, nothing is lost.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen.lost).toBe(0);
    // Hidden and throttled: a minute passes with no tick, then one tick. The show is still there.
    const before = net.sent.length;
    await throttledMinute();
    expect(seen.lost).toBe(0);
    // That tick asked the show (a ping) and the show answered.
    const after = net.sent.slice(before).map((m) => (m.data as { kind: string }).kind);
    expect(after).toContain('ping');
    expect(after).toContain('alive');
    // Several throttled minutes in a row, and back to normal ticking: still linked.
    await throttledMinute();
    await throttledMinute();
    await vi.advanceTimersByTimeAsync(PRESENTER_LOST_MS * 3);
    expect(seen.lost).toBe(0);
    // The presenter's link still moves the show.
    expect(link.closed).toBe(false);
    presenter.close();
    link.close();
  });

  it('a show that went away while the window was throttled is still reported lost (once its ping goes unanswered)', async () => {
    vi.useFakeTimers();
    const { link, seen, presenter } = await linkUp('throttled-gone');
    // The show's window vanishes without a word, then the presenter window is throttled.
    (link as unknown as { ch: { onmessage: unknown } }).ch.onmessage = null;
    // The first late tick only asks: silence during a throttled gap is not proof.
    await throttledMinute();
    expect(seen.lost).toBe(0);
    // The next tick finds that ping unanswered for well over the window: lost.
    await throttledMinute();
    expect(seen.lost).toBe(1);
    await throttledMinute();
    expect(seen.lost).toBe(1);
    presenter.close();
    link.close();
  });

  it('with timers running normally, a vanished show is reported lost within the usual window', async () => {
    vi.useFakeTimers();
    const { link, seen, presenter } = await linkUp('normal-gone');
    await vi.advanceTimersByTimeAsync(10_000);
    (link as unknown as { ch: { onmessage: unknown } }).ch.onmessage = null;
    // The show was last heard at most one ping interval before it vanished, so loss comes no sooner than
    // lostMs - pingMs after it, and no later than lostMs plus a tick or two.
    await vi.advanceTimersByTimeAsync(PRESENTER_LOST_MS - PRESENTER_PING_MS - tick);
    expect(seen.lost).toBe(0);
    await vi.advanceTimersByTimeAsync(PRESENTER_PING_MS + 3 * tick);
    expect(seen.lost).toBe(1);
    presenter.close();
    link.close();
  });
});
