// @vitest-environment jsdom
/**
 * Phase 6 (ADR 0013), group EXPORT: embedded diagrams in DOCX and ODT exports and back.
 * - the PNG carries the diagram's editable data, so importing the file restores an editable diagram;
 * - DOCX import keeps the size Word shows (wp:extent), for diagrams and ordinary pictures;
 * - the vector drawing (SVG) is written with the PNG as fallback (DOCX asvg:svgBlip, ODT two draw:image);
 * - a missing preview is redrawn from the data; one failing load never aborts the export;
 * - the export report says honestly what happened to each diagram.
 */
import type { JSONContent } from '@tiptap/core';
import { strFromU8, strToU8, unzipSync, zipSync, zlibSync } from 'fflate';
import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { importDocumentFile } from '../import';
import { withStoredAttachments } from '../import/common';
import { diagramFromPicture } from '../import/diagrams';
import { imageSize } from '../import/imageSize';
import { contentSchemaFor } from '../migrate';
import { createEmptyDocument, type DocumentContent } from '../types';
import type { RenderedDiagramPreview } from '../extensions/diagramEmbed';
import { DRAWN_DIAGRAM_SCHEMA } from './diagramAssets';
import { diagramPngEnvelope, embedDiagramInPng, isPng, pngChunks, pngPixelRatio, readDiagramFromPng, withoutDiagramData } from './diagramPng';
import { exportDocx } from './docx';
import { exportOdt } from './odt';
import { ExportReport, exportToast } from './report';

/** A grey PNG of w × h pixels (no pHYs, no text chunks), like the editor's 2× previews. */
function makePng(w: number, h: number, shade = 200): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
    view.setUint32(0, data.length);
    out.set(t, 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(Buffer.concat([t, data])) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8-bit greyscale
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.fill(shade, y * (w + 1) + 1, (y + 1) * (w + 1));
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))];
  return Uint8Array.from(Buffer.concat(parts));
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/></svg>';

const shape = (id: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  position: { x, y },
  width: 120,
  height: 60,
  data: { shape: 'rectangle', label, fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false },
  ...extra,
});
const source = (labels: string[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  nodes: labels.map((l, i) => shape(`n${i}`, l, 0, i * 100)),
  edges: [],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
  ...extra,
});

const diagram = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'diagram',
  attrs: { source: null, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: '', align: null, caption: null, alt: null, svgPreviewId: null, ...attrs },
});
const doc = (...blocks: JSONContent[]): DocumentContent => {
  const c = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, ...blocks] } };
  return { ...c, schemaVersion: contentSchemaFor(c) };
};
const loader = (files: Record<string, Uint8Array | string | Error>) =>
  vi.fn(async (id: string) => {
    const f = files[id];
    if (f instanceof Error) throw f;
    if (f === undefined) return undefined;
    return new Blob([f as BlobPart], { type: typeof f === 'string' ? 'image/svg+xml' : 'image/png' });
  });
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

function diagramsOf(n: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (n.type === 'diagram') out.push(n);
  n.content?.forEach((c) => diagramsOf(c, out));
  return out;
}
function nodesOf(n: JSONContent, type: string, out: JSONContent[] = []): JSONContent[] {
  if (n.type === type) out.push(n);
  n.content?.forEach((c) => nodesOf(c, type, out));
  return out;
}

const FLOW = source(['Start', 'Check', 'End']);
const CYCLE = source(['Plan', 'Do']);
const P1 = makePng(800, 600); // a 2× preview of a 400 × 300 diagram
const P2 = makePng(600, 400, 120); // 300 × 200

/** Two diagrams and a pasted copy of the first; the second is captioned, right-aligned and has alt text. */
const THREE = () =>
  doc(
    diagram({ source: FLOW, previewId: 'p1', naturalWidth: 400, naturalHeight: 300, width: 200, height: 150, title: 'Flow' }),
    diagram({ source: CYCLE, previewId: 'p2', naturalWidth: 300, naturalHeight: 200, width: 300, height: 200, title: 'Cycle', align: 'right', caption: 'Figure 2: the cycle', alt: 'Plan leads to Do' }),
    diagram({ source: FLOW, previewId: 'p1', naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: 'Flow' }),
  );

