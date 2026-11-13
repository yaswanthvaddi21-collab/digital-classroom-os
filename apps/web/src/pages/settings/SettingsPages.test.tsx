// @vitest-environment jsdom
/** Settings → Storage: free up space, unsaved drafts, and failures shown instead of lost (Phase 3, B2/B5/B6). */
import 'fake-indexeddb/auto';
import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { emergencyDraftKey, storage } from '../../lib/storage';
import { StorageSettings } from './SettingsPages';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function Opened() {
  const { id } = useParams();
  return <p>Opened {id}</p>;
}

function renderStorageSettings() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/settings/storage']}>
          <Routes>
            <Route path="/settings/storage" element={<StorageSettings />} />
            <Route path="/documents/:id" element={<Opened />} />
            <Route path="/diagrams/:id" element={<Opened />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function clearDrafts() {
  for (const d of await storage.listDrafts()) await storage.deleteDraft(d.kind, d.itemId, d.session);
}

describe('Settings → Storage: Free up space', () => {
  it('reports what was really removed, or that there was nothing to remove', async () => {
    const cleanUp = vi.spyOn(storage, 'cleanUpAttachments').mockResolvedValueOnce({ removed: 3, freedBytes: 1.2 * 1024 * 1024 }).mockResolvedValueOnce({ removed: 0, freedBytes: 0 });
    renderStorageSettings();
    const button = await screen.findByRole('button', { name: 'Free up space' });
    fireEvent.click(button);
    expect(await screen.findByText('Removed 3 unused images, 1.2 MB')).toBeTruthy();
    fireEvent.click(button);
    expect(await screen.findByText('Nothing to remove')).toBeTruthy();
    expect(cleanUp).toHaveBeenCalledTimes(2);
    expect(await storage.getMeta('lastAttachmentCleanUpAt')).toBeTruthy();
  });

  it('removes an unused image for real', async () => {
    const image = await storage.putAttachment(new Blob(['unused image bytes']), 'image/png');
    const real = storage.cleanUpAttachments.bind(storage);
    vi.spyOn(storage, 'cleanUpAttachments').mockImplementation(() => real({ graceMs: 0 }));
    renderStorageSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Free up space' }));
    expect(await screen.findByText(/^Removed 1 unused image, \d/)).toBeTruthy();
    expect(await storage.getAttachment(image.id)).toBeUndefined();
  });

  it('says so when the clean-up fails', async () => {
    vi.spyOn(storage, 'cleanUpAttachments').mockRejectedValue(new Error('The app was updated in another tab. Reload to keep working.'));
    renderStorageSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Free up space' }));
    expect(await screen.findByText(/Nothing was removed\. The app was updated in another tab/)).toBeTruthy();
  });
});

describe('Settings → Storage: errors are shown, not lost', () => {
  it('storage details that cannot be read show a message', async () => {
    vi.spyOn(storage, 'info').mockRejectedValue(new Error('IndexedDB is not available'));
    renderStorageSettings();
    expect(await screen.findByText(/Storage details could not be read\. IndexedDB is not available/)).toBeTruthy();
  });

  it('a safety copy that cannot be exported or deleted shows a message', async () => {
    vi.spyOn(storage, 'info').mockResolvedValue({ deviceId: 'd', schemaVersion: 2, backend: 'IndexedDB', safetyCopies: ['digital-classroom-os-backup-v1-x'] });
    vi.spyOn(storage, 'exportSafetyCopy').mockRejectedValue(new Error('copy unreadable'));
    vi.spyOn(storage, 'deleteSafetyCopy').mockRejectedValue(new Error('copy in use'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderStorageSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(await screen.findByText('The copy could not be exported. copy unreadable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The copy could not be deleted. copy in use')).toBeTruthy();
  });
});

describe('Settings → Storage: unsaved drafts', () => {
  it('lists every draft, including one of a deleted item and one kept in localStorage', async () => {
    await clearDrafts();
    const doc = await storage.create('document', { title: 'Lab report', content: { text: 'stored' } });
    const gone = await storage.create('document', { title: 'Old essay', content: { text: 'gone' } });
    await storage.purge('document', gone.id);
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 's1', baseVersion: doc.version, content: { text: 'draft' } });
    await storage.saveDraft({ kind: 'document', itemId: gone.id, session: 's2', baseVersion: 1, title: 'Old essay', content: { text: 'orphan' } });
    localStorage.setItem(emergencyDraftKey('diagram', 'never-saved'), JSON.stringify({ baseVersion: 1, content: { nodes: [], edges: [] }, savedAt: new Date().toISOString() }));
    renderStorageSettings();
    const region = await screen.findByRole('region', { name: 'Unsaved drafts' });
    await waitFor(() => expect(within(region).getAllByRole('listitem')).toHaveLength(3));
    const lab = within(region).getByRole('listitem', { name: 'Unsaved draft: Lab report' });
    expect(within(lab).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(`/documents/${doc.id}`);
    const deleted = within(region).getAllByRole('listitem', { name: 'Unsaved draft: Deleted item' });
    expect(deleted).toHaveLength(2);
    for (const row of deleted) {
      expect(row.textContent).toContain('deleted item');
      expect(within(row).queryByRole('link', { name: 'Open' })).toBeNull();
    }
  });

  it('saves a draft of a deleted item as a new document and opens it', async () => {
    await clearDrafts();
    const gone = await storage.create('document', { title: 'Old essay', content: { text: 'gone' } });
    await storage.purge('document', gone.id);
    await storage.saveDraft({ kind: 'document', itemId: gone.id, session: 's2', baseVersion: 1, title: 'Old essay', content: { text: 'orphan' } });
    renderStorageSettings();
    const row = await screen.findByRole('listitem', { name: 'Unsaved draft: Deleted item' });
    fireEvent.click(within(row).getByRole('button', { name: 'Save as a new document' }));
    const opened = await screen.findByText(/^Opened /);
    const id = opened.textContent!.replace('Opened ', '');
    expect(await storage.get('document', id)).toMatchObject({ title: 'Old essay (recovered)', content: { text: 'orphan' } });
    expect(await storage.listDrafts()).toEqual([]);
  });

  it('discards a draft only after confirmation', async () => {
    await clearDrafts();
    const doc = await storage.create('document', { title: 'Notes', content: { text: 'stored' } });
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 's1', baseVersion: doc.version, content: { text: 'draft' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderStorageSettings();
    const row = await screen.findByRole('listitem', { name: 'Unsaved draft: Notes' });
    fireEvent.click(within(row).getByRole('button', { name: 'Discard' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await storage.listDrafts()).toHaveLength(1);
    fireEvent.click(within(row).getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('No unsaved drafts on this device.')).toBeTruthy();
    expect(await storage.listDrafts()).toEqual([]);
  });
});
