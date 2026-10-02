import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { createRef } from 'preact';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('Preact Dialog', () => {
  afterEach(cleanup);

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
    fireEvent.keyDown(document, { key: 'Escape' });

    // #then the dialog is removed and the launcher is focused again
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull();
    });
    expect(document.activeElement).toBe(launcher.current);
  });
});
