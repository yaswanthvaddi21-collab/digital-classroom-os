// @vitest-environment jsdom
/**
 * Phase 6 (DIALOG): unsaved edits in the diagram dialog are kept as drafts of their document, never mistaken for
 * document content, offered again after a reload, and put back into the document without losing anything.
 */
import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRecoveredDiagram } from './diagramRecovery';
import {
  deleteDiagramDialogDraft,
  diagramDialogDraftTexts,
  holdDiagramDialogSession,
  keepDiagramDialogDraftLocally,
  listDiagramDialogDrafts,
  listUnsavedDrafts,
  newDiagramDialogSession,
  saveDiagramDialogDraft,
  storage,
  useEditableItem,
  type DiagramDialogBase,
  DIAGRAM_DIALOG_DRAFT_NOTE,
} from './storage';
import { contentSchemaFor, migrateDocument } from '@dcos/document-studio';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete (navigator as { locks?: unknown }).locks;
});

const SOURCE = { schemaVersion: 2, nodes: [{ id: 'old', label: 'Old' }], edges: [] };
const EDITED = { schemaVersion: 2, nodes: [{ id: 'old', label: 'UNSAVED-EDIT' }], edges: [] };
const base: DiagramDialogBase = { source: SOURCE, previewId: 'p-old', naturalWidth: 200, naturalHeight: 100, title: 'Flow' };
const diagramNode = (attrs: Record<string, unknown> = {}) => ({
  type: 'diagram',
  attrs: { source: SOURCE, previewId: 'p-old', naturalWidth: 200, naturalHeight: 100, width: 300, height: 150, title: 'Flow', ...attrs },
});
const docContent = (blocks: unknown[]) => ({
  schemaVersion: 2,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, ...blocks] },
  page: { size: 'A4', orientation: 'portrait', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  mode: 'simple',
});
const newDoc = (content: unknown = docContent([diagramNode()])) => storage.create('document', { title: 'Doc', content });

/** A minimal Web Locks stand-in that remembers which names are held. */
function fakeLocks() {
  const held = new Set<string>();
  (navigator as { locks?: unknown }).locks = {
    request: (name: string, cb: () => Promise<void>) => {
      held.add(name);
      return cb().finally(() => held.delete(name));
    },
    query: async () => ({ held: Array.from(held, (name) => ({ name })), pending: [] }),
  };
  return held;
}

