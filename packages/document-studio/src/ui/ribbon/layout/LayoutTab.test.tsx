// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../../DocumentEditor';
import { createEmptyDocument, DEFAULT_PAGE, type DocumentContent, type PageSettings } from '../../../types';

const p = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (page: Partial<PageSettings> = {}, content: JSONContent[] = [p('Hello world')]) => ({
  ...createEmptyDocument(),
  mode: 'advanced' as const,
  page: { ...DEFAULT_PAGE, ...page },
  doc: { type: 'doc', content },
});
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent;

async function open(content = doc()) {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <DocumentEditor initialContent={content} title="T" onChange={onChange} />
    </ToastProvider>,
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Layout' }));
  return { onChange, panel: within(screen.getByRole('tabpanel')) };
}
const dialog = () => within(screen.getByRole('dialog'));

beforeEach(() => {
  document.elementFromPoint ??= () => null;
  // jsdom has no layout: ProseMirror scrolls the cursor into view after inserting a break.
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= rect;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('Layout tab', () => {
  it('has paper size, orientation, columns, breaks, header and footer, page numbers and section controls', async () => {
    const { panel } = await open();
    expect(panel.getByRole('combobox', { name: 'Paper size' })).toBeTruthy();
    expect(panel.getByRole('combobox', { name: 'Orientation' })).toBeTruthy();
    expect(panel.getByRole('combobox', { name: 'Columns' })).toBeTruthy();
    for (const name of ['Breaks', 'Header & footer', 'Page numbers', 'Section 1 settings', 'How layout prints']) expect(panel.getByRole('button', { name })).toBeTruthy();
    expect(panel.getByText('Section 1 of 1')).toBeTruthy();
    expect(panel.getByText('A4, portrait')).toBeTruthy();
    const sizes = Array.from(panel.getByRole<HTMLSelectElement>('combobox', { name: 'Paper size' }).options).map((o) => o.value);
    expect(sizes).toEqual(['A3', 'A4', 'A5', 'Letter', 'Legal']);
  });

  it('paper size, orientation and columns save with the document (schema 2 for anything v0.1.0 lacks)', async () => {
    const { onChange, panel } = await open();
    fireEvent.change(panel.getByRole('combobox', { name: 'Paper size' }), { target: { value: 'A5' } });
    await waitFor(() => expect(lastSaved(onChange).page.size).toBe('A5'));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    fireEvent.change(panel.getByRole('combobox', { name: 'Orientation' }), { target: { value: 'landscape' } });
    await waitFor(() => expect(lastSaved(onChange).page.orientation).toBe('landscape'));
    fireEvent.change(panel.getByRole('combobox', { name: 'Columns' }), { target: { value: '2' } });
    await waitFor(() => expect(lastSaved(onChange).page.columns).toBe(2));
    expect(panel.getByText('A5, landscape')).toBeTruthy();
  });

  it('refuses an orientation the margins do not fit (A5 with 70 mm top and bottom margins cannot turn landscape)', async () => {
    const page = { size: 'A5' as const, margins: { top: 70, bottom: 70, left: 20, right: 20 } };
    const { onChange, panel } = await open(doc(page));
    const orientation = panel.getByRole<HTMLSelectElement>('combobox', { name: 'Orientation' });
    const landscape = Array.from(orientation.options).find((o) => o.value === 'landscape')!;
    expect(landscape.disabled).toBe(true);
    expect(landscape.textContent).toMatch(/margins too wide/);
    // Even if the change arrives (e.g. by a script or a stale control), nothing is saved.
    fireEvent.change(orientation, { target: { value: 'landscape' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange.mock.calls.some(([c]) => (c as DocumentContent).page.orientation === 'landscape')).toBe(false);
    // The Section settings dialog refuses it too.
    fireEvent.click(panel.getByRole('button', { name: 'Section 1 settings' }));
    const sectionOrientation = Array.from(dialog().getByLabelText<HTMLSelectElement>('Orientation').options).find((o) => o.value === 'landscape')!;
    expect(sectionOrientation.disabled).toBe(true);
  });

  it('refuses a paper size the margins do not fit, and columns too narrow for text', async () => {
    const { panel } = await open(doc({ margins: { top: 25.4, bottom: 25.4, left: 65, right: 65 } }));
    const size = panel.getByRole<HTMLSelectElement>('combobox', { name: 'Paper size' });
    const a5 = Array.from(size.options).find((o) => o.value === 'A5')!;
    expect(a5.disabled).toBe(true);
    expect(a5.textContent).toMatch(/margins too wide/);
    const columns = Array.from(panel.getByRole<HTMLSelectElement>('combobox', { name: 'Columns' }).options);
    // A4 text width 80 mm: three columns 12.7 mm apart would be 18.2 mm wide.
    expect(columns.map((o) => o.disabled)).toEqual([false, false, true]);
  });

  it('Page setup refuses margins that leave no room for text on the smaller papers', async () => {
    const { onChange, panel } = await open();
    fireEvent.click(panel.getByRole('button', { name: /page setup/i }));
    fireEvent.change(dialog().getByRole('combobox', { name: 'Paper size' }), { target: { value: 'A5' } });
    const [, , left, right] = dialog().getAllByRole('spinbutton');
    fireEvent.change(left, { target: { value: '70' } });
    fireEvent.change(right, { target: { value: '70' } });
    expect((dialog().getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().getByRole('alert').textContent).toMatch(/no room for text/);
    fireEvent.change(right, { target: { value: '20' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(lastSaved(onChange).page).toMatchObject({ size: 'A5', margins: { left: 70, right: 20 } }));
  });

  describe('every section keeps room for text (not only the first)', () => {
    const brk = (attrs: Record<string, unknown>): JSONContent => ({ type: 'sectionBreak', attrs: { breakType: 'nextPage', ...attrs } });
    const twoSections = (page: Partial<PageSettings>, attrs: Record<string, unknown>) => doc(page, [p('Portrait part'), brk(attrs), p('Second part')]);

    it('Page setup refuses margins that fit the portrait first section but not a later landscape one', async () => {
      const { onChange, panel } = await open(twoSections({ size: 'A5' }, { orientation: 'landscape' }));
      fireEvent.click(panel.getByRole('button', { name: /page setup/i }));
      const [top, bottom] = dialog().getAllByRole('spinbutton');
      // A5 portrait keeps 210 - 140 = 70 mm of height; section 2 (landscape) would keep 148 - 140 = 8 mm.
      fireEvent.change(top, { target: { value: '70' } });
      fireEvent.change(bottom, { target: { value: '70' } });
      expect((dialog().getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
      expect(dialog().getByRole('alert').textContent).toMatch(/section 2 \(landscape\)/i);
      fireEvent.change(bottom, { target: { value: '40' } });
      fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(lastSaved(onChange).page.margins).toMatchObject({ top: 70, bottom: 40 }));
    });

    it('the Paper size select refuses a size that leaves a later landscape section no room', async () => {
      const { panel } = await open(twoSections({ margins: { top: 70, bottom: 70, left: 25.4, right: 25.4 } }, { orientation: 'landscape' }));
      const size = panel.getByRole<HTMLSelectElement>('combobox', { name: 'Paper size' });
      const a5 = Array.from(size.options).find((o) => o.value === 'A5')!;
      // Portrait A5 would be fine (70 mm high); landscape A5 would keep 8 mm.
      expect(a5.disabled).toBe(true);
      expect(a5.title).toMatch(/section 2/i);
    });

    it('the Paper size select refuses a size that makes a later section\'s columns too narrow', async () => {
      const { onChange, panel } = await open(twoSections({}, { columns: 3 }));
      const size = panel.getByRole<HTMLSelectElement>('combobox', { name: 'Paper size' });
      // A4: three columns of 44.6 mm. A5: (97.2 - 25.4) / 3 = 23.9 mm, below the 25 mm minimum.
      const a5 = Array.from(size.options).find((o) => o.value === 'A5')!;
      expect(a5.disabled).toBe(true);
      expect(a5.textContent).toMatch(/too narrow/);
      // A forced change is refused too.
      fireEvent.change(size, { target: { value: 'A5' } });
      await new Promise((r) => setTimeout(r, 50));
      expect(onChange.mock.calls.some(([c]) => (c as DocumentContent).page.size === 'A5')).toBe(false);
    });
  });

  it('inserts a section break; orientation and columns then apply to the new section only', async () => {
    const { onChange, panel } = await open();
    const body = await screen.findByRole('textbox', { name: 'Document body' });
    body.focus();
    fireEvent.click(panel.getByRole('button', { name: 'Breaks' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Section break (next page)' }));
    await waitFor(() => expect(lastSaved(onChange).doc.content!.map((n) => n.type)).toContain('sectionBreak'));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    expect(panel.getByText('Section 2 of 2')).toBeTruthy();
    expect(body.querySelector('[data-type="section-break"]')!.getAttribute('data-label')).toBe('Section break — section 2: Next page');
    fireEvent.change(panel.getByRole('combobox', { name: 'Orientation (section 2)' }), { target: { value: 'landscape' } });
    fireEvent.change(panel.getByRole('combobox', { name: 'Columns (section 2)' }), { target: { value: '2' } });
    await waitFor(() => expect(lastSaved(onChange).doc.content!.find((n) => n.type === 'sectionBreak')!.attrs).toMatchObject({ orientation: 'landscape', columns: 2 }));
    expect(lastSaved(onChange).page.orientation).toBe('portrait');
    expect(lastSaved(onChange).page.columns).toBe(1);
  });

  it('the Section dialog restarts numbering, changes the break type and removes the break', async () => {
    const { onChange, panel } = await open();
    (await screen.findByRole('textbox', { name: 'Document body' })).focus();
    fireEvent.click(panel.getByRole('button', { name: 'Breaks' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Section break (next page)' }));
    await waitFor(() => expect(panel.getByText('Section 2 of 2')).toBeTruthy());
    fireEvent.click(panel.getByRole('button', { name: 'Section 2 settings' }));
    fireEvent.click(dialog().getByRole('radio', { name: 'Restart' }));
    fireEvent.change(dialog().getByRole('spinbutton', { name: 'Restart at' }), { target: { value: '1' } });
    fireEvent.change(dialog().getByRole('combobox', { name: 'Number format' }), { target: { value: 'lowerRoman' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    const saved = () => lastSaved(onChange).doc.content!.find((n) => n.type === 'sectionBreak')?.attrs;
    await waitFor(() => expect(saved()).toMatchObject({ breakType: 'nextPage', numberStart: 1, numberFormat: 'lowerRoman', orientation: null }));

    // A continuous section keeps orientation and numbering from the section before.
    fireEvent.click(panel.getByRole('button', { name: 'Section 2 settings' }));
    fireEvent.change(dialog().getByRole('combobox', { name: 'Section starts' }), { target: { value: 'continuous' } });
    expect((dialog().getByRole('combobox', { name: 'Orientation' }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(saved()).toMatchObject({ breakType: 'continuous', numberStart: null, numberFormat: null }));
    expect(panel.getByRole<HTMLSelectElement>('combobox', { name: 'Orientation (section 2)' }).disabled).toBe(true);

    fireEvent.click(panel.getByRole('button', { name: 'Section 2 settings' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Remove section break' }));
    await waitFor(() => expect(lastSaved(onChange).doc.content!.some((n) => n.type === 'sectionBreak')).toBe(false));
    expect(panel.getByText('Section 1 of 1')).toBeTruthy();
  });

  it('header and footer: three parts each and a different first page, previewed on the page', async () => {
    const { onChange, panel } = await open();
    fireEvent.click(panel.getByRole('button', { name: 'Header & footer' }));
    fireEvent.change(dialog().getByRole('textbox', { name: 'Header: left' }), { target: { value: 'Physics' } });
    fireEvent.change(dialog().getByRole('textbox', { name: 'Header: right' }), { target: { value: 'Asha R.' } });
    fireEvent.change(dialog().getByRole('textbox', { name: 'Footer: left' }), { target: { value: 'Draft' } });
    fireEvent.click(dialog().getByRole('checkbox', { name: 'Different first page' }));
    fireEvent.change(dialog().getByRole('textbox', { name: 'First page header: centre' }), { target: { value: 'Cover' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(lastSaved(onChange).page).toMatchObject({ headerLeft: 'Physics', headerRight: 'Asha R.', footerLeft: 'Draft', firstPage: { header: { left: '', center: 'Cover', right: '' }, pageNumbers: false } }));
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    // The top of the sheet is the first page: it shows the first page's header; the footer shows its three parts.
    expect(document.querySelector('.dcos-paper-header')!.textContent).toBe('Cover');
    const footer = document.querySelector('.dcos-paper-footer')!;
    expect(Array.from(footer.children).map((c) => c.textContent)).toEqual(['Draft', 'Page # of #', '']);
  });

  it('the first-page number option is unavailable (and says why) while page numbers are off', async () => {
    const { panel } = await open(doc({ pageNumbers: false }));
    fireEvent.click(panel.getByRole('button', { name: 'Header & footer' }));
    fireEvent.click(dialog().getByRole('checkbox', { name: 'Different first page' }));
    const box = dialog().getByRole<HTMLInputElement>('checkbox', { name: 'Show the page number on the first page' });
    expect(box.disabled).toBe(true);
    expect(dialog().getByText(/Page numbers are off/)).toBeTruthy();
  });

  it('page numbers: position, wording, format and first number; an invalid number cannot be applied', async () => {
    const { onChange, panel } = await open();
    fireEvent.click(panel.getByRole('button', { name: 'Page numbers' }));
    fireEvent.change(dialog().getByRole('combobox', { name: 'Position' }), { target: { value: 'right' } });
    fireEvent.change(dialog().getByRole('combobox', { name: 'Text' }), { target: { value: 'number' } });
    fireEvent.change(dialog().getByRole('combobox', { name: 'Number format' }), { target: { value: 'upperRoman' } });
    const start = dialog().getByRole('spinbutton', { name: 'Start at' });
    fireEvent.change(start, { target: { value: '2.5' } });
    expect((dialog().getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().getByRole('alert').textContent).toMatch(/whole number/);
    fireEvent.change(start, { target: { value: '3' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(lastSaved(onChange).page).toMatchObject({ pageNumbers: true, pageNumberAlign: 'right', pageNumberText: 'number', pageNumberFormat: 'upperRoman', pageNumberStart: 3 }));
    expect(Array.from(document.querySelector('.dcos-paper-footer')!.children).map((c) => c.textContent)).toEqual(['', '', '#']);
  });

  it('a document with the default layout still saves as schema 1 and shows the v0.1.0 header and footer', async () => {
    const { onChange, panel } = await open(doc({ header: 'Lab', footer: 'Name' }));
    expect(document.querySelector('.dcos-paper-header')!.textContent).toBe('Lab');
    expect(document.querySelector('.dcos-paper-footer')!.textContent).toBe('Name   ·   Page # of #');
    // Applying the page number and header dialogs without changes saves the page again, still as schema 1.
    fireEvent.click(panel.getByRole('button', { name: 'Page numbers' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    fireEvent.click(panel.getByRole('button', { name: 'Header & footer' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lastSaved(onChange).page).toMatchObject({ header: 'Lab', footer: 'Name', firstPage: null, pageNumberFormat: 'decimal' });
    expect(lastSaved(onChange).schemaVersion).toBe(1);
  });
});
