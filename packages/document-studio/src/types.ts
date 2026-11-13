import type { JSONContent } from '@tiptap/core';

export type PageSize = 'A4' | 'Letter';
export type Orientation = 'portrait' | 'landscape';
export type EditorMode = 'simple' | 'advanced';

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  /** Margins in millimetres. */
  margins: { top: number; right: number; bottom: number; left: number };
  header: string;
  footer: string;
  pageNumbers: boolean;
}

/** The persisted form of a document. `doc` is Tiptap/ProseMirror JSON. */
export interface DocumentContent {
  /** Content schema; see DOCUMENT_SCHEMA in migrate.ts. */
  schemaVersion: number;
  doc: JSONContent;
  page: PageSettings;
  mode: EditorMode;
}

/** Paper dimensions in millimetres (portrait). */
export const PAPER_MM: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  header: '',
  footer: '',
  pageNumbers: true,
};

export function paperSize(page: PageSettings) {
  const p = PAPER_MM[page.size];
  return page.orientation === 'landscape' ? { width: p.height, height: p.width } : p;
}

export function createEmptyDocument(): DocumentContent {
  return { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, page: { ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins } }, mode: 'simple' };
}

/** Fills in defaults for content saved by older versions or partially written records. */
export function normalizeDocument(raw: unknown): DocumentContent {
  const base = createEmptyDocument();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DocumentContent>;
  return {
    schemaVersion: 1,
    doc: r.doc && r.doc.type === 'doc' ? r.doc : base.doc,
    page: { ...base.page, ...r.page, margins: { ...base.page.margins, ...r.page?.margins } },
    mode: r.mode === 'advanced' ? 'advanced' : 'simple',
  };
}
