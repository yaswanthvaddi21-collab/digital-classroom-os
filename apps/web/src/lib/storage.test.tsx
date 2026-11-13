// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IndexedDbAdapter } from '@dcos/local-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { storage, useEditableItem } from './storage';

// A second connection to the same database plays "another window".
const otherWindow = new IndexedDbAdapter();
afterAll(() => otherWindow.close());

const SLOW = { timeout: 4000 };

async function newDoc(content: unknown = { text: 'v1' }) {
  return storage.create('document', { title: 'Doc', content });
}

describe('useEditableItem', () => {
  it('loads the item and reports saved', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.item?.id).toBe(doc.id);
  });

  it('reports a missing item', async () => {
    const { result } = renderHook(() => useEditableItem('document', 'no-such-id'));
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });

  it('coalesces rapid edits into one debounced save', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => {
      result.current.updateContent({ text: 'a' });
      result.current.updateContent({ text: 'ab' });
      result.current.updateContent({ text: 'abc' });
    });
    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    const stored = await storage.get('document', doc.id);
    expect(stored?.content).toEqual({ text: 'abc' });
    expect(stored?.version).toBe(doc.version + 1);
  });

  it('does not write when content is unchanged', async () => {
    const doc = await newDoc({ text: 'same' });
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.updateContent({ text: 'same' }));
    expect(result.current.status).toBe('saved');
    await new Promise((r) => setTimeout(r, 800));
    expect((await storage.get('document', doc.id))?.version).toBe(doc.version);
  });

  it('persists renames', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.rename('Renamed'));
    await waitFor(async () => expect((await storage.get('document', doc.id))?.title).toBe('Renamed'), SLOW);
  });

  it('stops on a conflict, keeps the stored version and holds the user edits', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await otherWindow.save('document', doc.id, { content: { text: 'from other window' } }, doc.version);

    act(() => result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(result.current.status).toBe('conflict'), SLOW);
    expect(result.current.conflict?.content).toEqual({ text: 'from other window' });
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'from other window' });

    // Further edits do not write while the conflict is open.
    act(() => result.current.updateContent({ text: 'mine 2' }));
    await new Promise((r) => setTimeout(r, 800));
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'from other window' });
  });

  it('resolves a conflict by saving the edits as a copy', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    act(() => result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(result.current.status).toBe('conflict'), SLOW);

    let copyId = '';
    await act(async () => {
      copyId = (await result.current.resolveConflict('save-copy'))!.id;
    });
    expect((await storage.get('document', copyId))?.content).toEqual({ text: 'mine' });
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'theirs' });
    expect(result.current.status).toBe('saved');
  });

  it('resolves a conflict by loading the latest version', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    act(() => result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(result.current.status).toBe('conflict'), SLOW);
    await act(async () => {
      await result.current.resolveConflict('load-latest');
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.item?.content).toEqual({ text: 'theirs' });
  });

  it('flushes pending edits when the editor unmounts', async () => {
    const doc = await newDoc();
    const { result, unmount } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.updateContent({ text: 'typed then left' }));
    unmount();
    await waitFor(async () => expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'typed then left' }), SLOW);
  });

  it('Ctrl/⌘+S records one version per change and never bumps the item (audit CODE-1)', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.updateContent({ text: 'changed' }));
    let first = false;
    let second = true;
    await act(async () => {
      first = await result.current.saveNow();
      second = await result.current.saveNow();
    });
    expect([first, second]).toEqual([true, false]);
    const versions = await storage.listVersions('document', doc.id);
    expect(versions.map((v) => v.reason).sort()).toEqual(['create', 'manual']);
    expect((await storage.get('document', doc.id))?.version).toBe(doc.version + 1);
  });

  it('starring the item in another window does not cause a conflict (audit CODE-6)', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await otherWindow.setFavorite('document', doc.id, true);
    await otherWindow.trash('document', doc.id);
    await otherWindow.restore('document', doc.id);
    act(() => result.current.updateContent({ text: 'still mine' }));
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'still mine' });
  });

  it('keeps the title the user is typing while saves land (audit CODE-3)', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.rename('My essay '));
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    expect(result.current.title).toBe('My essay ');
    act(() => result.current.rename(''));
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    expect(result.current.title).toBe('');
    await act(async () => {
      await result.current.commitTitle();
    });
    expect(result.current.title).toBe('Untitled');
  });

  it('retries failed writes, then keeps the edits as a draft that can be recovered (audit CODE-2 / STOR-8)', async () => {
    const doc = await newDoc();
    const save = vi.spyOn(storage, 'save').mockRejectedValue(new Error('QuotaExceededError'));
    const first = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(first.result.current.status).toBe('saved'));
    act(() => first.result.current.updateContent({ text: 'not yet saved' }));
    await waitFor(() => expect(first.result.current.status).toBe('error'), SLOW);
    expect(first.result.current.lastError).toMatch(/Quota/);
    first.unmount();
    await waitFor(async () => expect(await storage.getDraft('document', doc.id)).toBeTruthy(), SLOW);
    save.mockRestore();

    const second = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(second.result.current.draft?.content).toEqual({ text: 'not yet saved' }));
    let outcome: Awaited<ReturnType<typeof second.result.current.recoverDraft>> = null;
    await act(async () => {
      outcome = await second.result.current.recoverDraft();
    });
    expect(outcome).toEqual({ appliedTo: 'item', id: doc.id });
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'not yet saved' });
    expect(await storage.getDraft('document', doc.id)).toBeUndefined();
  }, 20_000);

  it('keeps edits made during a conflict as a draft and recovers them as a copy', async () => {
    const doc = await newDoc();
    const first = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(first.result.current.status).toBe('saved'));
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    act(() => first.result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(first.result.current.status).toBe('conflict'), SLOW);
    first.unmount(); // user leaves without choosing

    const second = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(second.result.current.draft).toBeTruthy());
    let outcome: Awaited<ReturnType<typeof second.result.current.recoverDraft>> = null;
    await act(async () => {
      outcome = await second.result.current.recoverDraft();
    });
    expect(outcome!.appliedTo).toBe('copy');
    expect((await storage.get('document', outcome!.id))?.content).toEqual({ text: 'mine' });
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'theirs' });
  });

  it('adopts changes made in another tab when it has nothing unsaved', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await otherWindow.save('document', doc.id, { content: { text: 'edited elsewhere' } }, doc.version);
    const tab = new BroadcastChannel('dcos-storage');
    tab.postMessage({ kind: 'document', id: doc.id });
    await waitFor(() => expect(result.current.item?.content).toEqual({ text: 'edited elsewhere' }));
    expect(result.current.externalRevision).toBe(1);
    tab.close();
    act(() => result.current.updateContent({ text: 'next edit' }));
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
  });

  it('flushes pending edits when the page is hidden', async () => {
    const doc = await newDoc();
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => result.current.updateContent({ text: 'backgrounded' }));
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(async () => expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'backgrounded' }), { timeout: 400 });
  });
});
