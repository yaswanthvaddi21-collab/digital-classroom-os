// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import { act, render, screen } from '@testing-library/react';
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
