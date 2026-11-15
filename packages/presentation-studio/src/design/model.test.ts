import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide } from '../create';
import { layoutIdFor } from '../layouts';
import { decorationsOf, effectiveBackground } from '../render/SlideView';
import { presentationProblems } from '../safety';
import { THEMES } from '../themes';
import { plainTextOf, richTextFromPlain, type LayoutKind, type PresentationContent, type ShapeElement, type SlideElement, type TableElement, type TextElement } from '../types';
import {
  addDecorations,
  addPlaceholder,
  applyBackgroundToAll,
  applyTheme,
  applyThemeColors,
  applyThemeFonts,
  builtInThemeLike,
  changeLayout,
  removeFromTarget,
  reorderDecorations,
  rescaleBox,
  resetSlides,
  setShowMasterDecorations,
  setSlideSize,
  setSlidesBackground,
  setTargetBackground,
  updateDecorations,
  updatePlaceholder,
} from './model';

let n = 0;
const ids = () => `id-${++n}`;
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A presentation with a title slide and a "Title and content" slide, both typed into. */
function deck(): PresentationContent {
  const p = createPresentation('blank', { newId: ids });
  const second = createSlide(p, layoutIdFor('titleContent'), ids);
  const fill = (els: SlideElement[], texts: Record<string, string>) => els.map((e) => (e.type === 'text' && e.placeholderId && texts[e.placeholderId] ? { ...e, text: richTextFromPlain(texts[e.placeholderId]) } : e));
  p.slides = [
    { ...p.slides[0], id: 's1', elements: fill(p.slides[0].elements, { title: 'Cells', subtitle: 'Biology 101' }) },
    { ...second, id: 's2', elements: fill(second.elements, { title: 'Organelles', body: 'Nucleus\nMitochondria' }) },
  ];
  return p;
}

const text = (p: PresentationContent, slide: number, ph: string) => p.slides[slide].elements.find((e) => e.placeholderId === ph) as TextElement | undefined;

describe('themes', () => {
  it('applies a built-in theme; colour and font sets alone make a custom theme unless they equal a built-in one', () => {
    const p = deck();
    const midnight = THEMES.find((t) => t.id === 'midnight')!;
    const a = applyTheme(p, midnight);
    expect(a.themeId).toBe('midnight');
    expect(a.theme).toEqual(midnight);
    expect(a.theme).not.toBe(midnight); // a copy, never the shared constant
    expect(a.slides).toBe(p.slides); // theme slots: nothing on the slides changes

    const b = applyThemeColors(p, THEMES.find((t) => t.id === 'sunrise')!.colors);
    expect(b.themeId).toBe('custom');
    expect(b.theme.name).toBe('Custom');
    expect(b.theme.fonts).toEqual(p.theme.fonts);
    expect(b.theme.colors.accent1).toBe('#ea580c');

    // Sunrise's fonts on top of Sunrise's colours: that is Sunrise again.
    const c = applyThemeFonts(b, THEMES.find((t) => t.id === 'sunrise')!.fonts);
    expect(c.themeId).toBe('sunrise');
    expect(builtInThemeLike(c.theme)?.id).toBe('sunrise');
    expect(applyTheme(c, c.theme)).toBe(c); // no change, same content
    expect(presentationProblems(json(b))).toEqual([]);
  });
});

