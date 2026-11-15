/**
 * Diagrams on slides outside the editor: putting diagram edits that were kept by the app's diagram dialog (the page
 * went away while it was open) back into a stored presentation. Pure; the app calls it through its recovery offer.
 */
import { createSlide, newId } from '../create';
import { layoutIdFor } from '../layouts';
import { preparePresentation } from '../safety';
import type { PresentationEmbeddedDiagram } from '../hosts';
import type { DiagramElement, PresentationContent } from '../types';
import { newDiagram, withEditedDiagram } from './defaults';

/** The diagram the dialog was opened on (the app's DiagramDialogBase), used to find it on the slides again. */
export interface RecoveredDiagramBase {
  source: unknown;
  previewId: string | null;
  naturalWidth: number;
  naturalHeight: number;
  title: string;
}

const sameJson = (a: unknown, b: unknown) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/**
 * The presentation with recovered diagram edits applied: they replace the first diagram (on any slide, master or
 * layout decorations are never touched) still holding exactly the data and preview the dialog was opened on, keeping
 * its place and width. When there is no such diagram (a new one, or it was changed or removed since), the diagram is
 * added to the last slide (to a new blank slide when there are none), so the recovered work is never dropped.
 * Throws when this version cannot change the presentation (protected view).
 */
export function applyRecoveredPresentationDiagram(
  raw: unknown,
  base: RecoveredDiagramBase | null,
  result: PresentationEmbeddedDiagram,
  makeId: () => string = newId,
): { content: PresentationContent; placed: 'replaced' | 'appended' } {
  const prepared = preparePresentation(raw);
  if (prepared.state !== 'editable') throw new Error(prepared.detail);
  const content = prepared.content;
  if (base) {
    for (const slide of content.slides) {
      const hit = slide.elements.find((e): e is DiagramElement => e.type === 'diagram' && (e.previewId || null) === (base.previewId || null) && sameJson(e.source, base.source));
      if (hit) {
        const slides = content.slides.map((s) => (s === slide ? { ...s, elements: s.elements.map((e) => (e === hit ? withEditedDiagram(hit, result) : e)) } : s));
        return { content: { ...content, slides }, placed: 'replaced' };
      }
    }
  }
  const el = newDiagram(makeId(), result, content.size);
  if (!content.slides.length) {
    const slide = createSlide(content, content.layouts.find((l) => l.id === layoutIdFor('blank'))?.id ?? content.layouts[0].id, makeId);
    return { content: { ...content, slides: [{ ...slide, elements: [...slide.elements, el] }] }, placed: 'appended' };
  }
  const last = content.slides[content.slides.length - 1];
  return { content: { ...content, slides: [...content.slides.slice(0, -1), { ...last, elements: [...last.elements, el] }] }, placed: 'appended' };
}
