import { describe, expect, it } from 'vitest';
import { createPresentation, createSlide, TEMPLATE_IDS } from './create';
import { LAYOUT_NAMES, layoutIdFor } from './layouts';
import { cssFontFamily, resolveColor, resolveFont, THEMES, themeById } from './themes';
import { presentationTemplates } from './templates';
import {
  diagramNodeAttrs,
  isEmptyRichText,
  LAYOUT_KINDS,
  plainTextOf,
  PRESENTATION_SCHEMA,
  richTextFromPlain,
  sizeIdOf,
  SLIDE_SIZES,
  THEME_COLOR_SLOTS,
  type DiagramElement,
} from './types';

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('createPresentation', () => {
  it('makes a schema-1 16:9 presentation with the theme, one master, the eight layouts and a title slide', () => {
    const p = createPresentation('blank', { newId: counter() });
    expect(p.schemaVersion).toBe(PRESENTATION_SCHEMA);
    expect(p.size).toEqual({ width: 960, height: 540 });
    expect(p.themeId).toBe('classroom');
    expect(p.theme).toEqual(themeById('classroom'));
    expect(p.masters).toHaveLength(1);
    expect(p.layouts.map((l) => l.kind)).toEqual([...LAYOUT_KINDS]);
    expect(p.layouts.map((l) => l.name)).toEqual(LAYOUT_KINDS.map((k) => LAYOUT_NAMES[k]));
    expect(p.slides).toHaveLength(1);
    const [slide] = p.slides;
    expect(slide.layoutId).toBe(layoutIdFor('title'));
    expect(slide.elements.map((e) => [e.type, e.placeholderId])).toEqual([
      ['text', 'title'],
      ['text', 'subtitle'],
    ]);
    expect(isEmptyRichText(slide.notes)).toBe(true);
  });

  it('takes the theme and the slide size, and lays everything out inside the slide', () => {
    for (const sizeId of ['16:9', '4:3'] as const) {
      for (const t of THEMES) {
        const p = createPresentation('blank', { themeId: t.id, sizeId });
        expect(p.themeId).toBe(t.id);
        expect(sizeIdOf(p.size)).toBe(sizeId);
        for (const ph of [...p.masters[0].placeholders, ...p.layouts.flatMap((l) => l.placeholders)]) {
          expect(ph.x).toBeGreaterThanOrEqual(0);
          expect(ph.y).toBeGreaterThanOrEqual(0);
          expect(ph.x + ph.w).toBeLessThanOrEqual(SLIDE_SIZES[sizeId].width);
          expect(ph.y + ph.h).toBeLessThanOrEqual(SLIDE_SIZES[sizeId].height);
        }
      }
    }
  });

  it('falls back to the default theme for an unknown theme id, and refuses an unknown template', () => {
    expect(createPresentation('blank', { themeId: 'nope' }).themeId).toBe('classroom');
    expect(() => createPresentation('nope')).toThrow(/Unknown presentation template/);
  });

  it('gives every layout and placeholder a unique id, and every layout the built-in master', () => {
    const p = createPresentation();
    expect(new Set(p.layouts.map((l) => l.id)).size).toBe(p.layouts.length);
    for (const l of p.layouts) {
      expect(l.masterId).toBe(p.masters[0].id);
      expect(new Set(l.placeholders.map((x) => x.id)).size).toBe(l.placeholders.length);
    }
  });

  it('every template the app lists builds, and every template id has an entry', () => {
    expect(presentationTemplates.map((t) => t.id).sort()).toEqual([...TEMPLATE_IDS].sort());
    for (const t of presentationTemplates) expect(t.build().slides.length).toBeGreaterThan(0);
  });
});

describe('createSlide', () => {
  it('adds one empty text element per text placeholder, where the placeholder is', () => {
    const p = createPresentation();
    const slide = createSlide(p, layoutIdFor('comparison'), counter());
    const layout = p.layouts.find((l) => l.id === layoutIdFor('comparison'))!;
    expect(slide.elements.map((e) => e.placeholderId)).toEqual(layout.placeholders.map((x) => x.id));
    for (const e of slide.elements) {
      const ph = layout.placeholders.find((x) => x.id === e.placeholderId)!;
      expect([e.x, e.y, e.w, e.h]).toEqual([ph.x, ph.y, ph.w, ph.h]);
    }
    // The style is a copy: changing the slide never changes the layout.
    if (slide.elements[0].type === 'text') slide.elements[0].style.padding[0] = 99;
    expect(layout.placeholders[0].style.padding[0]).not.toBe(99);
  });

  it('gives picture placeholders no element, and the blank layout none at all', () => {
    const p = createPresentation();
    expect(createSlide(p, layoutIdFor('pictureCaption')).elements.map((e) => e.placeholderId)).toEqual(['title', 'caption']);
    expect(createSlide(p, layoutIdFor('blank')).elements).toEqual([]);
  });
});

describe('themes', () => {
  it('six built-in themes, each with every colour slot as #rrggbb and both fonts', () => {
    expect(THEMES).toHaveLength(6);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(6);
    for (const t of THEMES) {
      expect(Object.keys(t.colors).sort()).toEqual([...THEME_COLOR_SLOTS].sort());
      for (const c of Object.values(t.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.fonts.heading && t.fonts.body).toBeTruthy();
    }
  });

  it('themeById returns a copy', () => {
    const a = themeById('classroom')!;
    a.colors.accent1 = '#000000';
    expect(themeById('classroom')!.colors.accent1).not.toBe('#000000');
  });

  it('resolves colours and fonts through the theme', () => {
    const t = themeById('chalkboard')!;
    expect(resolveColor({ theme: 'accent1' }, t)).toBe(t.colors.accent1);
    expect(resolveColor('#ABCDEF', t)).toBe('#abcdef');
    expect(resolveColor('red', t, '#123456')).toBe('#123456');
    expect(resolveColor(undefined, t)).toBe('#000000');
    expect(resolveFont('heading', t)).toBe('Georgia');
    expect(resolveFont('body', t)).toBe('Verdana');
    expect(resolveFont('Courier New', t)).toBe('Courier New');
    expect(cssFontFamily('Georgia')).toBe('"Georgia", serif');
    expect(cssFontFamily('Arial')).toBe('"Arial", sans-serif');
    expect(cssFontFamily('Courier New')).toBe('"Courier New", monospace');
    expect(cssFontFamily('Bad"Name')).toBe('"BadName", sans-serif');
  });
});

describe('rich text helpers', () => {
  it('converts plain text to rich text and back', () => {
    const doc = richTextFromPlain('One\n\nThree', 'center');
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1]).toEqual({ type: 'paragraph', attrs: { textAlign: 'center' } });
    expect(plainTextOf(doc)).toBe('One\n\nThree');
    expect(isEmptyRichText(richTextFromPlain('  '))).toBe(true);
    expect(plainTextOf({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }] }] }] })).toBe('a\nb');
  });
});

describe('diagram elements', () => {
  it('map to the document diagram node attributes', () => {
    const el: DiagramElement = { id: 'd', type: 'diagram', x: 1, y: 2, w: 30, h: 20, rotation: 0, source: { a: 1 }, previewId: 'p', naturalWidth: 60, naturalHeight: 40, title: 'T', alt: 'A', svgPreviewId: 's' };
    expect(diagramNodeAttrs(el)).toEqual({ source: { a: 1 }, previewId: 'p', naturalWidth: 60, naturalHeight: 40, width: 30, height: 20, title: 'T', align: null, caption: null, alt: 'A', svgPreviewId: 's' });
  });
});