describe('slide size', () => {
  it('rescales text regions, keeps bands on their edge and keeps other objects their size', () => {
    expect(rescaleBox({ x: 10, y: 54, w: 100, h: 108 }, 'text', 540, 720)).toMatchObject({ x: 10, y: 72, w: 100, h: 144 });
    expect(rescaleBox({ x: 0, y: 0, w: 12, h: 540 }, 'band', 540, 720)).toMatchObject({ y: 0, h: 720 });
    expect(rescaleBox({ x: 0, y: 530, w: 960, h: 10 }, 'band', 540, 720)).toMatchObject({ y: 710, h: 10 });
    expect(rescaleBox({ x: 100, y: 220, w: 200, h: 100 }, 'object', 540, 720)).toMatchObject({ x: 100, y: 310, w: 200, h: 100 });
    // Too tall for the new size: shrunk to fit, centred where it was.
    expect(rescaleBox({ x: 100, y: 0, w: 200, h: 720 }, 'object', 720, 540)).toMatchObject({ x: 125, y: 0, w: 150, h: 540, factor: 0.75 });
  });

  it('changes the size of everything, and back without drift for text', () => {
    const p = addDecorations(deck(), { kind: 'master', id: 'master-1' }, [
      { id: 'band', type: 'shape', preset: 'rect', x: 0, y: 530, w: 960, h: 10, rotation: 0, fill: { type: 'solid', color: { theme: 'accent1' } }, line: null } as ShapeElement,
    ]);
    const four = setSlideSize(p, '4:3');
    expect(four.size).toEqual({ width: 960, height: 720 });
    expect(four.masters[0].decorations[0]).toMatchObject({ y: 710, h: 10 });
    const title = text(four, 1, 'title')!;
    const layoutTitle = four.layouts.find((l) => l.id === layoutIdFor('titleContent'))!.placeholders.find((x) => x.id === 'title')!;
    expect({ y: title.y, h: title.h }).toEqual({ y: layoutTitle.y, h: layoutTitle.h });
    expect(title.style.fontSize).toBe(text(p, 1, 'title')!.style.fontSize);
    expect(presentationProblems(json(four))).toEqual([]);
    expect(setSlideSize(four, '4:3')).toBe(four);
    const back = setSlideSize(four, '16:9');
    expect(Math.abs(text(back, 1, 'title')!.y - text(p, 1, 'title')!.y)).toBeLessThanOrEqual(1);
  });

  it('shrinks a table that no longer fits, columns and rows with it', () => {
    const p = setSlideSize(createPresentation('lab-results', { newId: ids }), '4:3');
    const tall: TableElement = { ...(p.slides[3].elements.find((e) => e.type === 'table') as TableElement), y: 0, h: 720, rows: Array.from({ length: 6 }, () => ({ height: 120, cells: Array.from({ length: 4 }, () => ({ text: richTextFromPlain('x') })) })) };
    p.slides[3].elements = [tall];
    const out = setSlideSize(p, '16:9').slides[3].elements[0] as TableElement;
    expect(out.h).toBe(540);
    expect(out.rows[0].height).toBe(90);
    expect(out.columns.reduce((a, b) => a + b, 0)).toBeCloseTo(out.w, -1);
  });
});

describe('backgrounds', () => {
  it('sets and resets the selected slides’ background; apply to all moves it to the master', () => {
    let p = deck();
    p = setLayoutBackground(p);
    const red = { type: 'solid' as const, color: '#ff0000' };
    const a = setSlidesBackground(p, ['s2'], red);
    expect(a.slides[0]).toBe(p.slides[0]);
    expect(effectiveBackground(a, a.slides[1])).toEqual(red);
    expect(setSlidesBackground(a, ['s2'], red)).toBe(a);
    const reset = setSlidesBackground(a, ['s2'], undefined);
    expect(reset.slides[1].background).toBeUndefined();
    expect('background' in reset.slides[1]).toBe(false);

    const all = applyBackgroundToAll(a, { type: 'gradient', angle: 90, stops: [{ position: 0, color: { theme: 'light1' } }, { position: 1, color: { theme: 'accent1' } }] });
    expect(all.masters[0].background.type).toBe('gradient');
    expect(all.layouts.every((l) => l.background === undefined)).toBe(true);
    expect(all.slides.every((s) => s.background === undefined)).toBe(true);
    // A new slide gets it too.
    expect(effectiveBackground(all, createSlide(all, layoutIdFor('blank'), ids)).type).toBe('gradient');
    expect(presentationProblems(json(all))).toEqual([]);
  });
});

