// @vitest-environment jsdom
/**
 * Phase 3 storage hardening on the app side: honest save status when saving stops (storage full, item deleted
 * elsewhere, repeated failures), drafts per editor session, emergency drafts on hide, cross-tab trash and purge,
 * and attachment clean-up scheduling.
 */
import 'fake-indexeddb/auto';
import { IndexedDbAdapter } from '@dcos/local-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMERGENCY_DRAFT_MAX_CHARS,
  canSaveDraftAsNew,
  discardUnsavedDraft,
  emergencyDraftKey,
  emergencyDraftTexts,
  listUnsavedDrafts,
  purgeItems,
  runDailyCleanUp,
  saveUnsavedDraftAsNew,
  scheduleDailyCleanUp,
  storage,
  useEditableItem,
} from './storage';

// A second connection to the same database plays "another window".
const otherWindow = new IndexedDbAdapter();
afterAll(() => otherWindow.close());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const SLOW = { timeout: 4000 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
/** What another tab's list page or editor broadcasts after changing items. */
const announce = (change: { kind?: string; id?: string }) => {
  const tab = new BroadcastChannel('dcos-storage');
  tab.postMessage(change);
  tab.close();
};
const newDoc = (content: unknown = { text: 'v1' }, title = 'Doc') => storage.create('document', { title, content });
const draftsOf = (id: string) => storage.listDrafts({ kind: 'document', itemId: id });

async function openEditor(id: string) {
  const hook = renderHook(() => useEditableItem<{ text: string }>('document', id));
  await waitFor(() => expect(hook.result.current.status).toBe('saved'));
  return hook;
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('B1: saving stops honestly', () => {
  it('storage full: one retry after a short delay, then stops, says why and keeps the edits as a draft', async () => {
    const doc = await newDoc();
    const save = vi.spyOn(storage, 'save').mockRejectedValue(quota());
    const { result } = await openEditor(doc.id);
    act(() => result.current.updateContent({ text: 'typed on a full disk' }));
    await waitFor(() => expect(result.current.status).toBe('error'), SLOW);
    await waitFor(() => expect(result.current.status).toBe('not-saved'), { timeout: 6000 });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.problem).toBe('quota');
    expect(result.current.kept).toBe('kept');
    const kept = await draftsOf(doc.id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ session: result.current.session, content: { text: 'typed on a full disk' } });
    await sleep(2500);
    expect(save).toHaveBeenCalledTimes(2); // stopped: no more automatic attempts

    // 'Try again' once space was freed: saved, the notice clears and the draft this session kept is removed.
    save.mockRestore();
    await act(() => result.current.retry());
    expect(result.current.status).toBe('saved');
    expect(result.current.problem).toBeNull();
    expect(result.current.kept).toBeNull();
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'typed on a full disk' });
    expect(await draftsOf(doc.id)).toEqual([]);
  }, 15_000);

  it("'Try again' that fails again stops at once instead of retrying in the background", async () => {
    const doc = await newDoc();
    const save = vi.spyOn(storage, 'save').mockRejectedValue(quota());
    const { result } = await openEditor(doc.id);
    act(() => result.current.updateContent({ text: 'still full' }));
    await waitFor(() => expect(result.current.status).toBe('not-saved'), { timeout: 6000 });
    await act(() => result.current.retry());
    expect(save).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('not-saved');
    await sleep(2500);
    expect(save).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('storage full and the draft cannot be kept either: says so (never ignored)', async () => {
    const doc = await newDoc();
    vi.spyOn(storage, 'save').mockRejectedValue(quota());
    vi.spyOn(storage, 'saveDraft').mockRejectedValue(quota());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quota();
    });
    const { result } = await openEditor(doc.id);
    act(() => result.current.updateContent({ text: 'nowhere to keep this' }));
    await waitFor(() => expect(result.current.status).toBe('not-saved'), { timeout: 6000 });
    expect(result.current.problem).toBe('quota');
    expect(result.current.kept).toBe('not-kept');
  }, 10_000);

  it('a draft that cannot be kept during a conflict is reported as not kept', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    vi.spyOn(storage, 'saveDraft').mockRejectedValue(new Error('broken'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quota();
    });
    act(() => result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(result.current.status).toBe('conflict'), SLOW);
    await waitFor(() => expect(result.current.kept).toBe('not-kept'));
  });

  it('item deleted in another window: no retry, edits kept, and they can be saved as a new item', async () => {
    const doc = await newDoc({ text: 'v1' }, 'Essay');
    const save = vi.spyOn(storage, 'save');
    const { result } = await openEditor(doc.id);
    await otherWindow.purge('document', doc.id); // no notification: found out by the save
    act(() => {
      result.current.rename('Essay, final');
      result.current.updateContent({ text: 'written after it was deleted' });
    });
    await waitFor(() => expect(result.current.status).toBe('deleted'), SLOW);
    expect(result.current.problem).toBe('deleted');
    await sleep(1500);
    expect(save).toHaveBeenCalledTimes(1);
    // Kept as a draft of the deleted item, so closing the page now would not lose it (Settings lists it).
    expect((await draftsOf(doc.id))[0]).toMatchObject({ content: { text: 'written after it was deleted' } });

    let copyId = '';
    await act(async () => {
      copyId = (await result.current.saveAsNew())!.id;
    });
    const copy = await storage.get('document', copyId);
    expect(copy).toMatchObject({ title: 'Essay, final', content: { text: 'written after it was deleted' } });
    expect(await draftsOf(doc.id)).toEqual([]);
    expect(localStorage.getItem(emergencyDraftKey('document', doc.id))).toBeNull();
  });

  it('Ctrl/⌘+S on an item deleted elsewhere reports it as deleted instead of failing silently', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    await otherWindow.purge('document', doc.id);
    let created = true;
    await act(async () => {
      created = await result.current.saveNow();
    });
    expect(created).toBe(false);
    expect(result.current.status).toBe('deleted');
  });
});