describe('dialog drafts in storage', () => {
  it('are kept per dialog session, listed newest first and removed again', async () => {
    const doc = await newDoc();
    const a = newDiagramDialogSession();
    const b = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: a, base, source: EDITED, title: 'Flow A' });
    await new Promise((r) => setTimeout(r, 5));
    await saveDiagramDialogDraft({ docId: doc.id, session: b, base: null, source: EDITED, title: 'New B' });
    const listed = await listDiagramDialogDrafts(doc.id);
    expect(listed.map((d) => d.title)).toEqual(['New B', 'Flow A']);
    expect(listed[1]).toMatchObject({ docId: doc.id, session: a, base, source: EDITED });
    await deleteDiagramDialogDraft(doc.id, a);
    expect((await listDiagramDialogDrafts(doc.id)).map((d) => d.session)).toEqual([b]);
    // Another document has none.
    expect(await listDiagramDialogDrafts('other-doc')).toEqual([]);
  });

  it('a localStorage copy (page closed before the database write) is offered, and the newer copy wins', async () => {
    const doc = await newDoc();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s, base, source: SOURCE, title: 'Older' });
    await new Promise((r) => setTimeout(r, 5));
    expect(keepDiagramDialogDraftLocally({ docId: doc.id, session: s, base, source: EDITED, title: 'Newer' })).toBe(true);
    const [d, ...rest] = await listDiagramDialogDrafts(doc.id);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ title: 'Newer', source: EDITED });
    // Deleting removes both copies.
    await deleteDiagramDialogDraft(doc.id, s);
    expect(await listDiagramDialogDrafts(doc.id)).toEqual([]);
    expect(diagramDialogDraftTexts()).toEqual([]);
  });

  it('are stored as a schema-2 document, so builds before Phase 6 recover them as an editable copy, not an empty one', async () => {
    // Builds before Phase 6 offer every draft of a document as unsaved document changes; their "Recover" (and Settings
    // → Storage "Save as new") store the draft's content as a new document. That content must be a real document.
    const doc = await newDoc();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s, base, source: EDITED, title: 'Edited flow' });
    const [stored] = (await storage.listDrafts({ kind: 'document', itemId: doc.id })).filter((d) => d.session === s);
    const content = stored.content as { schemaVersion: number; doc: { content: Array<{ type: string; attrs?: Record<string, unknown> }> } };
    expect(contentSchemaFor(content as never)).toBe(2);
    expect(content.schemaVersion).toBe(2);
    expect(Object.keys(content).sort()).toEqual(['doc', 'mode', 'page', 'schemaVersion']);
    const diagrams = content.doc.content.filter((n) => n.type === 'diagram');
    expect(diagrams.map((n) => [n.attrs?.source, n.attrs?.previewId, n.attrs?.title])).toEqual([
      [SOURCE, 'p-old', 'Flow'],
      [EDITED, null, 'Edited flow'],
    ]);
    const opened = migrateDocument(content);
    if (!opened.ok) throw new Error('the stored draft does not open as a document');
    expect(opened.repairs).toEqual([]);
    expect(opened.content.doc.content?.filter((n) => n.type === 'diagram')).toHaveLength(2);
    expect(JSON.stringify(opened.content.doc)).toContain('UNSAVED-EDIT');
    // This build still reads it back as a dialog draft, with the diagram it was opened on.
    expect(await listDiagramDialogDrafts(doc.id)).toEqual([expect.objectContaining({ session: s, base, source: EDITED, title: 'Edited flow' })]);
    // A new diagram (no base) keeps only the edited one.
    const s2 = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s2, base: null, source: EDITED, title: 'New' });
    expect((await listDiagramDialogDrafts(doc.id)).find((d) => d.session === s2)).toMatchObject({ base: null, source: EDITED, title: 'New' });
  });

  it('falls back to localStorage when the database cannot take the draft', async () => {
    const doc = await newDoc();
    vi.spyOn(storage, 'saveDraft').mockRejectedValue(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s, base, source: EDITED, title: 'Kept' });
    expect(diagramDialogDraftTexts()).toHaveLength(1);
    expect((await listDiagramDialogDrafts(doc.id))[0]).toMatchObject({ session: s, title: 'Kept' });
  });

  it('ignores damaged drafts instead of offering them', async () => {
    const doc = await newDoc();
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: newDiagramDialogSession(), baseVersion: 0, content: { schemaVersion: 2, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: DIAGRAM_DIALOG_DRAFT_NOTE }] }, { type: 'diagram', attrs: { source: 'not a diagram', title: 'x' } }] } } });
    await storage.saveDraft({ kind: 'document', itemId: doc.id, session: newDiagramDialogSession(), baseVersion: 0, content: { schemaVersion: 2, doc: { type: 'doc', content: [{ type: 'diagram', attrs: { source: SOURCE, title: 'no note' } }] } } });
    localStorage.setItem(`dcos-diagram-dialog-draft:${doc.id}:${newDiagramDialogSession()}`, '{not json');
    expect(await listDiagramDialogDrafts(doc.id)).toEqual([]);
  });

  it('does not offer a draft whose dialog is still open (in this or another tab)', async () => {
    const held = fakeLocks();
    const doc = await newDoc();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s, base, source: EDITED, title: 'Open elsewhere' });
    const release = holdDiagramDialogSession(s);
    expect(held.size).toBe(1);
    expect(await listDiagramDialogDrafts(doc.id)).toEqual([]);
    release();
    await waitFor(() => expect(held.size).toBe(0));
    expect(await listDiagramDialogDrafts(doc.id)).toHaveLength(1);
  });

  it('keeps preview images that only a localStorage dialog draft still refers to', async () => {
    const image = await storage.putAttachment(new Blob(['dialog-draft-only image']), 'image/png');
    const s = newDiagramDialogSession();
    keepDiagramDialogDraftLocally({ docId: 'gone-doc', session: s, base: { ...base, previewId: image.id }, source: EDITED, title: 'x' });
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(image.id)).toBeDefined();
    await deleteDiagramDialogDraft('gone-doc', s);
    await storage.cleanUpAttachments({ graceMs: 0 });
    expect(await storage.getAttachment(image.id)).toBeUndefined();
  });
});

