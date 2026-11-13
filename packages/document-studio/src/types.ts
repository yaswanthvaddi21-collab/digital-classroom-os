import type { JSONContent } from '@tiptap/core';

import { LAYOUT_DEFAULTS, LAYOUT_FIELD_CHECKS, type PageLayoutFields } from './pageLayout';
import { commentsProblem, type CommentThread } from './review/comments';
import { languageProblem } from './review/language';

// @phase4:page-settings — page sizes: add new sizes to PageSize, PAPER_MM and PAPER_LABELS together.
// G-LAYOUT: A3, A5 and Legal (schema 2: v0.1.0 knew only A4 and Letter).
export type PageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type EditorMode = 'simple' | 'advanced';
export const EDITOR_MODES: readonly EditorMode[] = ['simple', 'advanced'];

/** Page settings. The layout fields (columns, page number format, header/footer parts…) come from pageLayout.ts. */
export interface PageSettings extends PageLayoutFields {
  size: PageSize;
  orientation: Orientation;
  /** Margins in millimetres. */
  margins: { top: number; right: number; bottom: number; left: number };
  header: string;
  footer: string;
  pageNumbers: boolean;
  // @phase4:page-settings — new page fields (optional, with a default in DEFAULT_PAGE and a check in PAGE_FIELD_CHECKS).
}

/** The persisted form of a document. `doc` is Tiptap/ProseMirror JSON. */
export interface DocumentContent {
  /** Content schema; see DOCUMENT_SCHEMA in migrate.ts. */
  schemaVersion: number;
  doc: JSONContent;
  page: PageSettings;
  mode: EditorMode;
  /** Comment threads (G-REVIEW; see review/comments.ts). Absent when the document has none. */
  comments?: CommentThread[];
  /** Document language, a BCP 47 tag such as "en-GB" (G-REVIEW). Absent when not set. */
  language?: string;
  // @phase4:content-fields — new top-level fields (optional; register them in CONTENT_FIELDS below).
}

/** Paper dimensions in millimetres (portrait). */
export const PAPER_MM: Record<PageSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

/** How each paper size is named in the UI (in this order). */
export const PAPER_LABELS: Record<PageSize, { short: string; long: string }> = {
  A3: { short: 'A3', long: 'A3 (297 × 420 mm)' },
  A4: { short: 'A4', long: 'A4 (210 × 297 mm)' },
  A5: { short: 'A5', long: 'A5 (148 × 210 mm)' },
  Letter: { short: 'Letter', long: 'Letter (8.5 × 11 in)' },
  Legal: { short: 'Legal', long: 'Legal (8.5 × 14 in)' },
};

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  header: '',
  footer: '',
  pageNumbers: true,
  // Layout fields (G-LAYOUT); at these defaults a document stays content schema 1.
  ...LAYOUT_DEFAULTS,
};

/** Smallest text area a page may leave between its margins, in millimetres. */
const MIN_TEXT_MM = 20;

export function paperSize(page: Pick<PageSettings, 'size' | 'orientation'>) {
  const p = PAPER_MM[page.size] ?? PAPER_MM.A4;
  return page.orientation === 'landscape' ? { width: p.height, height: p.width } : p;
}

export function createEmptyDocument(): DocumentContent {
  return { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, page: { ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins } }, mode: 'simple' };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const MARGIN_KEYS = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Checks for each stored page field. A check returns a problem description, or null when the value is usable.
 * Missing fields are not checked: they take their default (older content). Unknown fields are a problem too.
 */
