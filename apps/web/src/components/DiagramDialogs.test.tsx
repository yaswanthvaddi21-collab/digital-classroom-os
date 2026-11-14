// @vitest-environment jsdom
/**
 * The app's diagram dialog, which is Document Studio's DiagramHost, and how the editor page protects it from
 * external reloads.
 */
import { ToastProvider } from '@dcos/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DIALOG_DRAFT_DELAY_MS, useDiagramHost } from './DiagramDialogs';
import { EditorPage } from '../pages/EditorPage';
import type { DiagramHost, EmbeddedDiagram } from '@dcos/document-studio';
import type { DiagramDialogDraft } from '../lib/storage';

const storage = vi.hoisted(() => ({
  putAttachment: vi.fn(async (): Promise<{ id: string }> => ({ id: 'att-1' })),
  list: vi.fn(async () => []),
  get: vi.fn(),
  getAttachment: vi.fn(),
}));
// Phase 6 dialog drafts (apps/web/src/lib/storage.ts; covered against IndexedDB in diagram-dialog-drafts.test.tsx).
const drafts = vi.hoisted(() => ({
  save: vi.fn(async (_d: unknown) => {}),
  keepLocally: vi.fn((_d: unknown) => true),
  delete: vi.fn(async (_docId: string, _session: string) => {}),
  list: vi.fn(async (_docId: string): Promise<unknown[]> => []),
  hold: vi.fn((_session: string) => () => {}),
  apply: vi.fn(async (_change: (c: unknown) => unknown) => ({})),
}));
const editorState = vi.hoisted(() => ({ readOnly: false, nodes: [{ id: 'n1' }] as unknown[] }));
const studio = vi.hoisted(() => ({ renderDiagramPreview: vi.fn() }));
const page = vi.hoisted(() => ({
  release: vi.fn(),
  hold: vi.fn(),
  host: null as DiagramHost | null,
}));

vi.mock('../lib/storage', () => ({
  storage,
  saveDiagramDialogDraft: drafts.save,
  keepDiagramDialogDraftLocally: drafts.keepLocally,
  deleteDiagramDialogDraft: drafts.delete,
  listDiagramDialogDrafts: drafts.list,
  holdDiagramDialogSession: drafts.hold,
  newDiagramDialogSession: () => 'diagram-dialog:test-session',
  useEditableItem: () => ({
    applyChange: drafts.apply,
    item: { content: {}, deletedAt: null },
    title: 'Doc',
    status: 'saved',
    externalRevision: 0,
    saveNow: async () => {},
    updateContent: () => {},
    holdExternalUpdates: page.hold,
  }),
}));
vi.mock('./EditorFrame', () => ({ EditorFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, MissingItem: () => null }));
vi.mock('../modules', () => ({
  MODULES: { diagram: { templates: [] } },
  useModuleEditor: () =>
    function FakeDocumentEditor({ diagramHost }: { diagramHost?: DiagramHost }) {
      page.host = diagramHost ?? null;
      return null;
    },
}));
vi.mock('@dcos/diagram-studio', () => ({
  renderDiagramPreview: studio.renderDiagramPreview,
  diagramTemplates: [],
  createEmptyDiagram: () => ({ nodes: [], edges: [] }),
  DiagramEditor: forwardRef(function FakeEditor({ onChange, apiRef }: { onChange: () => void; apiRef: React.Ref<unknown> }, _ref) {
    useImperativeHandle(apiRef, () => ({
      getContent: () => ({ nodes: editorState.nodes, edges: [] }),
      isReadOnly: () => editorState.readOnly,
      renderPng: async () => ({ blob: new Blob(['png']), width: 120, height: 80 }),
    }));
    return (
      <button type="button" onClick={onChange}>
        Change the diagram
      </button>
    );
  }),
}));

let host: DiagramHost;
let active = false;
let recover: (d: DiagramDialogDraft) => Promise<EmbeddedDiagram | null>;
function Harness({ docId }: { docId?: string }) {
  const h = useDiagramHost({ docId });
  host = h.host;
  active = h.active;
  recover = h.recover;
  return <>{h.dialogs}</>;
}

