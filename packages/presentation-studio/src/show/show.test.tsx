// @vitest-environment jsdom
/**
 * Phase 7 SHOW in the editor: the Slide Show, Transitions and Animations tabs, the slide show itself (keys, clicks,
 * taps, swipes, hidden slides, builds, the end screen, black and white screens), transitions and animations played with
 * Web Animations (cuts with reduced motion), the presenter window over a BroadcastChannel, and the presenter view in
 * the page (phones, a blocked or silent second window).
 */
import { ToastProvider } from '@dcos/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { PresentationEditor } from '../PresentationEditor';
import { SlideView } from '../render/SlideView';
import { kitchenSinkPresentation } from '../testFixtures';
import { richTextFromPlain, type PresentationContent } from '../types';
import { PresenterWindow } from './PresenterWindow';
import { memoryChannels } from './testChannels';

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

let reduced = false;
let touch = false;
const animateCalls: Array<{ el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    // Browsers fire 'close' later, as a task.
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  reduced = false;
  touch = false;
  animateCalls.length = 0;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)' ? reduced : q === '(hover: none) and (pointer: coarse)' ? touch : q === '(min-width: 768px)' ? !touch : false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  (Element.prototype as unknown as { animate: unknown }).animate = function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
    animateCalls.push({ el: this, frames, options });
    return { finished: Promise.resolve(), finish: () => undefined, cancel: () => undefined } as unknown as Animation;
  };
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

/** Intro, Hidden (hidden), Method (push transition, its subtitle fades in on click), End. */
function talk(): PresentationContent {
  const p = createPresentation('blank');
  const base = p.slides[0];
  const slide = (id: string, title: string, extra: object = {}) => ({
    ...json(base),
    id,
    elements: json(base.elements).map((e, i) => ({ ...e, id: `${id}-${i}`, ...(e.type === 'text' ? { text: richTextFromPlain(e.placeholderId === 'title' ? title : `${title} body`) } : {}) })),
    notes: richTextFromPlain(`Notes for ${title}`),
    ...extra,
  });
  p.slides = [slide('s1', 'Intro'), slide('s2', 'Hidden', { hidden: true }), slide('s3', 'Method', { transition: { type: 'push', duration: 500, direction: 'left' } }), slide('s4', 'End')];
  p.slides[2].elements[1] = { ...p.slides[2].elements[1], animation: { effect: 'fade', order: 1, trigger: 'on-click', duration: 400 } };
  return p;
}

function setup(content: PresentationContent = talk(), props: { presenterUrl?: (s: string) => string } = {}) {
  const onChange = vi.fn();
  const view = render(
    <ToastProvider>
      <PresentationEditor initialContent={json(content)} title="Cell talk" onChange={onChange} {...props} />
    </ToastProvider>,
  );
  const last = (): PresentationContent => onChange.mock.calls.at(-1)![0];
  return { onChange, last, view };
}

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const toolbar = (name: string) => screen.getByRole('toolbar', { name });
const showDialog = () => screen.queryByRole('dialog', { name: 'Slide show' });
const surface = () => showDialog()!.querySelector('[data-show-surface]') as HTMLElement;
const shown = () => showDialog()?.querySelector('[data-show-slide]')?.getAttribute('data-show-slide') ?? null;
const key = (k: string, init: object = {}) => fireEvent.keyDown(surface(), { key: k, ...init });
/** Objects of the shown slide that are hidden until their build plays. */
const hiddenNow = () => {
  const layer = showDialog()!.querySelector('[data-show-slide]')!;
  return [...(layer.querySelector('style')?.textContent ?? '').matchAll(/data-element="([^"]+)"/g)].map((m) => m[1]);
};
const slideOptions = () => within(screen.getByRole('listbox', { name: 'Slides' })).getAllByRole('option');

function startFromBeginning() {
  tab('Slide Show');
  fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'From beginning' }));
  expect(showDialog()).not.toBeNull();
}

