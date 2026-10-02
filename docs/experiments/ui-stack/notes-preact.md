# Preact UI Stack Notes

## P1: Toolchain Beside React

- Added `@astrojs/preact`, `preact`, `@nanostores/preact`, `@testing-library/preact` and `lucide-preact` while keeping the current React toolchain in place.
- Astro renderer split: Preact is registered before React and handles files named `*.preact.tsx` or `*.preact.jsx`; React excludes those files and handles the existing `.tsx` islands. The include/exclude set also contains `**/*.preact` because Astro's component metadata can preserve an extensionless TS import such as `PreactSmokeIsland.preact`.
- Added `src/pages/experiments/preact-smoke.astro` with a `client:load` Preact island to prove that one Preact island builds and hydrates before production components move. It is not linked from the product index.
- Preact files use `/** @jsxImportSource preact */` while the repo-level JSX settings still point to React for unmigrated components.
- Installed `preact@^10.29.0` because `@astrojs/preact@6.0.5` declares a Preact 10 peer. An initial install of Preact 11 produced a peer warning, so it was replaced before checks.

## Compatibility Decisions

- `@base-ui/react`: not evaluated in P1. It remains on React islands only. P2 will decide whether to replace it with native Preact primitives or use `preact/compat`.
- `lucide-react`: not evaluated in P1. `lucide-preact` is installed for the native Preact path and will be used when icon-bearing components migrate.
- `preact/compat`: not enabled in P1. There are no migrated production components yet, and the smoke island uses native Preact APIs.

## Config And Cost

- Config cost: one extra Astro integration and renderer include/exclude patterns in `astro.config.mjs`.
- Runtime cost in production tool routes: not measured in P1. No production island migrated yet, and React remains in current bundles until P5.
- Framework-independent code changes: none. `src/data`, `src/lib` and `src/stores` were not changed.
