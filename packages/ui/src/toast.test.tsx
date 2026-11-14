// @vitest-environment jsdom
/**
 * RG-8 / TD-24: toasts must be seen and announced while a modal dialog is open. Everything outside an open modal
 * <dialog> is drawn below it and is inert (also for screen readers), so toasts are shown inside the dialog then.
 */
import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ToastProvider, topModalDialog, useToast } from './toast';

let toast: ReturnType<typeof useToast>;
function Page({ dialogOpen }: { dialogOpen: boolean }) {
  toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // jsdom has no top layer; `open` is what showModal() sets.
    if (dialogOpen) ref.current?.setAttribute('open', '');
    else ref.current?.removeAttribute('open');
  }, [dialogOpen]);
  return (
    <dialog ref={ref} aria-label="Edit diagram">
      <p>Dialog body</p>
    </dialog>
  );
}

// jsdom has no showModal() and its :modal never matches: an open dialog here stands for a modal one.
beforeAll(() => {
  HTMLDialogElement.prototype.matches = function (this: HTMLDialogElement, selector: string) {
    return selector === ':modal' ? this.open : Element.prototype.matches.call(this, selector);
  };
});
afterAll(() => {
  delete (HTMLDialogElement.prototype as { matches?: unknown }).matches;
});

const mount = (dialogOpen: boolean) =>
  render(
    <ToastProvider>
      <Page dialogOpen={dialogOpen} />
    </ToastProvider>,
  );

describe('toasts and modal dialogs', () => {
  it('without a dialog: shown in the page, as a status message; errors as alerts', () => {
    mount(false);
    act(() => toast('Saved', 'success'));
    act(() => toast('Could not save', 'error'));
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    expect(status.textContent).toBe('Saved');
    expect(alert.textContent).toBe('Could not save');
    expect(document.querySelector('dialog')!.contains(status)).toBe(false);
  });

  it('while a modal dialog is open: shown inside it, so it is drawn above it and not inert', async () => {
    mount(true);
    expect(topModalDialog()).toBe(document.querySelector('dialog'));
    act(() => toast('The diagram could not be saved', 'error'));
    await act(async () => {});
    const alert = screen.getByRole('alert');
    expect(document.querySelector('dialog')!.contains(alert)).toBe(true);
  });

  it('moves back to the page when the dialog closes, and into a dialog that opens later', async () => {
    const view = mount(true);
    act(() => toast('Inserted', 'info'));
    await act(async () => {});
    expect(document.querySelector('dialog')!.contains(screen.getByRole('status'))).toBe(true);
    view.rerender(
      <ToastProvider>
        <Page dialogOpen={false} />
      </ToastProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('Inserted');
    expect(document.querySelector('dialog')!.contains(screen.getByRole('status'))).toBe(false);
    view.rerender(
      <ToastProvider>
        <Page dialogOpen />
      </ToastProvider>,
    );
    await act(async () => {});
    expect(document.querySelector('dialog')!.contains(screen.getByRole('status'))).toBe(true);
  });

  // Round 3 (verifier, DIALOG): a dialog unmounted while still open (never closed) used to keep the empty toast area,
  // so the next toast was inserted together with its area and screen readers might not announce it.
  it('after a dialog is removed without being closed, the toast area is back in the page before the next toast', async () => {
    function Picker({ show }: { show: boolean }) {
      toast = useToast();
      return show ? (
        <dialog open aria-label="Insert from my diagrams">
          <p>List</p>
        </dialog>
      ) : null;
    }
    const view = render(
      <ToastProvider>
        <Picker show />
      </ToastProvider>,
    );
    await act(async () => {});
    expect(document.querySelector('dialog')!.querySelector('[data-dcos-toasts]')).not.toBeNull();
    view.rerender(
      <ToastProvider>
        <Picker show={false} />
      </ToastProvider>,
    );
    await act(async () => {});
    act(() => toast('Diagram added', 'success'));
    // The (still empty) area is in the page first; the toast follows a moment later.
    const area = document.querySelector('[data-dcos-toasts]');
    expect(area?.isConnected).toBe(true);
    expect(area?.childElementCount).toBe(0);
    await act(() => new Promise((r) => setTimeout(r, 80)));
    expect(screen.getByRole('status').textContent).toBe('Diagram added');
    expect(document.querySelector('[data-dcos-toasts]')!.contains(screen.getByRole('status'))).toBe(true);
  });
});
