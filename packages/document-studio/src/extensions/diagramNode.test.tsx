// @vitest-environment jsdom
// Phase 6 (NODE): the embedded diagram's node view, its keyboard and touch paths to the editor, the shared
// openDiagramEditor helper, alignment/caption/alt text, the automatic redraw of a missing preview, and where a new
// diagram is inserted.
import { ToastProvider } from '@dcos/ui';
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../DocumentEditor';
import { createEmptyDocument, type DocumentContent } from '../types';
import { DIAGRAM_GONE, openDiagramEditor, RELOADED_NOT_APPLIED, setDiagramTextWidth, type DiagramHost, type EmbeddedDiagram } from './diagramEmbed';
import { documentExtensions } from './index';

const source = { nodes: [{ id: 'n1', data: { label: 'Start' } }], edges: [] };
const para = (text?: string): JSONContent => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
const makeHost = (over: Partial<DiagramHost> = {}): DiagramHost => ({
  templates: [],
  edit: vi.fn(async () => null),
  pickFromLibrary: vi.fn(async () => null),
  importFile: vi.fn(async () => null),
  loadPreview: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  toDrawio: vi.fn(async () => ''),
  ...over,
});
const later = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

let ids = 0;
/** A previewId no other test has used (the preview URL cache is shared by every editor). */
const freshId = (prefix = 'p') => `${prefix}-${++ids}-${Math.random().toString(36).slice(2)}`;
const diagramAttrs = (over: Record<string, unknown> = {}) => ({ source, previewId: freshId(), naturalWidth: 400, naturalHeight: 200, width: 300, height: 150, title: 'Cycle', ...over });
const edited: EmbeddedDiagram = { source: { nodes: [{ id: 'n2' }], edges: [] }, previewId: 'p-edited', naturalWidth: 800, naturalHeight: 200, title: 'Cycle v2' };

beforeEach(() => {
  // ProseMirror asks where a mouse event landed; jsdom has no layout.
  document.elementFromPoint ??= () => null;
  URL.createObjectURL = vi.fn(() => `blob:${freshId('url')}`);
  URL.revokeObjectURL = vi.fn();
});

// ---------------------------------------------------------------------------------------------------------------
// Headless editor (no React node views): commands, shortcuts and the shared helper.
// ---------------------------------------------------------------------------------------------------------------
let editor: Editor | null = null;
afterEach(() => {
  if (editor && !editor.isDestroyed) editor.destroy();
  editor = null;
});
const make = (content: JSONContent[], host: DiagramHost | null = null) => (editor = new Editor({ extensions: documentExtensions({ diagramHost: host }), content: { type: 'doc', content } }));
const top = (e: Editor) => ((e.getJSON() as JSONContent).content ?? []).map((n: JSONContent) => (n.type === 'paragraph' ? `p:${(n.content ?? []).map((c: JSONContent) => c.text).join('')}` : n.type!));
const diagramsIn = (e: Editor) => {
  const out: Record<string, unknown>[] = [];
  e.state.doc.descendants((n) => void (n.type.name === 'diagram' && out.push(n.attrs)));
  return out;
};
const diagramPos = (e: Editor, index = 0) => {
  const found: number[] = [];
  e.state.doc.descendants((n, pos) => void (n.type.name === 'diagram' && found.push(pos)));
  return found[index]!;
};
const selectDiagram = (e: Editor, index = 0) => e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, diagramPos(e, index))));
const press = (e: Editor, key: string) => !!e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
const fresh: EmbeddedDiagram = { source, previewId: 'p-insert', naturalWidth: 400, naturalHeight: 200, title: 'New' };

