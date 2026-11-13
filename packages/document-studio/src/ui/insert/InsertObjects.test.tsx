// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../DocumentEditor';
import { createEmptyDocument, type DocumentContent } from '../../types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const doc = (mode: 'simple' | 'advanced', content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]) => ({
  ...createEmptyDocument(),
  mode,
  doc: { type: 'doc', content },
});
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent;
const savedNode = (onChange: ReturnType<typeof vi.fn>, type: string) => {
  let found: JSONContent | undefined;
  const walk = (n: JSONContent) => {
    if (!found && n.type === type) found = n;
    n.content?.forEach(walk);
  };
  walk(lastSaved(onChange).doc);
  return found;
};
const open = (content: DocumentContent | ReturnType<typeof doc>, onChange = vi.fn()) => {
  render(
    <ToastProvider>
      <DocumentEditor initialContent={content} title="T" onChange={onChange} />
    </ToastProvider>,
  );
  return onChange;
};
const insertTab = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'Insert' }));
  return within(screen.getByRole('tabpanel'));
};
/** Selects the node at `pos` as a click or the arrow keys do (jsdom has no layout, so clicks cannot select). */
const selectNodeAt = async (body: HTMLElement, pos: number) => {
  const editor = (body as unknown as { editor: import('@tiptap/core').Editor }).editor;
  await act(async () => {
    editor.commands.setNodeSelection(pos);
  });
};

