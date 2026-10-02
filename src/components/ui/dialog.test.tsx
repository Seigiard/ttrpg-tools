import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { createRef } from 'preact';
import { Dialog, DialogContent, DialogTitle } from './dialog';

function dispatchCancel(element: HTMLElement) {
  element.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('Preact Dialog', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  test('renders an accessible modal dialog with its title wired as the label', async () => {
    // #given an open calibration dialog
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Задать рост</DialogTitle>
          <button type="button">Применить</button>
        </DialogContent>
      </Dialog>,
    );

    // #when it mounts
    const dialog = await screen.findByRole('dialog', { name: 'Задать рост' });

    // #then the modal semantics are present
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDefined();
  });

  test('Escape closes the dialog and restores final focus', async () => {
    // #given a dialog launched from a button that must regain focus
    const launcher = createRef<HTMLButtonElement>();
    render(
      <div>
        <button ref={launcher} type="button">
          Open calibration
        </button>
        <Dialog defaultOpen>
          <DialogContent finalFocus={launcher}>
            <DialogTitle>Задать рост</DialogTitle>
            <button type="button">Применить</button>
          </DialogContent>
        </Dialog>
      </div>,
    );
    await screen.findByRole('dialog', { name: 'Задать рост' });

    // #when the user presses Escape
    dispatchCancel(screen.getByRole('dialog', { name: 'Задать рост' }));

    // #then the dialog is removed and the launcher is focused again
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(launcher.current);
    });
  });

  test('Shift+Tab from the dialog container keeps focus inside the modal', async () => {
    // #given a dialog whose container itself has focus
    render(
      <div>
        <button type="button">Editor button</button>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Задать рост</DialogTitle>
            <button type="button">Отмена</button>
            <button type="button">Применить</button>
          </DialogContent>
        </Dialog>
      </div>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Задать рост' });
    dialog.focus();

    // #when the user reverse-tabs from the focused dialog surface
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });

    // #then focus wraps to the last dialog control instead of escaping to the page
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Применить' }));
  });

  test('clicking outside the popup closes the dialog', async () => {
    // #given a dialog with a visible outside-click target
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Задать рост</DialogTitle>
          <button type="button">Применить</button>
        </DialogContent>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Задать рост' });
    const outside = dialog;

    // #when the user clicks outside the popup
    fireEvent.click(outside);

    // #then the dialog is removed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull();
    });
  });

  test('locks document scrolling while the dialog is open', async () => {
    // #given a scrollable page behind an open dialog
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Задать рост</DialogTitle>
          <button type="button">Применить</button>
        </DialogContent>
      </Dialog>,
    );

    // #when the dialog mounts
    await screen.findByRole('dialog', { name: 'Задать рост' });
    const lockedOverflow = document.body.style.overflow;
    dispatchCancel(screen.getByRole('dialog', { name: 'Задать рост' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull();
    });

    // #then page scrolling is blocked only for the open modal lifetime
    await waitFor(() => {
      expect({ lockedOverflow, restoredOverflow: document.body.style.overflow }).toEqual({
        lockedOverflow: 'hidden',
        restoredOverflow: '',
      });
    });
  });
});