describe('inserting a diagram never splits a word', () => {
  it('a caret in the middle of a word puts the diagram after the paragraph, with the text intact', () => {
    const e = make([para('somewhere else'), para('next')]);
    e.commands.setTextSelection(5); // "some|where"
    e.chain().insertDiagram(fresh, 600).run();
    expect(top(e)).toEqual(['p:somewhere else', 'diagram', 'p:next']);
  });

  it('a caret at the start of a paragraph puts the diagram before it', () => {
    const e = make([para('first'), para('second')]);
    e.commands.setTextSelection(8); // start of "second"
    e.chain().insertDiagram(fresh, 600).run();
    expect(top(e)).toEqual(['p:first', 'diagram', 'p:second']);
  });

  it('a text selection inside a word puts the diagram after the paragraph and keeps the text', () => {
    const e = make([para('keep this whole')]);
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 3, 4)));
    e.chain().insertDiagram(fresh, 600).run();
    expect(top(e).slice(0, 2)).toEqual(['p:keep this whole', 'diagram']);
  });

  it('inside a list item it goes after the item\'s paragraph, even at its start (a list item must start with text)', () => {
    const list = (text: string): JSONContent => ({ type: 'bulletList', content: [{ type: 'listItem', content: [para(text)] }] });
    for (const caret of [3, 6]) {
      const e = make([list('alpha beta')]);
      e.commands.setTextSelection(caret); // positions 3 = start of "alpha", 6 = "alp|ha"
      e.chain().insertDiagram(fresh, 600).run();
      const item = (e.getJSON() as JSONContent).content![0].content![0];
      expect(item.content!.map((n: JSONContent) => n.type)).toEqual(['paragraph', 'diagram']);
      expect(item.content![0].content![0].text).toBe('alpha beta');
      e.destroy();
    }
  });

  it('an empty paragraph is still replaced by the diagram', () => {
    const e = make([para('a'), para(), para('b')]);
    e.commands.setTextSelection(4);
    e.chain().insertDiagram(fresh, 600).run();
    expect(top(e)).toEqual(['p:a', 'diagram', 'p:b']);
  });
});

describe('Enter and F2 on a selected diagram open its editor', () => {
  it('Enter and F2 call host.edit and add no paragraph', async () => {
    const host = makeHost();
    const e = make([para('a'), { type: 'diagram', attrs: diagramAttrs() }, para('b')], host);
    selectDiagram(e);
    expect(press(e, 'Enter')).toBe(true);
    await flush();
    expect(host.edit).toHaveBeenCalledTimes(1);
    expect(top(e)).toEqual(['p:a', 'diagram', 'p:b']);
    selectDiagram(e);
    expect(press(e, 'F2')).toBe(true);
    await flush();
    expect(host.edit).toHaveBeenCalledTimes(2);
    expect(top(e)).toEqual(['p:a', 'diagram', 'p:b']);
  });

  it('does nothing in a read-only document, and Enter in text still splits the paragraph', async () => {
    const host = makeHost();
    const e = make([para('ab'), { type: 'diagram', attrs: diagramAttrs() }], host);
    selectDiagram(e);
    e.setEditable(false);
    press(e, 'Enter');
    press(e, 'F2');
    await flush();
    expect(host.edit).not.toHaveBeenCalled();
    e.setEditable(true);
    e.commands.setTextSelection(2);
    press(e, 'Enter');
    await flush();
    expect(host.edit).not.toHaveBeenCalled();
    expect(top(e).slice(0, 2)).toEqual(['p:a', 'p:b']);
  });
});

