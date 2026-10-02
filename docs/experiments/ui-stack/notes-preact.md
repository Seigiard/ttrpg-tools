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

## Compatibility Decisions

- `@base-ui/react`: keep it only for unmigrated React islands. For Preact, use native primitives instead of routing Base UI through `preact/compat`.
- Reason: Base UI wrappers are React components, so compat would make Preact islands depend on React-shaped component semantics during the migration and make the final “no React runtime” target harder to prove. The local needs are small: button styling, tabs selection/keyboard movement and one modal dialog.
- Compatibility gap accepted in P2: the native Dialog does not implement Base UI's full portal/focus-management surface. It implements the behavior used by `PaperMinisGenerator`: default-open modal, title, Escape close and `finalFocus` restore. P4 will validate it against the paper-minis component tests.
- `lucide-react`: keep it only for unmigrated React islands. Preact components use `lucide-preact` through `src/components/icons.preact.ts`.
- `preact/compat`: not enabled. P1 smoke and P2 primitives use native Preact APIs.

## Config And Cost

- Config cost: one extra Astro integration and renderer include/exclude patterns in `astro.config.mjs`.
- Runtime cost in production tool routes: not measured in P1. No production island migrated yet, and React remains in current bundles until P5.
- Framework-independent code changes: none. `src/data`, `src/lib` and `src/stores` were not changed.
- P2 local source/test cost: 864 added lines across native Preact primitives, `ReferenceList`, icon seam and tests, measured with `wc -l` on the new P2 files.
- P2 installed package footprint in `node_modules`: `preact` 1.8M, `@preact` 1.1M, `lucide-preact` 32M, `@nanostores/preact` 20K, `@testing-library/preact` 3.6M. This is install footprint, not production bundle cost.
- Production route runtime cost: still not measured in P2. Production routes still use React islands; the Preact smoke route remains the only Preact Astro island.
