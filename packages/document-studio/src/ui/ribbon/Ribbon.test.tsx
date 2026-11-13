// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../DocumentEditor';
import type { DiagramHost } from '../../extensions/diagramEmbed';
import { createEmptyDocument, type DocumentContent } from '../../types';

const withProviders = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const doc = (mode: 'simple' | 'advanced', content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]) => ({
  ...createEmptyDocument(),
  mode,
  doc: { type: 'doc', content },
});
const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent);
const host = (over: Partial<DiagramHost> = {}): DiagramHost => ({
  templates: [{ id: 'flowchart', name: 'Flowchart' }],
  edit: vi.fn(async () => null),
  pickFromLibrary: vi.fn(async () => null),
  importFile: vi.fn(async () => null),
  loadPreview: vi.fn(async () => undefined),
  toDrawio: vi.fn(async () => '<mxfile/>'),
  ...over,
});
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent;
const selectAll = async () => {
  const body = await screen.findByRole('textbox', { name: 'Document body' });
  body.focus();
  // Select the whole text so formatting commands apply to it.
  const range = document.createRange();
  range.selectNodeContents(body);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  await act(async () => document.dispatchEvent(new Event('selectionchange')));
  return body;
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  // jsdom lacks these layout and dialog APIs.
  document.elementFromPoint ??= () => null;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('ribbon tabs', () => {
  it('Simple mode shows Home and Insert (and Diagram when diagrams are available); Advanced adds Layout and Review', async () => {
    const { unmount } = withProviders(<DocumentEditor initialContent={doc('simple')} title="T" onChange={vi.fn()} />);
    await screen.findByRole('tab', { name: 'Home' });
    expect(tabs()).toEqual(['Home', 'Insert']);
    unmount();
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={vi.fn()} diagramHost={host()} />);
    await screen.findByRole('tab', { name: 'Home' });
    expect(tabs()).toEqual(['Home', 'Insert', 'Layout', 'Review', 'Diagram']);
  });

  it('puts each control on its tab', async () => {
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={vi.fn()} diagramHost={host()} />);
    const toolbar = async (tab: string) => {
      fireEvent.click(await screen.findByRole('tab', { name: tab }));
      return within(screen.getByRole('tabpanel'));
    };
    let t = await toolbar('Home');
    for (const name of ['Undo (Ctrl+Z)', 'Bold (Ctrl+B)', 'Text colour', 'Highlight', 'Bulleted list', 'Quote', 'Centre', 'Subscript']) expect(t.getByRole('button', { name })).toBeTruthy();
    expect(t.getByRole('combobox', { name: 'Text style' })).toBeTruthy();
    expect(t.getByRole('combobox', { name: 'Font' })).toBeTruthy();
    t = await toolbar('Insert');
    for (const name of ['Link (Ctrl+K)', 'Insert image', 'Insert table', 'Horizontal line', 'Page break (Ctrl+Enter)', 'Table of contents', 'Insert diagram']) expect(t.getByRole('button', { name })).toBeTruthy();
    t = await toolbar('Layout');
    expect(t.getByRole('button', { name: /page setup/i })).toBeTruthy();
    expect(t.getByText('A4, portrait')).toBeTruthy();
    t = await toolbar('Review');
    for (const name of ['Find and replace (Ctrl+F)', 'Spell check on', 'Word count']) expect(t.getByRole('button', { name })).toBeTruthy();
    t = await toolbar('Diagram');
    expect(t.getByRole('button', { name: /new diagram/i })).toBeTruthy();
  });

  it('moves between tabs with the arrow keys, Home and End', async () => {
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={vi.fn()} />);
    const home = await screen.findByRole('tab', { name: 'Home' });
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Insert' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(home, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Review' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('dcos-tab-home');
  });

  it('falls back to Home when switching to Simple hides the current tab', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={onChange} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('radio', { name: 'simple' }));
    expect(screen.getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('true');
    expect(lastSaved(onChange).mode).toBe('simple');
  });
});

describe('controls work', () => {
  it('Bold formats the selection and saves', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={doc('simple')} title="T" onChange={onChange} />);
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'Bold (Ctrl+B)' }));
    await waitFor(() => expect(JSON.stringify(lastSaved(onChange).doc)).toContain('"bold"'));
    expect(lastSaved(onChange).schemaVersion).toBe(1);
  });

  it('links typed without a scheme get https://; disallowed ones are refused with a message (DS-7)', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={doc('simple')} title="T" onChange={onChange} />);
    await selectAll();
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link (Ctrl+K)' }));
    const input = screen.getByRole('textbox', { name: 'Link address' });
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/not allowed/);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'example.com/notes' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(JSON.stringify(lastSaved(onChange).doc)).toContain('"href":"https://example.com/notes"'));
  });

  it('Ctrl/⌘+K opens the link box on the Insert tab', async () => {
    withProviders(<DocumentEditor initialContent={doc('simple')} title="T" onChange={vi.fn()} />);
    const body = await screen.findByRole('textbox', { name: 'Document body' });
    fireEvent.keyDown(body, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Link address' })).toBeTruthy());
    expect(screen.getByRole('tab', { name: 'Insert' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Review: word count, find and spell check', async () => {
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Word count' }));
    const list = screen.getByLabelText('Word count', { selector: 'dl' });
    expect(list.textContent).toMatch(/Words\s*2/);
    expect(list.textContent).toMatch(/Characters\s*11/);
    expect(list.textContent).toMatch(/\(no spaces\)\s*10/);
    fireEvent.click(screen.getByRole('button', { name: 'Find and replace (Ctrl+F)' }));
    expect(screen.getByRole('search')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Spell check on' }));
    expect(screen.getByRole('textbox', { name: 'Document body' }).getAttribute('spellcheck')).toBe('false');
  });

  it('Layout: page setup opens the dialog', async () => {
    withProviders(<DocumentEditor initialContent={doc('advanced')} title="T" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('button', { name: /page setup/i }));
    expect(screen.getByText('Paper size')).toBeTruthy();
  });

  it('the table tools appear while the cursor is in a table', async () => {
    const table = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }] }] };
    withProviders(<DocumentEditor initialContent={doc('simple', [table])} title="T" onChange={vi.fn()} />);
    await selectAll();
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Table' })).toBeTruthy());
  });
});

