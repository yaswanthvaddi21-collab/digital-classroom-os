import { describe, expect, it } from 'vitest';
import { presentationNovelty } from '../compat';
import { createPresentation, TEMPLATE_IDS } from '../create';
import { preparePresentation, presentationProblems } from '../safety';
import { presentationTemplates } from '../templates';
import { plainTextOf, type PresentationContent } from '../types';

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function allIds(p: PresentationContent): string[] {
  return [
    ...p.masters.flatMap((m) => [m.id, ...m.decorations.map((d) => d.id)]),
    ...p.layouts.flatMap((l) => [l.id, ...l.decorations.map((d) => d.id)]),
    ...p.slides.flatMap((s) => [s.id, ...s.elements.map((e) => e.id)]),
  ];
}

describe('presentation templates', () => {
  it('lists Blank, Lecture, Project presentation, Lab results and Class report, each with a builder', () => {
    expect(presentationTemplates.map((t) => t.name)).toEqual(['Blank presentation', 'Lecture', 'Project presentation', 'Lab results', 'Class report']);
    expect(presentationTemplates.map((t) => t.id)).toEqual(TEMPLATE_IDS);
    expect(new Set(presentationTemplates.map((t) => t.description)).size).toBe(5);
  });

  it.each(presentationTemplates.map((t) => [t.id, t] as const))('%s opens editable, uses only schema-1 content and has unique ids', (_id, template) => {
    for (const p of [template.build(), createPresentation(template.id, { sizeId: '4:3' })]) {
      const stored = json(p);
      expect(presentationProblems(stored)).toEqual([]);
      expect(presentationNovelty(stored)).toBeNull();
      expect(preparePresentation(stored).state).toBe('editable');
      expect(new Set(allIds(p)).size).toBe(allIds(p).length);
      // Every object on a slide lies on the slide.
      for (const s of p.slides) for (const e of s.elements) expect(e.y + e.h).toBeLessThanOrEqual(p.size.height);
    }
  });

  it('gives each template its own theme, slides and notes; the blank one stays one empty title slide', () => {
    const themes = presentationTemplates.map((t) => t.build().themeId);
    expect(themes).toEqual(['classroom', 'classroom', 'sunrise', 'midnight', 'paper']);
    const blank = createPresentation('blank');
    expect(blank.slides).toHaveLength(1);
    expect(blank.slides[0].elements.every((e) => e.type === 'text' && plainTextOf(e.text) === '')).toBe(true);
    const lecture = createPresentation('lecture');
    expect(lecture.slides).toHaveLength(6);
    expect(lecture.masters[0].decorations.map((d) => d.name)).toEqual(['Accent bar', 'Footer']);
    expect(plainTextOf(lecture.slides[0].notes)).toMatch(/Welcome/);
    const lab = createPresentation('lab-results');
    expect(lab.slides.some((s) => s.elements.some((e) => e.type === 'table'))).toBe(true);
    const report = createPresentation('class-report');
    expect(report.layouts.filter((l) => !l.showMasterDecorations).map((l) => l.kind)).toEqual(['title', 'sectionHeader', 'blank', 'pictureCaption']);
  });

  it('a theme asked for wins over the template’s own; an unknown template is refused', () => {
    expect(createPresentation('project', { themeId: 'contrast' }).themeId).toBe('contrast');
    expect(() => createPresentation('nope')).toThrow(/Unknown presentation template/);
    expect(() => createPresentation('toString')).toThrow(/Unknown presentation template/);
  });
});
