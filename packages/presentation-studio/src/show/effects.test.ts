// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { animate, animationFrames, prefersReducedMotion, transitionFrames } from './effects';

afterEach(() => vi.unstubAllGlobals());

describe('transition keyframes', () => {
  it('none and no transition are cuts', () => {
    expect(transitionFrames(undefined)).toBeNull();
    expect(transitionFrames({ type: 'none', duration: 500 })).toBeNull();
  });

  it('fade and zoom', () => {
    expect(transitionFrames({ type: 'fade', duration: 500 })).toEqual({ incoming: [{ opacity: 0 }, { opacity: 1 }] });
    expect(transitionFrames({ type: 'zoom', duration: 500 })!.incoming[0]).toEqual({ transform: 'scale(0.3)', opacity: 0 });
  });

  it('push moves both slides the way the direction says (left = the new slide comes from the right)', () => {
    const left = transitionFrames({ type: 'push', duration: 500, direction: 'left' })!;
    expect(left.incoming).toEqual([{ transform: 'translate(100%, 0)' }, { transform: 'translate(0, 0)' }]);
    expect(left.outgoing).toEqual([{ transform: 'translate(0, 0)' }, { transform: 'translate(-100%, 0)' }]);
    const right = transitionFrames({ type: 'push', duration: 500, direction: 'right' })!;
    expect(right.incoming[0]).toEqual({ transform: 'translate(-100%, 0)' });
    expect(right.outgoing![1]).toEqual({ transform: 'translate(100%, 0)' });
    const up = transitionFrames({ type: 'push', duration: 500, direction: 'up' })!;
    expect(up.incoming[0]).toEqual({ transform: 'translate(0, 100%)' });
    expect(up.outgoing![1]).toEqual({ transform: 'translate(0, -100%)' });
    const down = transitionFrames({ type: 'push', duration: 500, direction: 'down' })!;
    expect(down.incoming[0]).toEqual({ transform: 'translate(0, -100%)' });
  });

  it('cover moves only the new slide; wipe and split clip it open', () => {
    expect(transitionFrames({ type: 'cover', duration: 500, direction: 'up' })).toEqual({ incoming: [{ transform: 'translate(0, 100%)' }, { transform: 'translate(0, 0)' }] });
    expect(transitionFrames({ type: 'wipe', duration: 500, direction: 'left' })!.incoming[0]).toEqual({ clipPath: 'inset(0 0 0 100%)' });
    expect(transitionFrames({ type: 'wipe', duration: 500, direction: 'down' })!.incoming[0]).toEqual({ clipPath: 'inset(0 0 100% 0)' });
    expect(transitionFrames({ type: 'split', duration: 500, orientation: 'horizontal' })!.incoming[0]).toEqual({ clipPath: 'inset(50% 0 50% 0)' });
    expect(transitionFrames({ type: 'split', duration: 500, orientation: 'vertical' })!.incoming[0]).toEqual({ clipPath: 'inset(0 50% 0 50%)' });
  });
});

describe('animation keyframes', () => {
  const size = { width: 960, height: 540 } as const;
  const el = { x: 100, y: 200, w: 300, h: 100, rotation: 0 };

  it('fly-in starts just outside the slide on the side it comes from', () => {
    const f = (direction: 'left' | 'right' | 'up' | 'down') => animationFrames({ effect: 'fly-in', order: 1, trigger: 'on-click', duration: 500, direction }, el, size)[0];
    expect(f('left')).toEqual({ transform: 'translate(-420px, 0px)' });
    expect(f('right')).toEqual({ transform: 'translate(880px, 0px)' });
    expect(f('up')).toEqual({ transform: 'translate(0px, -320px)' });
    expect(f('down')).toEqual({ transform: 'translate(0px, 360px)' });
  });

  it('keeps the object\'s rotation while it moves or zooms', () => {
    const rotated = { ...el, rotation: 30 };
    const fly = animationFrames({ effect: 'fly-in', order: 1, trigger: 'on-click', duration: 500, direction: 'left' }, rotated, size);
    expect(fly[1]).toEqual({ transform: 'translate(0px, 0px) rotate(30deg)' });
    const zoom = animationFrames({ effect: 'zoom', order: 1, trigger: 'on-click', duration: 500 }, rotated, size);
    expect(zoom).toEqual([
      { transform: 'rotate(30deg) scale(0.1)', opacity: 0 },
      { transform: 'rotate(30deg) scale(1)', opacity: 1 },
    ]);
  });

  it('appear and fade change opacity; wipe reveals from its side', () => {
    expect(animationFrames({ effect: 'appear', order: 1, trigger: 'on-click', duration: 500 }, el, size)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animationFrames({ effect: 'fade', order: 1, trigger: 'on-click', duration: 500 }, el, size)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animationFrames({ effect: 'wipe', order: 1, trigger: 'on-click', duration: 500, direction: 'left' }, el, size)[0]).toEqual({ clipPath: 'inset(0 100% 0 0)' });
    expect(animationFrames({ effect: 'wipe', order: 1, trigger: 'on-click', duration: 500, direction: 'down' }, el, size)[0]).toEqual({ clipPath: 'inset(100% 0 0 0)' });
  });
});

describe('the player', () => {
  it('follows prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is a cut where element.animate is missing', () => {
    const div = document.createElement('div');
    expect(animate(div, [{ opacity: 0 }, { opacity: 1 }], { duration: 10 })).toBeNull();
    expect(animate(null, [], {})).toBeNull();
  });
});