/** Clicks inside the document body at its end, so commands have a selection. */
const focusBody = async () => {
  const body = await screen.findByRole('textbox', { name: 'Document body' });
  body.focus();
  await act(async () => document.dispatchEvent(new Event('selectionchange')));
  return body;
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  document.elementFromPoint ??= () => null;
  // jsdom has no layout: ProseMirror measures ranges when it scrolls the selection into view.
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= rects;
  Range.prototype.getBoundingClientRect ??= () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('Insert tab: equations, shapes and text boxes', () => {
  it('are on the Insert tab in Advanced mode only (Simple keeps the curated core)', async () => {
    open(doc('simple'));
    let tab = await insertTab();
    expect(tab.queryByRole('button', { name: 'Insert equation' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'advanced' }));
    tab = await insertTab();
    for (const name of ['Insert equation', 'Insert shape', 'Insert text box']) expect(tab.getByRole('button', { name })).toBeTruthy();
  });

  it('inserts a display equation through the dialog with a live preview and the Word note, then saves schema 2', async () => {
    const onChange = open(doc('advanced'));
    await focusBody();
    const tab = await insertTab();
    fireEvent.click(tab.getByRole('button', { name: 'Insert equation' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /display equation/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Insert equation' })).toBeTruthy();
    const insert = within(dialog).getByRole('button', { name: 'Insert' }) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    const latex = within(dialog).getByRole('textbox', { name: 'LaTeX' });
    fireEvent.change(latex, { target: { value: '\\frac{' } });
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/This LaTeX has a problem/));
    expect(insert.disabled).toBe(true);
    fireEvent.change(latex, { target: { value: 'E = mc^2' } });
    await waitFor(() => expect(screen.getByTestId('equation-preview').querySelector('.katex')).toBeTruthy());
    expect(within(dialog).getByRole('status').textContent).toBe('Word export: an editable Word equation.');
    fireEvent.change(latex, { target: { value: '\\overgroup{AB}' } });
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toMatch(/a picture of the equation/));
    fireEvent.change(latex, { target: { value: 'E = mc^2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fraction' }));
    expect((latex as HTMLTextAreaElement).value).toBe('E = mc^2\\frac{}{}');
    fireEvent.change(latex, { target: { value: 'E = mc^2' } });
    fireEvent.click(insert);
    await waitFor(() => expect(savedNode(onChange, 'blockMath')?.attrs?.latex).toBe('E = mc^2'));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    expect(document.querySelector('.ProseMirror [data-type="block-math"] .katex-display')).toBeTruthy();
  });

  it('a selected equation has tools: edit (in the dialog), switch inline/display, delete', async () => {
    const onChange = open(doc('simple', [{ type: 'paragraph', content: [{ type: 'text', text: 'Area ' }, { type: 'inlineMath', attrs: { latex: '\\pi r^2' } }] }]));
    await selectNodeAt(await focusBody(), 6);
    const bar = await screen.findByRole('toolbar', { name: 'Equation' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Edit equation…' }));
    const dialog = await screen.findByRole('dialog');
    const latex = within(dialog).getByRole('textbox', { name: 'LaTeX' }) as HTMLTextAreaElement;
    expect(latex.value).toBe('\\pi r^2');
    fireEvent.change(latex, { target: { value: '\\pi r^{2}' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(savedNode(onChange, 'inlineMath')?.attrs?.latex).toBe('\\pi r^{2}'));
    fireEvent.click(within(await screen.findByRole('toolbar', { name: 'Equation' })).getByRole('button', { name: 'Make display' }));
    await waitFor(() => expect(savedNode(onChange, 'blockMath')?.attrs?.latex).toBe('\\pi r^{2}'));
    expect(savedNode(onChange, 'inlineMath')).toBeUndefined();
    fireEvent.click(within(await screen.findByRole('toolbar', { name: 'Equation' })).getByRole('button', { name: 'Delete equation' }));
    await waitFor(() => expect(savedNode(onChange, 'blockMath')).toBeUndefined());
  });

  it('inserts a shape, shows it as SVG with a resize handle, and the shape tools change it', async () => {
    const onChange = open(doc('advanced'));
    await focusBody();
    const tab = await insertTab();
    fireEvent.click(tab.getByRole('button', { name: 'Insert shape' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ellipse' }));
    const bar = await screen.findByRole('toolbar', { name: 'Shape' });
    await waitFor(() => expect(document.querySelector('.ProseMirror .dcos-shape svg ellipse')).toBeTruthy());
    expect(document.querySelector('.ProseMirror .dcos-shape-handle')).toBeTruthy();
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Shape kind' }), { target: { value: 'callout' } });
    await waitFor(() => expect(savedNode(onChange, 'shape')?.attrs?.kind).toBe('callout'));
    const bar2 = screen.getByRole('toolbar', { name: 'Shape' });
    fireEvent.input(within(bar2).getByLabelText('Fill colour'), { target: { value: '#ff0000' } });
    await waitFor(() => expect(savedNode(onChange, 'shape')?.attrs?.fill).toBe('#ff0000'));
    const width = within(screen.getByRole('toolbar', { name: 'Shape' })).getByRole('spinbutton', { name: 'Shape width in pixels' });
    fireEvent.change(width, { target: { value: '300' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    await waitFor(() => expect(savedNode(onChange, 'shape')?.attrs?.width).toBe(300));
    const label = within(screen.getByRole('toolbar', { name: 'Shape' })).getByRole('textbox', { name: 'Shape text' });
    fireEvent.change(label, { target: { value: 'Note' } });
    fireEvent.blur(label);
    await waitFor(() => expect(savedNode(onChange, 'shape')?.attrs?.text).toBe('Note'));
    expect(document.querySelector('.ProseMirror .dcos-shape svg text')?.textContent).toBe('Note');
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Shape' })).getByRole('button', { name: 'Align right' }));
    await waitFor(() => expect(savedNode(onChange, 'shape')?.attrs?.align).toBe('right'));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
  });

  it('inserts a text box, types in it, and the text box tools float it and set its width', async () => {
    const onChange = open(doc('advanced'));
    await focusBody();
    const tab = await insertTab();
    fireEvent.click(tab.getByRole('button', { name: 'Insert text box' }));
    const bar = await screen.findByRole('toolbar', { name: 'Text box' });
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Text wrapping' }), { target: { value: 'right' } });
    await waitFor(() => expect(savedNode(onChange, 'textBox')?.attrs?.float).toBe('right'));
    const width = within(screen.getByRole('toolbar', { name: 'Text box' })).getByRole('spinbutton', { name: 'Text box width in pixels' });
    fireEvent.change(width, { target: { value: '200' } });
    fireEvent.blur(width);
    await waitFor(() => expect(savedNode(onChange, 'textBox')?.attrs?.width).toBe(200));
    const box = document.querySelector<HTMLElement>('.ProseMirror .dcos-textbox')!;
    expect(box.classList.contains('dcos-textbox-right')).toBe(true);
    expect(box.style.width).toBe('200px');
  });

  it('a selected picture can be aligned and given a caption and alternative text (in Simple mode too)', async () => {
    const onChange = open(doc('simple', [{ type: 'image', attrs: { src: PNG, alt: 'Cell', width: 50, height: 50 } }, { type: 'paragraph' }]));
    const body = await focusBody();
    expect(body.querySelector('figure.dcos-figure img')).toBeTruthy();
    await selectNodeAt(body, 0);
    const bar = await screen.findByRole('toolbar', { name: 'Picture' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Align left' }));
    await waitFor(() => expect(savedNode(onChange, 'image')?.attrs?.align).toBe('left'));
    const caption = within(screen.getByRole('toolbar', { name: 'Picture' })).getByRole('textbox', { name: 'Caption' });
    fireEvent.change(caption, { target: { value: 'Figure 1. A cell' } });
    fireEvent.keyDown(caption, { key: 'Enter' });
    await waitFor(() => expect(savedNode(onChange, 'image')?.attrs?.caption).toBe('Figure 1. A cell'));
    expect(document.querySelector('.ProseMirror figure.dcos-figure figcaption')?.textContent).toBe('Figure 1. A cell');
    expect(document.querySelector<HTMLElement>('.ProseMirror figure.dcos-figure')?.dataset.align).toBe('left');
    expect(lastSaved(onChange).schemaVersion).toBe(2);
  });
});
