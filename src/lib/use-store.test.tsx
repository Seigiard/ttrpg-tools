import { afterEach, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/preact';
import { atom, type ReadableAtom } from 'nanostores';
import { useStore } from './use-store';

function Value({ store }: { store: ReadableAtom<string> }) {
  return <output>{useStore(store)}</output>;
}

afterEach(cleanup);

test('a store change reaches the DOM without waiting for a timer task', async () => {
  // #given
  const store = atom('before');
  const view = render(<Value store={store} />);

  // #when
  store.set('after');
  await Promise.resolve();

  // #then
  expect(view.container.textContent).toBe('after');
});

test('switching stores reads the new snapshot and stops listening to the old store', async () => {
  // #given
  const first = atom('first');
  const second = atom('second');
  const view = render(<Value store={first} />);

  // #when
  view.rerender(<Value store={second} />);
  first.set('stale');
  second.set('current');
  await Promise.resolve();

  // #then
  expect(view.container.textContent).toBe('current');
});

test('unmount removes the store subscription', () => {
  // #given
  const store = atom('value');
  const view = render(<Value store={store} />);
  expect(store.lc).toBe(1);

  // #when
  view.unmount();

  // #then
  expect(store.lc).toBe(0);
});