describe('export menu', () => {
  it('explains that PDF uses the print dialog and what the header and footer need (DS-5)', async () => {
    withProviders(<DocumentEditor initialContent={doc('simple')} title="T" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    const pdf = screen.getByRole('menuitem', { name: /PDF/ });
    expect(pdf.textContent).toMatch(/print dialog/);
    expect(pdf.textContent).toMatch(/header, footer and page numbers/);
  });

  it('reports approximations in the Word export toast (DS-3)', async () => {
    const remote = [{ type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'a' } }, { type: 'paragraph' }];
    withProviders(<DocumentEditor initialContent={doc('simple', remote)} title="T" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /word document/i }));
    expect(await screen.findByText('Exported Word document. 1 image was not saved for offline use and was written as a placeholder.')).toBeTruthy();
  });
});

describe('diagram tab', () => {
  const diagram = (source: unknown) => ({ type: 'diagram', attrs: { source, previewId: null, naturalWidth: 400, naturalHeight: 200, width: 300, height: 150, title: 'Cycle' } });

  it('has no dead-end "SVG or PDF" download item (DS-8)', async () => {
    const content = { ...doc('simple', [diagram({ nodes: [] })]), schemaVersion: 2 };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} diagramHost={host()} />);
    const box = await waitFor(() => document.querySelector('.dcos-diagram-box')!);
    fireEvent.mouseDown(box, { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Diagram' }));
    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items.some((t) => /png image/i.test(t ?? ''))).toBe(true);
    expect(items.some((t) => /svg|pdf/i.test(t ?? ''))).toBe(false);
  });

  it('a diagram without its data says so on double-click and offers Remove, without opening the editor (WEB-3)', async () => {
    const h = host();
    const onChange = vi.fn();
    const content = { ...doc('simple', [diagram(null), { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }]), schemaVersion: 2 };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} diagramHost={h} />);
    const box = await waitFor(() => document.querySelector('.dcos-diagram-box')!);
    await act(async () => box.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(h.edit).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/data is missing/);
    fireEvent.click(within(alert).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => box.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Remove diagram' }));
    await waitFor(() => expect(lastSaved(onChange).doc.content!.some((n) => n.type === 'diagram')).toBe(false));
    expect(lastSaved(onChange).schemaVersion).toBe(1);
  });

  it('the Diagram tab Edit button says the data is missing instead of opening an empty editor (WEB-3)', async () => {
    const h = host();
    const content = { ...doc('simple', [diagram(null)]), schemaVersion: 2 };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} diagramHost={h} />);
    const box = await waitFor(() => document.querySelector('.dcos-diagram-box')!);
    fireEvent.mouseDown(box, { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Diagram' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByText(/data is missing/)).toBeTruthy();
    expect(h.edit).not.toHaveBeenCalled();
  });

  it('shows "preview unavailable" when the preview fails to load, and retries on the next view (WEB-10)', async () => {
    const loadPreview = vi.fn().mockRejectedValueOnce(new Error('storage error')).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const content = { ...doc('simple', [{ ...diagram({ nodes: [] }), attrs: { ...diagram({ nodes: [] }).attrs, previewId: 'retry-me' } }]), schemaVersion: 2 };
    const first = withProviders(<DocumentEditor key="1" initialContent={content} title="T" onChange={vi.fn()} diagramHost={host({ loadPreview })} />);
    expect(await screen.findByText(/preview unavailable/i)).toBeTruthy();
    first.unmount();
    withProviders(<DocumentEditor key="2" initialContent={content} title="T" onChange={vi.fn()} diagramHost={host({ loadPreview })} />);
    await waitFor(() => expect(document.querySelector('.dcos-diagram img')).not.toBeNull());
    expect(loadPreview).toHaveBeenCalledTimes(2);
  });
});

describe('page settings this version cannot use (DS-2)', () => {
  it('open read-only with the reason, instead of crashing', async () => {
    const onChange = vi.fn();
    const content = { ...doc('simple'), page: { ...createEmptyDocument().page, size: 'A0' } };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} />);
    expect(await screen.findByText(/opened read-only to protect this document/i)).toBeTruthy();
    expect(screen.getByText(/paper size "A0"/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Document body' }).textContent).toContain('Hello world');
    expect(onChange).not.toHaveBeenCalled();
  });
});
