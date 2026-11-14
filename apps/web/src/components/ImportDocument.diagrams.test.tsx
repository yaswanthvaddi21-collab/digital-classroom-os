// @vitest-environment jsdom
/**
 * Phase 6 (ADR 0013), group EXPORT: importing documents whose diagrams carry pictures. The app stores each picture
 * before the document and points the document at the stored copies, for the native .dcosdoc file and for diagrams
 * restored from a Word or OpenDocument file.
 */
import 'fake-indexeddb/auto';
import { createEmptyDocument, exportDcosdoc, exportDocx, exportOdt, readDiagramFromPng, type DocumentContent } from '@dcos/document-studio';
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { storage } from '../lib/storage';
import { useImportDocument } from './ImportDocument';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/documents']}>
    <ToastProvider>{children}</ToastProvider>
  </MemoryRouter>
);
const useProbe = () => ({ importer: useImportDocument(), path: useLocation().pathname });

// Two different 1×1 PNGs.
const PNG_A = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const PNG_B = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"/>';
const source = (label: string) => ({ schemaVersion: 2, nodes: [{ id: 'n', position: { x: 0, y: 0 }, width: 100, height: 50, data: { shape: 'rectangle', label } }], edges: [], viewport: null, settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' } });

const diagram = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'diagram',
  attrs: { source: null, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 200, height: 150, title: 'D', align: null, caption: null, alt: null, svgPreviewId: null, ...attrs },
});
const contentWith = (...blocks: JSONContent[]): DocumentContent => ({ ...createEmptyDocument(), schemaVersion: 2, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }, ...blocks] } });
const load = async (id: string) => {
  const a = await storage.getAttachment(id);
  return a ? new Blob([a.data]) : undefined;
};
const bytesOf = async (id: unknown) => new Uint8Array((await storage.getAttachment(String(id)))!.data);
function diagramsOf(n: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (n.type === 'diagram') out.push(n);
  n.content?.forEach((c) => diagramsOf(c, out));
  return out;
}

async function importAndRead(file: File) {
  const { result } = renderHook(useProbe, { wrapper });
  await act(() => result.current.importer.importFile(file));
  const id = result.current.path.split('/').pop()!;
  const item = await storage.get('document', id);
  expect(item, `imported from ${file.name}`).toBeTruthy();
  return item!.content as DocumentContent;
}

describe('importing documents with embedded diagrams', () => {
  it('a .dcosdoc round trip keeps every diagram editable with its preview and SVG', async () => {
    const a = await storage.putAttachment(new Blob([PNG_A]), 'image/png');
    const b = await storage.putAttachment(new Blob([PNG_B]), 'image/png');
    const s = await storage.putAttachment(new Blob([SVG]), 'image/svg+xml');
    const original = contentWith(
      diagram({ source: source('First'), previewId: a.id, title: 'First' }),
      diagram({ source: source('Second'), previewId: b.id, svgPreviewId: s.id, title: 'Second', caption: 'Figure 2', align: 'right' }),
      diagram({ source: source('First'), previewId: a.id, title: 'First' }),
    );
    const file = new File([await exportDcosdoc(original, 'Native', load)], 'Native.dcosdoc');
    const imported = await importAndRead(file);
    const before = diagramsOf(original.doc);
    const after = diagramsOf(imported.doc);
    expect(after.map((d) => d.attrs?.source)).toEqual(before.map((d) => d.attrs?.source));
    expect(after.map((d) => [d.attrs?.title, d.attrs?.caption, d.attrs?.align, d.attrs?.width])).toEqual(before.map((d) => [d.attrs?.title, d.attrs?.caption, d.attrs?.align, d.attrs?.width]));
    // Every picture resolves in the store to the same bytes as the original.
    for (const [i, d] of after.entries()) {
      expect(await bytesOf(d.attrs?.previewId)).toEqual(await bytesOf(before[i].attrs?.previewId));
      if (before[i].attrs?.svgPreviewId) expect(new TextDecoder().decode(await bytesOf(d.attrs?.svgPreviewId))).toBe(SVG);
    }
    expect(imported.schemaVersion).toBe(3);
  });

  // Round 3 (verifier, EXPORT): a .dcosdoc none of whose pictures can be read was saved with the file's own ids.
  it('a .dcosdoc whose pictures are all missing is saved with no picture ids, never the ids from the file', async () => {
    // An id that also exists in this store must not be picked up as this diagram's picture.
    const here = await storage.putAttachment(new Blob([PNG_A]), 'image/png');
    const file = new File(
      [JSON.stringify({ format: 'dcos-document', version: 1, app: 'test', title: 'Lost', content: { ...contentWith(diagram({ source: source('Kept'), previewId: here.id, svgPreviewId: 'gone', title: 'Kept' })), schemaVersion: 3 }, attachments: {} })],
      'Lost.dcosdoc',
    );
    // With notes to read (the missing pictures), the import stays on the list and shows them instead of opening it.
    const { result } = renderHook(useProbe, { wrapper });
    await act(() => result.current.importer.importFile(file));
    const listed = (await storage.list('document')).find((i) => i.title === 'Lost');
    expect(listed).toBeTruthy();
    const imported = (await storage.get('document', listed!.id))!.content as DocumentContent;
    const [d] = diagramsOf(imported.doc);
    expect(d.attrs?.source).toEqual(source('Kept'));
    expect([d.attrs?.previewId, d.attrs?.svgPreviewId]).toEqual([null, null]);
    expect(imported.schemaVersion).toBe(2);
  });

  for (const format of ['docx', 'odt'] as const) {
    it(`a diagram exported to ${format.toUpperCase()} comes back editable, with its preview stored`, async () => {
      const png = await storage.putAttachment(new Blob([PNG_B]), 'image/png');
      const original = contentWith(diagram({ source: source('Start'), previewId: png.id, naturalWidth: 2, naturalHeight: 1, width: 300, height: 150, title: 'Flow' }));
      const exporter = format === 'docx' ? exportDocx : exportOdt;
      const file = new File([await exporter(original, 'Flow doc', load)], `flow.${format}`);
      const imported = await importAndRead(file);
      const [d] = diagramsOf(imported.doc);
      expect(d.attrs?.source).toEqual(source('Start'));
      expect([d.attrs?.width, d.attrs?.height]).toEqual([300, 150]);
      const stored = await bytesOf(d.attrs?.previewId);
      expect(stored.subarray(0, 4)).toEqual(PNG_B.subarray(0, 4));
      // The stored preview does not carry the diagram a second time.
      expect(readDiagramFromPng(stored)).toBeNull();
      expect(imported.schemaVersion).toBe(2);
    });
  }
});