describe('B2: drafts per editor session', () => {
  it('two editors of the same item keep separate drafts; neither replaces the other', async () => {
    const doc = await newDoc();
    const a = await openEditor(doc.id);
    const b = await openEditor(doc.id);
    expect(a.result.current.session).not.toBe(b.result.current.session);
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    act(() => a.result.current.updateContent({ text: 'from A' }));
    act(() => b.result.current.updateContent({ text: 'from B' }));
    await waitFor(() => expect([a.result.current.status, b.result.current.status]).toEqual(['conflict', 'conflict']), SLOW);
    await waitFor(async () => expect(await draftsOf(doc.id)).toHaveLength(2));
    const kept = await draftsOf(doc.id);
    expect(kept.map((d) => (d.content as { text: string }).text).sort()).toEqual(['from A', 'from B']);
    expect(new Set(kept.map((d) => d.session))).toEqual(new Set([a.result.current.session, b.result.current.session]));
  });

  it('offers drafts from other sessions newest first, one at a time; recovering or discarding reveals the next', async () => {
    const doc = await newDoc({ text: 'stored' });
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 'older', baseVersion: doc.version, content: { text: 'older draft' } });
    await sleep(5);
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 'middle', baseVersion: doc.version, content: { text: 'middle draft' } });
    await sleep(5);
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 'newer', baseVersion: doc.version, content: { text: 'newer draft' } });
    const { result } = await openEditor(doc.id);
    await waitFor(() => expect(result.current.draft?.content).toEqual({ text: 'newer draft' }));
    expect(result.current.draftCount).toBe(3);

    await act(() => result.current.discardDraft());
    expect(result.current.draft?.content).toEqual({ text: 'middle draft' });
    expect(result.current.draftCount).toBe(2);
    expect((await draftsOf(doc.id)).map((d) => d.session).sort()).toEqual(['middle', 'older']);

    let outcome: Awaited<ReturnType<typeof result.current.recoverDraft>> = null;
    await act(async () => {
      outcome = await result.current.recoverDraft();
    });
    expect(outcome).toEqual({ appliedTo: 'item', id: doc.id });
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'middle draft' });
    // The last one was made on the old version, so recovering it now makes a copy rather than replacing anything.
    expect(result.current.draft?.content).toEqual({ text: 'older draft' });
    await act(async () => {
      outcome = await result.current.recoverDraft();
    });
    expect(outcome!.appliedTo).toBe('copy');
    expect((await storage.get('document', outcome!.id))?.content).toEqual({ text: 'older draft' });
    expect(result.current.draft).toBeNull();
    expect(await draftsOf(doc.id)).toEqual([]);
  });

  it('a draft still on offer when the item is deleted elsewhere is recovered as a new item, not lost', async () => {
    const doc = await newDoc({ text: 'stored' }, 'Essay');
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 'earlier', baseVersion: doc.version, title: 'Essay', content: { text: 'unsaved words' } });
    const { result } = await openEditor(doc.id);
    await waitFor(() => expect(result.current.draft?.content).toEqual({ text: 'unsaved words' }));
    await otherWindow.purge('document', doc.id); // also removes the stored draft: the offer is the only copy left
    let outcome: Awaited<ReturnType<typeof result.current.recoverDraft>> = null;
    await act(async () => {
      outcome = await result.current.recoverDraft();
    });
    expect(outcome!.appliedTo).toBe('copy');
    const copy = await storage.get('document', outcome!.id);
    expect(copy).toMatchObject({ title: 'Essay (recovered)', content: { text: 'unsaved words' } });
  });

  it('the item still opens when its drafts cannot be read (they stay stored for Settings)', async () => {
    const doc = await newDoc();
    vi.spyOn(storage, 'listDrafts').mockRejectedValue(new Error('drafts unreadable'));
    vi.spyOn(storage, 'getDraft').mockRejectedValue(new Error('drafts unreadable'));
    const { result } = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.item?.id).toBe(doc.id);
    expect(result.current.draft).toBeNull();
  });

  it('a session keeps its draft when another session recovers or discards its own', async () => {
    const doc = await newDoc({ text: 'stored' });
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 'other-tab', baseVersion: doc.version, content: { text: 'other tab' } });
    const { result } = await openEditor(doc.id);
    await waitFor(() => expect(result.current.draft).not.toBeNull());
    await otherWindow.save('document', doc.id, { content: { text: 'theirs' } }, doc.version);
    act(() => result.current.updateContent({ text: 'mine' }));
    await waitFor(() => expect(result.current.status).toBe('conflict'), SLOW);
    await act(() => result.current.discardDraft()); // discards 'other-tab' only
    const left = await draftsOf(doc.id);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ session: result.current.session, content: { text: 'mine' } });
  });
});

