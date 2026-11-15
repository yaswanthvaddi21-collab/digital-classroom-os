import { TEMPLATE_BUILDERS } from './design/templates';
import { createLayouts, createMaster } from './layouts';
import { DEFAULT_THEME_ID, themeById } from './themes';
import {
  emptyRichText,
  PRESENTATION_SCHEMA,
  SLIDE_SIZES,
  type PresentationContent,
  type Slide,
  type SlideLayout,
  type SlideSizeId,
  type TextElement,
} from './types';

/** A new unique id (random UUID; a counter-free fallback where crypto.randomUUID is missing). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateOptions {
  themeId?: string;
  sizeId?: SlideSizeId;
  /** Id generator, for deterministic tests. */
  newId?: () => string;
}

/**
 * A slide on `layoutId`: one empty text element per text placeholder of the layout (title, subtitle, body), linked to
 * it by placeholderId and placed where the placeholder is. Picture, chart and table placeholders get no element until
 * they are filled.
 */
export function createSlide(content: Pick<PresentationContent, 'layouts'>, layoutId: string, makeId: () => string = newId): Slide {
  const layout: SlideLayout | undefined = content.layouts.find((l) => l.id === layoutId) ?? content.layouts[0];
  const elements: TextElement[] = (layout?.placeholders ?? [])
    .filter((p) => p.kind === 'title' || p.kind === 'subtitle' || p.kind === 'body')
    .map((p) => ({ id: makeId(), type: 'text', x: p.x, y: p.y, w: p.w, h: p.h, rotation: 0, placeholderId: p.id, text: emptyRichText(), style: { ...p.style, padding: [...p.style.padding] } }));
  return { id: makeId(), layoutId: layout?.id ?? layoutId, elements, notes: emptyRichText() };
}

/**
 * Presentation templates by id (design/templates.ts): Blank, Lecture, Project presentation, Lab results and Class
 * report. Each starts from the same base (theme, master, the eight layouts) and adds its look and slides.
 */
export const TEMPLATE_IDS = Object.keys(TEMPLATE_BUILDERS);

/**
 * A new presentation from a template: the theme (the template's, or options.themeId), the built-in master and its eight layouts, and the template's
 * slides. Unknown template ids are refused (a caller bug, not user data).
 */
export function createPresentation(templateId = 'blank', options: CreateOptions = {}): PresentationContent {
  const build = Object.prototype.hasOwnProperty.call(TEMPLATE_BUILDERS, templateId) ? TEMPLATE_BUILDERS[templateId] : undefined;
  if (!build) throw new Error(`Unknown presentation template: ${templateId}`);
  const makeId = options.newId ?? newId;
  const size = { ...SLIDE_SIZES[options.sizeId ?? '16:9'] };
  const themeId = options.themeId && themeById(options.themeId) ? options.themeId : DEFAULT_THEME_ID;
  const base: PresentationContent = {
    schemaVersion: PRESENTATION_SCHEMA,
    size,
    themeId,
    theme: themeById(themeId)!,
    masters: [createMaster(size)],
    layouts: createLayouts(size),
    slides: [],
  };
  const built = build(base, makeId, createSlide);
  // A theme asked for explicitly wins over the template's own.
  return options.themeId && themeById(options.themeId) ? { ...built, themeId, theme: themeById(themeId)! } : built;
}