for (const format of ['docx', 'odt'] as const) {
  const exportFile = format === 'docx' ? exportDocx : exportOdt;
  describe(`${format.toUpperCase()}: diagrams survive export and re-import as editable diagrams`, () => {
    it('restores every diagram with its data, title, size, caption, alignment and alt text', async () => {
      const content = THREE();
      const report = new ExportReport();
      const file = await bytes(await exportFile(content, 'Doc', loader({ p1: P1, p2: P2 }), report));
      const back = await importDocumentFile(`doc.${format}`, file);
      const ds = diagramsOf(back.content.doc);
      expect(ds).toHaveLength(3);
      expect(ds.map((d) => d.attrs?.source)).toEqual([FLOW, CYCLE, FLOW]);
      expect(ds.map((d) => d.attrs?.title)).toEqual(['Flow', 'Cycle', 'Flow']);
      expect(ds.map((d) => [d.attrs?.width, d.attrs?.height])).toEqual([
        [200, 150],
        [300, 200],
        [400, 300],
      ]);
      expect(ds.map((d) => [d.attrs?.naturalWidth, d.attrs?.naturalHeight])).toEqual([
        [400, 300],
        [300, 200],
        [400, 300],
      ]);
      expect(ds.map((d) => d.attrs?.align)).toEqual([null, 'right', null]);
      expect(ds.map((d) => d.attrs?.caption)).toEqual([null, 'Figure 2: the cycle', null]);
      expect(ds.map((d) => d.attrs?.alt)).toEqual([null, 'Plan leads to Do', null]);
      // The caption is the diagram's again, not a paragraph of its own.
      expect(JSON.stringify(back.content.doc)).not.toContain('"paragraphStyle":"caption"');
      // Each restored preview is handed to the app to store; it no longer carries the data (that is in the document).
      expect(back.attachments?.map((a) => a.id).sort()).toEqual(ds.map((d) => d.attrs?.previewId as string).sort());
      for (const a of back.attachments ?? []) {
        expect(a.mimeType).toBe('image/png');
        expect(isPng(a.data)).toBe(true);
        expect(readDiagramFromPng(a.data)).toBeNull();
      }
      expect(imageSize(back.attachments!.find((a) => a.id === ds[1].attrs?.previewId)!.data)).toEqual({ width: 600, height: 400 });
      // Stored and re-linked as the app does it: ids replaced, nothing left pointing at the import's own ids.
      const stored = new Map((back.attachments ?? []).map((a, i) => [a.id, `stored-${i}`]));
      const linked = withStoredAttachments(back.content, stored);
      expect(diagramsOf(linked.doc).map((d) => d.attrs?.previewId)).toEqual(ds.map((d) => stored.get(d.attrs?.previewId as string)));
      // Captioned, aligned, alt-text diagrams are content schema 3 (Phase 6 attributes), as in the editor.
      expect(linked.schemaVersion).toBe(3);
      // The report says what happened: pictures, editable again in Classroom OS.
      const toast = exportToast('file', report);
      expect(toast.kind).toBe('info');
      expect(toast.message).toContain('3 diagrams were written as pictures; they can be edited again when this file is imported back into Classroom OS');
    });

    it('a plain diagram stays content schema 2 after the round trip', async () => {
      const content = doc(diagram({ source: FLOW, previewId: 'p1', width: 400, height: 300, title: 'Flow' }));
      expect(content.schemaVersion).toBe(2);
      const back = await importDocumentFile(`d.${format}`, await bytes(await exportFile(content, 'D', loader({ p1: P1 }))));
      const linked = withStoredAttachments(back.content, new Map(back.attachments!.map((a) => [a.id, 'x'])));
      expect(linked.schemaVersion).toBe(2);
    });

    it('a diagram without data, or a picture with damaged data, comes back as a picture', async () => {
      const content = doc(diagram({ source: null, previewId: 'p1', title: 'No data' }));
      const report = new ExportReport();
      const file = await bytes(await exportFile(content, 'D', loader({ p1: P1 }), report));
      expect(exportToast('file', report).message).toContain('1 diagram was written as a picture only: its editable data could not be kept in the file');
      const back = await importDocumentFile(`d.${format}`, file);
      expect(diagramsOf(back.content.doc)).toHaveLength(0);
      expect(nodesOf(back.content.doc, 'image')).toHaveLength(1);
      expect(back.attachments).toBeUndefined();
    });

    it('a preview that fails to load does not abort the export; it is redrawn from the data when possible', async () => {
      const content = doc(
        diagram({ source: FLOW, previewId: 'broken', title: 'Broken', width: 400, height: 300 }),
        diagram({ source: CYCLE, previewId: 'p2', title: 'Fine', naturalWidth: 300, naturalHeight: 200, width: 300, height: 200 }),
        diagram({ source: null, previewId: 'gone', title: 'Lost' }),
      );
      // Without a renderer: the failed one is a placeholder, the export still succeeds.
      let report = new ExportReport();
      let file = await bytes(await exportFile(content, 'D', loader({ broken: new Error('IndexedDB read failed'), p2: P2 }), report));
      let back = await importDocumentFile(`d.${format}`, file);
      expect(diagramsOf(back.content.doc).map((d) => d.attrs?.title)).toEqual(['Fine']);
      expect(JSON.stringify(back.content.doc)).toContain('[Diagram: Broken — preview not available]');
      expect(exportToast('file', report).message).toContain('2 diagrams have no preview and were written as placeholders');

      // With the host's renderer: the failed one is drawn from its data; the one without data stays a placeholder.
      const renderPreview = vi.fn(async (): Promise<RenderedDiagramPreview> => ({ png: new Blob([P1 as BlobPart], { type: 'image/png' }), svg: SVG, width: 400, height: 300 }));
      report = new ExportReport();
      file = await bytes(await exportFile(content, 'D', loader({ broken: new Error('IndexedDB read failed'), p2: P2 }), report, { renderPreview }));
      back = await importDocumentFile(`d.${format}`, file);
      expect(diagramsOf(back.content.doc).map((d) => d.attrs?.title)).toEqual(['Broken', 'Fine']);
      expect(diagramsOf(back.content.doc)[0].attrs?.source).toEqual(FLOW);
      expect(JSON.stringify(back.content.doc)).toContain('[Diagram: Lost — preview not available]');
      const message = exportToast('file', report).message;
      expect(message).toContain("1 diagram's missing preview was redrawn from its data");
      expect(message).toContain('1 diagram has no preview and was written as a placeholder');
    });
  });
}

