import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { sectionAt } from '../../../extensions/sectionBreak';
import { readBreakAttrs, resolveSections, type ResolvedSection, type SectionBreakAttrs } from '../../../sections';
import { PAGE_FIELD_CHECKS, paperSize, type Orientation, type PageSettings } from '../../../types';

export interface SectionInfo {
  /** Index of the section holding the cursor (0 = first). */
  index: number;
  count: number;
  /** Settings in force in that section. */
  current: ResolvedSection;
  /** The section break that starts it (null for the first section). */
  break: { pos: number; attrs: SectionBreakAttrs } | null;
  /** Stored attributes of every top-level break, in order (for checks that cover every section). */
  breaks: Array<Record<string, unknown>>;
}

/** The section the cursor is in, kept up to date as the selection and document change. */
export function useSection(editor: Editor, page: PageSettings): SectionInfo {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return { index: 0, breaks: [] as Array<{ pos: number; attrs: Record<string, unknown> }> };
      const s = sectionAt(e.state);
      return { index: s.index, breaks: s.breaks.map((b) => ({ pos: b.pos, attrs: { ...b.node.attrs } })) };
    },
  });
  const breaks = state?.breaks ?? [];
  const sections = resolveSections(page, breaks.map((b) => b.attrs));
  const index = Math.min(state?.index ?? 0, sections.length - 1);
  const b = index > 0 ? breaks[index - 1] : null;
  return { index, count: sections.length, current: sections[index], break: b ? { pos: b.pos, attrs: readBreakAttrs(b.attrs) } : null, breaks: breaks.map((x) => x.attrs) };
}

/**
 * Why an orientation would leave no room for text with the document's margins (e.g. A5 landscape with 70 mm top and
 * bottom margins), or null. Paper size and Page setup refuse such pages; the orientation controls must too, or the
 * saved document would reopen in the protected view.
 */
export function orientationProblem(page: PageSettings, orientation: Orientation): string | null {
  return pageProblem({ ...page, orientation });
}

/**
 * Changes the settings of the section holding the cursor: the page settings for the first, else its break.
 * Returns false (and changes nothing) when the change would leave the page no room for text.
 */
export function applyToSection(editor: Editor, page: PageSettings, onPageChange: ((p: PageSettings) => void) | undefined, info: SectionInfo, patch: Partial<SectionBreakAttrs>): boolean {
  if (patch.orientation && orientationProblem(page, patch.orientation)) return false;
  if (info.break) {
    // Continuous sections after this one inherit its orientation and columns, so check them all.
    const at = info.index - 1;
    const breaks = info.breaks.map((a, i) => (i === at ? { ...a, ...patch } : a));
    if (layoutProblem(page, breaks)) return false;
  }
  if (!info.break) {
    const next: PageSettings = { ...page };
    if (patch.orientation) next.orientation = patch.orientation;
    if (patch.columns) next.columns = patch.columns;
    if (patch.columnSpacing !== undefined && patch.columnSpacing !== null) next.columnSpacing = patch.columnSpacing;
    if (patch.numberFormat) next.pageNumberFormat = patch.numberFormat;
    if (patch.numberStart !== undefined && patch.numberStart !== null) next.pageNumberStart = patch.numberStart;
    if (layoutProblem(next, info.breaks)) return false;
    onPageChange?.(next);
    return true;
  }
  return editor.chain().focus().updateSectionBreak(info.break.pos, patch).run();
}

/** Why the page settings would be unusable (e.g. margins leaving no room on a smaller paper), or null. */
export function pageProblem(page: PageSettings): string | null {
  return PAGE_FIELD_CHECKS.margins(page.margins, page as unknown as Record<string, unknown>);
}

/** Narrowest text column the Layout controls allow, in millimetres. */
export const MIN_COLUMN_MM = 25;

/**
 * Why page settings would leave some section without a usable text area, or null. Paper size and margins are shared
 * by the whole document, but each section has its own orientation and columns, so every section is checked with its
 * own: margins that fit a portrait page can leave a landscape section 8 mm high, and a smaller paper can make a later
 * section's three columns too narrow. The message names the section when the document has more than one.
 */
export function layoutProblem(page: PageSettings, breaks: ReadonlyArray<Record<string, unknown> | undefined>): string | null {
  const sections = resolveSections(page, [...breaks]);
  const named = (s: ResolvedSection, text: string) => (sections.length > 1 ? `section ${s.index + 1} (${s.orientation}): ${text}` : text);
  const seen = new Set<Orientation>();
  for (const s of sections) {
    if (!seen.has(s.orientation)) {
      seen.add(s.orientation);
      const problem = pageProblem({ ...page, orientation: s.orientation });
      if (problem) return named(s, problem);
    }
    if (s.columns > 1 && columnWidthMm(page, s.orientation, s.columns, s.columnSpacing) < MIN_COLUMN_MM) {
      return named(s, `its ${s.columns} columns would be narrower than ${MIN_COLUMN_MM} mm`);
    }
  }
  return null;
}

/** Width of one column in millimetres, for a section's orientation, columns and spacing. */
export function columnWidthMm(page: PageSettings, orientation: ResolvedSection['orientation'], columns: number, spacing: number) {
  const text = paperSize({ size: page.size, orientation }).width - page.margins.left - page.margins.right;
  return (text - spacing * (columns - 1)) / columns;
}