const dialog = () => document.querySelector('dialog')!;
const existing: EmbeddedDiagram = { source: { nodes: [{ id: 'old' }] }, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' };

async function open(current: EmbeddedDiagram | null, docId?: string) {
  render(
    <ToastProvider>
      <Harness docId={docId} />
    </ToastProvider>,
  );
  let result: Promise<EmbeddedDiagram | null>;
  act(() => {
    result = host.edit(current, current ? undefined : { title: 'New' });
  });
  await screen.findByRole('button', { name: 'Change the diagram' });
  const settled = vi.fn();
  void result!.then(settled);
  return settled;
}

const nativeCancel = () => {
  const e = new Event('cancel', { cancelable: true });
  act(() => {
    dialog().dispatchEvent(e);
  });
  return e;
};

beforeEach(() => {
  editorState.readOnly = false;
  editorState.nodes = [{ id: 'n1' }];
  Object.values(drafts).forEach((f) => f.mockClear());
  drafts.list.mockResolvedValue([]);
  page.release.mockClear();
  page.hold.mockReset().mockReturnValue(page.release);
  storage.putAttachment.mockClear();
  // Like a browser: open, then focus the autofocus element or the first focusable one (dialog focusing steps).
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    (this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>('input, button'))?.focus();
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  // jsdom's :modal never matches; an open dialog here is a modal one (all of the app's dialogs are).
  HTMLDialogElement.prototype.matches = function (this: HTMLDialogElement, selector: string) {
    return selector === ':modal' ? this.open : Element.prototype.matches.call(this, selector);
  };
});
afterEach(() => vi.restoreAllMocks());

describe('diagram dialog: discarding (DOC-1)', () => {
  it('closes an untouched new diagram without asking', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const settled = await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(confirm).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledWith(null);
  });

  it('asks before Escape discards a changed new diagram, and keeps it when the user says no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const settled = await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    const e = nativeCancel();
    expect(e.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/discard this new diagram\?/i));
    await act(async () => {});
    expect(settled).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
    expect(active).toBe(true);

    confirm.mockReturnValue(true);
    nativeCancel();
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith(null);
    expect(document.querySelector('dialog')).toBeNull();
    expect(active).toBe(false);
  });

  it('asks before discarding changes to an existing diagram', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const settled = await open(existing);
    fireEvent.change(screen.getByRole('textbox', { name: 'Diagram title' }), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/discard your changes/i));
    await act(async () => {});
    expect(settled).not.toHaveBeenCalled();
  });

  it('reopens the dialog if the browser closes it without the user agreeing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const settled = await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    dialog().removeAttribute('open');
    act(() => {
      dialog().dispatchEvent(new Event('close'));
    });
    expect(dialog().hasAttribute('open')).toBe(true);
    await act(async () => {});
    expect(settled).not.toHaveBeenCalled();
  });
});

