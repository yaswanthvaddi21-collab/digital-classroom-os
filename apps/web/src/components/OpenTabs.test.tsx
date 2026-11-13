// @vitest-environment jsdom
/** The open-items tabs above the editor (Phase 4, G-FILES). */
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeTab, getOpenTabs, MAX_OPEN_TABS, neighbourTab, openTab, resetOpenTabs } from '../lib/openTabs';
import { notifyStorageChanged, storage } from '../lib/storage';
import { MODULES } from '../modules';
import { isTabShortcut, OpenTabs } from './OpenTabs';

beforeEach(() => {
  localStorage.clear();
  resetOpenTabs();
});

describe('open tabs store', () => {
  it('adds each item once, in opening order, and remembers them on this device', () => {
    openTab({ kind: 'document', id: 'a' });
    openTab({ kind: 'diagram', id: 'b' });
    openTab({ kind: 'document', id: 'a' });
    expect(getOpenTabs()).toEqual([
      { kind: 'document', id: 'a' },
      { kind: 'diagram', id: 'b' },
    ]);
    expect(JSON.parse(localStorage.getItem('dcos.openTabs')!)).toEqual(getOpenTabs());
  });

  it('moves to the next tab (wrapping) and, on closing the current one, to its neighbour', () => {
    for (const id of ['a', 'b', 'c']) openTab({ kind: 'document', id });
    expect(neighbourTab({ kind: 'document', id: 'c' }, 1)).toEqual({ kind: 'document', id: 'a' });
    expect(neighbourTab({ kind: 'document', id: 'a' }, -1)).toEqual({ kind: 'document', id: 'c' });
    expect(closeTab({ kind: 'document', id: 'b' })).toEqual({ kind: 'document', id: 'c' });
    expect(closeTab({ kind: 'document', id: 'c' })).toEqual({ kind: 'document', id: 'a' });
    expect(closeTab({ kind: 'document', id: 'a' })).toBeNull();
  });

  it(`keeps at most ${MAX_OPEN_TABS} tabs, closing the one shown least recently`, () => {
    for (let i = 0; i < MAX_OPEN_TABS; i++) openTab({ kind: 'document', id: `d${i}` });
    openTab({ kind: 'document', id: 'd0' }); // shown again: now the most recent
    openTab({ kind: 'document', id: 'new' });
    const ids = getOpenTabs().map((t) => t.id);
    expect(ids).toHaveLength(MAX_OPEN_TABS);
    expect(ids).toContain('d0');
    expect(ids).not.toContain('d1');
    expect(ids.at(-1)).toBe('new');
  });

  it('ignores damaged stored data', async () => {
    localStorage.setItem('dcos.openTabs', '{"not":"a list"}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'dcos.openTabs' }));
    expect(getOpenTabs()).toEqual([]);
    localStorage.setItem('dcos.openTabs', JSON.stringify([{ kind: 'document', id: 'x' }, { kind: 'spreadsheet', id: 'y' }, null]));
    window.dispatchEvent(new StorageEvent('storage', { key: 'dcos.openTabs' }));
    expect(getOpenTabs()).toEqual([{ kind: 'document', id: 'x' }]);
  });

  it('recognises the keyboard shortcut', () => {
    const base = { ctrlKey: true, altKey: true, metaKey: false, shiftKey: false };
    expect(isTabShortcut({ ...base, key: 'ArrowRight' })).toBe(1);
    expect(isTabShortcut({ ...base, key: 'ArrowLeft' })).toBe(-1);
    expect(isTabShortcut({ ...base, altKey: false, key: 'ArrowRight' })).toBe(0);
    expect(isTabShortcut({ ...base, shiftKey: true, key: 'ArrowRight' })).toBe(0);
  });
});

function Probe() {
  const { id = '' } = useParams();
  const location = useLocation();
  const kind = location.pathname.startsWith('/diagrams') ? 'diagram' : 'document';
  return (
    <>
      <OpenTabs kind={kind} id={id} title={kind === 'document' ? 'Live title' : 'Flow'} />
      <output data-testid="at">{location.pathname}</output>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/documents/:id" element={<Probe />} />
        <Route path="/diagrams/:id" element={<Probe />} />
        <Route path="/documents" element={<output data-testid="at">/documents</output>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpenTabs', () => {
  it('shows the open items with their titles, switches with Ctrl+Alt+arrows, and closes tabs', async () => {
    const essay = await storage.create('document', { title: 'Essay', content: {}, templateId: null });
    const flow = await storage.create('diagram', { title: 'Flowchart', content: {}, templateId: null });
    notifyStorageChanged();
    openTab({ kind: 'diagram', id: flow.id });
    renderAt(`/documents/${essay.id}`);
    const nav = await screen.findByRole('navigation', { name: 'Open items' });
    // The current item's live title (being typed) is shown, the other from storage.
    await waitFor(() => expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Flowchart', 'Live title']));
    expect(within(nav).getByRole('link', { name: /Live title/ }).getAttribute('aria-current')).toBe('page');

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true, altKey: true });
    await waitFor(() => expect(screen.getByTestId('at').textContent).toBe(`/diagrams/${flow.id}`));

    // Closing the current tab shows its neighbour; closing the last one goes back to the list.
    fireEvent.click(screen.getByRole('button', { name: 'Close Flow' }));
    await waitFor(() => expect(screen.getByTestId('at').textContent).toBe(`/documents/${essay.id}`));
    expect(screen.queryByRole('navigation', { name: 'Open items' })).toBeNull();
    expect(getOpenTabs()).toEqual([{ kind: 'document', id: essay.id }]);
  });

  it('closes tabs of items that were deleted', async () => {
    const kept = await storage.create('document', { title: 'Kept', content: {}, templateId: null });
    openTab({ kind: 'document', id: 'deleted-long-ago' });
    openTab({ kind: 'diagram', id: 'also-gone' });
    renderAt(`/documents/${kept.id}`);
    await waitFor(() => expect(getOpenTabs()).toEqual([{ kind: 'document', id: kept.id }]));
    expect(MODULES.document.route).toBe('documents');
  });
});