function setLayoutBackground(p: PresentationContent) {
  return setTargetBackground(p, { kind: 'layout', id: layoutIdFor('sectionHeader') }, { type: 'solid', color: { theme: 'dark2' } });
}

describe('change layout', () => {
  it('moves typed text into the new layout’s placeholders and keeps everything typed', () => {
    const p = deck();
    const out = changeLayout(p, ['s2'], layoutIdFor('twoContent'), ids);
    const s = out.slides[1];
    expect(s.layoutId).toBe(layoutIdFor('twoContent'));
    const left = out.layouts.find((l) => l.id === layoutIdFor('twoContent'))!.placeholders.find((x) => x.id === 'left')!;
    // body → left (same family), at the new placeholder's place and style; the new right column is added empty.
    expect(plainTextOf((s.elements.find((e) => e.placeholderId === 'left') as TextElement).text)).toBe('Nucleus\nMitochondria');
    expect(s.elements.find((e) => e.placeholderId === 'left')).toMatchObject({ x: left.x, y: left.y, w: left.w, h: left.h });
    expect((s.elements.find((e) => e.placeholderId === 'left') as TextElement).style.fontSize).toBe(18);
    expect(plainTextOf((s.elements.find((e) => e.placeholderId === 'right') as TextElement).text)).toBe('');
    expect(plainTextOf((s.elements.find((e) => e.placeholderId === 'title') as TextElement).text)).toBe('Organelles');
    expect(out.slides[0]).toBe(p.slides[0]);
    expect(presentationProblems(json(out))).toEqual([]);
  });

  it('keeps text the new layout has no place for, as an ordinary text box, and drops only empty placeholders', () => {
    const p = deck();
    const out = changeLayout(p, ['s1', 's2'], layoutIdFor('titleOnly'), ids);
    const sub = out.slides[0].elements.find((e) => e.type === 'text' && plainTextOf(e.text) === 'Biology 101')!;
    expect(sub.placeholderId).toBeUndefined();
    expect(sub).toMatchObject({ x: text(p, 0, 'subtitle')!.x, y: text(p, 0, 'subtitle')!.y });
    expect(out.slides[1].elements.map((e) => (e.type === 'text' ? plainTextOf(e.text) : e.type))).toEqual(['Organelles', 'Nucleus\nMitochondria']);
    // Empty placeholders go: an untouched title slide on the Blank layout has nothing left.
    const fresh = createPresentation('blank', { newId: ids });
    expect(changeLayout(fresh, [fresh.slides[0].id], layoutIdFor('blank'), ids).slides[0].elements).toEqual([]);
    expect(changeLayout(fresh, ['unknown'], layoutIdFor('blank'))).toBe(fresh);
  });

  it('keeps a position or style the user changed on the slide', () => {
    const p = deck();
    p.slides[1].elements = p.slides[1].elements.map((e) => (e.placeholderId === 'title' && e.type === 'text' ? { ...e, x: 300, style: { ...e.style, fontSize: 50 } } : e));
    const out = changeLayout(p, ['s2'], layoutIdFor('sectionHeader'), ids);
    const title = out.slides[1].elements.find((e) => e.placeholderId === 'title') as TextElement;
    const ph = out.layouts.find((l) => l.id === layoutIdFor('sectionHeader'))!.placeholders.find((x) => x.id === 'title')!;
    expect(title.x).toBe(300); // moved by the user
    expect(title.style.fontSize).toBe(50); // sized by the user
    expect(title.y).toBe(ph.y); // the rest follows the new layout
    expect(title.style.verticalAlign).toBe(ph.style.verticalAlign);
  });

  it('reset puts placeholders back and adds missing ones, keeping the text', () => {
    let p = deck();
    p.slides[1].elements = p.slides[1].elements.filter((e) => e.placeholderId !== 'body').map((e) => (e.type === 'text' ? { ...e, x: 5, rotation: 30, style: { ...e.style, fontSize: 60 } } : e));
    p = resetSlides(p, ['s2'], ids);
    const layout = p.layouts.find((l) => l.id === layoutIdFor('titleContent'))!;
    const title = text(p, 1, 'title')!;
    expect(title).toMatchObject({ x: layout.placeholders[0].x, rotation: 0 });
    expect(title.style).toEqual(layout.placeholders[0].style);
    expect(plainTextOf(title.text)).toBe('Organelles');
    expect(text(p, 1, 'body')).toBeTruthy();
    expect(resetSlides(p, ['s2'], ids)).toBe(p);
  });
});

