// @vitest-environment jsdom
/**
 * Phase 6 (ADR 0013), group EXPORT: the Classroom OS document file (.dcosdoc): one document with its diagrams' data and
 * pictures, read back strictly (newer or damaged files are refused, never imported in part).
 */
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { importDocumentFile, IMPORT_ACCEPT } from '../import';
import { withStoredAttachments } from '../import/common';
import { importDcosdoc } from '../import/dcosdoc';
import { contentSchemaFor, DOCUMENT_SCHEMA } from '../migrate';
import { createEmptyDocument, type DocumentContent } from '../types';
import { DCOSDOC_FORMAT, DCOSDOC_VERSION, exportDcosdoc, referencedAttachments, toBase64 } from './dcosdoc';
import { ExportReport, exportToast } from './report';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const FLOW = { schemaVersion: 2, nodes: [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 50, data: { shape: 'rectangle', label: 'Start' } }], edges: [], viewport: null, settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' } };

const diagram = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'diagram',
  attrs: { source: FLOW, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: 'Flow', align: null, caption: null, alt: null, svgPreviewId: null, ...attrs },
});
const docOf = (...blocks: JSONContent[]): DocumentContent => {
  const c = { ...createEmptyDocument(), mode: 'advanced' as const, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }, ...blocks] } };
  return { ...c, schemaVersion: contentSchemaFor(c) };
};
const loader = (files: Record<string, Uint8Array | string | Error>) =>
  vi.fn(async (id: string) => {
    const f = files[id];
    if (f instanceof Error) throw f;
    return f === undefined ? undefined : new Blob([f as BlobPart]);
  });
const fileBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe('.dcosdoc export', () => {
  it('holds the content as stored and every picture it refers to, once', async () => {
    const content = docOf(diagram({ previewId: 'p1', svgPreviewId: 's1' }), diagram({ previewId: 'p1', svgPreviewId: 's1' }), diagram({ previewId: 'p2', title: 'Other', caption: 'Fig. 2' }));
    expect(referencedAttachments(content.doc)).toEqual(['p1', 's1', 'p2']);
    const blob = await exportDcosdoc(content, 'My doc', loader({ p1: PNG, s1: SVG, p2: PNG }), undefined, {}, 'test');
    expect(blob.type).toBe('application/vnd.dcos.document+json');
    const file = JSON.parse(await blob.text());
    expect(file).toMatchObject({ format: DCOSDOC_FORMAT, version: DCOSDOC_VERSION, app: 'test', title: 'My doc' });
    expect(file.content).toEqual(content);
    expect(Object.keys(file.attachments).sort()).toEqual(['p1', 'p2', 's1']);
    expect(file.attachments.p1).toEqual({ type: 'image/png', data: toBase64(PNG) });
    expect(file.attachments.s1.type).toBe('image/svg+xml');
  });

  it('records the lowest content schema the document needs (2 for a plain diagram)', async () => {
    const content = { ...docOf(diagram({ previewId: 'p1' })), schemaVersion: DOCUMENT_SCHEMA };
    const file = JSON.parse(await (await exportDcosdoc(content, 'D', loader({ p1: PNG }))).text());
    expect(file.content.schemaVersion).toBe(2);
  });

  it('redraws a preview that cannot be read, or says it was left out; one failure never aborts', async () => {
    const content = docOf(diagram({ previewId: 'broken' }), diagram({ previewId: 'gone', source: null, title: 'Lost' }));
    const renderPreview = vi.fn(async () => ({ png: new Blob([PNG as BlobPart]), svg: SVG, width: 1, height: 1 }));
    const report = new ExportReport();
    const file = JSON.parse(await (await exportDcosdoc(content, 'D', loader({ broken: new Error('read failed') }), report, { renderPreview })).text());
    expect(Object.keys(file.attachments)).toEqual(['broken']);
    expect(file.attachments.broken.data).toBe(toBase64(PNG));
    const message = exportToast('Classroom OS document', report).message;
    expect(message).toContain("1 diagram's missing preview was redrawn from its data");
    expect(message).toContain("1 diagram's preview could not be read and was left out; the diagram keeps its data");
  });
});

