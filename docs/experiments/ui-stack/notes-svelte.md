# Svelte UI Stack Notes

## S1 · Toolchain beside React

- Added `@astrojs/svelte` and `svelte` beside the existing React integration.
- Scoped Astro integrations by file extension: React owns `*.jsx`/`*.tsx`, Svelte owns `*.svelte`.
- Added `prettier-plugin-svelte` and included `.svelte` files in `format` and `format:check`.
- Added a Bun test preload plugin that compiles `.svelte` and `.svelte.js/.svelte.ts` imports with `svelte/compiler`, so `@testing-library/svelte` tests can run under `bun test` with the existing happy-dom setup.
- Bun resolves `svelte` to the server export during tests, so the preload rewrites `@testing-library/svelte`'s runtime imports to Svelte's client entry. `bun --conditions=browser test` also works for the fixture, but `bunfig.toml` does not apply that condition to plain `bun test`.
- Added a small Svelte fixture island under `/fixtures/svelte-probe` to prove Astro can build and hydrate a Svelte island without migrating a production component. A `__fixtures` route is not enough because Astro excludes underscore-prefixed route segments from the build.
- Astro's multi-renderer check cannot identify the existing hook-based React function islands by calling them, so the current React island exports are wrapped in `React.memo`. This keeps the components on React while giving Astro an object marker it can route to the React renderer.

No changes to `src/data`, `src/lib` or `src/stores` were needed.