describe('B3: emergency drafts when the page is hidden or closed', () => {
  afterEach(() => setVisibility('visible'));

  it('writes pending edits to localStorage synchronously on hide, and removes them once saved', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    act(() => result.current.updateContent({ text: 'typed just before switching apps' }));
    const key = emergencyDraftKey('document', doc.id);
    setVisibility('hidden');
    // Synchronously, before any save could land.
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      baseVersion: doc.version,
      session: result.current.session,
      content: { text: 'typed just before switching apps' },
    });
    await waitFor(async () => expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'typed just before switching apps' }));
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
  });

  it('also on pagehide, including a save that is still in flight', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realSave = storage.save.bind(storage);
    vi.spyOn(storage, 'save').mockImplementation(async (...args: Parameters<typeof storage.save>) => {
      await gate;
      return realSave(...args);
    });
    act(() => result.current.updateContent({ text: 'in flight' }));
    act(() => void result.current.flush());
    await waitFor(() => expect(result.current.status).toBe('saving'));
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(emergencyDraftKey('document', doc.id))!)).toMatchObject({ content: { text: 'in flight' } });
    release();
    await waitFor(() => expect(localStorage.getItem(emergencyDraftKey('document', doc.id))).toBeNull());
  });

  it('skips the localStorage copy safely when the edits are too large, and still saves them', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    const big = { text: 'x'.repeat(EMERGENCY_DRAFT_MAX_CHARS + 1) };
    act(() => result.current.updateContent(big));
    expect(() => setVisibility('hidden')).not.toThrow();
    expect(localStorage.getItem(emergencyDraftKey('document', doc.id))).toBeNull();
    await waitFor(async () => expect((await storage.get('document', doc.id))?.content).toEqual(big), SLOW);
  });

  it('on load, an emergency draft identical to the stored content is removed without asking', async () => {
    const doc = await newDoc({ text: 'same' });
    const key = emergencyDraftKey('document', doc.id);
    localStorage.setItem(key, JSON.stringify({ baseVersion: doc.version, session: 'gone', content: { text: 'same' }, savedAt: new Date().toISOString() }));
    const { result } = await openEditor(doc.id);
    await sleep(100);
    expect(result.current.draft).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(await draftsOf(doc.id)).toEqual([]);
  });

  it('a save does not remove an emergency draft this editor did not write', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    const key = emergencyDraftKey('document', doc.id);
    act(() => result.current.updateContent({ text: 'mine' }));
    setVisibility('hidden');
    setVisibility('visible');
    // Another tab replaced it meanwhile.
    const theirs = JSON.stringify({ baseVersion: doc.version, session: 'other', content: { text: 'other tab' }, savedAt: new Date().toISOString() });
    localStorage.setItem(key, theirs);
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    await sleep(50);
    expect(localStorage.getItem(key)).toBe(theirs);
  });
});

