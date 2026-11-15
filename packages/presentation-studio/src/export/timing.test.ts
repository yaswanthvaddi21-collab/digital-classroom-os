// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { textStyle } from '../layouts';
import { buildSteps } from '../show/sequence';
import type { Animation, Slide, TransitionType } from '../types';
import { timedSteps, timingXml, transitionSpeed, transitionXml } from './timing';

const P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
/** Parses a fragment with the PresentationML prefix bound (throws on malformed XML). */
function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(`<root ${P_NS}>${xml}</root>`, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`malformed: ${xml}`);
  return doc;
}
const anim = (order: number, trigger: Animation['trigger'], effect: Animation['effect'] = 'fade', extra: Partial<Animation> = {}): Animation => ({ effect, order, trigger, duration: 500, ...extra });

describe('transitions', () => {
  it('maps every transition type to its base PresentationML element', () => {
    const cases: Array<[TransitionType, string]> = [
      ['fade', '<p:fade/>'],
      ['push', '<p:push dir="l"/>'],
      ['wipe', '<p:wipe dir="l"/>'],
      ['cover', '<p:cover dir="l"/>'],
      ['split', '<p:split orient="horz" dir="out"/>'],
      ['zoom', '<p:zoom dir="in"/>'],
    ];
    for (const [type, effect] of cases) {
      const xml = transitionXml({ type, duration: 500 });
      expect(xml).toBe(`<p:transition spd="fast">${effect}</p:transition>`);
      parse(xml);
    }
    expect(transitionXml({ type: 'none', duration: 500 })).toBe('');
    expect(transitionXml(undefined)).toBe('');
  });

  it('writes directions and the split axis', () => {
    expect(transitionXml({ type: 'push', duration: 500, direction: 'up' })).toContain('<p:push dir="u"/>');
    expect(transitionXml({ type: 'wipe', duration: 500, direction: 'down' })).toContain('<p:wipe dir="d"/>');
    expect(transitionXml({ type: 'cover', duration: 500, direction: 'right' })).toContain('<p:cover dir="r"/>');
    expect(transitionXml({ type: 'split', duration: 500, orientation: 'vertical' })).toContain('orient="vert"');
  });

  it('rounds a duration to the nearest of the three OOXML speeds', () => {
    expect([0, 300, 500, 600, 700, 750, 875, 900, 1000, 2000].map(transitionSpeed)).toEqual(['fast', 'fast', 'fast', 'fast', 'med', 'med', 'med', 'slow', 'slow', 'slow']);
  });
});