describe('diagrams inside tables and lists', () => {
  for (const format of ['docx', 'odt'] as const) {
    it(`${format.toUpperCase()}: a captioned, right-aligned diagram in a table cell and one in a list item come back editable`, async () => {
      const cellDiagram = diagram({ source: CYCLE, previewId: 'p2', naturalWidth: 300, naturalHeight: 200, width: 150, height: 100, title: 'In cell', align: 'right', caption: 'Cell figure' });
      const listDiagram = diagram({ source: FLOW, previewId: 'p1', width: 200, height: 150, title: 'In list' });
      const content = doc(
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [cellDiagram] },
              ],
            },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }, listDiagram] }] },
      );
      const exportFile = format === 'docx' ? exportDocx : exportOdt;
      const back = await importDocumentFile(`t.${format}`, await bytes(await exportFile(content, 'T', loader({ p1: P1, p2: P2 }))));
      const cells = nodesOf(back.content.doc, 'tableCell').concat(nodesOf(back.content.doc, 'tableHeader'));
      const inCell = cells.flatMap((c) => diagramsOf(c));
      expect(inCell.map((d) => [d.attrs?.title, d.attrs?.source, d.attrs?.align, d.attrs?.caption, d.attrs?.width])).toEqual([['In cell', CYCLE, 'right', 'Cell figure', 150]]);
      const inList = nodesOf(back.content.doc, 'listItem').flatMap((li) => diagramsOf(li));
      if (format === 'odt') expect(inList.map((d) => [d.attrs?.title, d.attrs?.source])).toEqual([['In list', FLOW]]);
      else {
        // Word: a picture that is not the item's first paragraph comes back after the list (as ordinary pictures
        // always have through mammoth); the diagram is still editable.
        expect(inList).toEqual([]);
        expect(diagramsOf(back.content.doc).map((d) => [d.attrs?.title, d.attrs?.source])).toContainEqual(['In list', FLOW]);
      }
    });
  }
});

