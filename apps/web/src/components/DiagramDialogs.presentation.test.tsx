// @vitest-environment jsdom
/**
 * Phase 7 CONTENT (ADR 0014): the app's diagram dialog opened from a presentation. Its unsaved edits are kept as
 * drafts of the presentation, it speaks of slides, the editor page gives presentations the diagram host, and kept
 * edits are put back onto the slides. The document behaviour is covered, unchanged, by DiagramDialogs.test.tsx.
 */
import { ToastProvider } from '@dcos/ui';
import { createPresentation, type DiagramElement, type PresentationContent } from '@dcos/presentation-studio';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramHost, EmbeddedDiagram } from '@dcos/document-studio';
import type { DiagramDialogDraft } from '../lib/storage';
import { EditorPage } from '../pages/EditorPage';
import { DIALOG_DRAFT_DELAY_MS, focusDocumentSoon, useDiagramHost } from './DiagramDialogs';

const storage = vi.hoisted(() => ({
  putAttachment: vi.fn(async (): Promise<{ id: string; mimeType: string; sizeBytes: number }> => ({ id: 'att-1', mimeType: 'image/png', sizeBytes: 3 })),
  list: vi.fn(async () => []),
  get: vi.fn(),
  getAttachment: vi.fn(),
}));
const drafts = vi.hoisted(() => ({
  save: vi.fn(async (_d: unknown) => {}),
  keepLocally: vi.fn((_d: unknown) => true),
  delete: vi.fn(async (..._args: unknown[]) => {}),
  list: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  hold: vi.fn((_session: string) => () => {}),
  apply: vi.fn(async (_change: (c: unknown) => unknown) => ({})),
}));
const page = vi.hoisted(() => ({ host: null as DiagramHost | null, imageHost: null as unknown }));

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
    title: 'Deck',
    status: 'saved',
    externalRevision: 0,
    saveNow: async () => {},
    updateContent: () => {},
    holdExternalUpdates: () => () => {},
  }),
}));
vi.mock('./EditorFrame', () => ({ EditorFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, MissingItem: () => null }));
vi.mock('../modules', () => ({
  MODULES: { diagram: { templates: [] } },
  useModuleEditor: () =>
    function FakePresentationEditor({ diagramHost, imageHost }: { diagramHost?: DiagramHost; imageHost?: unknown }) {
      page.host = diagramHost ?? null;
      page.imageHost = imageHost ?? null;
      return null;
    },
}));
vi.mock('@dcos/diagram-studio', () => ({
  renderDiagramPreview: vi.fn(),
  diagramTemplates: [],
  createEmptyDiagram: () => ({ nodes: [], edges: [] }),
  DiagramEditor: forwardRef(function FakeEditor({ onChange, apiRef }: { onChange: () => void; apiRef: React.Ref<unknown> }, _ref) {
    useImperativeHandle(apiRef, () => ({
      getContent: () => ({ nodes: [{ id: 'n1' }], edges: [] }),
      isReadOnly: () => false,
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
function Harness() {
  const h = useDiagramHost({ owner: { kind: 'presentation', id: 'deck-1' } });
  host = h.host;
  return <>{h.dialogs}</>;
}
const existing: EmbeddedDiagram = { source: { nodes: [{ id: 'old' }] }, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' };

async function open(current: EmbeddedDiagram | null) {
  render(
    <ToastProvider>
      <Harness />
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

beforeEach(() => {
  Object.values(drafts).forEach((f) => f.mockClear());
  drafts.list.mockResolvedValue([]);
  storage.putAttachment.mockClear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});
afterEach(() => vi.restoreAllMocks());

describe('diagram dialog opened from a presentation', () => {
  it('speaks of the slide and asks about the presentation before discarding a changed new diagram', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open(null);
    expect(screen.getByText('This diagram will be placed on your slide.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insert on slide' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Insert into document' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard this new diagram? It has not been added to your presentation.');
  });

  it('keeps unsaved edits as a draft of the presentation, and removes it once the diagram is on the slide', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await open(existing);
      expect(screen.getByText('Changes appear on your slide when you save.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
      await act(async () => {
        vi.advanceTimersByTime(DIALOG_DRAFT_DELAY_MS + 10);
      });
      expect(drafts.save).toHaveBeenCalledWith(expect.objectContaining({ docId: 'deck-1', ownerKind: 'presentation', session: 'diagram-dialog:test-session' }));
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    const saved = drafts.save.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(saved).toMatchObject({ docId: 'deck-1', ownerKind: 'presentation' });
  });

  it('when the diagram could not be put on the slide, the edits stay kept and the message names the presentation', async () => {
    const settled = await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert on slide' }));
    await waitFor(() => expect(settled).toHaveBeenCalled());
    const result = settled.mock.calls[0][0] as EmbeddedDiagram;
    act(() => host.settle!(result, false));
    expect(await screen.findByText('Your diagram changes were kept. Choose “Recover diagram edits” to put them into the presentation.')).toBeTruthy();
    expect(drafts.delete).not.toHaveBeenCalled();
  });

  it('the draft is removed (as a presentation draft) when the diagram got onto the slide', async () => {
    const settled = await open(null);
    fireEvent.click(screen.getByRole('button', { name: 'Change the diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert on slide' }));
    await waitFor(() => expect(settled).toHaveBeenCalled());
    act(() => host.settle!(settled.mock.calls[0][0] as EmbeddedDiagram, true));
    await waitFor(() => expect(drafts.delete).toHaveBeenCalledWith('deck-1', 'diagram-dialog:test-session', 'presentation'));
  });
});

describe('editor page: presentations', () => {
  const module = { kind: 'presentation', label: 'Presentation' } as never;
  const mountPage = () =>
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/presentations/p1']}>
          <Routes>
            <Route path="/presentations/:id" element={<EditorPage module={module} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

  it('gives the presentation editor the diagram host and the image host, and lists its kept dialog edits', async () => {
    mountPage();
    await waitFor(() => expect(page.host).not.toBeNull());
    expect(page.imageHost).not.toBeNull();
    await waitFor(() => expect(drafts.list).toHaveBeenCalledWith('p1', 'presentation'));
  });

  it('recovers kept edits onto the slides: over the diagram they were opened on', async () => {
    const deck: PresentationContent = createPresentation('blank');
    const d: DiagramElement = { id: 'd1', type: 'diagram', x: 10, y: 20, w: 200, h: 100, rotation: 0, source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old', alt: null, svgPreviewId: null };
    deck.slides[0].elements.push(d);
    const kept: DiagramDialogDraft = {
      docId: 'p1',
      ownerKind: 'presentation',
      session: 'diagram-dialog:earlier',
      base: { source: existing.source, previewId: 'p1', naturalWidth: 100, naturalHeight: 50, title: 'Old' },
      source: { nodes: [{ id: 'recovered' }], edges: [] },
      title: 'Flow',
      savedAt: new Date().toISOString(),
    };
    drafts.list.mockResolvedValueOnce([kept]).mockResolvedValueOnce([kept]).mockResolvedValue([]);
    mountPage();
    const later = await screen.findByRole('button', { name: 'Later' });
    expect(later.getAttribute('title')).toBe('Hide this until the presentation is opened again; the edits stay kept');
    fireEvent.click(screen.getByRole('button', { name: 'Recover diagram edits' }));
    await screen.findByRole('button', { name: 'Change the diagram' });
    expect(screen.getByText(/to put them in your presentation\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(drafts.delete).toHaveBeenCalledWith('p1', 'diagram-dialog:earlier', 'presentation'), { timeout: 5000 });
    const change = drafts.apply.mock.calls[0][0];
    const next = change(deck) as PresentationContent;
    const after = next.slides[0].elements.find((e) => e.id === 'd1') as DiagramElement;
    expect(after).toMatchObject({ x: 10, y: 20, w: 200, previewId: 'att-1', title: 'Flow', source: { nodes: [{ id: 'n1' }], edges: [] } });
    expect(await screen.findByText('Recovered diagram edits saved in the presentation.')).toBeTruthy();
  });
});

describe('focus after recovered edits (Phase 7 Round 3)', () => {
  it('follows the editor when it is mounted again after focus was put back (a presentation reopens with the edits)', async () => {
    vi.useFakeTimers();
    try {
      const make = () => {
        const el = document.createElement('div');
        el.setAttribute('role', 'listbox');
        el.setAttribute('data-target', '');
        el.tabIndex = -1;
        document.body.append(el);
        return el;
      };
      const first = make();
      focusDocumentSoon('[data-target]');
      await vi.advanceTimersByTimeAsync(1);
      expect(document.activeElement).toBe(first);
      // The editor is mounted again: the element that had the focus is replaced.
      first.remove();
      const second = make();
      expect(document.activeElement).toBe(document.body);
      await vi.advanceTimersByTimeAsync(120);
      expect(document.activeElement).toBe(second);
      // Focus the user moves elsewhere is left alone.
      const other = document.createElement('button');
      document.body.append(other);
      other.focus();
      await vi.advanceTimersByTimeAsync(200);
      expect(document.activeElement).toBe(other);
      second.remove();
      other.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

