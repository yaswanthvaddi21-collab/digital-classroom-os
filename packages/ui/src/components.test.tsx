// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './components';

function renderMenu() {
  return render(
    <Menu
      trigger={(p) => (
        <button type="button" {...p}>
          Actions
        </button>
      )}
      items={[{ label: 'Rename', onSelect: vi.fn() }]}
    />,
  );
}

describe('Menu', () => {
  it('consumes Escape when it closes, so an enclosing dialog stays open', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Rename' }), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('leaves Escape alone when it is closed', () => {
    renderMenu();
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(true);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  // TD-25 (Phase 6 Round 3): the keyboard menu pattern.
  it('focuses the first item on open, moves with the arrow keys, Home and End, and gives focus back on Escape', () => {
    render(
      <Menu
        trigger={(p) => (
          <button type="button" {...p}>
            Diagram
          </button>
        )}
        items={[
          { label: 'Edit', onSelect: vi.fn() },
          { label: 'Disabled', onSelect: vi.fn(), disabled: true },
          { label: 'Download', onSelect: vi.fn() },
          { label: 'Remove', onSelect: vi.fn() },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Diagram' });
    trigger.focus();
    fireEvent.click(trigger);
    const item = (name: string) => screen.getByRole('menuitem', { name });
    expect(document.activeElement).toBe(item('Edit'));
    const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });
    key('ArrowDown');
    expect(document.activeElement).toBe(item('Download')); // the disabled item is skipped
    key('End');
    expect(document.activeElement).toBe(item('Remove'));
    key('ArrowDown');
    expect(document.activeElement).toBe(item('Edit')); // wraps
    key('ArrowUp');
    expect(document.activeElement).toBe(item('Remove'));
    key('Home');
    expect(document.activeElement).toBe(item('Edit'));
    key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