describe('diagram dialog: saving', () => {
  it('saves the diagram with a stored preview', async () => {
    const settled = await open(existing);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith({ source: { nodes: [{ id: 'n1' }], edges: [] }, previewId: 'att-1', naturalWidth: 120, naturalHeight: 80, title: 'Old' });
  });

  it('cannot save over a diagram from a newer version, and says why (DS-1)', async () => {
    editorState.readOnly = true;
    const settled = await open(existing);
    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/made with a newer version of Classroom OS and can't be changed here/i)).toBeTruthy();
    fireEvent.click(save);
    await act(async () => {});
    expect(storage.putAttachment).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it('cannot insert a read-only diagram as new either (DS-1)', async () => {
    editorState.readOnly = true;
    await open(null);
    expect((screen.getByRole('button', { name: 'Insert into document' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('diagram host (DOC-4)', () => {
  it('reports a dialog as active only while it is open', async () => {
    const settled = await open(existing);
    expect(active).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith(null);
    expect(active).toBe(false);
  });
});

describe('diagram host: off-screen preview (Phase 6, ADR 0013)', () => {
  const mount = () =>
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

  it('draws through Diagram Studio with no dialog shown, and hands back only the picture', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    studio.renderDiagramPreview.mockReset().mockResolvedValue({ png, svg: '<svg/>', width: 320, height: 180, pixelRatio: 2, readOnly: false, notes: ['n'] });
    mount();
    const source = Object.freeze({ schemaVersion: 3, nodes: [{ id: 'a' }], edges: [] });
    const r = await host.renderPreview!(source, 'Flow');
    expect(studio.renderDiagramPreview).toHaveBeenCalledWith(source, { title: 'Flow' });
    expect(r).toEqual({ png, svg: '<svg/>', width: 320, height: 180 });
    // Nothing is opened or stored: the caller decides what to keep.
    expect(document.querySelector('dialog')).toBeNull();
    expect(active).toBe(false);
    expect(storage.putAttachment).not.toHaveBeenCalled();
  });

  it('resolves null when there is nothing to draw, and passes on a drawing failure', async () => {
    mount();
    studio.renderDiagramPreview.mockReset().mockResolvedValue(null);
    expect(await host.renderPreview!(null)).toBeNull();
    studio.renderDiagramPreview.mockReset().mockRejectedValue(new Error('The browser could not create an image of this size.'));
    await expect(host.renderPreview!({ nodes: [] })).rejects.toThrow(/could not create an image/);
  });
});

describe('editor page (DOC-4)', () => {
  it('holds back other tabs\' versions while a diagram dialog is open, and only then', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/documents/d1']}>
          <Routes>
            <Route path="/documents/:id" element={<EditorPage module={{ kind: 'document', label: 'Document' } as never} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(page.host).toBeTruthy();
    expect(page.hold).not.toHaveBeenCalled();
    let result: Promise<EmbeddedDiagram | null>;
    act(() => {
      result = page.host!.edit(existing);
    });
    await screen.findByRole('button', { name: 'Change the diagram' });
    expect(page.hold).toHaveBeenCalledTimes(1);
    expect(page.release).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await result!).toBeNull();
    expect(page.release).toHaveBeenCalledTimes(1);
  });
});

describe('diagram dialog: unsaved edits are kept (Phase 6 DIALOG)', () => {
  const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e;
  };

  it('warns before the page unloads only while the dialog holds unsaved changes', async () => {
    await open(existing, 'doc-1');
    expect(unload().defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    expect(unload().defaultPrevented).toBe(true);
    // A synchronous copy is kept, since the database write may not finish before the page goes.
    expect(drafts.keepLocally).toHaveBeenCalledWith(expect.objectContaining({ docId: 'doc-1', session: 'diagram-dialog:test-session', source: { nodes: [{ id: 'n1' }], edges: [] } }));
  });

  it('keeps a draft of the edits a moment after the last change, with what the dialog was opened on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await open(existing, 'doc-1');
      fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Diagram title' }), { target: { value: 'UNSAVED-EDIT' } });
      expect(drafts.save).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(DIALOG_DRAFT_DELAY_MS + 10);
      });
      expect(drafts.save).toHaveBeenCalledTimes(1);
      expect(drafts.save).toHaveBeenCalledWith({
        docId: 'doc-1',
        session: 'diagram-dialog:test-session',
        base: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' },
        source: { nodes: [{ id: 'n1' }], edges: [] },
        title: 'UNSAVED-EDIT',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps no drafts for a dialog without a document (and an untouched dialog keeps none)', async () => {
    await open(existing);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    expect(unload().defaultPrevented).toBe(false);
    expect(drafts.hold).not.toHaveBeenCalled();
  });

  it('marks the dialog as open so other tabs do not offer its draft, until it closes', async () => {
    const release = vi.fn();
    drafts.hold.mockReturnValue(release);
    await open(existing, 'doc-1');
    expect(drafts.hold).toHaveBeenCalledWith('diagram-dialog:test-session');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(release).toHaveBeenCalled();
  });

  it('removes the draft once the saved diagram is in the document, and on Cancel', async () => {
    let settled = await open(existing, 'doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'att-1' }));
    // Kept (with what was saved) until Document Studio says the diagram is in the document.
    expect(drafts.delete).not.toHaveBeenCalled();
    act(() => host.settle!(settled.mock.calls[0][0], true));
    expect(drafts.delete).toHaveBeenCalledWith('doc-1', 'diagram-dialog:test-session');
    cleanup();
    drafts.delete.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    settled = await open(existing, 'doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith(null);
    expect(drafts.delete).toHaveBeenCalledWith('doc-1', 'diagram-dialog:test-session');
  });

  // Round 3 (verifier, DIALOG): Save used to remove the draft before Document Studio applied the result, so an editor
  // destroyed (RELOADED_NOT_APPLIED) or a diagram removed (DIAGRAM_GONE) meanwhile lost the saved edits.
  it('keeps what was saved, and offers it again, when Document Studio could not put it into the document', async () => {
    const changed = vi.fn();
    window.addEventListener('dcos-diagram-dialog-drafts-changed', changed);
    try {
      const settled = await open(existing, 'doc-1');
      fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Diagram title' }), { target: { value: 'Saved title' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await act(async () => {});
      expect(drafts.save).toHaveBeenLastCalledWith({
        docId: 'doc-1',
        session: 'diagram-dialog:test-session',
        base: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' },
        source: { nodes: [{ id: 'n1' }], edges: [] },
        title: 'Saved title',
      });
      act(() => host.settle!(settled.mock.calls[0][0], false));
      expect(drafts.delete).not.toHaveBeenCalled();
      expect(changed).toHaveBeenCalled();
      expect(await screen.findByText(/changes were kept.*Recover diagram edits/)).toBeTruthy();
    } finally {
      window.removeEventListener('dcos-diagram-dialog-drafts-changed', changed);
    }
  });

  it('keeps the edits when the page or editor goes away with the dialog still open', async () => {
    const settled = await open(existing, 'doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    cleanup();
    expect(settled).not.toHaveBeenCalled();
    expect(drafts.keepLocally).toHaveBeenCalledWith(expect.objectContaining({ session: 'diagram-dialog:test-session', source: { nodes: [{ id: 'n1' }], edges: [] } }));
    await act(async () => {});
    expect(drafts.save).toHaveBeenCalledWith(expect.objectContaining({ session: 'diagram-dialog:test-session' }));
    expect(drafts.delete).not.toHaveBeenCalled();
  });

  it('reopens recovered edits, unsaved until saved, and leaves removing the draft to the page', async () => {
    render(
      <ToastProvider>
        <Harness docId="doc-1" />
      </ToastProvider>,
    );
    const draft: DiagramDialogDraft = {
      docId: 'doc-1',
      session: 'diagram-dialog:earlier',
      base: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' },
      source: { nodes: [{ id: 'recovered' }], edges: [] },
      title: 'Recovered title',
      savedAt: new Date().toISOString(),
    };
    let result: Promise<EmbeddedDiagram | null>;
    act(() => {
      result = recover(draft);
    });
    await screen.findByRole('button', { name: 'Change the diagram' });
    expect(screen.getByRole('dialog', { name: 'Edit diagram' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Diagram title' }) as HTMLInputElement).value).toBe('Recovered title');
    expect(screen.getByText(/Recovered unsaved changes/)).toBeTruthy();
    expect(unload().defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await result!).toEqual(expect.objectContaining({ previewId: 'att-1', title: 'Recovered title' }));
    expect(drafts.save).toHaveBeenCalledWith(expect.objectContaining({ session: 'diagram-dialog:earlier', base: draft.base }));
    expect(drafts.delete).not.toHaveBeenCalled();
  });
});

describe('diagram dialog: errors are shown inside the dialog (RG-8)', () => {
  it('a failed save keeps the dialog open and says why in an alert inside it', async () => {
    storage.putAttachment.mockRejectedValueOnce(new Error('The quota has been exceeded.'));
    const settled = await open(existing, 'doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(dialog().contains(alert)).toBe(true);
    expect(alert.textContent).toMatch(/could not be saved: The quota has been exceeded/);
    expect(settled).not.toHaveBeenCalled();
    expect(drafts.delete).not.toHaveBeenCalled();
    // Saving again works and clears the message.
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'att-1' }));
  });

  it('an empty diagram is refused with the reason inside the dialog', async () => {
    editorState.nodes = [];
    await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into document' }));
    const alert = await screen.findByRole('alert');
    expect(dialog().contains(alert)).toBe(true);
    expect(alert.textContent).toMatch(/Add at least one shape/);
  });
});

describe('diagram dialog: focus (Phase 6 DIALOG)', () => {
  const openFrom = async (opener: HTMLElement) => {
    opener.focus();
    expect(document.activeElement).toBe(opener);
    return open(existing, 'doc-1');
  };
  const editorSurface = () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.tabIndex = 0;
    el.className = 'ProseMirror';
    document.body.append(el);
    return el;
  };
  afterEach(() => {
    document.querySelectorAll('.ProseMirror').forEach((e) => e.remove());
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('goes back to the document after Escape', async () => {
    const doc = editorSurface();
    await openFrom(doc);
    expect(dialog().contains(document.activeElement)).toBe(true);
    nativeCancel();
    await act(async () => {});
    expect(document.activeElement).toBe(doc);
  });

  it('goes back to the button that opened it after Cancel, and after Save', async () => {
    const button = document.createElement('button');
    button.textContent = 'Edit';
    document.body.append(button);
    await openFrom(button);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(document.activeElement).toBe(button);
    cleanup();
    document.body.append(button);
    const settled = await openFrom(button);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {});
    expect(settled).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('on a touch screen, opening does not focus the title field (no soft keyboard over the canvas)', async () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', media: q })) as typeof window.matchMedia;
    await open(existing, 'doc-1');
    const focused = document.activeElement as HTMLElement;
    expect(dialog().contains(focused)).toBe(true);
    expect(['INPUT', 'TEXTAREA'].includes(focused.tagName)).toBe(false);
  });

  it('with a mouse, opening still focuses inside the dialog (the title field)', async () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as typeof window.matchMedia;
    await open(existing, 'doc-1');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Diagram title' }));
  });
});

describe('editor page: recovering kept diagram edits (Phase 6 DIALOG)', () => {
  const kept: DiagramDialogDraft = {
    docId: 'd1',
    session: 'diagram-dialog:earlier',
    base: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' },
    source: { nodes: [{ id: 'recovered' }], edges: [] },
    title: 'Flow',
    savedAt: new Date().toISOString(),
  };
  const mountPage = () =>
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/documents/d1']}>
          <Routes>
            <Route path="/documents/:id" element={<EditorPage module={{ kind: 'document', label: 'Document' } as never} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

  it('offers them, reopens the dialog, puts the saved diagram into the document, then removes the draft', async () => {
    drafts.list.mockResolvedValueOnce([kept]).mockResolvedValueOnce([kept]).mockResolvedValue([]);
    // The document the page shows: focus goes back to it after Save (the offer's button has gone).
    const surface = document.createElement('div');
    surface.className = 'ProseMirror';
    surface.setAttribute('contenteditable', 'true');
    surface.tabIndex = 0;
    document.body.append(surface);
    mountPage();
    expect(drafts.list).toHaveBeenCalledWith('d1');
    fireEvent.click(await screen.findByRole('button', { name: 'Recover diagram edits' }));
    await screen.findByRole('button', { name: 'Change the diagram' });
    // The offer is hidden while the dialog is open.
    expect(screen.queryByRole('button', { name: 'Recover diagram edits' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // Saving goes through the page's lazily loaded parts; on a cold module cache that can take over a second.
    await waitFor(() => expect(drafts.delete).toHaveBeenCalledWith('d1', 'diagram-dialog:earlier'), { timeout: 5000 });
    expect(drafts.apply).toHaveBeenCalledTimes(1);
    // The change it applies is the real one: the diagram the dialog was opened on is replaced.
    const change = drafts.apply.mock.calls[0][0];
    const stored = {
      schemaVersion: 2,
      doc: { type: 'doc', content: [{ type: 'diagram', attrs: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, width: 100, height: 50, title: 'Old' } }] },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
      mode: 'simple',
    };
    const next = change(stored) as { doc: { content: Array<{ attrs: Record<string, unknown> }> } };
    expect(next.doc.content).toHaveLength(1);
    expect(next.doc.content[0].attrs).toMatchObject({ previewId: 'att-1', source: { nodes: [{ id: 'n1' }], edges: [] }, title: 'Flow' });
    expect(await screen.findByText('Recovered diagram edits saved in the document.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recover diagram edits' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(surface));
    surface.remove();
  });

  // Round 3 (verifier, DIALOG): two tabs showed the same offer; the second recovered a draft already used.
  it('reads the draft again before reopening it: one recovered or discarded elsewhere is not offered again', async () => {
    drafts.list.mockResolvedValueOnce([kept]).mockResolvedValue([]);
    mountPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Recover diagram edits' }));
    expect(await screen.findByText(/already recovered or discarded/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(drafts.apply).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recover diagram edits' })).toBeNull());
  });

  it('Later hides the offer without removing anything', async () => {
    drafts.list.mockResolvedValue([kept]);
    mountPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('button', { name: 'Recover diagram edits' })).toBeNull();
    expect(drafts.delete).not.toHaveBeenCalled();
  });

  it('keeps the draft when the edits cannot be put into the document', async () => {
    drafts.list.mockResolvedValue([kept]);
    drafts.apply.mockRejectedValueOnce(new Error('Your latest changes to this document are not saved yet.'));
    mountPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Recover diagram edits' }));
    await screen.findByRole('button', { name: 'Change the diagram' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/could not be put into the document.*still kept/, undefined, { timeout: 5000 })).toBeTruthy();
    expect(drafts.delete).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Recover diagram edits' })).toBeTruthy();
  });

  it('Discard asks first, then removes the draft', async () => {
    drafts.list.mockResolvedValueOnce([kept]).mockResolvedValue([]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mountPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be undone/));
    await waitFor(() => expect(drafts.delete).toHaveBeenCalledWith('d1', 'diagram-dialog:earlier'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull());
  });
});
