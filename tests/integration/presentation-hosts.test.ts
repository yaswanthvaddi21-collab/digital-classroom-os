/**
 * Presentation Studio's hosts stay interchangeable with the app's (ADR 0014): the diagram host the app already builds
 * for documents (document-studio DiagramHost) is a PresentationDiagramHost and the other way round, so the app can
 * pass the same host to both studios without either package importing the other.
 */
import type { DiagramHost, EmbeddedDiagram } from '@dcos/document-studio';
import { DIAGRAM_PHASE6_ATTRS } from '@dcos/document-studio';
import { diagramNodeAttrs, PRESENTATION_V1_VOCABULARY, type DiagramElement, type PresentationDiagramHost, type PresentationEmbeddedDiagram } from '@dcos/presentation-studio';
import { describe, expect, it } from 'vitest';

// Compile-time checks: tsc fails here if either interface drifts.
const toPresentation = (h: DiagramHost): PresentationDiagramHost => h;
const toDocument = (h: PresentationDiagramHost): DiagramHost => h;
const diagramBack = (d: EmbeddedDiagram): PresentationEmbeddedDiagram => d;
const diagramForth = (d: PresentationEmbeddedDiagram): EmbeddedDiagram => d;

describe('presentation hosts', () => {
  it('the document diagram host and the presentation diagram host are the same shape', () => {
    expect([toPresentation, toDocument, diagramBack, diagramForth].every((f) => typeof f === 'function')).toBe(true);
  });

  it('a slide diagram carries exactly the document diagram node attributes, for the Phase 6 export helpers', () => {
    const el: DiagramElement = { id: 'd', type: 'diagram', x: 10, y: 20, w: 300, h: 200, rotation: 0, source: { nodes: [] }, previewId: 'p', naturalWidth: 600, naturalHeight: 400, title: 'Flow', alt: null, svgPreviewId: null };
    const attrs = diagramNodeAttrs(el);
    expect(Object.keys(attrs).sort()).toEqual(['source', 'previewId', 'naturalWidth', 'naturalHeight', 'width', 'height', 'title', ...DIAGRAM_PHASE6_ATTRS].sort());
    expect(attrs).toMatchObject({ width: 300, height: 200, previewId: 'p', title: 'Flow' });
    // The stored element fields are those attributes (minus the slide-level size), as frozen in schema 1.
    expect([...PRESENTATION_V1_VOCABULARY.elementTypes.diagram].sort()).toEqual(['alt', 'naturalHeight', 'naturalWidth', 'previewId', 'source', 'svgPreviewId', 'title']);
  });
});
