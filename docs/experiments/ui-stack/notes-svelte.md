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

## S3 · Weather, locations, encounters and prices

- Migrated the weather, locations, encounters and The Black Hack prices islands to Svelte and switched their Astro pages to `.svelte` imports.
- Replaced the React component tests for those four islands with Svelte tests using `@testing-library/svelte`. Assertion intent is unchanged: deterministic first rolls, rerolls, tab switches, reference hit markers, skeleton wrappers and prices URL/localStorage sync.
- Removed the replaced React generator components and the React `ReferenceList`; `PaperMinisGenerator.tsx` is still React and is left for S4.
- Kept `src/data`, `src/lib` and `src/stores` unchanged. The Svelte islands bind nanostores via the Svelte store contract (`$store`).
- Svelte warns when a prop is captured for store initialization; these islands intentionally treat table props as static Astro data and suppress that warning at the store construction line. If tables ever become live-updated props, the component should remount via `key` or rebuild the store explicitly.

## S2 · Svelte primitives, icons and ReferenceList

- Added Svelte versions of `Button`, `Card`, `Skeleton`, `Tabs`, `Dialog` and `ReferenceList` beside the React files. Existing React islands still import the React files; production island migration starts in S3.
- `ReferenceList.svelte` uses Svelte snippets for the label and row content slots. Its tests keep the previous DOM contract: row order, `data-hit`, `data-row-index` and the non-colour left border marker.
- `Tabs` is implemented without Base UI. It keeps `role="tablist"`, `role="tab"`, `aria-selected`, roving focus and arrow-key selection.
- `Dialog` uses native `<dialog>`, with Escape handling, focus trap and focus restore. Happy DOM does not expose native dialog semantics exactly like a browser, so the test dispatches keyboard events on the `<dialog>` element directly.
- Added `@lucide/svelte` and a local `src/components/icons.ts` facade for Svelte icons. `lucide-react` remains until the React islands are migrated.
- `astro check` alone did not catch a deliberate `.svelte` type error. The `typecheck` script now runs `astro check && svelte-check --tsconfig ./tsconfig.json`.
- `svelte-check` also caught real S2 issues that `astro check` missed: an invalid Svelte element type import, dialog props being spread onto the wrong element type and a possibly undefined bound dialog element.

No changes to `src/data`, `src/lib` or `src/stores` were needed.