describe('vector drawings beside the PNG', () => {
  const twoCopies = () =>
    doc(diagram({ source: FLOW, previewId: 'p1', title: 'Flow', width: 400, height: 300 }), diagram({ source: FLOW, previewId: 'p1', title: 'Flow', width: 200, height: 150 }));

  it('DOCX writes the SVG with the PNG as fallback (asvg:svgBlip), once for copies, and still re-imports editable', async () => {
    const renderPreview = vi.fn(async (): Promise<RenderedDiagramPreview> => ({ png: new Blob([P1 as BlobPart]), svg: SVG, width: 400, height: 300 }));
    const file = await bytes(await exportDocx(twoCopies(), 'D', loader({ p1: P1 }), new ExportReport(), { renderPreview }));
    // Copies of a diagram are drawn once.
    expect(renderPreview).toHaveBeenCalledTimes(1);
    const zip = unzipSync(file);
    const media = Object.keys(zip).filter((f) => f.startsWith('word/media/'));
    expect(media.filter((f) => f.endsWith('.svg'))).toHaveLength(1);
    expect(media.filter((f) => f.endsWith('.png'))).toHaveLength(1);
    const xml = strFromU8(zip['word/document.xml']);
    expect(xml.match(/asvg:svgBlip/g)?.length).toBe(2);
    const png = zip[media.find((f) => f.endsWith('.png'))!];
    expect(readDiagramFromPng(png)?.envelope.diagram).toEqual(FLOW);
    expect(pngPixelRatio(png)).toBe(2);
    const back = await importDocumentFile('d.docx', file);
    expect(diagramsOf(back.content.doc).map((d) => d.attrs?.width)).toEqual([400, 200]);
  });

  it('a stored SVG preview is used as it is, without drawing', async () => {
    const renderPreview = vi.fn();
    const content = doc(diagram({ source: FLOW, previewId: 'p1', svgPreviewId: 's1', title: 'Flow' }));
    const file = await bytes(await exportDocx(content, 'D', loader({ p1: P1, s1: SVG }), new ExportReport(), { renderPreview }));
    expect(renderPreview).not.toHaveBeenCalled();
    const zip = unzipSync(file);
    expect(strFromU8(zip[Object.keys(zip).find((f) => f.endsWith('.svg'))!])).toBe(SVG);
  });

  it('ODT puts the SVG first and the PNG second in one frame, with copies sharing one Pictures/ entry each', async () => {
    const renderPreview = vi.fn(async (): Promise<RenderedDiagramPreview> => ({ png: new Blob([P1 as BlobPart]), svg: SVG, width: 400, height: 300 }));
    const file = await bytes(await exportOdt(twoCopies(), 'D', loader({ p1: P1 }), new ExportReport(), { renderPreview }));
    const zip = unzipSync(file);
    const pictures = Object.keys(zip).filter((f) => f.startsWith('Pictures/'));
    expect(pictures.sort()).toEqual(['Pictures/0001.svg', 'Pictures/0002.png']);
    const content = strFromU8(zip['content.xml']);
    const frames = content.match(/<draw:frame\b[\s\S]*?<\/draw:frame>/g) ?? [];
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      const images = [...frame.matchAll(/<draw:image [^>]*xlink:href="([^"]+)"[^>]*draw:mime-type="([^"]+)"/g)].map((m) => [m[1], m[2]]);
      expect(images).toEqual([
        ['Pictures/0001.svg', 'image/svg+xml'],
        ['Pictures/0002.png', 'image/png'],
      ]);
    }
    const manifest = strFromU8(zip['META-INF/manifest.xml']);
    expect(manifest).toContain('manifest:full-path="Pictures/0001.svg" manifest:media-type="image/svg+xml"');
    expect(manifest).toContain('manifest:full-path="Pictures/0002.png" manifest:media-type="image/png"');
    // Import prefers the PNG with the data over the SVG in front of it.
    const back = await importDocumentFile('d.odt', file);
    expect(diagramsOf(back.content.doc).map((d) => d.attrs?.source)).toEqual([FLOW, FLOW]);
  });

  it('a diagram from a newer version keeps its stored PNG only (it is not redrawn by this version)', async () => {
    const newer = { ...FLOW, schemaVersion: DRAWN_DIAGRAM_SCHEMA + 1 };
    const renderPreview = vi.fn();
    const content = doc(diagram({ source: newer, previewId: 'p1', title: 'New' }));
    const file = await bytes(await exportDocx(content, 'D', loader({ p1: P1 }), new ExportReport(), { renderPreview }));
    expect(renderPreview).not.toHaveBeenCalled();
    expect(Object.keys(unzipSync(file)).some((f) => f.endsWith('.svg'))).toBe(false);
    // Its data is still carried byte for byte, and comes back unchanged.
    const back = await importDocumentFile('d.docx', file);
    expect(diagramsOf(back.content.doc)[0].attrs?.source).toEqual(newer);
  });
});

