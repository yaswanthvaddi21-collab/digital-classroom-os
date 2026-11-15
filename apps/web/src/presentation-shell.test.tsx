// @vitest-environment jsdom
/**
 * Phase 7 (ADR 0014): presentations in the app shell. The module registry, sidebar, Dashboard (counts, New, quick
 * start), the New dialog and the editor page all know the third kind, and nothing is shown that does not work.
 */
import 'fake-indexeddb/auto';
import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { createPresentation, type ImageElement, type PresentationContent } from '@dcos/presentation-studio';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyStorageChanged, storage } from './lib/storage';
import { MODULE_LIST, MODULES } from './modules';
import { NAV, titleFor } from './navigation';
import { Dashboard, QUICK_START, storedSentence } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
beforeEach(async () => {
  localStorage.clear();
  const all = [...(await storage.listAll()), ...(await storage.listAll({ trashed: true }))];
  await storage.purgeMany(all.map((i) => ({ kind: i.kind, id: i.id })));
  notifyStorageChanged();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function At() {
  return <output data-testid="at">{useLocation().pathname}</output>;
}

function renderApp(path: string) {
  return render(
    <ThemeProvider>
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {MODULE_LIST.map((m) => (
            <Route key={m.kind} path={`/${m.route}/:id`} element={<><EditorPage module={m} /><At /></>} />
          ))}
        </Routes>
      </MemoryRouter>
    </ToastProvider>
    </ThemeProvider>,
  );
}

describe('the presentation module', () => {
  it('is registered with its own frozen route, label, icon and templates', () => {
    expect(MODULES.presentation).toMatchObject({ kind: 'presentation', route: 'presentations', label: 'Presentation', plural: 'Presentations' });
    expect(MODULES.presentation.templates.map((t) => t.id)).toContain('blank');
    expect(MODULE_LIST.map((m) => m.route)).toEqual(['documents', 'diagrams', 'presentations']);
  });

  it('has a sidebar entry and a page title', () => {
    const workspace = NAV.find((s) => s.title === 'Workspace')!;
    expect(workspace.items.map((i) => i.label)).toEqual(['Dashboard', 'Documents', 'Diagrams', 'Presentations']);
    expect(titleFor('/presentations')).toBe('Presentations');
  });

  it('every quick start entry has a unique label and a template that exists', () => {
    expect(new Set(QUICK_START.map((q) => q.label)).size).toBe(QUICK_START.length);
    for (const q of QUICK_START) expect(MODULES[q.kind].templates.some((t) => t.id === q.template)).toBe(true);
    expect(QUICK_START.some((q) => q.kind === 'presentation')).toBe(true);
  });

  it('the stored sentence names every kind', () => {
    expect(storedSentence({ document: 1, diagram: 0, presentation: 2 })).toBe('1 document, 0 diagrams and 2 presentations.');
  });
});

describe('Dashboard with presentations', () => {
  it('counts presentations and lists them with the others', async () => {
    await storage.create('presentation', { title: 'Lecture 1', content: createPresentation(), templateId: 'blank' });
    await storage.create('document', { title: 'Essay', content: { schemaVersion: 1, doc: { type: 'doc', content: [] } }, templateId: null });
    renderApp('/');
    expect(await screen.findByText('1 document, 0 diagrams and 1 presentation.')).toBeTruthy();
    expect(screen.getByText('Lecture 1')).toBeTruthy();
  });

  it('“New presentation” opens the New dialog; its template creates “Untitled presentation” and opens it', async () => {
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'New presentation' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New presentation' })).toBeTruthy();
    // No import card for presentations: there is no presentation import.
    expect(within(dialog).queryByText('Import a file')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /Blank presentation/ }));
    await waitFor(() => expect(screen.getByTestId('at').textContent).toMatch(/^\/presentations\/[0-9a-f-]{36}$/));
    const [item] = await storage.list('presentation');
    expect(item).toMatchObject({ title: 'Untitled presentation', templateId: 'blank' });
    expect(await screen.findByRole('listbox', { name: 'Slides' })).toBeTruthy();
  });

  it('the quick start entry creates a presentation', async () => {
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Blank presentation' }));
    await waitFor(() => expect(screen.getByTestId('at').textContent).toMatch(/^\/presentations\//));
    expect(await storage.list('presentation')).toHaveLength(1);
  });

  it('says the files could not be read instead of showing an empty dashboard', async () => {
    vi.spyOn(storage, 'listAll').mockRejectedValue(new Error('VersionError: newer data'));
    renderApp('/');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Your files could not be read/);
    expect(alert.textContent).toMatch(/Nothing has been changed or removed/);
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(screen.queryByText(/Stored on this device/)).toBeNull();
  });
});

describe('opening a presentation', () => {
  it('shows its slides, with pictures loaded from the attachments store through the image host', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const picture = await storage.putAttachment(png.buffer, 'image/png');
    const content: PresentationContent = createPresentation();
    const image: ImageElement = { id: 'img', type: 'image', x: 10, y: 10, w: 100, h: 80, rotation: 0, attachmentId: picture.id, mimeType: 'image/png', naturalWidth: 100, naturalHeight: 80, fit: 'contain', alt: 'Stored picture' };
    content.slides[0].elements.push(image);
    const item = await storage.create('presentation', { title: 'With picture', content, templateId: null });
    renderApp(`/presentations/${item.id}`);
    expect(await screen.findByRole('listbox', { name: 'Slides' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByAltText('Stored picture').length).toBeGreaterThan(0));
    // Opening it never changes it (Round 1 is read-only).
    await new Promise((r) => setTimeout(r, 700));
    expect((await storage.get('presentation', item.id))?.version).toBe(1);
  });
});
