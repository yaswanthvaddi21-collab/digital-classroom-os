// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from './DocumentEditor';
import type { EmbeddedDiagram } from './extensions/diagramEmbed';
import { createEmptyDocument } from './types';

const withProviders = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('DocumentEditor', () => {
  it('emits changes for a normal document', async () => {
    const onChange = vi.fn();
    const content = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] } };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} />);
    const editor = await screen.findByRole('textbox', { name: 'Document body' });
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(editor.textContent).toContain('Hello');
    expect(onChange).not.toHaveBeenCalled(); // opening is not an edit
  });

  it('never saves over a document it cannot represent, and says so', async () => {
    const onChange = vi.fn();
    const content = {
      ...createEmptyDocument(),
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Precious work' }] }, { type: 'futureWidget' }] },
    };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} />);
    expect(await screen.findByText(/opened read-only to protect this document/i)).toBeTruthy();
    const editor = screen.getByRole('textbox', { name: 'Document body' });
    expect(editor.getAttribute('contenteditable')).toBe('false');
    expect(editor.textContent).toContain('Precious work');
    act(() => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /download original data/i })).toBeTruthy();
  });
});

describe('embedded diagrams', () => {
  const diagram = { type: 'diagram', attrs: { source: { nodes: [] }, previewId: 'p1', naturalWidth: 400, naturalHeight: 200, width: 300, height: 150, title: 'Cycle' } };
  const content = { ...createEmptyDocument(), schemaVersion: 2, doc: { type: 'doc', content: [diagram] } };

  it('shows the stored preview and re-renders after a double-click edit, keeping the chosen width', async () => {
    const onChange = vi.fn();
    const host = {
      templates: [],
      edit: vi.fn(async () => ({ source: { nodes: [1] }, previewId: 'p2', naturalWidth: 800, naturalHeight: 200, title: 'Cycle v2' })),
      pickFromLibrary: vi.fn(),
      importFile: vi.fn(),
      loadPreview: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
      toDrawio: vi.fn(),
    };
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} diagramHost={host} />);
    const img = await waitFor(() => {
      const el = document.querySelector<HTMLImageElement>('.dcos-diagram img');
      if (!el) throw new Error('preview not shown yet');
      return el;
    });
    expect(img.getAttribute('alt')).toBe('Cycle');
    expect(img.getAttribute('width')).toBe('300');
    expect(host.loadPreview).toHaveBeenCalledWith('p1');
    // Print export clones this DOM: the clipboard copy of the diagram data stays out of it.
    expect(document.querySelector('[data-diagram]')).toBeNull();

    await act(async () => {
      img.closest('.dcos-diagram-box')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(host.edit).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'p1', title: 'Cycle' }));
    const saved = onChange.mock.calls.at(-1)![0];
    expect(saved.schemaVersion).toBe(2);
    expect(saved.doc.content[0].attrs).toMatchObject({ previewId: 'p2', title: 'Cycle v2', width: 300, height: 75 });
  });

  // DOC-4: another tab's save can remount the editor while the diagram dialog is open.
  describe('when the document is reloaded while the diagram dialog is open', () => {
    const later = <T,>() => {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    };
    const edited = { source: { nodes: [1] }, previewId: 'p2', naturalWidth: 800, naturalHeight: 200, title: 'Cycle v2' };
    const makeHost = (edit: () => Promise<EmbeddedDiagram | null>) => ({
      templates: [],
      edit: vi.fn(edit),
      pickFromLibrary: vi.fn(),
      importFile: vi.fn(async () => ({ source: { nodes: [] }, title: 'Imported' })),
      loadPreview: vi.fn(async () => undefined),
      toDrawio: vi.fn(),
    });
    // Remounting under a new key, as EditorPage does, destroys the old Tiptap editor.
    const reload = async (rerender: (ui: React.ReactElement) => void, ui: React.ReactElement) => {
      rerender(<ToastProvider>{ui}</ToastProvider>);
      await act(() => new Promise((r) => setTimeout(r, 20)));
    };

    it('says the edit was not applied instead of writing into the old editor', async () => {
      const pending = later<EmbeddedDiagram | null>();
      const host = makeHost(() => pending.promise);
      const onChange = vi.fn();
      const { rerender } = withProviders(<DocumentEditor key="1" initialContent={content} title="T" onChange={onChange} diagramHost={host} />);
      const box = await waitFor(() => document.querySelector('.dcos-diagram-box')!);
      act(() => {
        box.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      expect(host.edit).toHaveBeenCalled();
      await reload(rerender, <DocumentEditor key="2" initialContent={content} title="T" onChange={onChange} diagramHost={host} />);
      await act(async () => pending.resolve(edited));
      expect(await screen.findByText(/reloaded while you were editing\. Your changes to the diagram were not applied/i)).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('says the diagram was not inserted instead of reporting success', async () => {
      const pending = later<EmbeddedDiagram | null>();
      const host = makeHost(() => pending.promise);
      const onChange = vi.fn();
      const empty = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph' }] } };
      const { rerender } = withProviders(<DocumentEditor key="1" initialContent={empty} title="T" onChange={onChange} diagramHost={host} />);
      fireEvent.click(await screen.findByRole('tab', { name: 'Diagram' }));
      fireEvent.click(screen.getByRole('button', { name: /import diagrams\.net/i }));
      await waitFor(() => expect(host.edit).toHaveBeenCalled());
      await reload(rerender, <DocumentEditor key="2" initialContent={empty} title="T" onChange={onChange} diagramHost={host} />);
      await act(async () => pending.resolve(edited));
      expect(await screen.findByText(/reloaded while you were editing\. Your diagram was not inserted/i)).toBeTruthy();
      expect(screen.queryByText(/diagram added/i)).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('still reports success when the editor is alive', async () => {
      const host = makeHost(async () => edited);
      const onChange = vi.fn();
      const empty = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph' }] } };
      withProviders(<DocumentEditor initialContent={empty} title="T" onChange={onChange} diagramHost={host} />);
      fireEvent.click(await screen.findByRole('tab', { name: 'Diagram' }));
      fireEvent.click(screen.getByRole('button', { name: /import diagrams\.net/i }));
      expect(await screen.findByText(/diagram added/i)).toBeTruthy();
      await waitFor(() => expect(onChange.mock.calls.at(-1)?.[0].doc.content.some((n: { type: string }) => n.type === 'diagram')).toBe(true));
    });
  });

  it('shows a clear placeholder when there is no preview to show', async () => {
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} />);
    expect(await screen.findByText(/preview unavailable/i)).toBeTruthy();
  });
});