describe('B4: changes made in another tab', () => {
  it('moving the open item to the trash elsewhere shows here, without a version change', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    await otherWindow.trash('document', doc.id);
    announce({ kind: 'document', id: doc.id });
    await waitFor(() => expect(result.current.item?.deletedAt).not.toBeNull());
    expect(result.current.externalRevision).toBe(0);
    await otherWindow.restore('document', doc.id);
    await otherWindow.setFavorite('document', doc.id, true);
    announce({ kind: 'document', id: doc.id });
    await waitFor(() => expect(result.current.item?.deletedAt).toBeNull());
    expect(result.current.item?.favorite).toBe(true);
    act(() => result.current.updateContent({ text: 'still saves' }));
    await waitFor(() => expect(result.current.status).toBe('saved'), SLOW);
    expect((await storage.get('document', doc.id))?.content).toEqual({ text: 'still saves' });
  });

  it('deleting the open item forever elsewhere shows the deleted notice at once', async () => {
    const doc = await newDoc();
    const { result } = await openEditor(doc.id);
    await otherWindow.purge('document', doc.id);
    announce({}); // Empty trash announces "items changed" without an id
    await waitFor(() => expect(result.current.status).toBe('deleted'));
    expect(result.current.problem).toBe('deleted');
  });

  it('a change to another item does not disturb this editor', async () => {
    const doc = await newDoc();
    const other = await newDoc();
    const { result } = await openEditor(doc.id);
    const get = vi.spyOn(storage, 'get');
    await otherWindow.purge('document', other.id);
    announce({ kind: 'document', id: other.id });
    await sleep(100);
    expect(get).not.toHaveBeenCalled();
    expect(result.current.status).toBe('saved');
  });
});