describe('the slide show', () => {
  it('skips hidden slides, plays the transition and the builds, ends on a black screen, and leaves', async () => {
    setup();
    startFromBeginning();
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');
    expect(shown()).toBe('s1');

    key('ArrowRight');
    // Slide 2 is hidden. Slide 3 comes in with its push transition; its subtitle waits for a click.
    expect(shown()).toBe('s3');
    const push = animateCalls.find((c) => (c.frames[0] as { transform?: string }).transform === 'translate(100%, 0)');
    expect(push?.options.duration).toBe(500);
    expect(push?.el.getAttribute('data-show-slide')).toBe('s3');
    expect(animateCalls.some((c) => (c.frames[1] as { transform?: string }).transform === 'translate(-100%, 0)')).toBe(true);
    expect(hiddenNow()).toEqual(['s3-1']);

    animateCalls.length = 0;
    key(' ');
    expect(shown()).toBe('s3');
    expect(hiddenNow()).toEqual([]);
    expect(animateCalls).toHaveLength(1);
    expect(animateCalls[0].el.getAttribute('data-element')).toBe('s3-1');
    expect(animateCalls[0].frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animateCalls[0].options).toMatchObject({ duration: 400, delay: 0, fill: 'backwards' });

    key('PageDown');
    expect(shown()).toBe('s4');
    key('n');
    expect(shown()).toBeNull();
    expect(showDialog()!.textContent).toContain('End of slide show. Click to exit.');
    key('ArrowRight');
    expect(showDialog()).toBeNull();
  });

  it('goes back, jumps by number (a hidden slide too), Home and End, blanks the screen, and Escape returns to the editor', () => {
    setup();
    tab('Slide Show');
    const from = within(toolbar('Slide Show')).getByRole('button', { name: 'From beginning' });
    from.focus();
    fireEvent.click(from);
    key('End');
    expect(shown()).toBe('s4');
    key('ArrowLeft');
    // Back to slide 3 with its build played.
    expect(shown()).toBe('s3');
    expect(hiddenNow()).toEqual([]);
    key('Backspace');
    expect(hiddenNow()).toEqual(['s3-1']);
    key('Home');
    expect(shown()).toBe('s1');
    key('2');
    expect(showDialog()!.textContent).toContain('Go to slide 2');
    key('Enter');
    expect(shown()).toBe('s2');

    key('b');
    expect(showDialog()!.querySelector('[data-show-blank="black"]')).not.toBeNull();
    // The next press brings the slide back without moving.
    key('ArrowRight');
    expect(showDialog()!.querySelector('[data-show-blank]')).toBeNull();
    expect(shown()).toBe('s2');
    key('W');
    expect(showDialog()!.querySelector('[data-show-blank="white"]')).not.toBeNull();
    key(',');
    expect(showDialog()!.querySelector('[data-show-blank]')).toBeNull();

    key('ArrowRight');
    expect(shown()).toBe('s3');
    key('Escape');
    expect(showDialog()).toBeNull();
    // The editor shows the slide the show ended on.
    expect(slideOptions()[2].getAttribute('aria-current')).toBe('true');
    return waitFor(() => expect(document.activeElement).toBe(from));
  });

  it('moves with clicks, taps (left third back) and swipes, and with its own buttons', () => {
    setup();
    startFromBeginning();
    const s = surface();
    fireEvent.pointerDown(s, { pointerType: 'mouse', button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerUp(s, { pointerType: 'mouse', button: 0, clientX: 500, clientY: 300 });
    expect(shown()).toBe('s3');
    // Swipe right: back.
    fireEvent.pointerDown(s, { pointerType: 'touch', clientX: 200, clientY: 300 });
    fireEvent.pointerUp(s, { pointerType: 'touch', clientX: 400, clientY: 310 });
    expect(shown()).toBe('s1');
    // Swipe left: on.
    fireEvent.pointerDown(s, { pointerType: 'touch', clientX: 400, clientY: 300 });
    fireEvent.pointerUp(s, { pointerType: 'touch', clientX: 200, clientY: 290 });
    expect(shown()).toBe('s3');
    // A tap on the left third goes back; elsewhere on.
    vi.spyOn(s, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(s, { pointerType: 'touch', clientX: 100, clientY: 300 });
    fireEvent.pointerUp(s, { pointerType: 'touch', clientX: 100, clientY: 300 });
    expect(shown()).toBe('s1');
    fireEvent.pointerDown(s, { pointerType: 'touch', clientX: 700, clientY: 300 });
    fireEvent.pointerUp(s, { pointerType: 'touch', clientX: 700, clientY: 300 });
    expect(shown()).toBe('s3');

    const controls = within(screen.getByRole('toolbar', { name: 'Slide show controls' }));
    // jsdom has no full screen: no Full screen button.
    expect(controls.queryByRole('button', { name: 'Full screen' })).toBeNull();
    fireEvent.click(controls.getByRole('button', { name: 'Previous' }));
    expect(shown()).toBe('s1');
    const next = controls.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.click(next, { detail: 1 });
    expect(shown()).toBe('s3');
    // After a mouse click the focus is back on the slide: Space plays the build instead of pressing Next again.
    expect(document.activeElement).toBe(surface());
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(shown()).toBe('s3');
    expect(hiddenNow()).toEqual([]);
    fireEvent.click(controls.getByRole('button', { name: 'End show' }));
    expect(showDialog()).toBeNull();
  });

  it('keeps the editor\'s keys out of the show: Ctrl/⌘+Z changes nothing and F5 does not reload', () => {
    const { onChange, last } = setup();
    // One change first, so the editor has something to undo.
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Hide slide' }));
    expect(last().slides[0].hidden).toBe(true);
    const calls = onChange.mock.calls.length;
    fireEvent.click(slideOptions()[2]);
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'From current slide' }));
    key('z', { ctrlKey: true });
    key('z', { metaKey: true });
    key('y', { ctrlKey: true });
    expect(onChange.mock.calls.length).toBe(calls);
    const f5 = new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true });
    surface().dispatchEvent(f5);
    expect(f5.defaultPrevented).toBe(true);
    expect(shown()).toBe('s3');
  });

  it('raises the show above the page once the page is full screen (the full-screen page joins the top layer after it)', () => {
    setup();
    startFromBeginning();
    const dialog = showDialog() as HTMLDialogElement;
    const showModal = vi.spyOn(dialog, 'showModal');
    let fsElement: Element | null = document.documentElement;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsElement });
    try {
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      expect(showModal).toHaveBeenCalledTimes(1);
      expect(showDialog()).not.toBeNull();
      expect(document.activeElement).toBe(surface());
      key('ArrowRight');
      expect(shown()).toBe('s3');
      // The browser's own Escape leaves full screen: that ends the show.
      fsElement = null;
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      expect(showDialog()).toBeNull();
    } finally {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });

  it('says so when full screen is not available, and F says it again', async () => {
    setup();
    startFromBeginning();
    await waitFor(() => expect(showDialog()!.textContent).toContain('Full screen is not available in this browser'));
    key('f');
    expect(showDialog()!.textContent).toContain('The slide show fills the window.');
  });

  it('makes transitions and animations cuts with reduced motion', () => {
    reduced = true;
    setup();
    startFromBeginning();
    key('ArrowRight');
    key('ArrowRight');
    expect(shown()).toBe('s3');
    expect(hiddenNow()).toEqual([]);
    expect(animateCalls).toHaveLength(0);
    key('Escape');
    tab('Slide Show');
    expect(toolbar('Slide Show').textContent).toContain('Reduced motion is on');
  });

  it('starts from the current slide (Shift+F5), from the beginning (F5), and from the slide menu', () => {
    setup();
    fireEvent.click(slideOptions()[3]);
    fireEvent.keyDown(document.body, { key: 'F5', shiftKey: true });
    expect(shown()).toBe('s4');
    key('Escape');
    fireEvent.keyDown(document.body, { key: 'F5' });
    expect(shown()).toBe('s1');
    key('Escape');
    fireEvent.click(slideOptions()[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Slide actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Play from this slide' }));
    expect(shown()).toBe('s3');
    key('Escape');
    // The ribbon's Slide show button plays from the first slide.
    fireEvent.click(screen.getByRole('button', { name: 'Slide show' }));
    expect(shown()).toBe('s1');
  });

  it('cannot start when every slide is hidden', () => {
    const p = talk();
    p.slides = p.slides.map((s) => ({ ...s, hidden: true }));
    setup(p);
    tab('Slide Show');
    for (const name of ['From beginning', 'From current slide', 'Presenter view']) expect(within(toolbar('Slide Show')).getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Slide show' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(document.body, { key: 'F5' });
    expect(showDialog()).toBeNull();
  });

  it('Hide slide in the Slide Show tab hides and shows the selected slides', () => {
    const { last } = setup();
    tab('Slide Show');
    const hide = within(toolbar('Slide Show')).getByRole('button', { name: 'Hide slide' });
    expect(hide.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hide);
    expect(last().slides[0].hidden).toBe(true);
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(last().slides[0].hidden).toBeUndefined();
  });
});

describe('the Transitions tab', () => {
  it('sets the transition of the selected slides, its direction and speed, applies it to all, previews it, and undoes', async () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[3]);
    tab('Transitions');
    const bar = within(toolbar('Transitions'));
    expect(bar.getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('true');
    expect(bar.getByRole('button', { name: 'Preview the transition' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(bar.getByRole('button', { name: 'Wipe' }));
    expect(last().slides[3].transition).toEqual({ type: 'wipe', duration: 750, direction: 'left' });
    fireEvent.change(bar.getByRole('combobox', { name: 'Direction' }), { target: { value: 'down' } });
    expect(last().slides[3].transition!.direction).toBe('down');
    fireEvent.change(bar.getByRole('combobox', { name: 'Speed' }), { target: { value: '1000' } });
    expect(last().slides[3].transition).toEqual({ type: 'wipe', duration: 1000, direction: 'down' });
    fireEvent.click(bar.getByRole('button', { name: 'Split' }));
    expect(last().slides[3].transition).toEqual({ type: 'split', duration: 1000, orientation: 'horizontal' });
    fireEvent.change(bar.getByRole('combobox', { name: 'Orientation' }), { target: { value: 'vertical' } });
    expect(last().slides[3].transition!.orientation).toBe('vertical');

    // Preview: the slide before it goes out, this one comes in, over the canvas; then the preview goes.
    fireEvent.click(bar.getByRole('button', { name: 'Preview the transition' }));
    const preview = document.querySelector('[data-show-preview="transition"]');
    expect(preview).not.toBeNull();
    expect(animateCalls.some((c) => (c.frames[0] as { clipPath?: string }).clipPath === 'inset(0 50% 0 50%)')).toBe(true);
    await waitFor(() => expect(document.querySelector('[data-show-preview]')).toBeNull());

    fireEvent.click(bar.getByRole('button', { name: 'Apply to all slides' }));
    expect(last().slides.map((s) => s.transition?.type)).toEqual(['split', 'split', 'split', 'split']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides.map((s) => s.transition?.type)).toEqual([undefined, undefined, 'push', 'split']);
    fireEvent.click(bar.getByRole('button', { name: 'None' }));
    expect('transition' in last().slides[3]).toBe(false);
  });

  it('every transition type button sets that type', () => {
    const { last } = setup();
    tab('Transitions');
    const want = { fade: undefined, push: 'left', wipe: 'left', cover: 'left', split: undefined, zoom: undefined } as const;
    for (const [type, direction] of Object.entries(want)) {
      fireEvent.click(within(toolbar('Transitions')).getByRole('button', { name: type[0].toUpperCase() + type.slice(1) }));
      expect(last().slides[0].transition).toMatchObject({ type, duration: 750 });
      expect(last().slides[0].transition!.direction).toBe(direction);
    }
  });

  it('applies to every selected slide', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[3], { shiftKey: true });
    tab('Transitions');
    fireEvent.click(within(toolbar('Transitions')).getByRole('button', { name: 'Fade' }));
    expect(last().slides.map((s) => s.transition?.type)).toEqual(['fade', 'fade', 'fade', 'fade']);
  });
});

/** Presses on an object on the canvas (and lets go without moving). */
function pick(el: HTMLElement, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 100, clientY: 100, ...init });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
}
const objects = () => within(screen.getByRole('listbox', { name: /^Objects on slide/ })).getAllByRole('option');

