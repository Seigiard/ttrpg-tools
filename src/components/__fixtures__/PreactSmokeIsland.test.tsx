/** @jsxImportSource preact */
import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { PreactSmokeIsland } from './PreactSmokeIsland.preact';

describe('PreactSmokeIsland', () => {
  afterEach(cleanup);

  test('hydrates and handles client interaction', async () => {
    render(<PreactSmokeIsland />);

    await waitFor(() => {
      expect(screen.getByTestId('preact-smoke').getAttribute('data-hydrated')).toBe('true');
    });

    const button = screen.getByTestId('preact-smoke-button');
    expect(button.textContent).toContain('Count: 0');

    fireEvent.click(button);

    expect(button.textContent).toContain('Count: 1');
  });
});
