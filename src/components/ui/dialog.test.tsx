import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { createRef } from 'preact';
import { Dialog, DialogContent, DialogTitle } from './dialog';

function dispatchCancel(element: HTMLElement) {
  element.dispatchEvent(new Event('cancel', { cancelable: true }));
}

// happy-dom lays nothing out, so the dialog box is placed explicitly.
function placeDialog(dialog: HTMLElement) {
  dialog.getBoundingClientRect = () =>
    ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100 }) as DOMRect;
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
    // #given an open dialog whose box sits in the middle of the viewport
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Задать рост</DialogTitle>
          <button type="button">Применить</button>
        </DialogContent>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Задать рост' });
    placeDialog(dialog);

    // #when the user clicks the backdrop, which targets the dialog element outside its box
    fireEvent.click(dialog, { clientX: 10, clientY: 10 });

    // #then the dialog is removed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull();
    });
  });

  test('clicking the popup padding keeps the dialog open', async () => {
    // #given an open dialog whose box sits in the middle of the viewport
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Задать рост</DialogTitle>
          <button type="button">Применить</button>
        </DialogContent>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Задать рост' });
    placeDialog(dialog);

    // #when the user clicks the padding, which also targets the dialog element
    fireEvent.click(dialog, { clientX: 200, clientY: 200 });

    // #then the dialog stays open
    expect(screen.getByRole('dialog', { name: 'Задать рост' })).toBeTruthy();
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