describe('the Animations tab', () => {
  it('needs a selected object, then sets the effect, direction, start, duration, delay and order, previews, and removes', async () => {
    const { last } = setup();
    tab('Animations');
    const bar = () => within(toolbar('Animations'));
    expect(bar().getByRole('button', { name: 'Fade' }).hasAttribute('disabled')).toBe(true);
    expect(toolbar('Animations').textContent).toContain('Select an object on the slide to animate it.');
    expect(bar().getByRole('button', { name: "Preview the slide's animations" }).hasAttribute('disabled')).toBe(true);

    pick(objects()[1]);
    fireEvent.click(bar().getByRole('button', { name: 'Fly in' }));
    expect(last().slides[0].elements[1].animation).toEqual({ effect: 'fly-in', order: 1, trigger: 'on-click', duration: 500, direction: 'down' });
    fireEvent.change(bar().getByRole('combobox', { name: 'Comes in' }), { target: { value: 'left' } });
    fireEvent.change(bar().getByRole('combobox', { name: 'Start' }), { target: { value: 'after-previous' } });
    fireEvent.change(bar().getByRole('spinbutton', { name: 'Duration (seconds)' }), { target: { value: '1.5' } });
    fireEvent.change(bar().getByRole('spinbutton', { name: 'Delay (seconds)' }), { target: { value: '0.25' } });
    expect(last().slides[0].elements[1].animation).toEqual({ effect: 'fly-in', order: 1, trigger: 'after-previous', duration: 1500, delay: 250, direction: 'left' });

    // The title too: it comes second; then it moves first.
    pick(objects()[0]);
    fireEvent.click(bar().getByRole('button', { name: 'Appear' }));
    expect(last().slides[0].elements[0].animation!.order).toBe(2);
    expect(toolbar('Animations').textContent).toContain('Animation 2 of 2');
    expect(bar().getByRole('spinbutton', { name: 'Duration (seconds)' }).hasAttribute('disabled')).toBe(true);
    expect(bar().getByRole('button', { name: 'Move later' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(bar().getByRole('button', { name: 'Move earlier' }));
    expect(last().slides[0].elements.map((e) => e.animation?.order)).toEqual([1, 2]);
    expect(toolbar('Animations').textContent).toContain('Animation 1 of 2');

    fireEvent.click(bar().getByRole('button', { name: "Preview the slide's animations" }));
    expect(document.querySelector('[data-show-preview="animations"]')).not.toBeNull();
    // Both objects animate, the second after the first (fill: backwards keeps it hidden until then).
    const delays = animateCalls.map((c) => c.options.delay);
    expect(delays).toHaveLength(2);
    expect(delays[1]!).toBeGreaterThan(delays[0]!);
    await waitFor(() => expect(document.querySelector('[data-show-preview]')).toBeNull());

    fireEvent.click(bar().getByRole('button', { name: 'No animation' }));
    expect('animation' in last().slides[0].elements[0]).toBe(false);
    expect(last().slides[0].elements[1].animation!.order).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements[0].animation!.effect).toBe('appear');
  });

  it('every effect button sets that effect', () => {
    const { last } = setup();
    tab('Animations');
    pick(objects()[0]);
    for (const [name, effect] of [['Appear', 'appear'], ['Fade', 'fade'], ['Fly in', 'fly-in'], ['Zoom', 'zoom'], ['Wipe', 'wipe']]) {
      fireEvent.click(within(toolbar('Animations')).getByRole('button', { name }));
      expect(last().slides[0].elements[0].animation!.effect).toBe(effect);
      expect(within(toolbar('Animations')).getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('typing a duration is one undo step', () => {
    const { last } = setup();
    tab('Animations');
    pick(objects()[1]);
    const bar = within(toolbar('Animations'));
    fireEvent.click(bar.getByRole('button', { name: 'Fade' }));
    const field = bar.getByRole('spinbutton', { name: 'Duration (seconds)' });
    fireEvent.change(field, { target: { value: '1' } });
    fireEvent.change(field, { target: { value: '1.2' } });
    expect(last().slides[0].elements[1].animation!.duration).toBe(1200);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(last().slides[0].elements[1].animation!.duration).toBe(500);
  });
});

/** A BroadcastChannel stand-in for the whole test (the show and the presenter window share it). */
function stubChannels() {
  const net = memoryChannels();
  vi.stubGlobal(
    'BroadcastChannel',
    function (this: unknown, name: string) {
      return net.factory(name);
    } as unknown as typeof BroadcastChannel,
  );
  return net;
}

describe('the presenter view', () => {
  it('opens a second window, shakes hands, and the two stay in step both ways until the show ends', async () => {
    stubChannels();
    const popup = { close: vi.fn() } as unknown as Window;
    const open = vi.fn(() => popup);
    vi.stubGlobal('open', open);
    const closeSelf = vi.fn();
    setup(talk(), { presenterUrl: (s) => `app#/presentations/presenter/${s}` });
    tab('Slide Show');
    expect(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }).getAttribute('title')).toContain('second window');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    expect(open).toHaveBeenCalledTimes(1);
    const url = (open.mock.calls[0] as unknown as [string])[0];
    const session = url.split('/').at(-1)!;
    expect(url).toBe(`app#/presentations/presenter/${session}`);
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');

    // The presenter window (the app's route renders this component).
    vi.stubGlobal('close', closeSelf);
    const win = render(<PresenterWindow session={session} />);
    const pv = within(win.container);
    await waitFor(() => expect(pv.getByText(/^Slide 1 of 4/)).toBeTruthy());
    await waitFor(() => expect(showDialog()!.textContent).toContain('The presenter view is open in the other window.'));
    expect(pv.getByRole('region', { name: 'Speaker notes' }).textContent).toContain('Notes for Intro');
    expect(pv.getByRole('region', { name: 'Next slide' }).querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Next: slide 3');

    // Presenter → show.
    fireEvent.click(pv.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(shown()).toBe('s3'));
    await waitFor(() => expect(pv.getByText(/^Slide 3 of 4/)).toBeTruthy());
    expect(pv.getByRole('status', { name: '' }).textContent).toContain('1 animation step left on this slide');
    // Show → presenter.
    key('ArrowRight');
    await waitFor(() => expect(pv.queryByText(/animation step left/)).toBeNull());
    fireEvent.click(pv.getByRole('button', { name: /Black screen/ }));
    await waitFor(() => expect(showDialog()!.querySelector('[data-show-blank="black"]')).not.toBeNull());
    await waitFor(() => expect(pv.getByRole('button', { name: /Black screen/ }).getAttribute('aria-pressed')).toBe('true'));
    // The presenter's timer pauses, resumes and resets.
    fireEvent.click(pv.getByRole('button', { name: 'Pause timer' }));
    fireEvent.click(pv.getByRole('button', { name: 'Resume timer' }));
    fireEvent.click(pv.getByRole('button', { name: 'Reset timer' }));
    expect(pv.getByLabelText('Time since the show started').textContent).toBe('0:00');

    fireEvent.click(pv.getByRole('button', { name: /End show/ }));
    await waitFor(() => expect(showDialog()).toBeNull());
    await waitFor(() => expect(pv.getByText('The slide show has ended. You can close this window.')).toBeTruthy());
    expect(closeSelf).toHaveBeenCalled();
  });

  it('shows the presenter view in the page when the browser blocks the second window', async () => {
    stubChannels();
    vi.stubGlobal('open', vi.fn(() => null));
    setup(talk(), { presenterUrl: (s) => `x#${s}` });
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    // The audience may be watching this screen: the show asks before showing notes on it (Round 3).
    const offer = await waitFor(() => within(showDialog()!).getByRole('group', { name: 'Presenter view' }));
    expect(offer.textContent).toMatch(/did not open a second window.*Only do this if the audience cannot see this screen/);
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');
    fireEvent.click(within(offer).getByRole('button', { name: 'Presenter view on this screen' }));
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('presenter');
    const dlg = within(showDialog()!);
    expect(dlg.getByRole('region', { name: 'Speaker notes' }).textContent).toContain('Notes for Intro');
    expect(dlg.getByText(/1 hidden slide is skipped/)).toBeTruthy();
    fireEvent.click(dlg.getByRole('button', { name: /Next/ }));
    expect(shown()).toBe('s3');
    expect(dlg.getByRole('region', { name: 'Speaker notes' }).textContent).toContain('Notes for Method');
    fireEvent.click(dlg.getByRole('button', { name: /Previous/ }));
    expect(shown()).toBe('s1');
    fireEvent.click(dlg.getByRole('button', { name: /End show/ }));
    expect(showDialog()).toBeNull();
  });

  it('falls back to the page when the second window never answers', async () => {
    vi.useFakeTimers();
    stubChannels();
    const popup = { close: vi.fn() } as unknown as Window;
    vi.stubGlobal('open', vi.fn(() => popup));
    setup(talk(), { presenterUrl: (s) => `x#${s}` });
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4001);
    });
    // The second window is closed, and the audience view stays until the presenter chooses (Round 3).
    expect(popup.close).toHaveBeenCalled();
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');
    const offer = within(showDialog()!).getByRole('group', { name: 'Presenter view' });
    expect(offer.textContent).toContain('The presenter window did not respond');
    // Keeping the audience view: the offer goes, the keys still move the show.
    fireEvent.click(within(offer).getByRole('button', { name: 'Keep the audience view' }));
    expect(within(showDialog()!).queryByRole('group', { name: 'Presenter view' })).toBeNull();
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('audience');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.activeElement).toBe(surface());
    key('ArrowRight');
    expect(shown()).toBe('s3');
  });

  it('the presenter window says so when the show goes away without ending (its window crashed or was closed)', async () => {
    vi.useFakeTimers();
    const net = stubChannels();
    const popup = { close: vi.fn() } as unknown as Window;
    vi.stubGlobal('open', vi.fn(() => popup));
    setup(talk(), { presenterUrl: (s) => `x#${s}` });
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    const session = (window.open as unknown as { mock: { calls: string[][] } }).mock.calls[0][0].split('#')[1];
    // The presenter window's channel, with a switch that cuts it off from the show (as when the show's window dies).
    let cut = false;
    const channel = (name: string) => {
      const ch = net.factory(name);
      const wrapped = { postMessage: (d: unknown) => !cut && ch.postMessage(d), close: () => ch.close(), onmessage: null as ((e: MessageEvent) => void) | null };
      ch.onmessage = (e) => !cut && wrapped.onmessage?.(e);
      return wrapped;
    };
    const win = render(<PresenterWindow session={session} channel={channel} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(within(win.container).getByText(/^Slide 1 of 4/)).toBeTruthy();
    // Quiet for a long while with the show still there: still live.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(within(win.container).getByRole('button', { name: /Next/ })).toBeTruthy();
    cut = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(within(win.container).queryByRole('button', { name: /Next/ })).toBeNull();
    expect(within(win.container).getByRole('status').textContent).toContain('The slide show is no longer running');
    expect(within(win.container).getByRole('button', { name: 'Close this window' })).toBeTruthy();
  });

  it('presenter buttons clicked with the mouse give the keys back to the show (Space moves, not Pause again)', async () => {
    stubChannels();
    vi.stubGlobal('open', vi.fn(() => null));
    setup(talk(), { presenterUrl: (s) => `x#${s}` });
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    const offer = await waitFor(() => within(showDialog()!).getByRole('group', { name: 'Presenter view' }));
    fireEvent.click(within(offer).getByRole('button', { name: 'Presenter view on this screen' }));
    const pause = within(showDialog()!).getByRole('button', { name: 'Pause timer' });
    pause.focus();
    fireEvent.click(pause, { detail: 1 });
    expect(document.activeElement?.hasAttribute('data-presenter-view')).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(shown()).toBe('s3');
    expect(within(showDialog()!).getByRole('button', { name: 'Resume timer' })).toBeTruthy();
  });

  it('Ctrl/⌘+S and Ctrl/⌘+P pressed in the show open no browser dialog', () => {
    setup();
    startFromBeginning();
    for (const k of ['s', 'p', 'S']) {
      const ev = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      surface().dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      const mac = new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true });
      surface().dispatchEvent(mac);
      expect(mac.defaultPrevented).toBe(true);
    }
    expect(showDialog()).not.toBeNull();
  });

  it('on a phone, opens the presenter view in the page, where taps and swipes move it', () => {
    touch = true;
    const open = vi.fn();
    vi.stubGlobal('open', open);
    setup(talk(), { presenterUrl: (s) => `x#${s}` });
    tab('Slide Show');
    const button = within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' });
    expect(button.getAttribute('title')).toContain('on this screen');
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('presenter');
    const tap = showDialog()!.querySelector('[data-show-tap]') as HTMLElement;
    fireEvent.pointerDown(tap, { pointerType: 'touch', clientX: 400, clientY: 100 });
    fireEvent.pointerUp(tap, { pointerType: 'touch', clientX: 300, clientY: 100 });
    expect(shown()).toBe('s3');
  });

  it('without a presenter window address the presenter view stays in the page', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    setup();
    tab('Slide Show');
    fireEvent.click(within(toolbar('Slide Show')).getByRole('button', { name: 'Presenter view' }));
    expect(open).not.toHaveBeenCalled();
    expect(showDialog()!.getAttribute('data-slide-show')).toBe('presenter');
  });
});

describe('the presenter window on its own', () => {
  it('says when it is not linked to a show', async () => {
    vi.useFakeTimers();
    stubChannels();
    render(<PresenterWindow session="nobody" waitMs={2000} />);
    expect(screen.getByRole('status').textContent).toBe('Connecting to the slide show…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(screen.getByRole('status').textContent).toContain('not linked to a slide show');
    // Close this window: closes it, or says the browser refused (a window the user opened by hand).
    const close = vi.fn();
    vi.stubGlobal('close', close);
    fireEvent.click(screen.getByRole('button', { name: 'Close this window' }));
    expect(close).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.queryByRole('button', { name: 'Close this window' })).toBeNull();
    expect(screen.getByText(/did not let this page close its window/)).toBeTruthy();
  });
});

describe('builds need every object to carry data-element', () => {
  it('every kind of object on every slide is drawn with its id', () => {
    const p = kitchenSinkPresentation();
    for (const slide of p.slides) {
      const { container, unmount } = render(<SlideView content={p} slide={slide} scale={0.5} />);
      for (const el of slide.elements) expect(container.querySelector(`[data-element="${el.id}"]`), `${el.type} ${el.id}`).not.toBeNull();
      unmount();
    }
  });
});
