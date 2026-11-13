import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type DocumentContent } from '../types';
import { buildDocx, diagramPreviewIds } from './docx';
import { documentToText } from './text';

// 1×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

const withDiagram = (attrs: Record<string, unknown>): DocumentContent => ({
  ...createEmptyDocument(),
  schemaVersion: 2,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, { type: 'diagram', attrs }] },
});

const docXml = async (content: DocumentContent, assets: Map<string, Uint8Array>) => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildDocx(content, 'T', assets)));
  return { zip, xml: await zip.file('word/document.xml')!.async('string') };
};

describe('embedded diagrams in exports', () => {
  it('writes the preview as a picture at the document size, keeping the aspect ratio', async () => {
    const content = withDiagram({ previewId: 'p1', title: 'Flow', naturalWidth: 400, naturalHeight: 600, width: 200, height: 300 });
    expect(diagramPreviewIds(content.doc)).toEqual(['p1']);
    const { zip, xml } = await docXml(content, new Map([['p1', PNG]]));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!;
    expect(Number(cx) / 9525).toBe(200);
    expect(Number(cy) / 9525).toBe(300);
    expect(xml).toContain('descr="Flow"');
  });

  it('never exceeds the page text width', async () => {
    const { xml } = await docXml(withDiagram({ previewId: 'p1', title: 'Wide', naturalWidth: 2000, naturalHeight: 1000, width: 2000, height: 1000 }), new Map([['p1', PNG]]));
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!;
    expect(Number(cx) / 9525).toBeLessThanOrEqual(602);
    expect(Math.round(Number(cx) / Number(cy))).toBe(2);
  });

  it('says plainly when a preview is missing instead of dropping the diagram', async () => {
    const { xml } = await docXml(withDiagram({ previewId: 'gone', title: 'Lost' }), new Map());
    expect(xml).toContain('[Diagram: Lost — preview not available]');
  });

  it('names diagrams in plain-text export', () => {
    expect(documentToText(withDiagram({ title: 'Cycle' }).doc)).toContain('[Diagram: Cycle]');
  });
});