describe('dialog drafts are not document drafts', () => {
  it('the document editor neither offers nor deletes them', async () => {
    const doc = await newDoc();
    const s = newDiagramDialogSession();
    await saveDiagramDialogDraft({ docId: doc.id, session: s, base, source: EDITED, title: 'Flow' });
    const hook = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    await act(async () => {});
    // Offering it would let "Recover them" replace the whole document with the dialog draft.
    expect(hook.result.current.draft).toBeNull();
    expect(hook.result.current.draftCount).toBe(0);
    expect(await listDiagramDialogDrafts(doc.id)).toHaveLength(1);
    hook.unmount();
  });

  it('Settings → Storage does not list them as unsaved document content', async () => {
    const doc = await newDoc();
    await saveDiagramDialogDraft({ docId: doc.id, session: newDiagramDialogSession(), base, source: EDITED, title: 'Flow' });
    expect((await listUnsavedDrafts()).filter((d) => d.itemId === doc.id)).toEqual([]);
  });
});

describe('applying recovered edits to the stored document', () => {
  const result = { source: EDITED, previewId: 'p-new', naturalWidth: 400, naturalHeight: 100, title: 'Flow v2' };

  it('replaces the diagram the dialog was opened on, keeping its width, alignment and caption', () => {
    const raw = docContent([diagramNode({ align: 'right', caption: 'Figure 1', svgPreviewId: 'svg-old' })]);
    const { content, placed } = applyRecoveredDiagram(raw, base, result);
    expect(placed).toBe('replaced');
    const blocks = content.doc.content!;
    expect(blocks).toHaveLength(2);
    expect(blocks[1].attrs).toMatchObject({ source: EDITED, previewId: 'p-new', title: 'Flow v2', width: 300, height: 75, align: 'right', caption: 'Figure 1', svgPreviewId: null });
    expect(raw.doc.content[1]).toEqual(diagramNode({ align: 'right', caption: 'Figure 1', svgPreviewId: 'svg-old' }));
  });

  it('finds the diagram inside a table cell', () => {
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [diagramNode()] }] }],
    };
    const { content, placed } = applyRecoveredDiagram(docContent([table]), base, result);
    expect(placed).toBe('replaced');
    expect(JSON.stringify(content.doc)).toContain('UNSAVED-EDIT');
    expect(content.doc.content).toHaveLength(2);
  });

  it('adds the diagram at the end when the original is gone, or for a new diagram, so nothing is lost', () => {
    const gone = applyRecoveredDiagram(docContent([diagramNode({ previewId: 'changed-since' })]), base, result);
    expect(gone.placed).toBe('appended');
    expect(gone.content.doc.content).toHaveLength(3);
    expect(gone.content.doc.content![2]).toMatchObject({ type: 'diagram', attrs: { source: EDITED, previewId: 'p-new', width: 400, height: 100 } });
    const fresh = applyRecoveredDiagram(docContent([]), null, { ...result, naturalWidth: 2000, naturalHeight: 1000 });
    expect(fresh.placed).toBe('appended');
    // Never wider than the A4 text width (210 - 2 * 25.4 mm ≈ 602 px).
    expect(fresh.content.doc.content![1].attrs).toMatchObject({ width: 602, height: 301 });
  });

  it('keeps a document that uses nothing new at schema 2', () => {
    const { content } = applyRecoveredDiagram(docContent([diagramNode()]), base, result);
    expect(content.schemaVersion).toBe(2);
    expect(JSON.stringify(content)).not.toContain('"svgPreviewId":"');
  });

  it('refuses a document from a newer version instead of rewriting it', () => {
    expect(() => applyRecoveredDiagram({ ...docContent([diagramNode()]), schemaVersion: 99 }, base, result)).toThrow(/newer version/);
  });

  it('useEditableItem.applyChange saves through the queue, keeps a version first and remounts the editor', async () => {
    const doc = await newDoc();
    const hook = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    const before = hook.result.current.externalRevision;
    await act(async () => {
      await hook.result.current.applyChange((c) => applyRecoveredDiagram(c, base, result).content);
    });
    const stored = await storage.get('document', doc.id);
    expect(JSON.stringify(stored!.content)).toContain('UNSAVED-EDIT');
    expect(hook.result.current.externalRevision).toBe(before + 1);
    expect(JSON.stringify(hook.result.current.item!.content)).toContain('UNSAVED-EDIT');
    // The state it replaced was kept as a version first.
    const versions = await storage.listVersions('document', doc.id);
    expect(versions.map((v) => v.version)).toContain(doc.version);
    hook.unmount();
  });

  it('applyChange refuses, changing nothing, when the change throws', async () => {
    const doc = await newDoc();
    const hook = renderHook(() => useEditableItem('document', doc.id));
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    await expect(
      hook.result.current.applyChange(() => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    expect((await storage.get('document', doc.id))!.version).toBe(doc.version);
    hook.unmount();
  });
});
