import type { JSONContent } from '@tiptap/core';
import { isColumnCount, isColumnSpacing, isNumberFormat, isPageNumberStart, layoutOf, type NumberFormat } from './pageLayout';
import type { Orientation, PageSettings } from './types';

/**
 * Sections. A document is one section until a section break (node `sectionBreak`) starts another. The first
 * section takes its settings from the page settings; each break describes the section that follows it, and every
 * setting it leaves unset (null) continues from the section before.
 *
 * - A "next page" break starts the section on a new page; it may change orientation, columns and page numbering.
 * - A "continuous" break starts the section on the same page; it changes columns only (as in Word, a page's
 *   orientation and numbering cannot change in the middle of the page).
 *
 * Only breaks at the top level of the document count. A break inside a table, list or quote has no effect (it is
 * marked as such on screen, and exports skip it).
 */

export const SECTION_BREAK = 'sectionBreak';
export type BreakType = 'nextPage' | 'continuous';
export const BREAK_TYPES: readonly BreakType[] = ['nextPage', 'continuous'];

/** Stored attributes of a section break (null means "same as the section before"). */
export interface SectionBreakAttrs {
  breakType: BreakType;
  orientation: Orientation | null;
  columns: number | null;
  columnSpacing: number | null;
  numberFormat: NumberFormat | null;
  /** Restart page numbering at this number; null continues the numbering. */
  numberStart: number | null;
}

export const SECTION_BREAK_DEFAULTS: SectionBreakAttrs = {
  breakType: 'nextPage',
  orientation: null,
  columns: null,
  columnSpacing: null,
  numberFormat: null,
  numberStart: null,
};

/** The settings in force in one section. */
export interface ResolvedSection {
  /** 0 for the first section. */
  index: number;
  /** How the section starts (null for the first section). */
  breakType: BreakType | null;
  orientation: Orientation;
  columns: number;
  /** Millimetres. */
  columnSpacing: number;
  numberFormat: NumberFormat;
  /** Page numbering restarts at this number at the start of the section (the first section: its first number). */
  numberStart: number | null;
}

/** Reads stored break attributes; values this version cannot use count as "same as before". */
export function readBreakAttrs(attrs: Record<string, unknown> | undefined): SectionBreakAttrs {
  const a = attrs ?? {};
  return {
    breakType: a.breakType === 'continuous' ? 'continuous' : 'nextPage',
    orientation: a.orientation === 'portrait' || a.orientation === 'landscape' ? a.orientation : null,
    columns: isColumnCount(a.columns) ? a.columns : null,
    columnSpacing: isColumnSpacing(a.columnSpacing) ? a.columnSpacing : null,
    numberFormat: isNumberFormat(a.numberFormat) ? a.numberFormat : null,
    numberStart: isPageNumberStart(a.numberStart) ? a.numberStart : null,
  };
}

/** The settings of every section, given the page settings and the attributes of each top-level break in order. */
export function resolveSections(page: PageSettings, breaks: Array<Record<string, unknown> | undefined>): ResolvedSection[] {
  const layout = layoutOf(page);
  const first: ResolvedSection = {
    index: 0,
    breakType: null,
    orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait',
    columns: layout.columns,
    columnSpacing: layout.columnSpacing,
    numberFormat: layout.pageNumberFormat,
    numberStart: layout.pageNumberStart,
  };
  const out = [first];
  for (const raw of breaks) {
    const b = readBreakAttrs(raw);
    const prev = out[out.length - 1];
    const page = b.breakType === 'nextPage';
    out.push({
      index: out.length,
      breakType: b.breakType,
      orientation: page ? (b.orientation ?? prev.orientation) : prev.orientation,
      columns: b.columns ?? prev.columns,
      columnSpacing: b.columnSpacing ?? prev.columnSpacing,
      numberFormat: page ? (b.numberFormat ?? prev.numberFormat) : prev.numberFormat,
      numberStart: page ? b.numberStart : null,
    });
  }
  return out;
}

/** The top-level section breaks of a stored document body, in order. */
export function topLevelBreaks(doc: JSONContent): JSONContent[] {
  return (doc.content ?? []).filter((n) => n.type === SECTION_BREAK);
}

/** Whether a document uses sections or any layout setting beyond v0.1.0's page settings. */
export function usesSections(doc: JSONContent) {
  return topLevelBreaks(doc).length > 0;
}

/** The document body split into sections: the blocks of each section, with its settings. Breaks are left out. */
export function splitSections(doc: JSONContent, page: PageSettings): Array<{ section: ResolvedSection; blocks: JSONContent[] }> {
  const sections = resolveSections(page, topLevelBreaks(doc).map((b) => b.attrs));
  const out = sections.map((section) => ({ section, blocks: [] as JSONContent[] }));
  let i = 0;
  for (const node of doc.content ?? []) {
    if (node.type === SECTION_BREAK) i += 1;
    else out[i].blocks.push(node);
  }
  return out;
}

/** A short description of a section's settings, e.g. "Landscape · 2 columns · numbering restarts at 1 (i, ii, iii)". */
export function describeBreak(attrs: SectionBreakAttrs, formatLabel: (f: NumberFormat) => string): string {
  const parts: string[] = [attrs.breakType === 'continuous' ? 'Continuous' : 'Next page'];
  if (attrs.breakType === 'nextPage' && attrs.orientation) parts.push(attrs.orientation === 'landscape' ? 'Landscape' : 'Portrait');
  if (attrs.columns) parts.push(attrs.columns === 1 ? '1 column' : `${attrs.columns} columns`);
  if (attrs.breakType === 'nextPage' && attrs.numberStart !== null) parts.push(`numbering restarts at ${attrs.numberStart}`);
  if (attrs.breakType === 'nextPage' && attrs.numberFormat) parts.push(`numbers ${formatLabel(attrs.numberFormat)}`);
  return parts.join(' · ');
}
