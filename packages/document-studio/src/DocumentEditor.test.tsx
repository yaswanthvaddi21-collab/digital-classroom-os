// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from './DocumentEditor';
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

    await act(async () => {
      img.closest('.dcos-diagram-box')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(host.edit).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'p1', title: 'Cycle' }));
    const saved = onChange.mock.calls.at(-1)![0];
    expect(saved.schemaVersion).toBe(2);
    expect(saved.doc.content[0].attrs).toMatchObject({ previewId: 'p2', title: 'Cycle v2', width: 300, height: 75 });
  });

  it('shows a clear placeholder when there is no preview to show', async () => {
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} />);
    expect(await screen.findByText(/preview unavailable/i)).toBeTruthy();
  });
});
