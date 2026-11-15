// @vitest-environment jsdom
/**
 * Phase 7 Round 3: the groups' work together, without a browser. Design operations (a theme, a custom master, a
 * layout without the master's graphics, slide size, a picture background) and every kind of slide object reach the
 * thumbnails, the slide show's builds and both exports, and the PowerPoint file plays the builds the show plays.
 */
import { render } from '@testing-library/react';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { addDecorations, applyTheme, setShowMasterDecorations, setSlideSize, setSlidesBackground, updatePlaceholder } from './design/model';
import { helveticaMeasure } from './export/metrics';
import { buildPptx } from './export/pptx';
import { ExportReport } from './export/report';
import { slideSvg } from './export/slideSvg';
import { memoryImageHost, solidPng } from './export/testing';
import { decorationsOf, SlideView } from './render/SlideView';
import { buildSteps } from './show/sequence';
import { kitchenSinkPresentation } from './testFixtures';
import { THEMES } from './themes';
import type { PresentationContent, SlideElement } from './types';

const files = { 'attachment-picture': solidPng(64, 48), 'attachment-diagram': solidPng(96, 64), 'attachment-logo': solidPng(8, 8), 'attachment-background': solidPng(16, 9), sky: solidPng(400, 300) };

/** The kitchen sink, redesigned: another theme, a master with a bigger title and a band, 4:3, a sky background. */
function designed(): PresentationContent {
  let p = kitchenSinkPresentation();
  p = applyTheme(p, THEMES.find((t) => t.id === 'midnight')!);
  const master = { kind: 'master' as const, id: p.masters[0].id };
  p = updatePlaceholder(p, master, 'title', (ph) => ({ ...ph, style: { ...ph.style, fontSize: 40 } }));
  const band: SlideElement = { id: 'band', type: 'shape', x: 0, y: 0, w: 960, h: 24, rotation: 0, preset: 'rect', fill: { type: 'solid', color: { theme: 'accent2' } }, line: null } as unknown as SlideElement;
  p = addDecorations(p, master, [band]);
  p = setShowMasterDecorations(p, p.slides[1].layoutId, false);
  p = setSlideSize(p, '4:3');
  p = setSlidesBackground(p, [p.slides[0].id], { type: 'image', attachmentId: 'sky', fit: 'cover' });
  return p;
}

describe('every group’s work reaches every place a slide is shown', () => {
  it('every kind of object is drawn in thumbnails, and in the PDF slide picture', () => {
    const p = designed();
    const kinds = new Set(p.slides.flatMap((s) => s.elements.map((e) => e.type)));
    expect([...kinds].sort()).toEqual(['chart', 'diagram', 'image', 'shape', 'table', 'text']);
    for (const slide of p.slides) {
      const { container, unmount } = render(<SlideView content={p} slide={slide} scale={0.2} />);
      for (const el of slide.elements) expect(container.querySelector(`[data-element="${el.id}"]`), `${slide.id} ${el.type}`).not.toBeNull();
      unmount();
      const pictures = { picture: (id: string) => (files[id as keyof typeof files] ? { bytes: files[id as keyof typeof files], type: 'png' as const, width: 16, height: 9, converted: false } : null), diagram: () => solidPng(4, 3) };
      const { svg } = slideSvg(p, slide, { measure: helveticaMeasure, pictures, report: new ExportReport() });
      expect(svg).toContain(`viewBox="0 0 960 720"`);
    }
  });

  it('the master band is drawn on slides whose layout shows the master graphics, in thumbnails and the PDF alike', () => {
    const p = designed();
    const hiding = p.slides[1].layoutId;
    const other = p.slides.findIndex((s) => s.layoutId !== hiding);
    expect(other).toBeGreaterThanOrEqual(0);
    // Thumbnails (SlideView) and the PDF (slideSvg) both draw decorationsOf: the band is there, or not, in both.
    expect(decorationsOf(p, p.slides[other]).map((e) => e.id)).toContain('band');
    expect(decorationsOf(p, p.slides[1]).map((e) => e.id)).not.toContain('band');
    const { container } = render(<SlideView content={p} slide={p.slides[other]} scale={0.2} />);
    expect(container.querySelector('[data-element="band"]')).not.toBeNull();
  });

  it('the PowerPoint file carries the design: theme, master, 4:3, the fitted background; and the show’s builds', async () => {
    const p = designed();
    const r = await buildPptx(p, { title: 'Designed', imageHost: memoryImageHost(files), measure: helveticaMeasure });
    const zip = await JSZip.loadAsync(r.bytes);
    const read = (n: string) => zip.file(n)!.async('string');
    expect(await read('ppt/presentation.xml')).toContain('<p:sldSz cx="9144000" cy="6858000"/>');
    const theme = (await read('ppt/theme/theme1.xml')).toLowerCase();
    for (const slot of ['accent1', 'accent2', 'dark1', 'light1'] as const) expect(theme).toContain(p.theme.colors[slot].replace('#', '').toLowerCase());
    expect(theme).toContain(p.theme.fonts.heading.toLowerCase());
    // The master's title size (40 pt) on the layouts' title placeholders.
    const layouts = await Promise.all(Object.keys(zip.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).map(read));
    expect(layouts.some((x) => /type="title"[\s\S]*?sz="4000"/.test(x))).toBe(true);
    // The band on the layouts that show the master graphics (written onto each layout), not on the one that hides them.
    const bandLayouts = layouts.filter((x) => x.includes('<a:off x="0" y="0"/><a:ext cx="9144000" cy="228600"/>'));
    expect(bandLayouts.length).toBe(p.layouts.filter((l) => l.showMasterDecorations).length);
    // The 400 × 300 sky on a 4:3 slide: same proportions, so stretched exactly (no crop needed).
    expect(await read('ppt/slides/slide1.xml')).toMatch(/<p:bg><p:bgPr><a:blipFill[^>]*><a:blip r:embed="rId\d+"[\s\S]*?<a:srcRect\/>/);
    // Each slide's click groups in the file are the show's build steps.
    for (let i = 0; i < p.slides.length; i++) {
      const xml = await read(`ppt/slides/slide${i + 1}.xml`);
      const steps = buildSteps(p.slides[i]);
      const clicks = steps.filter((s) => !s.auto).length;
      expect((xml.match(/nodeType="clickEffect"/g) ?? []).length, `slide ${i + 1}`).toBe(clicks);
    }
  });
});
