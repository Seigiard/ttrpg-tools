import type { ReadableAtom } from 'nanostores';
import { useLayoutEffect, useReducer } from 'preact/hooks';

/** Let Preact batch store updates in its render microtask, without a timer. */
export function useStore<Value>(store: ReadableAtom<Value>): Value {
  const value = store.get();
  const [, render] = useReducer((revision: number) => revision + 1, 0);

  useLayoutEffect(
    () =>
      store.subscribe(() => {
        // subscribe also checks for changes between render and subscription.
        if (value !== store.get()) render(undefined);
      }),
    [store, value],
  );

  return value;
}