describe('openDiagramEditor (shared by double-click, double-tap, Enter, F2 and the ribbon)', () => {
  it('applies the edit, keeps alignment/caption/alt and the width (clamped to the text width), drops the old SVG and keeps the diagram selected', async () => {
    const host = makeHost({ edit: vi.fn(async () => edited) });
    const e = make([para('a'), { type: 'diagram', attrs: diagramAttrs({ width: 500, align: 'right', caption: 'Figure 1', alt: 'The cycle', svgPreviewId: 's-old' }) }, para('b')], host);
    setDiagramTextWidth(e, 450);
    await expect(openDiagramEditor(e, diagramPos(e), host)).resolves.toBe('saved');
    expect(diagramsIn(e)[0]).toMatchObject({ previewId: 'p-edited', title: 'Cycle v2', width: 450, height: 113, align: 'right', caption: 'Figure 1', alt: 'The cycle', svgPreviewId: null });
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    expect((e.state.selection as NodeSelection).node.type.name).toBe('diagram');
    // An explicit width (the ribbon passes the page's text width) gives the same result.
    const e2 = make([{ type: 'diagram', attrs: diagramAttrs({ width: 500 }) }], host);
    await openDiagramEditor(e2, 0, host, 450);
    expect(diagramsIn(e2)[0]).toMatchObject({ width: 450, height: 113 });
  });

  it('cancelling changes nothing and leaves the diagram selected', async () => {
    const host = makeHost();
    const e = make([para('a'), { type: 'diagram', attrs: diagramAttrs() }, para('b')], host);
    e.commands.setTextSelection(1);
    const before = JSON.stringify(e.getJSON());
    await expect(openDiagramEditor(e, diagramPos(e), host)).resolves.toBe('cancelled');
    expect(JSON.stringify(e.getJSON())).toBe(before);
    expect((e.state.selection as NodeSelection).node?.type.name).toBe('diagram');
  });

  it('opens one dialog at a time', async () => {
    const pending = later<EmbeddedDiagram | null>();
    const host = makeHost({ edit: vi.fn(() => pending.promise) });
    const e = make([{ type: 'diagram', attrs: diagramAttrs() }, { type: 'diagram', attrs: diagramAttrs() }], host);
    const first = openDiagramEditor(e, diagramPos(e, 0), host);
    await expect(openDiagramEditor(e, diagramPos(e, 1), host)).resolves.toBe('unavailable');
    expect(host.edit).toHaveBeenCalledTimes(1);
    pending.resolve(null);
    await first;
    await expect(openDiagramEditor(e, diagramPos(e, 1), makeHost())).resolves.toBe('cancelled');
  });

  it('never opens an empty editor for a diagram without its data, nor in a read-only document', async () => {
    const host = makeHost();
    const e = make([{ type: 'diagram', attrs: diagramAttrs({ source: null }) }, { type: 'diagram', attrs: diagramAttrs() }], host);
    await expect(openDiagramEditor(e, 0, host)).resolves.toBe('missing-data');
    e.setEditable(false);
    await expect(openDiagramEditor(e, diagramPos(e, 1), host)).resolves.toBe('unavailable');
    await expect(openDiagramEditor(e, 0, null)).resolves.toBe('unavailable');
    expect(host.edit).not.toHaveBeenCalled();
  });

  it('follows the diagram when content before it changes, and refuses to apply when it was removed or the editor reloaded', async () => {
    // Moved: a paragraph added above while the dialog is open.
    let pending = later<EmbeddedDiagram | null>();
    // Round 3: the host hears whether each saved result got into the document (it keeps the edits until then).
    const settle = vi.fn();
    const host = makeHost({ edit: vi.fn(() => pending.promise), settle });
    const e = make([para('a'), { type: 'diagram', attrs: diagramAttrs({ previewId: 'keep-me' }) }, { type: 'diagram', attrs: diagramAttrs({ previewId: 'target' }) }], host);
    let run = openDiagramEditor(e, diagramPos(e, 1), host);
    e.commands.insertContentAt(0, para('inserted above'));
    pending.resolve(edited);
    await run;
    expect(diagramsIn(e).map((d) => d.previewId)).toEqual(['keep-me', 'p-edited']);
    expect(settle).toHaveBeenLastCalledWith(edited, true);

    // Removed while open.
    pending = later();
    run = openDiagramEditor(e, diagramPos(e, 1), host);
    const at = diagramPos(e, 1);
    e.commands.deleteRange({ from: at, to: at + 1 });
    pending.resolve(edited);
    await expect(run).rejects.toThrow(DIAGRAM_GONE);
    expect(diagramsIn(e).map((d) => d.previewId)).toEqual(['keep-me']);
    expect(settle).toHaveBeenLastCalledWith(edited, false);

    // Reloaded (editor destroyed) while open.
    pending = later();
    run = openDiagramEditor(e, diagramPos(e, 0), host);
    e.destroy();
    settle.mockClear();
    pending.resolve(edited);
    await expect(run).rejects.toThrow(RELOADED_NOT_APPLIED);
    expect(settle).toHaveBeenCalledWith(edited, false);
    // A cancelled dialog has nothing to settle.
    settle.mockClear();
    const e2 = make([{ type: 'diagram', attrs: diagramAttrs() }], makeHost({ settle }));
    await openDiagramEditor(e2, 0, makeHost({ settle }));
    expect(settle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The React node view inside the real DocumentEditor.
// ---------------------------------------------------------------------------------------------------------------
const withProviders = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const docWith = (content: JSONContent[], schemaVersion = 2): DocumentContent => ({ ...createEmptyDocument(), schemaVersion, doc: { type: 'doc', content } });
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent | undefined;
const savedDiagram = (onChange: ReturnType<typeof vi.fn>) => lastSaved(onChange)?.doc.content?.find((n) => n.type === 'diagram')?.attrs;
const findBox = () => waitFor(() => document.querySelector<HTMLElement>('.dcos-diagram-box') ?? Promise.reject(new Error('no diagram yet')));
const pointer = (type: string, init: Record<string, unknown>) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  for (const k of ['pointerId', 'pointerType'] as const) if (k in init) Object.defineProperty(ev, k, { value: init[k] });
  return ev;
};

describe('the diagram in the document', () => {
  it('is sized by its width and aspect ratio, not a fixed height (no letterboxing when the width is capped)', async () => {
    withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={vi.fn()} diagramHost={makeHost()} />);
    const box = await findBox();
    const style = box.getAttribute('style') ?? '';
    expect(style).toMatch(/width:\s*300px/);
    expect(style).toMatch(/aspect-ratio:\s*400\s*\/\s*200/);
    expect(style).not.toMatch(/(^|;)\s*height:/);
  });

  it('shows its alignment and caption, uses its alt text, and tells screen readers how to edit it', async () => {
    const attrs = diagramAttrs({ align: 'right', caption: 'Figure 1. The cycle', alt: 'A loop of four steps' });
    withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs }], 3)} title="T" onChange={vi.fn()} diagramHost={makeHost()} />);
    const img = await waitFor(() => document.querySelector<HTMLImageElement>('.dcos-diagram img') ?? Promise.reject(new Error('no img')));
    const figure = img.closest('.dcos-diagram')!;
    expect(figure.tagName).toBe('FIGURE');
    expect(figure.getAttribute('data-align')).toBe('right');
    expect(figure.querySelector('figcaption')?.textContent).toBe('Figure 1. The cycle');
    expect(img.getAttribute('alt')).toBe('A loop of four steps');
    expect(document.getElementById(img.getAttribute('aria-describedby')!)?.textContent).toMatch(/press enter or double-click/i);
  });

  it('a missing preview says "preview unavailable" in its accessible name', async () => {
    withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={vi.fn()} diagramHost={makeHost({ loadPreview: vi.fn(async () => undefined) })} />);
    const missing = await screen.findByRole('img', { name: /preview unavailable/ });
    expect(missing.getAttribute('aria-label')).toBe('Cycle — preview unavailable');
  });

  it('Enter on the selected diagram opens the editor through its view, which announces that it is busy', async () => {
    const pending = later<EmbeddedDiagram | null>();
    const host = makeHost({ edit: vi.fn(() => pending.promise) });
    withProviders(<DocumentEditor initialContent={docWith([para('a'), { type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={vi.fn()} diagramHost={host} />);
    const box = await findBox();
    fireEvent.mouseDown(box, { button: 0 });
    const body = screen.getByRole('textbox', { name: 'Document body' });
    act(() => void body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await waitFor(() => expect(host.edit).toHaveBeenCalledTimes(1));
    expect(within(box).getByRole('status').textContent).toBe('Editing…');
    await act(async () => pending.resolve(null));
    expect(within(box).queryByRole('status')).toBeNull();
  });

  it('two taps on a touch screen open the editor once; a single tap does not', async () => {
    const host = makeHost();
    withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={vi.fn()} diagramHost={host} />);
    const box = await findBox();
    const tap = (x: number) => {
      box.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: 10 }));
      fireEvent.click(box, { clientX: x, clientY: 10 });
    };
    tap(10);
    await flush();
    expect(host.edit).not.toHaveBeenCalled();
    tap(14);
    await flush();
    expect(host.edit).toHaveBeenCalledTimes(1);
    // The browser's own dblclick after the double-tap does not open a second dialog.
    fireEvent.doubleClick(box);
    await flush();
    expect(host.edit).toHaveBeenCalledTimes(1);
    // Two mouse clicks are not a double-tap.
    box.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', pointerId: 1 }));
    fireEvent.click(box);
    fireEvent.click(box);
    await flush();
    expect(host.edit).toHaveBeenCalledTimes(1);
  });

  describe('resizing', () => {
    const setup = async (onChange = vi.fn()) => {
      withProviders(<DocumentEditor initialContent={docWith([para('a'), { type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={onChange} diagramHost={makeHost()} />);
      const box = await findBox();
      fireEvent.mouseDown(box, { button: 0 });
      const handle = await waitFor(() => box.querySelector<HTMLElement>('.dcos-diagram-handle') ?? Promise.reject(new Error('no handle')));
      return { box, handle, onChange };
    };

    it('a cancelled drag (pointercancel) changes nothing, and later pointer events do not resize', async () => {
      const { box, handle, onChange } = await setup();
      act(() => {
        handle.dispatchEvent(pointer('pointerdown', { pointerId: 3, pointerType: 'touch', button: 0, clientX: 100 }));
        window.dispatchEvent(pointer('pointermove', { pointerId: 3, clientX: 40 }));
      });
      expect(box.style.width).toBe('240px'); // follows the finger while dragging
      act(() => void window.dispatchEvent(pointer('pointercancel', { pointerId: 3, clientX: 40 })));
      expect(box.style.width).toBe('300px');
      act(() => {
        window.dispatchEvent(pointer('pointermove', { pointerId: 3, clientX: 10 }));
        window.dispatchEvent(pointer('pointerup', { pointerId: 3, clientX: 10 }));
      });
      await flush();
      expect(box.style.width).toBe('300px');
      expect(savedDiagram(onChange)?.width ?? 300).toBe(300);
    });

    it('a finished drag stores the new width and keeps the aspect ratio; it starts from the width on screen', async () => {
      const { box, handle, onChange } = await setup();
      // Shown narrower than stored (a narrow page or phone): the drag starts from what the user sees.
      box.getBoundingClientRect = () => ({ width: 200, height: 100, x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 100, toJSON: () => ({}) });
      act(() => {
        handle.dispatchEvent(pointer('pointerdown', { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 100 }));
        window.dispatchEvent(pointer('pointermove', { pointerId: 4, clientX: 50 }));
        window.dispatchEvent(pointer('pointerup', { pointerId: 4, clientX: 50 }));
      });
      await waitFor(() => expect(savedDiagram(onChange)).toMatchObject({ width: 150, height: 75 }));
    });

    it('a tap on the handle without dragging changes nothing', async () => {
      const { handle, onChange } = await setup();
      act(() => {
        handle.dispatchEvent(pointer('pointerdown', { pointerId: 5, pointerType: 'touch', button: 0, clientX: 100 }));
        window.dispatchEvent(pointer('pointerup', { pointerId: 5, clientX: 101 }));
      });
      await flush();
      expect(savedDiagram(onChange)?.width ?? 300).toBe(300);
    });
  });

  describe('a missing preview is drawn again from the diagram\'s data', () => {
    const png = new Blob(['redrawn'], { type: 'image/png' });

    it('stores it and points the diagram at it, without an undo step', async () => {
      const onChange = vi.fn();
      const stored = new Map<string, Blob>();
      const host = makeHost({
        loadPreview: vi.fn(async (id: string) => stored.get(id)),
        renderPreview: vi.fn(async () => ({ png, width: 400, height: 200 })),
        storePreview: vi.fn(async (b: Blob) => (stored.set('p-redrawn', b), 'p-redrawn')),
      });
      withProviders(<DocumentEditor initialContent={docWith([para('a'), { type: 'diagram', attrs: diagramAttrs({ previewId: 'p-gone' }) }])} title="T" onChange={onChange} diagramHost={host} />);
      await waitFor(() => expect(savedDiagram(onChange)?.previewId).toBe('p-redrawn'));
      expect(host.renderPreview).toHaveBeenCalledWith(source, 'Cycle');
      expect(savedDiagram(onChange)).toMatchObject({ width: 300, height: 150, naturalWidth: 400, naturalHeight: 200, source });
      expect(lastSaved(onChange)?.schemaVersion).toBe(2);
      await waitFor(() => expect(document.querySelector('.dcos-diagram img')).not.toBeNull());
      // Undo does not bring the missing preview back.
      const body = screen.getByRole('textbox', { name: 'Document body' });
      act(() => void body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true })));
      await flush();
      expect(savedDiagram(onChange)?.previewId).toBe('p-redrawn');
      expect(host.renderPreview).toHaveBeenCalledTimes(1);
    });

    it('a diagram that never had a preview gets one, and a new shape updates its natural size', async () => {
      const onChange = vi.fn();
      const host = makeHost({ loadPreview: vi.fn(async () => undefined), renderPreview: vi.fn(async () => ({ png, width: 600, height: 200 })), storePreview: vi.fn(async () => 'p-first') });
      withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs({ previewId: null }) }])} title="T" onChange={onChange} diagramHost={host} />);
      await waitFor(() => expect(savedDiagram(onChange)).toMatchObject({ previewId: 'p-first', naturalWidth: 600, naturalHeight: 200, width: 300, height: 100 }));
    });

    it('in a read-only document it is shown but nothing is stored or changed', async () => {
      const onChange = vi.fn();
      const host = makeHost({ loadPreview: vi.fn(async () => undefined), renderPreview: vi.fn(async () => ({ png, width: 400, height: 200 })), storePreview: vi.fn(async () => 'never') });
      const content = docWith([{ type: 'diagram', attrs: diagramAttrs() }, { type: 'futureWidget' }]);
      withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} diagramHost={host} />);
      expect(await screen.findByText(/opened read-only/i)).toBeTruthy();
      await waitFor(() => expect(document.querySelector('.dcos-diagram img')?.getAttribute('src')).toMatch(/^blob:/));
      expect(host.storePreview).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    // Round 3: the clipboard plugin no longer redraws pasted diagrams itself; the view does it, once.
    it('a pasted diagram whose preview is gone is drawn and stored once, as part of the paste (one undo removes it)', async () => {
      const onChange = vi.fn();
      const stored = new Map<string, Blob>();
      const host = makeHost({
        loadPreview: vi.fn(async (id: string) => stored.get(id)),
        renderPreview: vi.fn(async () => ({ png, width: 400, height: 200 })),
        storePreview: vi.fn(async (b: Blob) => (stored.set('p-pasted', b), 'p-pasted')),
      });
      withProviders(<DocumentEditor initialContent={docWith([para('x')])} title="T" onChange={onChange} diagramHost={host} />);
      const body = await screen.findByRole('textbox', { name: 'Document body' });
      const html = `<figure data-type="diagram" data-diagram='${JSON.stringify(diagramAttrs({ previewId: 'p-lost' }))}'></figure>`;
      const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      ev.clipboardData = { types: ['text/html'], getData: (t: string) => (t === 'text/html' ? html : ''), setData: () => {}, clearData: () => {} };
      act(() => void body.dispatchEvent(ev));
      await waitFor(() => expect(savedDiagram(onChange)?.previewId).toBe('p-pasted'));
      await flush();
      expect(host.renderPreview).toHaveBeenCalledTimes(1);
      expect(host.storePreview).toHaveBeenCalledTimes(1);
    });

    it('when nothing can be drawn it says so, and stores nothing', async () => {
      const onChange = vi.fn();
      const host = makeHost({ loadPreview: vi.fn(async () => undefined), renderPreview: vi.fn(async () => null), storePreview: vi.fn(async () => 'never') });
      withProviders(<DocumentEditor initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={onChange} diagramHost={host} />);
      expect(await screen.findByRole('img', { name: 'Cycle — preview unavailable' })).toBeTruthy();
      expect(host.renderPreview).toHaveBeenCalledTimes(1);
      expect(host.storePreview).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('the Selected diagram bar sets alignment, caption, alternative text and the title (rename without re-rendering)', async () => {
    const onChange = vi.fn();
    const host = makeHost();
    withProviders(<DocumentEditor initialContent={docWith([para('a'), { type: 'diagram', attrs: diagramAttrs() }])} title="T" onChange={onChange} diagramHost={host} />);
    fireEvent.mouseDown(await findBox(), { button: 0 });
    const bar = await screen.findByRole('toolbar', { name: 'Selected diagram' });
    const commit = (name: string, value: string) => {
      const field = within(screen.getByRole('toolbar', { name: 'Selected diagram' })).getByRole('textbox', { name });
      fireEvent.change(field, { target: { value } });
      fireEvent.keyDown(field, { key: 'Enter' });
    };
    fireEvent.click(within(bar).getByRole('button', { name: 'Align left' }));
    await waitFor(() => expect(savedDiagram(onChange)?.align).toBe('left'));
    commit('Caption', 'Figure 2. Steps');
    await waitFor(() => expect(savedDiagram(onChange)?.caption).toBe('Figure 2. Steps'));
    commit('Alternative text', 'Four steps in a loop');
    await waitFor(() => expect(savedDiagram(onChange)?.alt).toBe('Four steps in a loop'));
    commit('Diagram title', 'Renamed cycle');
    await waitFor(() => expect(savedDiagram(onChange)?.title).toBe('Renamed cycle'));
    expect(lastSaved(onChange)?.schemaVersion).toBe(3);
    expect(document.querySelector('.dcos-diagram figcaption')?.textContent).toBe('Figure 2. Steps');
    expect(document.querySelector('.dcos-diagram')?.getAttribute('data-align')).toBe('left');
    // Centre is stored as no alignment; an empty caption or alt text as none: back to content schema 2.
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selected diagram' })).getByRole('button', { name: 'Centre' }));
    commit('Caption', '');
    commit('Alternative text', ' ');
    await waitFor(() => expect(savedDiagram(onChange)).toMatchObject({ align: null, caption: null, alt: null, title: 'Renamed cycle' }));
    expect(lastSaved(onChange)?.schemaVersion).toBe(2);
    expect(host.edit).not.toHaveBeenCalled();
    expect(savedDiagram(onChange)?.source).toEqual(source);
  });

  // Round 3 (verifier, NODE): a click on another diagram selects it before the field loses focus.
  it('text typed in the bar goes to the diagram it was typed for, even when another diagram is clicked next', async () => {
    const onChange = vi.fn();
    withProviders(
      <DocumentEditor
        initialContent={docWith([{ type: 'diagram', attrs: diagramAttrs({ title: 'A' }) }, para('between'), { type: 'diagram', attrs: diagramAttrs({ title: 'B', alt: 'B already' }) }])}
        title="T"
        onChange={onChange}
        diagramHost={makeHost()}
      />,
    );
    await waitFor(() => expect(document.querySelectorAll('.dcos-diagram-box')).toHaveLength(2));
    const [boxA, boxB] = Array.from(document.querySelectorAll<HTMLElement>('.dcos-diagram-box'));
    fireEvent.mouseDown(boxA, { button: 0 });
    const field = () => within(screen.getByRole('toolbar', { name: 'Selected diagram' })).getByRole('textbox', { name: 'Alternative text' }) as HTMLInputElement;
    await waitFor(() => expect(field().value).toBe(''));
    const typed = field();
    fireEvent.focus(typed);
    fireEvent.change(typed, { target: { value: 'Alt for A' } });
    // The click on B selects it (and re-renders the bar for B) before focus leaves the field.
    fireEvent.mouseDown(boxB, { button: 0 });
    await flush();
    expect(typed.value).toBe('Alt for A');
    fireEvent.blur(typed);
    await waitFor(() => expect(lastSaved(onChange)?.doc.content?.filter((n) => n.type === 'diagram').map((n) => n.attrs?.alt)).toEqual(['Alt for A', 'B already']));
    // B stays selected, and the bar now shows B's text.
    await waitFor(() => expect(field().value).toBe('B already'));
  });
});