describe('master view', () => {
  const master = { kind: 'master' as const, id: 'master-1' };
  const titleContent = { kind: 'layout' as const, id: layoutIdFor('titleContent') };

  it('a master placeholder change flows to the layouts and on to the slides, except where something was changed', () => {
    const p = deck();
    // Slide 2's title was resized by hand; the Title slide layout's title is its own design (44 pt, not 32).
    p.slides[1].elements = p.slides[1].elements.map((e) => (e.placeholderId === 'title' && e.type === 'text' ? { ...e, style: { ...e.style, color: '#ff0000' } } : e));
    const out = updatePlaceholder(p, master, 'title', (ph) => ({ ...ph, style: { ...ph.style, fontSize: 36, color: { theme: 'accent1' } } }));
    expect(out.masters[0].placeholders[0].style.fontSize).toBe(36);
    const tcTitle = out.layouts.find((l) => l.id === layoutIdFor('titleContent'))!.placeholders.find((x) => x.id === 'title')!;
    expect(tcTitle.style.fontSize).toBe(36);
    expect(out.layouts.find((l) => l.id === layoutIdFor('title'))!.placeholders.find((x) => x.id === 'title')!.style.fontSize).toBe(44);
    expect(text(out, 1, 'title')!.style.fontSize).toBe(36); // follows
    expect(text(out, 1, 'title')!.style.color).toBe('#ff0000'); // the user's colour stays
    // The Title slide layout's title has its own size (kept) but the master's colour (follows), and so does slide 1.
    expect(text(out, 0, 'title')!.style.fontSize).toBe(44);
    expect(text(out, 0, 'title')!.style.color).toEqual({ theme: 'accent1' });
    expect(out.slides[0].elements.find((e) => e.placeholderId === 'subtitle')).toBe(p.slides[0].elements.find((e) => e.placeholderId === 'subtitle'));
  });

  it('a layout placeholder moved or resized moves the slides’ objects that were where it was', () => {
    const p = deck();
    const out = updatePlaceholder(p, titleContent, 'body', (ph) => ({ ...ph, x: ph.x + 100, w: ph.w - 100 }));
    const body = text(out, 1, 'body')!;
    expect(body.x).toBe(text(p, 1, 'body')!.x + 100);
    expect(body.w).toBe(text(p, 1, 'body')!.w - 100);
    expect(updatePlaceholder(out, titleContent, 'nope', (x) => x)).toBe(out);
  });

  it('adds, removes and orders decorations, which every slide of the master shows', () => {
    const p = deck();
    const rect = (id: string): ShapeElement => ({ id, type: 'shape', preset: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: { type: 'solid', color: '#000000' }, line: null, placeholderId: 'x' });
    let out = addDecorations(p, master, [rect('a'), rect('b')]);
    expect(out.masters[0].decorations.map((d) => d.id)).toEqual(['a', 'b']);
    expect(out.masters[0].decorations[0].placeholderId).toBeUndefined();
    expect(decorationsOf(out, out.slides[1]).map((d) => d.id)).toEqual(['a', 'b']);
    out = reorderDecorations(out, master, ['a'], 'front');
    expect(out.masters[0].decorations.map((d) => d.id)).toEqual(['b', 'a']);
    out = updateDecorations(out, master, ['a'], (d) => ({ ...d, x: 50 }));
    expect(out.masters[0].decorations[1].x).toBe(50);
    out = setShowMasterDecorations(out, layoutIdFor('titleContent'), false);
    expect(decorationsOf(out, out.slides[1])).toEqual([]);
    expect(decorationsOf(out, out.slides[0]).length).toBe(2);
    out = removeFromTarget(out, master, { placeholders: [], decorations: ['a'] });
    expect(out.masters[0].decorations.map((d) => d.id)).toEqual(['b']);
    expect(presentationProblems(json(out))).toEqual([]);
  });

  it('a new layout placeholder reaches new slides and reset slides; removing one keeps what was typed in it', () => {
    const p = deck();
    const added = addPlaceholder(p, layoutIdFor('titleContent'));
    expect(added.id).toBe('text-1');
    expect(createSlide(added.content, layoutIdFor('titleContent'), ids).elements.some((e) => e.placeholderId === 'text-1')).toBe(true);
    expect(text(added.content, 1, 'text-1')).toBeUndefined(); // existing slides: only after Reset slide
    expect(text(resetSlides(added.content, ['s2'], ids), 1, 'text-1')).toBeTruthy();

    const removed = removeFromTarget(p, titleContent, { placeholders: ['body'], decorations: [] });
    expect(removed.layouts.find((l) => l.id === layoutIdFor('titleContent'))!.placeholders.map((x) => x.id)).toEqual(['title']);
    const kept = removed.slides[1].elements.find((e) => e.type === 'text' && plainTextOf(e.text) === 'Nucleus\nMitochondria')!;
    expect(kept.placeholderId).toBeUndefined();
    expect(presentationProblems(json(removed))).toEqual([]);
  });

  it('master and layout backgrounds; a layout can go back to the master’s, the master always keeps one', () => {
    const p = setLayoutBackground(deck());
    const s = createSlide(p, layoutIdFor('sectionHeader'), ids);
    expect(effectiveBackground(p, s)).toEqual({ type: 'solid', color: { theme: 'dark2' } });
    const back = setTargetBackground(p, { kind: 'layout', id: layoutIdFor('sectionHeader') }, undefined);
    expect(effectiveBackground(back, s)).toEqual(back.masters[0].background);
    expect(setTargetBackground(back, master, undefined)).toBe(back);
  });
});