describe('.dcosdoc import', () => {
  it('is accepted by the document import and recognised from the file itself', async () => {
    expect(IMPORT_ACCEPT).toContain('.dcosdoc');
    const content = docOf(diagram({ previewId: 'p1', caption: 'Figure 1', align: 'right' }), diagram({ previewId: 'p1' }));
    const bytes = await fileBytes(await exportDcosdoc(content, 'Report', loader({ p1: PNG })));
    const result = await importDocumentFile('renamed.json', bytes);
    expect(result.format).toBe('dcosdoc');
    expect(result.title).toBe('Report');
    expect(result.content.doc).toEqual(content.doc);
    expect(result.content.schemaVersion).toBe(3);
    expect(result.attachments).toEqual([{ id: 'p1', data: PNG, mimeType: 'image/png' }]);
    expect(result.report.empty).toBe(true);
    // Stored and re-linked: both copies point at the stored picture.
    const linked = withStoredAttachments(result.content, new Map([['p1', 'new-id']]));
    const ids: unknown[] = [];
    const walk = (n: JSONContent) => (n.type === 'diagram' && ids.push(n.attrs?.previewId), n.content?.forEach(walk));
    walk(linked.doc);
    expect(ids).toEqual(['new-id', 'new-id']);
  });

  it('refuses what it cannot import exactly', () => {
    const good = { format: DCOSDOC_FORMAT, version: 1, title: 'T', content: docOf(), attachments: {} };
    const refuse = (v: unknown, message: RegExp) => expect(() => importDcosdoc(typeof v === 'string' ? new TextEncoder().encode(v) : json(v))).toThrow(message);
    refuse('not json', /not valid JSON/);
    refuse({ ...good, format: 'dcos-diagram' }, /not a Classroom OS document file/);
    refuse({ ...good, version: 2 }, /newer file format \(version 2\)/);
    refuse({ ...good, version: 'one' }, /no valid format version/);
    refuse({ ...good, title: 5 }, /title is damaged/);
    refuse({ ...good, content: null }, /holds no document/);
    refuse({ ...good, content: { ...good.content, schemaVersion: DOCUMENT_SCHEMA + 1 } }, new RegExp(`newer version of Classroom OS \\(content version ${DOCUMENT_SCHEMA + 1}\\)`));
    refuse({ ...good, content: { ...good.content, schemaVersion: 0 } }, /no valid content version/);
    refuse({ ...good, content: { ...good.content, doc: { type: 'doc', content: [{ type: 'hologram' }] } } }, /cannot be imported/);
    refuse({ ...good, content: { ...good.content, mode: 'zen' } }, /cannot be imported/);
    refuse({ ...good, content: { ...good.content, footnotes: [] } }, /cannot be imported/);
    refuse({ ...good, attachments: [] }, /pictures are damaged/);
    expect(importDcosdoc(json(good)).content.doc).toEqual(good.content.doc);
  });

  it('leaves out pictures it cannot read, and pictures nothing refers to, and says so', () => {
    const content = docOf(diagram({ previewId: 'p1' }), diagram({ previewId: 'bad' }), diagram({ previewId: 'absent' }), diagram({ previewId: 'svg', svgPreviewId: 'notsvg' }));
    const file = {
      format: DCOSDOC_FORMAT,
      version: 1,
      title: 'T',
      content,
      attachments: {
        p1: { type: 'image/png', data: toBase64(PNG) },
        bad: { type: 'image/png', data: '%%%' },
        svg: { type: 'image/svg+xml', data: toBase64(new TextEncoder().encode(SVG)) },
        notsvg: { type: 'image/svg+xml', data: toBase64(PNG) },
        stray: { type: 'image/png', data: toBase64(PNG) },
      },
    };
    const result = importDcosdoc(json(file));
    expect(result.attachments?.map((a) => a.id)).toEqual(['p1', 'svg']);
    expect(result.report.sentences()).toEqual(['3 diagram pictures were missing from the file or could not be read; the diagrams keep their data and their previews can be drawn again']);
    // The diagrams without a picture keep their data, pointing at nothing rather than at a stranger's picture.
    const linked = withStoredAttachments(result.content, new Map([['p1', 'a'], ['svg', 'b']]));
    const attrs: Array<Record<string, unknown>> = [];
    const walk = (n: JSONContent) => (n.type === 'diagram' && attrs.push(n.attrs!), n.content?.forEach(walk));
    walk(linked.doc);
    expect(attrs.map((a) => [a.previewId, a.svgPreviewId])).toEqual([
      ['a', null],
      [null, null],
      [null, null],
      ['b', null],
    ]);
    expect(attrs.every((a) => JSON.stringify(a.source) === JSON.stringify(FLOW))).toBe(true);
  });
});