describe('DOCX import keeps the size Word shows (wp:extent)', () => {
  it('pictures and diagrams come back at their Word size, not their pixel size', async () => {
    const picture = `data:image/png;base64,${Buffer.from(P1).toString('base64')}`;
    const content = doc(
      { type: 'image', attrs: { src: picture, alt: 'Photo', width: 200, height: 150 } },
      diagram({ source: FLOW, previewId: 'p1', title: 'A', width: 200, height: 150 }),
      diagram({ source: FLOW, previewId: 'p1', title: 'A', width: 300, height: 225 }),
      diagram({ source: FLOW, previewId: 'p1', title: 'A', width: 400, height: 300 }),
    );
    const back = await importDocumentFile('d.docx', await bytes(await exportDocx(content, 'D', loader({ p1: P1 }))));
    const image = nodesOf(back.content.doc, 'image')[0];
    // Without wp:extent the 800 px wide picture came back as wide as the page.
    expect([image.attrs?.width, image.attrs?.height]).toEqual([200, 150]);
    expect(image.attrs?.alt).toBe('Photo');
    expect(diagramsOf(back.content.doc).map((d) => [d.attrs?.width, d.attrs?.height])).toEqual([
      [200, 150],
      [300, 225],
      [400, 300],
    ]);
  });

  it('a picture with no description keeps no alt text, and one described by its title keeps the title', async () => {
    const { buildDocx } = await import('./docx');
    const { Packer } = await import('docx');
    const picture = `data:image/png;base64,${Buffer.from(makePng(100, 50)).toString('base64')}`;
    const content = doc({ type: 'image', attrs: { src: picture, width: 100, height: 50 } });
    const back = await importDocumentFile('d.docx', new Uint8Array(await Packer.toBuffer(buildDocx(content))));
    const image = nodesOf(back.content.doc, 'image')[0];
    expect(image.attrs?.alt ?? null).toBeNull();
    expect([image.attrs?.width, image.attrs?.height]).toEqual([100, 50]);
  });
});

