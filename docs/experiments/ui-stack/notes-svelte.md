# Svelte UI Stack Notes

## S5 · React removal and final measurement

- Removed the React renderer and runtime packages from `package.json`/`bun.lock`: `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@base-ui/react`, `lucide-react`, `@nanostores/react` and `@testing-library/react`. Removed `shadcn` and `components.json`; no current source/config still uses shadcn.
- Removed Astro React integration and TypeScript React JSX settings. `astro.config.mjs` now only registers the Svelte integration.
- Removed the remaining React primitive files and tests: `button.tsx`, `card.tsx`, `dialog.tsx`, `skeleton.tsx`, `tabs.tsx` and `skeleton.test.tsx`. Also removed the temporary Svelte probe route and fixture directory.
- Preserved probe coverage through test-only Svelte beds beside the components: `PrimitiveTestBed.svelte` and `ReferenceListTestBed.svelte`. This keeps tests on real primitives without shipping probe routes.
- LOC evidence excluding generated measurement artifacts: `git diff --stat` for tracked files reports `57 insertions / 1184 deletions`; the two new Svelte test beds add 79 lines, for a source/test net of about `-1048` lines. There are no `*.tsx`/`*.jsx` files left.
- First full check before the fixture fix failed as requested evidence: `bun run lint && bun run format:check && bun run typecheck && bun run test && bun run build` reached `bun test --parallel=1`, then failed because `ReferenceList.svelte.test.ts` still imported deleted `./svelte-fixtures/ReferenceListProbe.svelte`. After moving that test bed, `bun run test` passed with `523 pass / 0 fail`.
- Final CI-equivalent check passed: `bun run lint && bun run format:check && bun run typecheck && bun run test && bun run build`. Unit evidence: `523 pass / 0 fail`. Build evidence: 6 pages built. Existing non-blocking warnings remain: oxlint warnings in legacy loops/sorts/shadowing and one `svelte-check` warning in `src/components/ui/dialog.svelte` about the initial `open` value capture.
- Required browser suite passed: `PORT=4402 bun run test:browser` -> `11 passed`.
- Required measurement passed: `PORT=4412 bun run measure -- --out docs/experiments/ui-stack/results/svelte`. It generated `payload`, `network`, `timings`, `versions` and screenshots under `docs/experiments/ui-stack/results/svelte/`.
- Measurement highlights: payload external JS gzip is `/` 0 B, weather 2584 B, locations 4083 B, encounters 2279 B, prices 4146 B and paper minis 198206 B. Cold transferred bytes are `/` 10395 B, weather 53590 B, locations 57449 B, encounters 52206 B, prices 54100 B and paper minis 243842 B.
- React-runtime grep evidence after the measurement rebuild: `rg -n "react-dom|react\.production|jsx-runtime" dist` produced no output, so the built `dist/` contains none of those strings.
- Remaining React words are historical docs/React baseline measurement records or the payload script's detection heuristic. They are not runtime dependencies or imports.

## S1 · Toolchain beside React

- Added `@astrojs/svelte` and `svelte` beside the existing React integration.
- Scoped Astro integrations by file extension: React owns `*.jsx`/`*.tsx`, Svelte owns `*.svelte`.
- Added `prettier-plugin-svelte` and included `.svelte` files in `format` and `format:check`.
- Added a Bun test preload plugin that compiles `.svelte` and `.svelte.js/.svelte.ts` imports with `svelte/compiler`, so `@testing-library/svelte` tests can run under `bun test` with the existing happy-dom setup.
- Bun resolves `svelte` to the server export during tests, so the preload rewrites `@testing-library/svelte`'s runtime imports to Svelte's client entry. `bun --conditions=browser test` also works for the fixture, but `bunfig.toml` does not apply that condition to plain `bun test`.
- Added a small Svelte fixture island under `/fixtures/svelte-probe` to prove Astro can build and hydrate a Svelte island without migrating a production component. A `__fixtures` route is not enough because Astro excludes underscore-prefixed route segments from the build.
- Astro's multi-renderer check cannot identify the existing hook-based React function islands by calling them, so the current React island exports are wrapped in `React.memo`. This keeps the components on React while giving Astro an object marker it can route to the React renderer.

No changes to `src/data`, `src/lib` or `src/stores` were needed.

## S4 · Paper minis and Bun test isolation

- Plain `bun test` still runs test files in parallel against one process-global happy-dom document from `test-setup.ts`. Svelte component files call `cleanup()` in their own `beforeEach`/`afterEach`, so one file can remove another file's rendered DOM while its assertions are still running.
- Evidence before the serial runner workaround: `bun test` reported `504 pass / 25 fail` on this branch. The failures were Paper Minis DOM lookups such as missing `dialog`, `Задать рост`, custom size inputs, plus a `Svelte Dialog traps Tab, closes on Escape and restores focus` timeout. Full output was saved at `/Users/seigiard/.local/share/opencode/tool-output/tool_0fcb511bf001A1admJ7a3q2Pqs`.
- Counter-evidence: `bun test --parallel=1` runs the same files in a single worker and passes. The `test` script and CI unit-test step use `bun test --parallel=1` until the shared DOM setup is replaced with per-file isolated DOM registration.

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
- Added `@lucide/svelte` and a local `src/components/icons.ts` facade for Svelte icons. `lucide-react` is removed in S5 after the React islands are migrated.
- `astro check` alone did not catch a deliberate `.svelte` type error. The `typecheck` script now runs `astro check && svelte-check --tsconfig ./tsconfig.json`.
- `svelte-check` also caught real S2 issues that `astro check` missed: an invalid Svelte element type import, dialog props being spread onto the wrong element type and a possibly undefined bound dialog element.

No changes to `src/data`, `src/lib` or `src/stores` were needed.
