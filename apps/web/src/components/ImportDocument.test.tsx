// @vitest-environment jsdom
/** Importing Word and OpenDocument files as new documents (Phase 4, G-FILES). */
import 'fake-indexeddb/auto';
import { buildOdt, createEmptyDocument, IMPORT_ACCEPT, type DocumentContent } from '@dcos/document-studio';
import { ToastProvider } from '@dcos/ui';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const odtFile = (content: DocumentContent, name: string) => new File([buildOdt(content, 'From ODT') as BlobPart], name);

describe('useImportDocument', () => {
  it('accepts the same files as the importer', async () => {
    // The app keeps its own copy so the list page does not load the editor's code.
    expect(readFileSync(join(__dirname, 'ImportDocument.tsx'), 'utf8')).toContain(`const ACCEPT = '${IMPORT_ACCEPT}'`);
  });

  it('creates a new document and opens it when nothing needs reporting', async () => {
    const before = (await storage.list('document')).length;
    const content: DocumentContent = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello from a file' }] }] } };
    const { result } = renderHook(useProbe, { wrapper });
    await act(() => result.current.importer.importFile(odtFile(content, 'hello.odt')));
    const docs = await storage.list('document');
    expect(docs).toHaveLength(before + 1);
    const created = docs.find((d) => d.title === 'From ODT')!;
    expect(result.current.path).toBe(`/documents/${created.id}`);
    const item = await storage.get('document', created.id);
    expect(JSON.stringify(item?.content)).toContain('Hello from a file');
    expect(result.current.importer.outcome).toBeNull();
  });

  it('shows what could not be imported before opening the new document', async () => {
    // An ODT with a linked (not embedded) picture, which the import cannot bring in.
    const { strToU8, unzipSync, zipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(buildOdt(createEmptyDocument()));
    files['content.xml'] = strToU8(
      strFromU8(files['content.xml']).replace(
        '<office:text>',
        '<office:text><text:p><draw:frame svg:width="1cm" svg:height="1cm"><draw:image xlink:href="https://example.org/web.png"/></draw:frame></text:p>',
      ),
    );
    const { result } = renderHook(useProbe, { wrapper });
    await act(() => result.current.importer.importFile(new File([zipSync(files) as BlobPart], 'linked.odt')));
    await waitFor(() => expect(result.current.importer.outcome?.notes).toEqual(['1 linked (not embedded) picture was not imported.']));
    expect(result.current.path).toBe('/documents');
    const id = result.current.importer.outcome!.id;
    expect(await storage.get('document', id)).toBeTruthy();
    act(() => result.current.importer.open());
    expect(result.current.path).toBe(`/documents/${id}`);
  });

  it('says why a file cannot be imported, and creates nothing', async () => {
    const before = (await storage.list('document')).length;
    const { result } = renderHook(useProbe, { wrapper });
    await act(() => result.current.importer.importFile(new File(['plain text'], 'notes.txt')));
    expect((await storage.list('document')).length).toBe(before);
    expect(result.current.path).toBe('/documents');
  });
});
