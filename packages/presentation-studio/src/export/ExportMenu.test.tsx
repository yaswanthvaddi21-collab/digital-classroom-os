// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPresentation } from '../create';
import { PresentationEditor } from '../PresentationEditor';
import { kitchenSinkPresentation } from '../testFixtures';
import { richTextFromPlain, type PresentationContent } from '../types';
import { ExportMenu, exportToastText } from './ExportMenu';
import { memoryImageHost, solidPng } from './testing';

const download = vi.hoisted(() => vi.fn());
vi.mock('@dcos/ui', async (original) => ({ ...(await original<typeof import('@dcos/ui')>()), downloadBlob: download }));

beforeEach(() => {
  download.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const titled = (): PresentationContent => {
  const p = createPresentation('blank');
  const el = p.slides[0].elements[0];
  if (el.type === 'text') el.text = richTextFromPlain('Hello export');
  return p;
};

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Export' }));
const item = (name: RegExp) => screen.getByRole('menuitem', { name });

describe('Export menu', () => {
  it('offers PowerPoint, PDF and PDF with speaker notes', () => {
    render(
      <ToastProvider>
        <ExportMenu getContent={titled} title="Talk" />
      </ToastProvider>,
    );
    open();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['PowerPoint (.pptx)', 'PDFone page per slide', 'PDF with speaker notesnotes pages']);
    for (const m of screen.getAllByRole('menuitem')) expect((m as HTMLButtonElement).disabled).toBe(false);
  });

  it('downloads a .pptx named after the presentation and says so', async () => {
    render(
      <ToastProvider>
        <ExportMenu getContent={titled} title="My: talk" />
      </ToastProvider>,
    );
    open();
    await act(async () => fireEvent.click(item(/PowerPoint/)));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toBe('My talk.pptx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Hello export');
    expect((await screen.findByRole('status')).textContent).toContain('Exported PowerPoint (1 slide).');
  });

  it('lists what was approximated in the toast', async () => {
    const imageHost = memoryImageHost({ 'attachment-diagram': solidPng(8, 8) });
    render(
      <ToastProvider>
        <ExportMenu getContent={kitchenSinkPresentation} title="Sink" imageHost={imageHost} />
      </ToastProvider>,
    );
    open();
    await act(async () => fireEvent.click(item(/PowerPoint/)));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toMatch(/Exported PowerPoint \(11 slides\)\. .*not on this device/);
    expect(toast.textContent).toMatch(/1 diagram was written as a picture/);
  });

  it('reports a failed export as an error and enables the menu again', async () => {
    const broken = () => ({ ...titled(), theme: null as never });
    render(
      <ToastProvider>
        <ExportMenu getContent={broken} title="Bad" />
      </ToastProvider>,
    );
    open();
    await act(async () => fireEvent.click(item(/PowerPoint/)));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Export failed: /);
    expect(download).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables what cannot produce a file: everything without slides, PDF when every slide is hidden', () => {
    const empty = () => ({ ...titled(), slides: [] });
    const { unmount } = render(
      <ToastProvider>
        <ExportMenu getContent={empty} title="x" />
      </ToastProvider>,
    );
    open();
    for (const m of screen.getAllByRole('menuitem')) expect((m as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const hidden = () => {
      const p = titled();
      return { ...p, slides: p.slides.map((s) => ({ ...s, hidden: true })) };
    };
    render(
      <ToastProvider>
        <ExportMenu getContent={hidden} title="x" />
      </ToastProvider>,
    );
    open();
    expect(screen.getAllByRole('menuitem').map((m) => (m as HTMLButtonElement).disabled)).toEqual([false, true, true]);
  });

  it('joins the message and notes into one sentence list', () => {
    expect(exportToastText('Exported PDF (2 slides)', [])).toBe('Exported PDF (2 slides).');
    expect(exportToastText('Exported PDF (2 slides)', ['A.', 'B.'])).toBe('Exported PDF (2 slides). A. B.');
  });

  it('is in the editor ribbon and exports the content as it is now', async () => {
    render(
      <ToastProvider>
        <PresentationEditor initialContent={titled()} title="From the editor" onChange={vi.fn()} />
      </ToastProvider>,
    );
    open();
    await act(async () => fireEvent.click(item(/PowerPoint/)));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect((download.mock.calls[0] as [Blob, string])[1]).toBe('From the editor.pptx');
  });
});
