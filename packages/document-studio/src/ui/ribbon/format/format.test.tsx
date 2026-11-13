// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../../DocumentEditor';
import { createEmptyDocument, type DocumentContent } from '../../../types';

const withProviders = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const doc = (mode: 'simple' | 'advanced', content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]) => ({
  ...createEmptyDocument(),
  mode,
  doc: { type: 'doc', content },
});
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent;
const firstBlock = (onChange: ReturnType<typeof vi.fn>) => lastSaved(onChange).doc.content![0];
const panel = () => within(screen.getByRole('tabpanel'));
const open = async (mode: 'simple' | 'advanced' = 'advanced', content?: JSONContent[]) => {
  const onChange = vi.fn();
  withProviders(<DocumentEditor initialContent={doc(mode, content)} title="T" onChange={onChange} />);
  const body = await screen.findByRole('textbox', { name: 'Document body' });
  await act(async () => body.focus());
  return onChange;
};

const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 20, height: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
const realRect = HTMLElement.prototype.getBoundingClientRect;
const realRangeRects = [Range.prototype.getClientRects, Range.prototype.getBoundingClientRect] as const;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  document.elementFromPoint ??= () => null;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  // jsdom has no layout: give the paper and its paragraphs a width so the ruler can place its markers.
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('dcos-paper')) return rect(100, 794);
    if (this.matches('.ProseMirror p, .ProseMirror h1, .ProseMirror h2')) return rect(196, 602);
    return rect(0, 1000);
  };
  // With layout present, ProseMirror measures text ranges when it scrolls the selection into view.
  Range.prototype.getBoundingClientRect = () => rect(200, 1);
  Range.prototype.getClientRects = () => Object.assign([rect(200, 1)], { item: () => rect(200, 1) }) as unknown as DOMRectList;
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  [Range.prototype.getClientRects, Range.prototype.getBoundingClientRect] = realRangeRects;
});

