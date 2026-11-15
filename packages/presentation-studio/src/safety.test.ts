import { describe, expect, it } from 'vitest';
import { presentationNovelty, presentationSchemaFor, PRESENTATION_V1_VOCABULARY } from './compat';
import { createPresentation } from './create';
import { migratePresentation, presentationSchemaOf } from './migrate';
import { displaySafe, elementProblem, preparePresentation, presentationProblems } from './safety';
import { kitchenSinkPresentation } from './testFixtures';
import { THEMES } from './themes';
import { CHART_TYPES, ELEMENT_TYPES, LAYOUT_KINDS, PLACEHOLDER_KINDS, SHAPE_PRESETS, THEME_COLOR_SLOTS, type PresentationContent } from './types';

/** Deeply frozen, so any write to the original during preparation throws. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

const sink = () => kitchenSinkPresentation();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('preparePresentation: what this build writes opens editable', () => {
  it('every new presentation, in every theme and both sizes', () => {
    for (const t of THEMES) for (const sizeId of ['16:9', '4:3'] as const) expect(preparePresentation(json(createPresentation('blank', { themeId: t.id, sizeId }))).state).toBe('editable');
  });

  it('a presentation using every part of the model (every element, shape, chart, fill, line, mark, transition and animation)', () => {
    const p = sink();
    const types = new Set(p.slides.flatMap((s) => s.elements.map((e) => e.type)));
    expect([...types].sort()).toEqual([...ELEMENT_TYPES].sort());
    expect(presentationProblems(json(p))).toEqual([]);
    expect(presentationNovelty(json(p))).toBeNull();
    const prepared = preparePresentation(json(p));
    expect(prepared.state).toBe('editable');
    if (prepared.state === 'editable') expect(prepared.content).toEqual(json(p));
  });

  it('always writes schema 1', () => {
    expect(presentationSchemaFor(sink())).toBe(1);
  });
});

describe('the frozen schema-1 vocabulary', () => {
  it('lists exactly the closed sets of the model', () => {
    const V = PRESENTATION_V1_VOCABULARY;
    expect([...V.shapePresets]).toEqual([...SHAPE_PRESETS]);
    expect([...V.chartTypes]).toEqual([...CHART_TYPES]);
    expect(Object.keys(V.elementTypes)).toEqual([...ELEMENT_TYPES]);
    expect([...V.layoutKinds]).toEqual([...LAYOUT_KINDS]);
    expect([...V.placeholderKinds]).toEqual([...PLACEHOLDER_KINDS]);
    expect([...V.themeColorSlots]).toEqual([...THEME_COLOR_SLOTS]);
    expect(Object.isFrozen(V)).toBe(true);
  });

  const cases: Array<[string, (p: PresentationContent & Record<string, unknown>) => void, RegExp]> = [
    ['a top-level field', (p) => void (p.comments = []), /unknown field “comments”/],
    ['a slide field', (p) => void ((p.slides[0] as unknown as Record<string, unknown>).sections = 'x'), /slides\[0\]: unknown field “sections”/],
    ['an element field', (p) => void ((p.slides[1].elements[0] as unknown as Record<string, unknown>).shadow = { blur: 2 }), /unknown field “shadow”/],
    ['an element type', (p) => void (p.slides[1].elements[0] = { ...p.slides[1].elements[0], type: 'video' } as never), /unknown element type "video"|element/],
    ['a shape preset', (p) => void ((p.slides[2].elements[0] as unknown as Record<string, unknown>).preset = 'cloud'), /unknown value "cloud"/],
    ['a transition', (p) => void (p.slides[1].transition = { type: 'vortex', duration: 1 } as never), /unknown value "vortex"/],
    ['an animation effect', (p) => void ((p.slides[2].elements[0] as unknown as { animation: { effect: string } }).animation.effect = 'bounce'), /unknown value "bounce"/],
    ['a text mark', (p) => void (p.slides[0].notes = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'glow' } as never] }] }] }), /unknown mark "glow"/],
    ['a text node', (p) => void (p.slides[0].notes = { type: 'doc', content: [{ type: 'heading' } as never] }), /unknown text node "heading"/],
    ['a mark attribute', (p) => void (p.slides[0].notes = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { letterSpacing: '2px' } } as never] }] }] }), /unknown attribute “letterSpacing”/],
    ['a theme colour slot', (p) => void ((p.theme.colors as Record<string, string>).accent7 = '#000000'), /theme.colors: unknown field “accent7”/],
    ['a slide size', (p) => void (p.size = { width: 1280, height: 720 } as never), /slide size/],
    ['a layout kind', (p) => void (p.layouts[0].kind = 'vertical' as never), /unknown value "vertical"/],
    ['a fill type', (p) => void (p.slides[0].background = { type: 'pattern' } as never), /background/],
  ];
  for (const [what, change, message] of cases) {
    it(`content with ${what} outside it opens read-only, and the original is not changed`, () => {
      const p = json(sink());
      change(p);
      const original = deepFreeze(json(p));
      const prepared = preparePresentation(original);
      expect(prepared.state).toBe('protected');
      if (prepared.state !== 'protected') return;
      expect(prepared.reason).toBe('invalid');
      expect(prepared.detail).toMatch(message);
      expect(original).toEqual(json(p));
    });
  }

  it('a field left undefined or an attribute left null is not new', () => {
    const p = json(sink());
    p.slides[0].notes = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null, indent: null }, content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: null, letterSpacing: null } }] }] }] };
    expect(presentationNovelty(p)).toBeNull();
    expect(presentationNovelty({ ...p, extra: undefined })).toBeNull();
  });
});

describe('preparePresentation: protected view', () => {
  it('opens content from a newer version read-only, shows what it can, and never changes the original', () => {
    const newer = deepFreeze({ ...json(sink()), schemaVersion: 2, slides: [...json(sink()).slides, { id: 'future', layoutId: 'layout-blank', elements: [{ id: 'v', type: 'video', x: 0, y: 0, w: 1, h: 1, rotation: 0 }], notes: { type: 'doc', content: [] } }] });
    const before = json(newer);
    const prepared = preparePresentation(newer);
    expect(prepared).toMatchObject({ state: 'protected', reason: 'newer' });
    if (prepared.state !== 'protected') return;
    expect(prepared.detail).toMatch(/newer version of Classroom OS \(content version 2\)/);
    expect(prepared.display.slides).toHaveLength(before.slides.length);
    // The unknown element is left out of the view; everything readable is shown.
    expect(prepared.display.slides.at(-1)!.elements).toEqual([]);
    expect(prepared.display.slides[1].elements).toEqual(before.slides[1].elements);
    expect(json(newer)).toEqual(before);
    expect(migratePresentation(newer)).toEqual({ ok: false, reason: 'newer', version: 2 });
  });

  it('opens damaged content read-only with a readable reason', () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /not a presentation/],
      ['text', /not a presentation/],
      [{ ...json(sink()), slides: 'x' }, /no list of slides/],
      [{ ...json(sink()), masters: [] }, /no slide master/],
      [{ ...json(sink()), theme: { id: 'x', name: 'x', colors: {}, fonts: {} } }, /theme colour/],
    ];
    for (const [raw, message] of cases) {
      const prepared = preparePresentation(raw);
      expect(prepared.state).toBe('protected');
      if (prepared.state === 'protected') {
        expect(prepared.reason).toBe('invalid');
        expect(prepared.detail).toMatch(message);
        expect(prepared.display.layouts.length).toBeGreaterThan(0);
      }
    }
  });

  it('finds broken slides, layouts and objects', () => {
    const p = json(sink());
    p.slides[0].layoutId = 'missing';
    p.slides[1].elements.push({ ...p.slides[1].elements[0] });
    p.slides[2].elements[0].x = 'left';
    p.slides[3].background = { type: 'none' };
    p.layouts[2].masterId = 'nope';
    p.slides.push({ ...p.slides[4] });
    const problems = presentationProblems(p);
    expect(problems).toEqual(
      expect.arrayContaining([
        'slide 1 has no layout',
        'slide 2: two objects share an id',
        expect.stringMatching(/slide 3: element .* has no readable position/),
        'slide 4 has an unreadable background',
        expect.stringMatching(/layout “.*” has no master/),
        expect.stringMatching(/has the same id as another slide/),
      ]),
    );
  });

  it('checks every kind of object', () => {
    const els = sink().slides.flatMap((s) => s.elements);
    for (const e of els) expect(elementProblem(json(e))).toBeNull();
    const broken: Array<[string, Record<string, unknown>]> = [
      ['text', { text: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] } }],
      ['image', { attachmentId: '' }],
      ['shape', { fill: { type: 'solid', color: 'blue' } }],
      ['table', { rows: [{ height: 10, cells: [] }] }],
      ['chart', { series: [{ name: 'a', values: ['x'] }] }],
      ['diagram', { previewId: 3 }],
    ];
    for (const [type, change] of broken) {
      const e = els.find((x) => x.type === type)!;
      expect(elementProblem({ ...json(e), ...change })).not.toBeNull();
    }
    expect(elementProblem({ id: 'a', type: 'text', x: 0, y: 0, w: -1, h: 1, rotation: 0 })).toMatch(/position or size/);
  });
});

describe('displaySafe', () => {
  it('falls back to the defaults for everything unreadable, and never changes its input', () => {
    const raw = deepFreeze({ size: { width: 960, height: 720 }, slides: [{ elements: [{ nonsense: true }], notes: 7 }, 'x'] });
    const view = displaySafe(raw);
    expect(view.size).toEqual({ width: 960, height: 720 });
    expect(view.themeId).toBe('classroom');
    expect(view.slides).toHaveLength(1);
    expect(view.slides[0]).toMatchObject({ id: 'slide-1', layoutId: view.layouts[0].id, elements: [] });
    expect(presentationProblems(view)).toEqual([]);
  });
});

describe('migratePresentation', () => {
  it('reads the stored schema and works on a copy', () => {
    expect(presentationSchemaOf({ schemaVersion: 1 })).toBe(1);
    expect(presentationSchemaOf({})).toBe(1);
    expect(presentationSchemaOf(null)).toBe(1);
    expect(presentationSchemaOf({ schemaVersion: 3 })).toBe(3);
    const raw = json(createPresentation());
    const out = migratePresentation(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.content).toEqual(raw);
      expect(out.content).not.toBe(raw);
      out.content.slides.length = 0;
      expect(raw.slides).toHaveLength(1);
    }
  });

  // verify-R1: an unreadable stored version used to read as 1, so the content opened as editable schema 1 and a save
  // would have replaced the stored value.
  it.each(['2', 2.5, 0, -1, null, true, [2], { v: 2 }, Number.NaN])('refuses the unreadable stored version %j and opens it protected, unchanged', (stored) => {
    const raw = deepFreeze({ ...json(createPresentation()), schemaVersion: stored });
    const before = JSON.stringify(raw);
    expect(presentationSchemaOf(raw)).toBeNull();
    expect(migratePresentation(raw)).toEqual({ ok: false, reason: 'unreadable', stored });
    const prepared = preparePresentation(raw);
    expect(prepared.state).toBe('protected');
    if (prepared.state === 'protected') {
      expect(prepared.reason).toBe('invalid');
      expect(prepared.detail).toMatch(/content version .+ is not readable/);
      expect(presentationProblems(prepared.display)).toEqual([]);
    }
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('reads a missing stored version as 1', () => {
    const { schemaVersion: _drop, ...raw } = json(createPresentation());
    const prepared = preparePresentation(raw);
    expect(prepared.state).toBe('editable');
    if (prepared.state === 'editable') expect(prepared.content.schemaVersion).toBe(1);
  });
});