describe('Round 3 fixes', () => {
  const master = { kind: 'master' as const, id: 'master-1' };

  /** A "Two content" slide with typed left and right columns. */
  function twoColumns(): PresentationContent {
    const p = createPresentation('blank', { newId: ids });
    const s = createSlide(p, layoutIdFor('twoContent'), ids);
    const typed: Record<string, string> = { title: 'Our approach', left: 'Idea\nMethod', right: 'Why it works\nRisks' };
    p.slides = [{ ...s, id: 'tc', elements: s.elements.map((e) => (e.type === 'text' && e.placeholderId && typed[e.placeholderId] ? { ...e, text: richTextFromPlain(typed[e.placeholderId]) } : e)) }];
    return p;
  }
  const typedIn = (p: PresentationContent, ph: string) => {
    const e = p.slides[0].elements.find((x) => x.placeholderId === ph);
    return e && e.type === 'text' ? plainTextOf(e.text) : undefined;
  };

  it('change layout matches every placeholder by id before any looser match (Two content ↔ Comparison)', () => {
    const p = twoColumns();
    const cmp = changeLayout(p, ['tc'], layoutIdFor('comparison'), ids);
    expect(typedIn(cmp, 'left')).toBe('Idea\nMethod');
    expect(typedIn(cmp, 'right')).toBe('Why it works\nRisks');
    expect(typedIn(cmp, 'leftHeading')).toBe('');
    expect(typedIn(cmp, 'rightHeading')).toBe('');
    expect(typedIn(cmp, 'title')).toBe('Our approach');
    const back = changeLayout(cmp, ['tc'], layoutIdFor('twoContent'), ids);
    expect(typedIn(back, 'left')).toBe('Idea\nMethod');
    expect(typedIn(back, 'right')).toBe('Why it works\nRisks');
    expect(back.slides[0].elements.filter((e) => e.type === 'text')).toHaveLength(3);
    expect(presentationProblems(json(back))).toEqual([]);
  });

  it("a master body placeholder's text style reaches every body-family placeholder of the layouts, and their slides", () => {
    const p = twoColumns();
    const extra = [createSlide(p, layoutIdFor('comparison'), ids), createSlide(p, layoutIdFor('pictureCaption'), ids)];
    p.slides = [...p.slides, ...extra];
    // The user gave the right column of slide 1 their own font: that stays.
    p.slides[0].elements = p.slides[0].elements.map((e) => (e.placeholderId === 'right' && e.type === 'text' ? { ...e, style: { ...e.style, font: 'Courier New' } } : e));
    const out = updatePlaceholder(p, master, 'body', (ph) => ({ ...ph, style: { ...ph.style, font: 'Georgia' } }));
    const fontOf = (layout: LayoutKind, id: string) => out.layouts.find((l) => l.id === layoutIdFor(layout))!.placeholders.find((x) => x.id === id)!.style.font;
    for (const [layout, id] of [
      ['titleContent', 'body'],
      ['sectionHeader', 'body'],
      ['twoContent', 'left'],
      ['twoContent', 'right'],
      ['comparison', 'leftHeading'],
      ['comparison', 'left'],
      ['comparison', 'rightHeading'],
      ['comparison', 'right'],
      ['pictureCaption', 'caption'],
      ['title', 'subtitle'],
    ] as const)
      expect(fontOf(layout, id), `${layout}/${id}`).toBe('Georgia');
    // Titles have their own master placeholder: untouched. Positions stay the layouts' own.
    expect(fontOf('comparison', 'title')).toBe(p.layouts.find((l) => l.id === layoutIdFor('comparison'))!.placeholders[0].style.font);
    const before = p.layouts.find((l) => l.id === layoutIdFor('twoContent'))!.placeholders.find((x) => x.id === 'left')!;
    expect(out.layouts.find((l) => l.id === layoutIdFor('twoContent'))!.placeholders.find((x) => x.id === 'left')).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.h, style: { fontSize: before.style.fontSize } });
    // Slides follow, except a field the user changed.
    const style = (slide: number, ph: string) => (out.slides[slide].elements.find((e) => e.placeholderId === ph) as TextElement).style;
    expect(style(0, 'left').font).toBe('Georgia');
    expect(style(0, 'right').font).toBe('Courier New');
    expect(style(1, 'rightHeading').font).toBe('Georgia');
    expect(style(1, 'rightHeading').bold).toBe(true);
    expect(style(2, 'caption').font).toBe('Georgia');
    expect(presentationProblems(json(out))).toEqual([]);
  });

  it('a shape taller than the new slide height is shrunk to fit instead of sticking out of the top', () => {
    // 4:3 (720 high) → 16:9 (540 high): a 620 high rect touching only the bottom edge.
    const b = rescaleBox({ x: 100, y: 100, w: 200, h: 620 }, 'band', 720, 540);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h).toBeLessThanOrEqual(540);
    expect(b.h).toBe(540);
    // A band that fits keeps its size on its edge.
    expect(rescaleBox({ x: 0, y: 620, w: 960, h: 100 }, 'band', 720, 540)).toMatchObject({ y: 440, h: 100 });
    expect(rescaleBox({ x: 0, y: 0, w: 960, h: 100 }, 'band', 720, 540)).toMatchObject({ y: 0, h: 100 });
  });
});