describe('Home tab formatting controls', () => {
  it('Advanced shows every format control; Simple keeps the core (styles, line spacing, colours)', async () => {
    await open('advanced');
    const styles = panel().getByRole('combobox', { name: 'Text style' }) as HTMLSelectElement;
    expect(Array.from(styles.options).map((o) => o.textContent)).toEqual(['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Quote', 'Caption', 'Code']);
    for (const name of ['Line and paragraph spacing', 'Bullet style', 'Numbering format', 'Decrease indent (Ctrl+Shift+M)', 'Increase indent (Ctrl+M)', 'Paragraph settings', 'Text colour', 'Highlight'])
      expect(panel().getByRole('button', { name })).toBeTruthy();
    expect(panel().getByRole('spinbutton', { name: 'Custom font size (pt)' })).toBeTruthy();
    for (const name of ['First line indent', 'Hanging indent', 'Left indent', 'Right indent', 'Left page margin', 'Right page margin']) expect(screen.getByRole('slider', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'simple' }));
    expect(panel().getByRole('combobox', { name: 'Text style' })).toBeTruthy();
    expect(panel().getByRole('button', { name: 'Line and paragraph spacing' })).toBeTruthy();
    expect(panel().queryByRole('button', { name: 'Bullet style' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Left indent' })).toBeNull();
  });

  it('the Styles list applies a named style, saves it as schema 2, and shows the style at the cursor', async () => {
    const onChange = await open('simple');
    const styles = panel().getByRole('combobox', { name: 'Text style' }) as HTMLSelectElement;
    fireEvent.change(styles, { target: { value: 'title' } });
    await waitFor(() => expect(firstBlock(onChange).attrs?.paragraphStyle).toBe('title'));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    expect(styles.value).toBe('title');
    fireEvent.change(styles, { target: { value: 'normal' } });
    await waitFor(() => expect(firstBlock(onChange).attrs?.paragraphStyle).toBeNull());
    expect(lastSaved(onChange).schemaVersion).toBe(1);
    fireEvent.change(styles, { target: { value: 'h2' } });
    await waitFor(() => expect(firstBlock(onChange)).toMatchObject({ type: 'heading', attrs: { level: 2 } }));
  });

  it('line spacing: presets, a custom value, and a refused value', async () => {
    const onChange = await open('simple');
    fireEvent.click(panel().getByRole('button', { name: 'Line and paragraph spacing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Line spacing 2.0' }));
    await waitFor(() => expect(firstBlock(onChange).attrs?.lineSpacing).toBe(2));
    fireEvent.click(panel().getByRole('button', { name: 'Line and paragraph spacing' }));
    expect(screen.getByRole('button', { name: 'Line spacing 2.0' }).getAttribute('aria-pressed')).toBe('true');
    const custom = screen.getByRole('spinbutton', { name: 'Custom line spacing' });
    fireEvent.change(custom, { target: { value: '9' } });
    fireEvent.submit(custom.closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/0\.5 to 5/);
    fireEvent.change(custom, { target: { value: '1.25' } });
    fireEvent.submit(custom.closest('form')!);
    await waitFor(() => expect(firstBlock(onChange).attrs?.lineSpacing).toBe(1.25));
  });

  it('custom text and highlight colours (hex field and colour picker)', async () => {
    const onChange = await open('simple');
    const body = screen.getByRole('textbox', { name: 'Document body' });
    const range = document.createRange();
    range.selectNodeContents(body);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    await act(async () => document.dispatchEvent(new Event('selectionchange')));
    fireEvent.click(panel().getByRole('button', { name: 'Text colour' }));
    const hex = screen.getByRole('textbox', { name: 'Custom text colour (hex)' });
    fireEvent.change(hex, { target: { value: 'nope' } });
    fireEvent.submit(hex.closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/hex colour/);
    fireEvent.change(hex, { target: { value: '123ABC' } });
    fireEvent.submit(hex.closest('form')!);
    await waitFor(() => expect(JSON.stringify(lastSaved(onChange).doc)).toContain('"color":"#123abc"'));
    fireEvent.click(panel().getByRole('button', { name: 'Highlight' }));
    fireEvent.change(screen.getByLabelText('Custom highlight colour picker'), { target: { value: '#00ffcc' } });
    await waitFor(() => expect(JSON.stringify(lastSaved(onChange).doc)).toContain('"type":"highlight","attrs":{"color":"#00ffcc"}'));
    // Custom colours use attributes v0.1.0 already had: still schema 1.
    expect(lastSaved(onChange).schemaVersion).toBe(1);
  });

  it('custom font size: any size in points, shown in the size list', async () => {
    const onChange = await open('advanced');
    const body = screen.getByRole('textbox', { name: 'Document body' });
    const range = document.createRange();
    range.selectNodeContents(body);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    await act(async () => document.dispatchEvent(new Event('selectionchange')));
    const input = panel().getByRole('spinbutton', { name: 'Custom font size (pt)' });
    fireEvent.change(input, { target: { value: '13.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(JSON.stringify(lastSaved(onChange).doc)).toContain('"fontSize":"13.5pt"'));
    expect((panel().getByRole('combobox', { name: 'Font size' }) as HTMLSelectElement).value).toBe('13.5pt');
  });

  it('bullet glyphs, number formats and the start number', async () => {
    const onChange = await open('advanced');
    fireEvent.click(panel().getByRole('button', { name: 'Bullet style' }));
    fireEvent.click(screen.getByRole('button', { name: /Square/ }));
    await waitFor(() => expect(firstBlock(onChange)).toMatchObject({ type: 'bulletList', attrs: { bulletStyle: 'square' } }));
    fireEvent.click(panel().getByRole('button', { name: 'Numbering format' }));
    fireEvent.click(screen.getByRole('button', { name: 'i, ii, iii' }));
    await waitFor(() => expect(firstBlock(onChange)).toMatchObject({ type: 'orderedList', attrs: { numberFormat: 'lower-roman' } }));
    fireEvent.click(panel().getByRole('button', { name: 'Numbering format' }));
    const start = screen.getByRole('spinbutton', { name: 'Start numbering at' });
    fireEvent.change(start, { target: { value: '0' } });
    fireEvent.submit(start.closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/whole number/);
    fireEvent.change(start, { target: { value: '5' } });
    fireEvent.submit(start.closest('form')!);
    await waitFor(() => expect(firstBlock(onChange).attrs?.start).toBe(5));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
  });

  it('indent buttons and the Paragraph dialog', async () => {
    const onChange = await open('advanced');
    fireEvent.click(panel().getByRole('button', { name: 'Increase indent (Ctrl+M)' }));
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentLeft).toBe(36));
    fireEvent.click(panel().getByRole('button', { name: 'Decrease indent (Ctrl+Shift+M)' }));
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentLeft).toBeNull());

    fireEvent.click(panel().getByRole('button', { name: 'Paragraph settings' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Left (cm)'), { target: { value: '0.5' } });
    fireEvent.change(dialog.getByLabelText('Special'), { target: { value: 'hanging' } });
    fireEvent.change(dialog.getByLabelText('By (cm)'), { target: { value: '1' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }));
    expect(dialog.getByRole('alert').textContent).toMatch(/hanging indent cannot be larger/);
    fireEvent.change(dialog.getByLabelText('Left (cm)'), { target: { value: '2' } });
    fireEvent.change(dialog.getByLabelText('Right (cm)'), { target: { value: '1' } });
    fireEvent.change(dialog.getByLabelText('Before (pt)'), { target: { value: '12' } });
    fireEvent.change(dialog.getByLabelText('After (pt)'), { target: { value: '6' } });
    fireEvent.change(dialog.getByLabelText('Line spacing'), { target: { value: 'multiple' } });
    fireEvent.change(dialog.getByLabelText('At (lines)'), { target: { value: '1.3' } });
    fireEvent.change(dialog.getByLabelText('Alignment'), { target: { value: 'justify' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(firstBlock(onChange).attrs).toMatchObject({ indentLeft: 56.69, indentRight: 28.35, indentFirstLine: -28.35, spaceBefore: 12, spaceAfter: 6, lineSpacing: 1.3, textAlign: 'justify' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the Paragraph dialog changes only what the user changed, keeping other selected paragraphs\' own indents and spacing', async () => {
    const onChange = await open('advanced', [
      { type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] },
      { type: 'paragraph', attrs: { spaceBefore: 24, indentLeft: 72, indentFirstLine: -36, textAlign: 'center' }, content: [{ type: 'text', text: 'Formatted' }] },
    ]);
    const body = screen.getByRole('textbox', { name: 'Document body' });
    const ed = (body as unknown as { editor: import('@tiptap/core').Editor }).editor;
    await act(async () => void ed.commands.selectAll());
    fireEvent.click(panel().getByRole('button', { name: 'Paragraph settings' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Line spacing'), { target: { value: '2' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(lastSaved(onChange).doc.content![1].attrs?.lineSpacing).toBe(2));
    const [first, second] = lastSaved(onChange).doc.content!;
    expect(first.attrs).toMatchObject({ lineSpacing: 2, spaceBefore: null, indentLeft: null, indentFirstLine: null });
    expect(second.attrs).toMatchObject({ lineSpacing: 2, spaceBefore: 24, indentLeft: 72, indentFirstLine: -36, textAlign: 'center' });
  });
});

describe('ruler', () => {
  it('moves indents and page margins with the keyboard (the sliders are the keyboard alternative to dragging)', async () => {
    const onChange = await open('advanced');
    const left = screen.getByRole('slider', { name: 'Left indent' });
    expect(left.getAttribute('aria-valuetext')).toBe('0 cm');
    fireEvent.keyDown(left, { key: 'ArrowRight' });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentLeft).toBe(7.09));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Left indent' }), { key: 'PageUp' });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentLeft).toBe(35.43));
    expect(screen.getByRole('slider', { name: 'Left indent' }).getAttribute('aria-valuetext')).toBe('1.25 cm');

    // First line: one step right of the left indent.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'First line indent' }), { key: 'ArrowRight' });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentFirstLine).toBeCloseTo(7.09, 1));
    // Hanging: moves the left indent and keeps the first line where it is (1.5 cm).
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hanging indent' }), { key: 'ArrowRight' });
    await waitFor(() => expect(firstBlock(onChange).attrs).toMatchObject({ indentLeft: 42.52 }));
    expect(firstBlock(onChange).attrs!.indentLeft + firstBlock(onChange).attrs!.indentFirstLine).toBeCloseTo(42.52, 1);
    // Right indent: arrows move the marker the way they point (left = more indent).
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Right indent' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentRight).toBe(7.09));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Right indent' }), { key: 'Home' });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentRight).toBeNull());

    // Page margins, in millimetres, kept valid.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Left page margin' }), { key: 'ArrowRight' });
    await waitFor(() => expect(lastSaved(onChange).page.margins.left).toBe(26.4));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Right page margin' }), { key: 'End' });
    await waitFor(() => expect(lastSaved(onChange).page.margins.right).toBe(80));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
  });

  it('drags the left indent marker, snapping to 0.25 cm', async () => {
    const onChange = await open('advanced');
    const left = screen.getByRole('slider', { name: 'Left indent' });
    fireEvent.pointerDown(left, { clientX: 196, pointerId: 1 });
    fireEvent.pointerMove(left, { clientX: 196 + 40, pointerId: 1 }); // 40 px ≈ 1.06 cm → 1 cm
    fireEvent.pointerUp(left, { clientX: 236, pointerId: 1 });
    await waitFor(() => expect(firstBlock(onChange).attrs?.indentLeft).toBe(28.35));
  });
});
