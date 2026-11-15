// @vitest-environment jsdom
/**
 * Phase 7 SHOW in the app: the presenter window's route (#/presentations/presenter/:session, outside the app shell)
 * and the presenter window address the editor page gives presentations.
 */
import 'fake-indexeddb/auto';
import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { createPresentation } from '@dcos/presentation-studio';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { storage } from './lib/storage';
import { MODULES } from './modules';
import { EditorPage } from './pages/EditorPage';
import { presenterUrl } from './pages/PresenterPage';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the presenter window route', () => {
  it('opens outside the app shell and waits for its slide show', async () => {
    window.location.hash = '#/presentations/presenter/session-1';
    render(
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Connecting to the slide show…')).toBeTruthy();
    // No app shell: no sidebar navigation, no editor.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('main', { name: 'Presenter view' })).toBeTruthy();
  });

  it('builds the full address of a session for window.open', () => {
    window.location.hash = '#/presentations/abc';
    expect(presenterUrl('a b')).toBe(`${window.location.href.split('#')[0]}#/presentations/presenter/a%20b`);
  });
});

describe('the editor page', () => {
  it('gives presentations the presenter window address, so the presenter view opens in a second window', async () => {
    const item = await storage.create('presentation', { title: 'Talk', content: createPresentation(), templateId: 'blank' });
    const open = vi.fn(() => null);
    vi.stubGlobal('open', open);
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/presentations/${item.id}`]}>
            <Routes>
              <Route path="/presentations/:id" element={<EditorPage module={MODULES.presentation} />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Slide Show' }));
    const button = within(screen.getByRole('toolbar', { name: 'Slide Show' })).getByRole('button', { name: 'Presenter view' });
    expect(button.getAttribute('title')).toContain('second window');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
    expect((open.mock.calls[0] as unknown as string[])[0]).toMatch(/#\/presentations\/presenter\/[\w-]+$/);
    vi.unstubAllGlobals();
  });
});