describe('B5: attachment clean-up', () => {
  it('images used only by an emergency draft in localStorage are kept', async () => {
    const image = await storage.putAttachment(new Blob(['emergency-only image']), 'image/png');
    const key = emergencyDraftKey('document', 'some-item');
    localStorage.setItem(key, JSON.stringify({ baseVersion: 1, content: { type: 'doc', attrs: { previewId: image.id } }, savedAt: new Date().toISOString() }));
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(image.id)).toBeDefined();
    localStorage.removeItem(key);
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(image.id)).toBeUndefined();
  });

  it('removes nothing when the emergency drafts in localStorage cannot be read', async () => {
    const { id } = await storage.putAttachment(new Uint8Array([7, 7, 7]).buffer, 'image/png');
    localStorage.setItem(emergencyDraftKey('document', 'x'), JSON.stringify({ baseVersion: 1, content: { previewId: id } }));
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    expect(() => emergencyDraftTexts()).toThrow();
    await expect(storage.cleanUpAttachments({ graceMs: 0 })).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await storage.getAttachment(id)).toBeDefined();
  });

  it('runs once a day: records the time and skips until a day has passed', async () => {
    const cleanUp = vi.spyOn(storage, 'cleanUpAttachments');
    const now = Date.now();
    await storage.setMeta('lastAttachmentCleanUpAt', new Date(now - 25 * 3600_000).toISOString());
    expect(await runDailyCleanUp(now)).toEqual(expect.objectContaining({ removed: expect.any(Number) }));
    expect(cleanUp).toHaveBeenCalledTimes(1);
    expect(Date.parse((await storage.getMeta('lastAttachmentCleanUpAt'))!)).toBeGreaterThanOrEqual(now - 1000);
    expect(await runDailyCleanUp(now + 3600_000)).toBeNull();
    expect(cleanUp).toHaveBeenCalledTimes(1);
    expect(await runDailyCleanUp(now + 25 * 3600_000)).not.toBeNull();
    expect(cleanUp).toHaveBeenCalledTimes(2);
  });

  it('is scheduled after start-up and can be cancelled', async () => {
    const cleanUp = vi.spyOn(storage, 'cleanUpAttachments');
    await storage.setMeta('lastAttachmentCleanUpAt', '');
    scheduleDailyCleanUp(10);
    await waitFor(() => expect(cleanUp).toHaveBeenCalledTimes(1));
    await storage.setMeta('lastAttachmentCleanUpAt', '');
    const cancel = scheduleDailyCleanUp(50);
    cancel();
    await sleep(150);
    expect(cleanUp).toHaveBeenCalledTimes(1);
  });

  it('Empty trash deletes all items in one go, removes their emergency drafts, then cleans up', async () => {
    const a = await newDoc();
    const b = await storage.create('diagram', { title: 'D', content: { nodes: [], edges: [] } });
    const keep = await newDoc();
    await storage.trash('document', a.id);
    await storage.trash('diagram', b.id);
    localStorage.setItem(emergencyDraftKey('document', a.id), JSON.stringify({ baseVersion: 1, content: {}, savedAt: '' }));
    const purgeMany = vi.spyOn(storage, 'purgeMany');
    const cleanUp = vi.spyOn(storage, 'cleanUpAttachments');
    await purgeItems([
      { kind: 'document', id: a.id },
      { kind: 'diagram', id: b.id },
    ]);
    expect(purgeMany).toHaveBeenCalledTimes(1);
    expect(await storage.get('document', a.id)).toBeUndefined();
    expect(await storage.get('diagram', b.id)).toBeUndefined();
    expect(await storage.get('document', keep.id)).toBeDefined();
    expect(localStorage.getItem(emergencyDraftKey('document', a.id))).toBeNull();
    await waitFor(() => expect(cleanUp).toHaveBeenCalledTimes(1));
  });

  it('a failed Empty trash removes nothing and does not clean up', async () => {
    const a = await newDoc();
    await storage.trash('document', a.id);
    vi.spyOn(storage, 'purgeMany').mockRejectedValue(new Error('disk error'));
    const cleanUp = vi.spyOn(storage, 'cleanUpAttachments');
    await expect(purgeItems([{ kind: 'document', id: a.id }])).rejects.toThrow('disk error');
    expect(await storage.get('document', a.id)).toBeDefined();
    await sleep(50);
    expect(cleanUp).not.toHaveBeenCalled();
  });
});

