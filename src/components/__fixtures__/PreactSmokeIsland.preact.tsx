/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';

export function PreactSmokeIsland() {
  const [hydrated, setHydrated] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <section data-testid="preact-smoke" data-hydrated={hydrated ? 'true' : undefined}>
      <p data-testid="preact-smoke-status">{hydrated ? 'Preact hydrated' : 'Preact server render'}</p>
      <button type="button" data-testid="preact-smoke-button" onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
    </section>
  );
}
