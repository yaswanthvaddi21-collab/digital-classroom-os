// @vitest-environment jsdom
/**
 * Phase 7 CONTENT (ADR 0014): the diagram dialog opened from a presentation keeps its unsaved edits as drafts of that
 * presentation, as a plain record (no document-shaped body), never mistaken for presentation content, never listed
 * for a document, and their pictures are kept by attachment clean-up. Document drafts stay exactly as in Phase 6
 * (diagram-dialog-drafts.test.tsx).
 */
import 'fake-indexeddb/auto';
import { createPresentation } from '@dcos/presentation-studio';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deleteDiagramDialogDraft,
  diagramDialogDraftTexts,
  keepDiagramDialogDraftLocally,
  listDiagramDialogDrafts,
  listUnsavedDrafts,
  newDiagramDialogSession,
  saveDiagramDialogDraft,
  storage,
  useEditableItem,
  type DiagramDialogBase,
} from './storage';

afterEach(() => localStorage.clear());

const SOURCE = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }], edges: [] };
const EDITED = { schemaVersion: 2, nodes: [{ id: 'a', label: 'UNSAVED' }], edges: [] };
const base: DiagramDialogBase = { source: SOURCE, previewId: 'p-old', naturalWidth: 200, naturalHeight: 100, title: 'Flow' };
const newDeck = () => storage.create('presentation', { title: 'Deck', content: createPresentation('blank') });

describe('presentation dialog drafts', () => {
  it('are filed under the presentation as a plain record, listed for it and removed again', async () => {
    const deck = await newDeck();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: deck.id, ownerKind: 'presentation', session: s, base, source: EDITED, title: 'Flow' });
    const stored = await storage.listDrafts({ kind: 'presentation', itemId: deck.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toEqual({ format: 'dcos-diagram-dialog-draft', version: 1, note: expect.any(String), base, source: EDITED, title: 'Flow' });
    // Nothing document-shaped and nothing filed as a document.
    expect(JSON.stringify(stored[0].content)).not.toMatch(/"doc"|"page"/);
    expect(await storage.listDrafts({ kind: 'document', itemId: deck.id })).toEqual([]);
    expect(await listDiagramDialogDrafts(deck.id)).toEqual([]);
    const listed = await listDiagramDialogDrafts(deck.id, 'presentation');
    expect(listed).toEqual([expect.objectContaining({ docId: deck.id, ownerKind: 'presentation', session: s, base, source: EDITED, title: 'Flow' })]);
    await deleteDiagramDialogDraft(deck.id, s, 'presentation');
    expect(await listDiagramDialogDrafts(deck.id, 'presentation')).toEqual([]);
  });

  it('a new diagram has no base; a local copy is keyed by kind and the newer copy wins', async () => {
    const deck = await newDeck();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: deck.id, ownerKind: 'presentation', session: s, base: null, source: SOURCE, title: 'Older' });
    await new Promise((r) => setTimeout(r, 5));
    expect(keepDiagramDialogDraftLocally({ docId: deck.id, ownerKind: 'presentation', session: s, base: null, source: EDITED, title: 'Newer' })).toBe(true);
    expect(Object.keys(localStorage).some((k) => k.startsWith(`dcos-diagram-dialog-draft:presentation:${deck.id}:`))).toBe(true);
    const [d, ...rest] = await listDiagramDialogDrafts(deck.id, 'presentation');
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ base: null, source: EDITED, title: 'Newer' });
    // A document with the same id would not see it.
    expect(await listDiagramDialogDrafts(deck.id)).toEqual([]);
    await deleteDiagramDialogDraft(deck.id, s, 'presentation');
    expect(diagramDialogDraftTexts()).toEqual([]);
  });

  it('ignores damaged presentation drafts instead of offering them', async () => {
    const deck = await newDeck();
    await storage.saveDraft({ kind: 'presentation', itemId: deck.id, session: newDiagramDialogSession(), baseVersion: 0, content: { format: 'dcos-diagram-dialog-draft', version: 2, source: EDITED, title: 'x' } });
    await storage.saveDraft({ kind: 'presentation', itemId: deck.id, session: newDiagramDialogSession(), baseVersion: 0, content: { format: 'dcos-diagram-dialog-draft', version: 1, source: 'nope', title: 'x' } });
    localStorage.setItem(`dcos-diagram-dialog-draft:presentation:${deck.id}:${newDiagramDialogSession()}`, '{not json');
    expect(await listDiagramDialogDrafts(deck.id, 'presentation')).toEqual([]);
  });

  it('the presentation editor neither offers nor deletes them, and Settings does not list them', async () => {
    const deck = await newDeck();
    await saveDiagramDialogDraft({ docId: deck.id, ownerKind: 'presentation', session: newDiagramDialogSession(), base, source: EDITED, title: 'Flow' });
    const hook = renderHook(() => useEditableItem('presentation', deck.id));
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    await act(async () => {});
    expect(hook.result.current.draft).toBeNull();
    expect(hook.result.current.draftCount).toBe(0);
    expect(await listDiagramDialogDrafts(deck.id, 'presentation')).toHaveLength(1);
    expect((await listUnsavedDrafts()).filter((d) => d.itemId === deck.id)).toEqual([]);
    hook.unmount();
  });

  it('attachment clean-up keeps a preview only a presentation dialog draft refers to (database and local copy)', async () => {
    const deck = await newDeck();
    const inDb = await storage.putAttachment(new Blob(['db draft image']), 'image/png');
    const local = await storage.putAttachment(new Blob(['local draft image']), 'image/png');
    const s1 = newDiagramDialogSession();
    const s2 = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: deck.id, ownerKind: 'presentation', session: s1, base: { ...base, previewId: inDb.id }, source: EDITED, title: 'x' });
    keepDiagramDialogDraftLocally({ docId: 'gone-deck', ownerKind: 'presentation', session: s2, base: { ...base, previewId: local.id }, source: EDITED, title: 'y' });
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(inDb.id)).toBeDefined();
    expect(await storage.getAttachment(local.id)).toBeDefined();
    await deleteDiagramDialogDraft(deck.id, s1, 'presentation');
    await deleteDiagramDialogDraft('gone-deck', s2, 'presentation');
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(inDb.id)).toBeUndefined();
    expect(await storage.getAttachment(local.id)).toBeUndefined();
  });
});
