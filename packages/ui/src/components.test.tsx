// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  // Round 3: browsers ignore focus() on an element that is visibility: hidden, which the dropdown is until placed.
  it('focuses the first item only once the menu is placed (not while it is still hidden)', () => {
    const seen: string[] = [];
    const real = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, o?: FocusOptions) {
      const menu = this.closest('[role="menu"]') as HTMLElement | null;
      if (menu) seen.push(menu.style.visibility || 'visible');
      real.call(this, o);
    });
    try {
      renderMenu();
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
      expect(seen).toEqual(['visible']);
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }));
    } finally {
      spy.mockRestore();
    }
  });

  it('follows its trigger when a toolbar scrolls, and closes once the trigger is off screen', () => {
    const { container } = render(
      <div data-testid="bar" style={{ overflowX: 'auto' }}>
        <Menu
          trigger={(p) => (
            <button type="button" {...p}>
              Layout
            </button>
          )}
          items={[{ label: 'Two content', onSelect: vi.fn() }]}
        />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Layout' });
    let left = 100;
    (trigger.parentElement as HTMLElement).getBoundingClientRect = () =>
      ({
        left,
        right: left + 60,
        top: 10,
        bottom: 40,
        width: 60,
        height: 30,
        x: left,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.click(trigger);
    expect(screen.getByRole('menu').style.left).toBe('100px');
    left = 40;
    fireEvent.scroll(container.querySelector('[data-testid="bar"]')!);
    expect(screen.getByRole('menu').style.left).toBe('40px');
    // A scroll inside the menu itself changes nothing.
    fireEvent.scroll(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeTruthy();
    left = -200;
    fireEvent.scroll(container.querySelector('[data-testid="bar"]')!);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // Phase 7 Round 3 (menu-height): a long menu (Insert > Diagram, 20 items) ran off the bottom of a 720 px window, so
  // its last items could not be clicked and End focused an item nobody could see.
  describe('a menu taller than the room below its trigger', () => {
    const ITEM = 30;
    const many = Array.from({ length: 20 }, (_, i) => ({
      label: `Item ${i + 1}`,
      onSelect: vi.fn(),
    }));
    function renderLong(rect: { top: number; bottom: number }, count = many.length) {
      const view = render(
        <Menu
          trigger={(p) => (
            <button type="button" {...p}>
              Diagram
            </button>
          )}
          items={many.slice(0, count)}
        />,
      );
      const trigger = screen.getByRole('button', { name: 'Diagram' });
      (trigger.parentElement as HTMLElement).getBoundingClientRect = () =>
        ({
          left: 100,
          right: 180,
          top: rect.top,
          bottom: rect.bottom,
          width: 80,
          height: rect.bottom - rect.top,
          x: 100,
          y: rect.top,
          toJSON: () => ({}),
        }) as DOMRect;
      return { ...view, trigger };
    }
    const spies: Array<{ mockRestore: () => void }> = [];
    let innerHeight: number;
    beforeEach(() => {
      innerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 720,
      });
      // Layout jsdom does not do: each item is 30 px tall, stacked from the menu's 4 px padding; the menu shows
      // whatever its max-height allows (or all of it).
      const isMenu = (el: HTMLElement) => el.getAttribute('role') === 'menu';
      const itemIndex = (el: HTMLElement) => Array.from(el.parentElement?.children ?? []).indexOf(el);
      const full = (el: HTMLElement) => el.querySelectorAll('[role="menuitem"]').length * ITEM + 8;
      spies.push(
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
          return isMenu(this) ? full(this) : 0;
        }),
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
          if (!isMenu(this)) return 0;
          const cap = parseFloat(this.style.maxHeight);
          return Number.isFinite(cap) ? Math.min(cap, full(this)) : full(this);
        }),
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
          if (isMenu(this)) return this.clientHeight; // no border in this fake layout
          return this.getAttribute('role') === 'menuitem' ? ITEM : 0;
        }),
        vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
          return this.getAttribute('role') === 'menuitem' ? 4 + itemIndex(this) * ITEM : 0;
        }),
      );
    });
    afterEach(() => {
      spies.splice(0).forEach((s) => s.mockRestore());
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: innerHeight,
      });
    });

    it('is capped to the room below and scrolls inside itself', () => {
      const { trigger } = renderLong({ top: 170, bottom: 200 }); // the menu needs 608 px (20 × 30 + 8): 508 free below, 158 above
      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe('204px');
      expect(menu.style.maxHeight).toBe(`${720 - 200 - 4 - 8}px`);
      expect(menu.style.overflowY).toBe('auto');
    });

    it('opens above its trigger when there is more room there', () => {
      const { trigger } = renderLong({ top: 600, bottom: 630 }, 8); // 248 px menu; 78 px free below, 588 above
      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe(`${600 - 4 - 248}px`);
      expect(menu.style.maxHeight).toBe(`${600 - 4 - 8}px`);
      expect(parseFloat(menu.style.top) + 248).toBeLessThanOrEqual(600);
    });

    it('stays below, uncapped in effect, when it fits there', () => {
      const { trigger } = renderLong({ top: 10, bottom: 40 }, 3); // 98 px menu
      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe('44px');
      expect(menu.style.maxHeight === '' || parseFloat(menu.style.maxHeight) > 98).toBe(true); // a cap it never reaches
    });

    it('keeps the focused item scrolled into view for End, Home and the arrow keys', () => {
      const { trigger } = renderLong({ top: 300, bottom: 330 }); // 378 px free below, more than the 296 above
      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      const view = () => [menu.scrollTop, menu.scrollTop + menu.clientHeight];
      const visible = (name: string) => {
        const el = screen.getByRole('menuitem', { name });
        const [from, to] = view();
        return el.offsetTop >= from && el.offsetTop + el.offsetHeight <= to;
      };
      expect(menu.clientHeight).toBe(720 - 330 - 4 - 8);
      expect(visible('Item 1')).toBe(true);
      const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });
      key('End');
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Item 20' }));
      expect(visible('Item 20')).toBe(true);
      expect(menu.scrollTop).toBe(20 * ITEM + 8 - menu.clientHeight); // scrolled to the very end, padding included
      key('Home');
      expect(visible('Item 1')).toBe(true);
      expect(menu.scrollTop).toBe(0);
      for (let i = 0; i < 15; i++) key('ArrowDown');
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Item 16' }));
      expect(visible('Item 16')).toBe(true);
      key('ArrowDown'); // wraps to the first
      expect(visible('Item 1')).toBe(false);
    });
  });

  it('closes when the window is resized', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Dialog', () => {
  it('is named by its title and described by its description', async () => {
    const { Dialog } = await import('./components');
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    render(
      <Dialog open onClose={vi.fn()} title="Version history" description="Snapshots of this item.">
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Version history' });
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Snapshots of this item.').id);
  });
});
