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
});