describe('animations', () => {
  /** A slide whose elements are named by their shape ids, each with an animation (or none). */
  const slide = (...anims: Array<[number, Animation | undefined, boolean?]>): Slide => ({
    id: 's',
    layoutId: 'l',
    notes: { type: 'doc', content: [] },
    elements: anims.map(([spid, animation]) => ({ id: `e${spid}`, type: 'text', x: 0, y: 0, w: 10, h: 10, rotation: 0, text: { type: 'doc', content: [] }, style: textStyle(), ...(animation ? { animation } : {}) })),
  });
  const timing = (s: Slide, pictures: number[] = []) => timingXml(timedSteps(s, (id) => ({ spid: Number(id.slice(1)), textShape: !pictures.includes(Number(id.slice(1))) })));

  it('writes nothing for a slide without animations', () => {
    expect(timingXml([])).toBe('');
    expect(timing(slide([2, undefined]))).toBe('');
  });

  it('groups effects into clicks as the slide show does: on-click starts a click, with-previous joins it, after-previous follows it', () => {
    const xml = timing(slide([5, anim(3, 'after-previous')], [3, anim(1, 'on-click')], [4, anim(2, 'with-previous')], [6, anim(4, 'on-click', 'wipe', { direction: 'left' })]), [6]);
    const doc = parse(xml);
    const main = doc.querySelector('[nodeType="mainSeq"]')!;
    // Two click groups (two on-click animations), each waiting for a click.
    const groups = main.querySelector('childTnLst')!.children;
    expect(groups).toHaveLength(2);
    // Effects are in `order`, with the right node types.
    const effects = [...doc.querySelectorAll('[presetClass="entr"]')];
    expect(effects.map((e) => e.getAttribute('nodeType'))).toEqual(['clickEffect', 'withEffect', 'afterEffect', 'clickEffect']);
    expect([...doc.querySelectorAll('spTgt')].map((t) => t.getAttribute('spid')).filter((v, i, a) => a.indexOf(v) === i)).toEqual(['3', '4', '5', '6']);
    // after-previous starts when the effect before it ends (500 ms): the same times the slide show uses.
    const seqs = groups[0].querySelector('childTnLst')!.children;
    expect(seqs).toHaveLength(2);
    expect([...seqs].map((s) => s.querySelector('cond')!.getAttribute('delay'))).toEqual(['0', '500']);
    // cTn ids are unique and increasing in document order.
    const ids = [...doc.querySelectorAll('cTn')].map((c) => Number(c.getAttribute('id')));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    // Only shapes with text are build targets.
    expect([...doc.querySelectorAll('bldP')].map((b) => b.getAttribute('spid'))).toEqual(['3', '4', '5']);
  });

  it('times effects from the step start like the show: delays, and "after previous" after the effect before it', () => {
    const s = slide([2, anim(1, 'on-click', 'fade', { duration: 1000 })], [3, anim(2, 'with-previous', 'fade', { duration: 200, delay: 100 })], [4, anim(3, 'after-previous', 'fade', { duration: 300 })]);
    expect(timedSteps(s, (id) => ({ spid: Number(id.slice(1)), textShape: true }))[0].effects.map((e) => e.start)).toEqual(
      buildSteps(s)[0].effects.map((e) => e.start),
    );
    const doc = parse(timing(s));
    expect([...doc.querySelectorAll('[nodeType="mainSeq"] > childTnLst > par > cTn > childTnLst > par > cTn > stCondLst > cond')].map((c) => c.getAttribute('delay'))).toEqual(['0', '100', '300']);
  });

  it('starts the first group with the slide when the first animation is not on click', () => {
    const doc = parse(timing(slide([2, anim(1, 'with-previous')])));
    const conds = [...doc.querySelector('[nodeType="mainSeq"] > childTnLst > par > cTn > stCondLst')!.children];
    expect(conds.map((c) => c.getAttribute('evt') ?? c.getAttribute('delay'))).toEqual(['indefinite', 'onBegin']);
    expect(doc.querySelector('[presetClass="entr"]')!.getAttribute('nodeType')).toBe('withEffect');
  });

  it('uses PowerPoint presets for each effect and direction', () => {
    const effect = (a: Animation) => parse(timing(slide([2, a]))).querySelector('[presetClass="entr"]')!;
    expect(effect(anim(1, 'on-click', 'appear')).getAttribute('presetID')).toBe('1');
    expect(effect(anim(1, 'on-click', 'fade')).getAttribute('presetID')).toBe('10');
    const fly = effect(anim(1, 'on-click', 'fly-in', { direction: 'left' }));
    expect([fly.getAttribute('presetID'), fly.getAttribute('presetSubtype')]).toEqual(['2', '8']);
    expect(fly.querySelector('tav strVal')!.getAttribute('val')).toBe('0-#ppt_w/2');
    const wipe = effect(anim(1, 'on-click', 'wipe', { direction: 'up' }));
    expect([wipe.getAttribute('presetID'), wipe.getAttribute('presetSubtype'), wipe.querySelector('animEffect')!.getAttribute('filter')]).toEqual(['22', '1', 'wipe(down)']);
    const zoom = effect(anim(1, 'on-click', 'zoom'));
    expect([zoom.getAttribute('presetID'), zoom.getAttribute('presetSubtype')]).toEqual(['53', '16']);
    // Every effect first makes its object visible.
    for (const e of ['appear', 'fade', 'fly-in', 'wipe', 'zoom'] as const) expect(effect(anim(1, 'on-click', e)).querySelector('set attrName')!.textContent).toBe('style.visibility');
  });

  it('writes durations in milliseconds and leaves out objects that are not on the slide', () => {
    const doc = parse(timing(slide([2, anim(1, 'on-click', 'fade', { duration: 1200, delay: 300 })])));
    expect(doc.querySelector('[nodeType="mainSeq"] > childTnLst > par > cTn > childTnLst > par > cTn > stCondLst > cond')!.getAttribute('delay')).toBe('300');
    expect(doc.querySelector('animEffect cTn')!.getAttribute('dur')).toBe('1200');
    expect(timingXml(timedSteps(slide([2, anim(1, 'on-click')]), () => null))).toBe('');
  });
});
