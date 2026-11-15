/**
 * Presentation exports and the other studios (Phase 7 EXPORT, ADR 0014):
 * - a diagram on a slide is written into the PPTX as a PNG carrying the diagram's own file, exactly as Document Studio
 *   writes it into DOCX/ODT, so document-studio's reader and diagram-studio's strict native reader both accept it
 *   (presentation-studio keeps its own copy of the writer: the package boundary forbids importing document-studio);
 * - the export's constants are the same as document-studio's and diagram-studio's.
 */
import { diagramTemplates, NATIVE_FORMAT, NATIVE_VERSION, parseNativeFile, type DiagramContent } from '@dcos/diagram-studio';
import { DIAGRAM_PNG_KEYWORD, DIAGRAM_PNG_MAX_BYTES, DIAGRAM_PNG_VERSION, readDiagramFromPng } from '@dcos/document-studio';
import { createPresentation, type DiagramElement } from '@dcos/presentation-studio';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import * as mine from '../../packages/presentation-studio/src/export/diagramPng';
import { helveticaMeasure } from '../../packages/presentation-studio/src/export/metrics';
import { buildPptx } from '../../packages/presentation-studio/src/export/pptx';
import { memoryImageHost, solidPng } from '../../packages/presentation-studio/src/export/testing';

const flowchart = () => diagramTemplates.find((t) => t.id === 'flowchart')!.build() as DiagramContent;

describe('presentation export and diagrams', () => {
  it('uses the same keyword, version and size limit as Document Studio and Diagram Studio', () => {
    expect(mine.DIAGRAM_PNG_KEYWORD).toBe(DIAGRAM_PNG_KEYWORD);
    expect(mine.DIAGRAM_PNG_KEYWORD).toBe(NATIVE_FORMAT);
    expect(mine.DIAGRAM_PNG_VERSION).toBe(DIAGRAM_PNG_VERSION);
    expect(mine.DIAGRAM_PNG_VERSION).toBe(NATIVE_VERSION);
    expect(mine.DIAGRAM_PNG_MAX_BYTES).toBe(DIAGRAM_PNG_MAX_BYTES);
  });

  it('a diagram exported in a PPTX opens with the document reader and the native diagram reader', async () => {
    const p = createPresentation('blank');
    const source = flowchart();
    const el: DiagramElement = { id: 'd1', type: 'diagram', x: 100, y: 100, w: 300, h: 200, rotation: 0, source, previewId: 'preview', naturalWidth: 300, naturalHeight: 200, title: 'Flow', alt: 'A flowchart', svgPreviewId: null };
    p.slides[0].elements.push(el);
    const r = await buildPptx(p, { title: 'x', imageHost: memoryImageHost({ preview: solidPng(600, 400) }), measure: helveticaMeasure });
    const zip = await JSZip.loadAsync(r.bytes);
    const media = Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/') && !n.endsWith('/'));
    expect(media).toHaveLength(1);
    const png = await zip.file(media[0])!.async('uint8array');
    const read = readDiagramFromPng(png)!;
    expect(read).not.toBeNull();
    const opened = parseNativeFile(read.text);
    expect(opened.title).toBe('Flow');
    expect(opened.content.nodes).toEqual(source.nodes);
    // The 600 px preview of a 300 px diagram is marked as 2×, so other apps show it at its real size.
    const at = Buffer.from(png).indexOf('pHYs', 0, 'latin1');
    const perMetre = new DataView(png.buffer, png.byteOffset + at + 4, 4).getUint32(0);
    expect(Math.round(((perMetre * 0.0254) / 96) * 100) / 100).toBe(2);
  });
});