describe('B2: unsaved drafts in Settings', () => {
  it('the same unsaved edits kept both as a draft and in localStorage are listed once', async () => {
    for (const d of await storage.listDrafts()) await storage.deleteDraft(d.kind, d.itemId, d.session);
    const doc = await newDoc({ text: 'stored' }, 'Notes');
    const edits = { title: 'Notes', content: { text: 'same edits' } };
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 's1', baseVersion: doc.version, ...edits });
    localStorage.setItem(emergencyDraftKey('document', doc.id), JSON.stringify({ baseVersion: doc.version, session: 's1', savedAt: new Date().toISOString(), ...edits }));
    const rows = (await listUnsavedDrafts()).filter((d) => d.itemId === doc.id);
    expect(rows).toHaveLength(1);
    // Different edits are different work: both stay listed.
    localStorage.setItem(emergencyDraftKey('document', doc.id), JSON.stringify({ baseVersion: doc.version, savedAt: new Date().toISOString(), title: 'Notes', content: { text: 'newer edits' } }));
    expect((await listUnsavedDrafts()).filter((d) => d.itemId === doc.id)).toHaveLength(2);
  });

  it('lists database and localStorage drafts, including ones whose item was deleted, newest first', async () => {
    for (const d of await storage.listDrafts()) await storage.deleteDraft(d.kind, d.itemId, d.session); // left by earlier tests
    const doc = await newDoc({ text: 'stored' }, 'Lab report');
    const gone = await newDoc({ text: 'gone' }, 'Old essay');
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: 's1', baseVersion: doc.version, content: { text: 'draft of lab report' } });
    // purge() removes the item's drafts; drafts written after that (by editors still open on it) are orphans.
    await storage.purge('document', gone.id);
    await sleep(5);
    await storage.saveDraft({ kind: 'document', itemId: gone.id, session: 's2', baseVersion: gone.version, title: 'Old essay v2', content: { text: 'orphan' } });
    await sleep(5);
    await storage.saveDraft({ kind: 'document', itemId: gone.id, session: 's3', baseVersion: gone.version, title: 'Only a title' });
    await sleep(5);
    localStorage.setItem(
      emergencyDraftKey('diagram', 'never-saved'),
      JSON.stringify({ baseVersion: 1, content: { nodes: [{ id: 'n' }], edges: [] }, savedAt: new Date(Date.now() + 1000).toISOString() }),
    );
    localStorage.setItem('dcos-emergency-draft:unknown-kind:x', '{}');

    const drafts = await listUnsavedDrafts();
    expect(drafts.map((d) => [d.kind, d.itemId, d.session, d.item?.title ?? null])).toEqual([
      ['diagram', 'never-saved', null, null],
      ['document', gone.id, 's3', null],
      ['document', gone.id, 's2', null],
      ['document', doc.id, 's1', 'Lab report'],
    ]);
    const [local, titleOnly, orphan, ofLab] = drafts;
    expect(canSaveDraftAsNew(titleOnly)).toBe(false);
    expect([local, orphan, ofLab].every(canSaveDraftAsNew)).toBe(true);

    const recovered = await saveUnsavedDraftAsNew(orphan);
    expect(recovered).toMatchObject({ title: 'Old essay v2 (recovered)', content: { text: 'orphan' } });
    const fromLocal = await saveUnsavedDraftAsNew(local);
    expect(fromLocal).toMatchObject({ kind: 'diagram', title: 'Untitled (recovered)' });
    expect(localStorage.getItem(emergencyDraftKey('diagram', 'never-saved'))).toBeNull();
    await discardUnsavedDraft(titleOnly);
    expect((await listUnsavedDrafts()).map((d) => d.key)).toEqual([ofLab.key]);
  });
});