export const PAGE_FIELD_CHECKS: Record<string, (value: unknown, page: Record<string, unknown>) => string | null> = {
  size: (v) => (typeof v === 'string' && Object.hasOwn(PAPER_MM, v) ? null : `paper size ${JSON.stringify(v)} is not one this version knows`),
  orientation: (v) => (v === 'portrait' || v === 'landscape' ? null : `page orientation ${JSON.stringify(v)} is not valid`),
  margins: (v, page) => {
    if (!isObject(v)) return 'page margins are not valid';
    const extra = Object.keys(v).filter((k) => !(MARGIN_KEYS as readonly string[]).includes(k));
    if (extra.length) return `page margins include unknown fields (${extra.join(', ')})`;
    for (const k of MARGIN_KEYS) {
      if (v[k] === undefined) continue;
      if (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || v[k] < 0) return `the ${k} margin (${JSON.stringify(v[k])}) is not a valid size`;
    }
    const m = { ...DEFAULT_PAGE.margins, ...(v as Partial<PageSettings['margins']>) };
    const size = typeof page.size === 'string' && Object.hasOwn(PAPER_MM, page.size) ? (page.size as PageSize) : DEFAULT_PAGE.size;
    const paper = paperSize({ size, orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait' });
    if (paper.width - m.left - m.right < MIN_TEXT_MM || paper.height - m.top - m.bottom < MIN_TEXT_MM) return 'the page margins leave no room for text';
    return null;
  },
  header: (v) => (typeof v === 'string' ? null : 'the page header is not text'),
  footer: (v) => (typeof v === 'string' ? null : 'the page footer is not text'),
  pageNumbers: (v) => (typeof v === 'boolean' ? null : 'the page numbers setting is not on or off'),
  // @phase4:page-settings — checks for new page fields.
  ...LAYOUT_FIELD_CHECKS,
};

/**
 * Top-level content fields beyond schemaVersion, doc, page and mode, with how to read each one. Fields a version
 * does not know make the document open in the protected view, so a save can never drop them.
 */
export const CONTENT_FIELDS: Record<string, { check: (value: unknown) => string | null; default: unknown }> = {
  // G-REVIEW: comment threads and the document language (absent, or at these defaults, they keep schema 1).
  comments: { check: commentsProblem, default: [] },
  language: { check: languageProblem, default: null },
  // @phase4:content-fields — e.g. comments: { check: …, default: [] }
};
const CORE_FIELDS = ['schemaVersion', 'doc', 'page', 'mode'];

/**
 * Reads stored page settings: missing fields take their defaults, and every stored value is checked. Values this
 * version cannot use are replaced by defaults in `page` and described in `problems`; never throws.
 */
export function normalizePage(raw: unknown): { page: PageSettings; problems: string[] } {
  const base: PageSettings = { ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins } };
  if (raw === undefined || raw === null) return { page: base, problems: [] };
  if (!isObject(raw)) return { page: base, problems: ['the page settings are not valid'] };
  const page: Record<string, unknown> = { ...base };
  const problems: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const check = PAGE_FIELD_CHECKS[key];
    if (!check) {
      problems.push(`page setting "${key}" is not one this version knows`);
      continue;
    }
    const problem = check(value, raw);
    if (problem) problems.push(problem);
    else page[key] = key === 'margins' ? { ...base.margins, ...(value as object) } : value;
  }
  return { page: page as unknown as PageSettings, problems };
}

/** Problems with the stored content outside `doc` that this version cannot represent (see normalizePage). */
export function contentProblems(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  const problems = [...normalizePage(raw.page).problems];
  // A mode this version does not have (one a later version adds) would otherwise open as Simple and be overwritten.
  if (raw.mode !== undefined && raw.mode !== null && !EDITOR_MODES.includes(raw.mode as EditorMode)) {
    problems.push(`the editing mode ${JSON.stringify(raw.mode)} is not one this version knows`);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (CORE_FIELDS.includes(key) || value === undefined) continue;
    const field = CONTENT_FIELDS[key];
    if (!field) problems.push(`document field "${key}" is not one this version knows`);
    else {
      const problem = field.check(value);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

/**
 * Fills in defaults for content saved by older versions or partially written records. Invalid page values are
 * replaced by defaults (prepareDocument opens such content in the protected view, so this copy is only displayed).
 */
export function normalizeDocument(raw: unknown): DocumentContent {
  const base = createEmptyDocument();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const doc = r.doc as JSONContent | undefined;
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(CONTENT_FIELDS)) {
    if (r[key] !== undefined && !CONTENT_FIELDS[key].check(r[key])) extras[key] = r[key];
  }
  return {
    ...extras,
    schemaVersion: 1,
    doc: doc && typeof doc === 'object' && doc.type === 'doc' ? doc : base.doc,
    page: normalizePage(r.page).page,
    mode: r.mode === 'advanced' ? 'advanced' : 'simple',
  };
}
