# Preact UI Stack Notes

## P1: Toolchain Beside React

- Added `@astrojs/preact`, `preact`, `@nanostores/preact`, `@testing-library/preact` and `lucide-preact` while keeping the current React toolchain in place.
- Astro renderer split: Preact is registered before React and handles files named `*.preact.tsx` or `*.preact.jsx`; React excludes those files and handles the existing `.tsx` islands. The include/exclude set also contains `**/*.preact` because Astro's component metadata can preserve an extensionless TS import such as `PreactSmokeIsland.preact`.
- Added `src/pages/experiments/preact-smoke.astro` with a `client:load` Preact island to prove that one Preact island builds and hydrates before production components move. It is not linked from the product index.
- Preact files use `/** @jsxImportSource preact */` while the repo-level JSX settings still point to React for unmigrated components.
- Installed `preact@^10.29.0` because `@astrojs/preact@6.0.5` declares a Preact 10 peer. An initial install of Preact 11 produced a peer warning, so it was replaced before checks.

## P2: Preact Primitives

- Added native Preact versions beside the React primitives: `button.preact.tsx`, `card.preact.tsx`, `skeleton.preact.tsx`, `tabs.preact.tsx`, `dialog.preact.tsx`, `ReferenceList.preact.tsx` and `icons.preact.ts`.
- Kept the React primitive files in place. Current React generators still import `@/components/ui/button`, `@/components/ui/tabs`, `@/components/ui/dialog`, etc.
- Ported the existing `Skeleton` and `ReferenceList` assertion intent to `@testing-library/preact` tests.
- Added Preact tests for the new native `Button`, `Card`, `Tabs`, `Dialog` and icon seam.
- `Tabs` is a small native controlled/uncontrolled primitive with `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `data-active` and arrow/Home/End focus movement.
- `Dialog` is a small native modal primitive with `role="dialog"`, `aria-modal`, title labelling, Escape close, basic Tab focus loop and `finalFocus` restore. It does not use a portal in P2.

## P3: Weather, Locations, Encounters And Prices

- Migrated the four non-paper generator islands to native Preact files: `WeatherGenerator.preact.tsx`, `LocationGenerator.preact.tsx`, `EncounterGenerator.preact.tsx` and `BlackHackPricesGenerator.preact.tsx`.
- Switched their Astro pages to import the `.preact` islands directly, while `PaperMinisGenerator` remains React for P4.
- Replaced the four React component test files with Preact test files using `@testing-library/preact`. The assertions keep the same intent: first client roll after mount, click routing, tab switching, `data-testid`s, `data-*` flags, highlighted reference rows and prices URL/localStorage behavior.
- The migrated islands use `@nanostores/preact`, `preact/hooks`, Preact primitives and `lucide-preact` via `icons.preact.ts`. They do not import React, `@nanostores/react`, `@testing-library/react` or `lucide-react`.
- Known P2 Dialog defect is deferred to P4 because P3 does not migrate the paper-minis dialog user. The P4 fix should make the open/close effect depend on open-state transitions only. Native `<dialog>.showModal()` is a candidate because it gives top-layer modality and inert background behavior; validate it against SSR, happy-dom tests and existing styling before choosing it.

## P4: Paper Minis

- Migrated the Paper Minis island to `PaperMinisGenerator.preact.tsx` and switched `src/pages/paper-minis.astro` to the Preact island. The old React component and tests were removed from the working tree.
- Kept the native Preact primitive direction: no `preact/compat`, no React hooks, no `@nanostores/react`, and icons still route through `icons.preact.ts`.
- Ported the latest main Paper Minis behavior after rebase: draft input recovery, ZIP export, batch/back upload planning, calibration session state, PDF/preview failure reporting, and row/thumbnail calibration overlays.
- P4 kept a custom div-based Dialog. It was later replaced by a native `<dialog>` opened with `showModal()` (see below).
- Test port notes: Preact + happy-dom needs explicit waits for nanostore-driven rerenders, and primary pointer-capture paths are stubbed in the Paper Minis component tests because happy-dom's pointer capture can keep the test process alive. Browser coverage still exercises the calibration user flow through Playwright.
- Verification after P4: `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun test`, `bun run build`, `bun run test:browser`, and `PORT=4401 bun run e2e` all pass. `lint` still reports existing warnings outside the P4 port.

## P5: React Removed

- Removed the React-side packages and config: `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@base-ui/react`, `lucide-react`, `@nanostores/react`, `@testing-library/react`, `shadcn` and `components.json`.
- Kept the Preact-side replacements versus main: `@astrojs/preact`, `preact`, `@nanostores/preact`, `lucide-preact` and `@testing-library/preact`.
- Dropped the `.preact` suffix from production files and tests. `astro.config.mjs` now registers `preact()` without include/exclude filters, and `tsconfig.json` sets `jsxImportSource` to `preact`, so file-level `/** @jsxImportSource preact */` pragmas are gone.
- Removed the P1 smoke route and fixture. Coverage moved to real primitives and production islands: `Button`, `Card`, `Tabs`, `Dialog`, `Skeleton`, `ReferenceList`, icons and all generator components have Preact tests.
- Line counts after suffix collapse, compared with React originals on main `0c530f3` using `git show 0c530f3:<path> | wc -l`: UI source is 2148 LOC Preact versus 1915 LOC React. UI tests are 1921 LOC Preact versus 1578 LOC React. The Preact counts include native primitive tests and icon seam tests that main did not have.
- No React runtime evidence after `bun run build`: grep of `dist/` for `react-dom`, `react.production`, `react/jsx-runtime` and `jsx-runtime` returned no matches. `results/preact/versions.json` also has empty snippets for `@astrojs/react`, `react-dom`, `@base-ui/react` and `@nanostores/react`; the `react` key only catches package names containing `preact`.
- Measurement output: `PORT=4411 bun run measure -- --out docs/experiments/ui-stack/results/preact`. External JS gzip per route: encounters 21413 B, locations 24368 B, weather 23217 B, prices 23852 B, paper minis 213012 B. An earlier static report undercounted shared chunks; the harness fix in `scripts/ui-stack/payload.ts` corrected it.
- Dialog modality: the dialog is a native `<dialog>` opened with `showModal()`, so the background is inert and focus stays in the top layer. Page scroll is locked while it is open, as Base UI did on main. The earlier div-based dialog let `Shift+Tab` from the dialog container reach the page; review round 03 caught it. A backdrop click is detected by the click point lying outside the dialog box, so clicks on the dialog padding do not close it.
- Test pitfall: happy-dom primary pointer-capture paths can keep the test process alive. Paper Minis component tests stub `setPointerCapture`/`releasePointerCapture` and use store-driven calibration updates for unit-level apply/reset assertions. Playwright still covers the keyboard calibration flow in a browser.
- Migration pitfalls seen before fixing: first browser modality probe failed with `ERR_CONNECTION_REFUSED` because Astro preview kept a stale singleton status for port 4401; `astro preview stop` cleared it. Removing `shadcn` also removed its Tailwind variants (`data-active`, `data-horizontal`, `data-vertical`) that the tab classes use; they are now vendored in `global.css`.

## Compatibility Decisions

- `@base-ui/react`: removed in P5. Preact uses local native primitives instead of routing React wrappers through `preact/compat`.
- Reason: Base UI wrappers are React components, so compat would make Preact islands depend on React-shaped component semantics and would weaken the “no React runtime” proof. The local needs are small: button styling, card slots, tabs selection/keyboard movement and one modal dialog.
- Dialog: Base UI is replaced by a native `<dialog>` opened with `showModal()`, which gives top-layer modality and an inert background. A page scroll lock and focus restore on every close path match what Base UI did on main. No accepted compatibility gap remains for the dialog.
- `lucide-react`: removed in P5. Preact components use `lucide-preact` through `src/components/icons.ts`.
- `preact/compat`: not enabled. All islands and primitives use native Preact APIs.

## Config And Cost

- Config cost after P5: one Astro integration, `@astrojs/preact`; no React renderer and no include/exclude suffix filter.
- Runtime cost in production tool routes: measured in `docs/experiments/ui-stack/results/preact/` after React removal.
- Framework-independent code changes: none. `src/data`, `src/lib` and `src/stores` were not changed.
- P2 local source/test cost: 864 added lines across native Preact primitives, `ReferenceList`, icon seam and tests, measured with `wc -l` on the new P2 files.
- P2 installed package footprint in `node_modules`: `preact` 1.8M, `@preact` 1.1M, `lucide-preact` 32M, `@nanostores/preact` 20K, `@testing-library/preact` 3.6M. This is install footprint, not production bundle cost.
- Production route runtime cost: still not measured in P2. Production routes still use React islands; the Preact smoke route remains the only Preact Astro island.