// Round 3 (verifier, EXPORT): files Word and other apps write that the size marking must not break.
describe('DOCX pictures as other apps write them', () => {
  /** A one-picture DOCX from this app's exporter, with its document.xml changed by `edit`. */
  async function editedDocx(picture: Uint8Array, width: number, height: number, edit: (xml: string) => string) {
    const { buildDocx } = await import('./docx');
    const { Packer } = await import('docx');
    const src = `data:image/png;base64,${Buffer.from(picture).toString('base64')}`;
    const file = new Uint8Array(await Packer.toBuffer(buildDocx(doc({ type: 'image', attrs: { src, alt: 'Photo', width, height } }))));
    const zip = unzipSync(file);
    const xml = strFromU8(zip['word/document.xml']);
    const changed = edit(xml);
    expect(changed).not.toBe(xml);
    zip['word/document.xml'] = strToU8(changed);
    return zipSync(zip);
  }
  const image = async (file: Uint8Array) => nodesOf((await importDocumentFile('d.docx', file)).content.doc, 'image')[0];

  it("imports a description in single quotes, or one holding a raw '>' (valid XML), with its size and text", async () => {
    const single = await editedDocx(makePng(100, 50), 200, 100, (x) => x.replace(/descr="Photo"/, "descr='x'"));
    expect(await image(single)).toMatchObject({ attrs: expect.objectContaining({ alt: 'x', width: 200, height: 100 }) });
    const greater = await editedDocx(makePng(100, 50), 200, 100, (x) => x.replace(/descr="Photo"/, 'descr="a > b"'));
    expect(await image(greater)).toMatchObject({ attrs: expect.objectContaining({ alt: 'a > b', width: 200, height: 100 }) });
    const quoted = await editedDocx(makePng(100, 50), 200, 100, (x) => x.replace(/descr="Photo"/, `descr='say "hi"'`));
    expect(await image(quoted)).toMatchObject({ attrs: expect.objectContaining({ alt: 'say "hi"', width: 200, height: 100 }) });
  });

  it('a picture cropped in Word keeps its own proportions (its box is the crop), so exports do not stretch it', async () => {
    // A square picture shown in a 4:1 box, its top and bottom cropped away in Word.
    const cropped = await editedDocx(makePng(10, 10), 100, 100, (x) =>
      x.replace(/cy="952500"/g, 'cy="238125"').replace(/<a:stretch>/, '<a:srcRect t="37500" b="37500"/><a:stretch>'),
    );
    const img = await image(cropped);
    expect([img.attrs?.width, img.attrs?.height]).toEqual([100, 100]);
  });
});

// Round 3 (verifier, EXPORT): a preview drawn at less than 2× (a large diagram) came back a few pixels off.
describe('natural size of a large diagram after a round trip', () => {
  it('a 3000 × 2500 diagram whose preview is 4477 × 3731 pixels comes back 3000 × 2500, in DOCX and ODT', async () => {
    const big = makePng(4477, 3731);
    const content = doc(diagram({ source: FLOW, previewId: 'big', naturalWidth: 3000, naturalHeight: 2500, width: 600, height: 500, title: 'Big' }));
    for (const [name, exporter] of [
      ['d.docx', exportDocx],
      ['d.odt', exportOdt],
    ] as const) {
      const back = await importDocumentFile(name, await bytes(await exporter(content, 'D', loader({ big }))));
      expect(diagramsOf(back.content.doc).map((d) => [d.attrs?.naturalWidth, d.attrs?.naturalHeight, d.attrs?.width, d.attrs?.height]), name).toEqual([[3000, 2500, 600, 500]]);
    }
  });
});

describe('sizes read from a file are bounded', () => {
  it('a picture of absurd proportions comes back at the default diagram shape, still editable', () => {
    const odd = embedDiagramInPng(makePng(60000, 2), diagramPngEnvelope(FLOW, 'Odd'));
    const d = diagramFromPicture(odd, { id: 'x', widthPx: null, maxWidthPx: 600 });
    expect(d?.attrs).toMatchObject({ source: FLOW, naturalWidth: 400, naturalHeight: 300, width: 600, height: 450 });
  });
});

describe('PNG helpers for imported diagrams', () => {
  it('reads the pixel ratio from pHYs, and none from a PNG without it', () => {
    expect(pngPixelRatio(P1)).toBeNull();
    for (const ratio of [1, 1.5, 2, 3]) expect(pngPixelRatio(embedDiagramInPng(P1, diagramPngEnvelope(FLOW, 'F'), { pixelRatio: ratio }))).toBe(ratio);
    expect(pngPixelRatio(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('takes the diagram out of a picture without changing the picture', () => {
    const carrying = embedDiagramInPng(P1, diagramPngEnvelope(FLOW, 'F'));
    const plain = withoutDiagramData(carrying);
    expect(readDiagramFromPng(plain)).toBeNull();
    const kept = (png: Uint8Array) => pngChunks(png)!.filter((c) => c.type !== 'iTXt').map((c) => [c.type, Buffer.from(c.data).toString('hex')]);
    expect(kept(plain)).toEqual(kept(carrying));
    expect(withoutDiagramData(P1)).toBe(P1);
    const junk = new Uint8Array([9, 9, 9]);
    expect(withoutDiagramData(junk)).toBe(junk);
  });
});
