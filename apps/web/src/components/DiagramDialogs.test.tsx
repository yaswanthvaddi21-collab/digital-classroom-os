// @vitest-environment jsdom
/**
 * The app's diagram dialog, which is Document Studio's DiagramHost, and how the editor page protects it from
 * external reloads.
 */
import { ToastProvider } from '@dcos/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useDiagramHost } from './DiagramDialogs';
import { EditorPage } from '../pages/EditorPage';
import type { DiagramHost, EmbeddedDiagram } from '@dcos/document-studio';

const storage = vi.hoisted(() => ({
  putAttachment: vi.fn(async () => ({ id: 'att-1' })),
  list: vi.fn(async () => []),
  get: vi.fn(),
  getAttachment: vi.fn(),
}));
const editorState = vi.hoisted(() => ({ readOnly: false }));
const page = vi.hoisted(() => ({
  release: vi.fn(),
  hold: vi.fn(),
  host: null as DiagramHost | null,
}));

vi.mock('../lib/storage', () => ({
  storage,
  useEditableItem: () => ({
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
  diagramTemplates: [],
  createEmptyDiagram: () => ({ nodes: [], edges: [] }),
  DiagramEditor: forwardRef(function FakeEditor({ onChange, apiRef }: { onChange: () => void; apiRef: React.Ref<unknown> }, _ref) {
    useImperativeHandle(apiRef, () => ({
      getContent: () => ({ nodes: [{ id: 'n1' }], edges: [] }),
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
function Harness() {
  const h = useDiagramHost();
  host = h.host;
  active = h.active;
  return <>{h.dialogs}</>;
}

const dialog = () => document.querySelector('dialog')!;
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

const nativeCancel = () => {
  const e = new Event('cancel', { cancelable: true });
  act(() => {
    dialog().dispatchEvent(e);
  });
  return e;
};

beforeEach(() => {
  editorState.readOnly = false;
  page.release.mockClear();
  page.hold.mockReset().mockReturnValue(page.release);
  storage.putAttachment.mockClear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
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
