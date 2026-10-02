import { afterEach, beforeEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import HydrationProbe from './HydrationProbe.svelte';

beforeEach(cleanup);
afterEach(cleanup);

test('Svelte fixtures compile and update through the Bun test loader', async () => {
  render(HydrationProbe);

  const button = screen.getByTestId('svelte-hydration-probe');
  expect(button.textContent).toBe('Svelte island ready: 0');
  expect(button.getAttribute('data-count')).toBe('0');

  await fireEvent.click(button);

  expect(button.textContent).toBe('Svelte island ready: 1');
  expect(button.getAttribute('data-count')).toBe('1');
});
