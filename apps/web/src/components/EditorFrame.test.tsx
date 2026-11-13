// @vitest-environment jsdom
/** The editor's save status and the notices shown when saving stops (Phase 3, B1/B2/B6). */
import 'fake-indexeddb/auto';
import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { storage } from '../lib/storage';
import { MODULES } from '../modules';
import { EditorFrame, VersionHistory } from './EditorFrame';

afterEach(() => {
  vi.restoreAllMocks();
});
beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

type Props = ComponentProps<typeof EditorFrame>;

function renderFrame(overrides: Partial<Props> = {}) {
  const props: Props = {
    module: MODULES.document,
    id: 'doc-1',
    title: 'Essay',
    status: 'saved',
    lastError: null,
    trashed: false,
    hasDraft: false,
    onRename: () => undefined,
    onTitleBlur: () => undefined,
    onBeforeRestore: async () => undefined,
    onRestored: () => undefined,
    hasConflict: false,
    onResolveConflict: async () => null,
    onRecoverDraft: async () => null,
    onDiscardDraft: async () => undefined,
    children: <p>editor body</p>,
    ...overrides,
  };
  return render(
    <ThemeProvider>
      <ToastProvider>
      <MemoryRouter initialEntries={['/documents/doc-1']}>
        <Routes>
          <Route path="/documents/:id" element={<EditorFrame {...props} />} />
          <Route path="/settings/storage" element={<p>Storage settings page</p>} />
        </Routes>
      </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('EditorFrame save problems', () => {
  it('storage full with the edits kept: says so, offers Try again and Free up space', async () => {
    const onRetry = vi.fn(async () => undefined);
    renderFrame({ status: 'not-saved', problem: 'quota', kept: 'kept', onRetry, lastError: 'The quota has been exceeded.' });
    const notice = screen.getByRole('alert');
    expect(notice.textContent).toContain('This device is out of storage space');
    expect(notice.textContent).toContain('kept as a draft on this device');
    expect(screen.getByRole('status', { name: 'Not saved' })).toBeTruthy();
    expect(screen.queryByText(/retrying/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Free up space' }));
    expect(await screen.findByText('Storage settings page')).toBeTruthy();
  });

  it('storage full and the edits could not be kept: Free up space opens a new tab, so this page and its edits stay', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      renderFrame({ status: 'not-saved', problem: 'quota', kept: 'not-kept' });
      fireEvent.click(screen.getByRole('button', { name: 'Free up space (new tab)' }));
      expect(open).toHaveBeenCalledWith('#/settings/storage', '_blank', 'noopener');
      expect(screen.queryByText('Storage settings page')).toBeNull();
      expect(screen.getByRole('alert')).toBeTruthy();
    } finally {
      open.mockRestore();
    }
  });

  it('storage full and the edits could not be kept: tells the user to copy them', () => {
    renderFrame({ status: 'not-saved', problem: 'quota', kept: 'not-kept' });
    expect(screen.getByRole('alert').textContent).toContain('could not be kept as a draft either. Copy anything you need');
  });

  it('deleted in another window: edits kept, Save as a new document opens the copy', async () => {
    const onSaveAsNew = vi.fn(async () => ({ id: 'copy-1' }));
    render(
      <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/documents/doc-1']}>
          <Routes>
            <Route
              path="/documents/doc-1"
              element={
                <EditorFrame
                  module={MODULES.document}
                  id="doc-1"
                  title="Essay"
                  status="deleted"
                  lastError={null}
                  trashed={false}
                  hasDraft={false}
                  onRename={() => undefined}
                  onTitleBlur={() => undefined}
                  onBeforeRestore={async () => undefined}
                  onRestored={() => undefined}
                  hasConflict={false}
                  onResolveConflict={async () => null}
                  onRecoverDraft={async () => null}
                  onDiscardDraft={async () => undefined}
                  problem="deleted"
                  kept="kept"
                  onSaveAsNew={onSaveAsNew}
                >
                  <p>editor body</p>
                </EditorFrame>
              }
            />
            <Route path="/documents/copy-1" element={<p>The new copy</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain('This document was deleted in another window. Your edits are still here.');
    expect(screen.getByRole('status', { name: 'Not saved' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save as a new document' }));
    expect(await screen.findByText('The new copy')).toBeTruthy();
    expect(onSaveAsNew).toHaveBeenCalledTimes(1);
  });

  it('other failures after retries: Not saved and Try again, no promise of retrying', () => {
    renderFrame({ status: 'not-saved', problem: 'failed', kept: 'kept', onRetry: async () => undefined });
    expect(screen.getByRole('alert').textContent).toMatch(/^Not saved\./);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(/retrying/i)).toBeNull();
  });

  it('while a retry is still scheduled, the status says so', () => {
    renderFrame({ status: 'error' });
    expect(screen.getByText('Not saved — retrying.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('edits that could not be kept are reported even without a save problem (e.g. during a conflict)', () => {
    renderFrame({ status: 'conflict', hasConflict: true, kept: 'not-kept' });
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('could not be kept on this device');
  });

  it('several drafts from other sessions: says how many, newest first', () => {
    renderFrame({ hasDraft: true, draftCount: 3 });
    expect(screen.getByRole('alert').textContent).toContain('Changes from 3 earlier sessions were not saved. Showing the newest first.');
  });
});

describe('VersionHistory', () => {
  it('shows a message instead of loading forever when the list cannot be read', async () => {
    vi.spyOn(storage, 'listVersions').mockRejectedValue(new Error('The database is not available.'));
    render(
      <ToastProvider>
        <VersionHistory module={MODULES.document} id="doc-1" onClose={() => undefined} onBeforeRestore={async () => undefined} onRestored={() => undefined} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/Version history could not be loaded\. The database is not available\./)).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
