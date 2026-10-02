# UI stack experiment: Preact and Svelte against React (#86)

Pinned base: `0c530f37` on `main` (re-pinned from `48c587c6` to pick up the paper-minis logic changes) (Astro 7, React 19, `@base-ui/react`, `lucide-react`, Nanostores 1.5).
Package manager: Bun 1.4.2. Node 24.21. Browser for e2e and measurements: Playwright Chromium (Playwright 1.63).

Branches:

- `experiment/ui-stack-harness` — this plan, the parity e2e suite, the measurement scripts and the React baseline results. Both candidates fork from its tip.
- `experiment/preact-ui` — the Preact candidate (track P).
- `experiment/svelte-ui` — the Svelte candidate (track S).
- `experiment/ui-stack-react-followup` — the follow-up change on React, for the diff only. No PR.

Each candidate branch ticks only its own track. The other track stays unchecked in that branch's copy.

## Route and component inventory

Astro keeps pages, layouts, static content and attribution. Only the islands and their UI change.

| Route | Island | Interactive behavior |
| --- | --- | --- |
| `/` | none | Static index of tool cards |
| `/mausritter/weather` | `WeatherGenerator` | Season tabs, roll, severe-weather flag, reference table with hit row |
| `/mausritter/locations` | `LocationGenerator` | Biome tabs, roll all, re-roll each part (icon buttons), reference tables |
| `/mausritter/encounters` | `EncounterGenerator` | Independent check (d6) and reaction (2d6) rolls, reference lists |
| `/the-black-hack/prices` | `BlackHackPricesGenerator` | Settlement-type tabs, re-roll all, URL state over localStorage, storage failure tolerance |
| `/paper-minis` | `PaperMinisGenerator` | File upload and drop, batch rows, size and settings fields, front/back artwork, calibration dialog with sliders and pointer input, focus restore, PDF preview and download, busy and error states |

Shared UI that both candidates replace:

- `ui/button` (Base UI Button), `ui/tabs` (Base UI Tabs), `ui/dialog` (Base UI Dialog with portal, backdrop, focus trap, Escape).
- `ui/card`, `ui/skeleton` (plain markup with class variants).
- `ReferenceList` (generic rows with render-prop label and content).
- Icons from `lucide-react` (`RefreshCw` in locations).
- Store bindings through `@nanostores/react` `useStore`.

Framework-independent code that stays as is: `src/data/**`, `src/lib/**` (dice, seeded RNG, paper-minis geometry, codecs, PDF), `src/stores/**`.

## Parity checklist

The browser suite in `e2e/` is the parity seam. The same specs run against each production build.

- Every route renders its static content and attribution with JavaScript disabled.
- First load hydrates and shows a rolled result without a hydration error in the console.
- Weather: roll changes the result; a season tab keeps the row and changes the column; keyboard arrows move between tabs.
- Locations: roll all; each part re-rolls on its own; biome tab switch.
- Encounters: check and reaction roll independently; reference hit row matches the result.
- Prices: bare load writes `s` and `r` to the URL; URL state wins over localStorage; reload restores state; tab switch re-rolls and updates the URL.
- Paper minis: upload an image, edit size, open calibration with keyboard, Escape restores focus, preview the PDF, download a valid PDF (`%PDF-` header, page count > 0).
- Narrow viewport (390 px): no horizontal page scroll on any route.

Component tests stay behavior tests. A migration adapts their rendering harness and keeps their assertions.

## Follow-up change (fixed before any candidate implements it)

Encounters: below the check result card, show the last five check outcomes, newest first. A «Очистить» button empties the history. The history is local component state; the store does not change. Each entry shows the d6 sum and the outcome label. The first automatic roll counts as an entry.

The change lands as its own last commit in each candidate and on the React follow-up branch, so `git show` gives its diff.

## Measurements

All measurements run against `astro build` output served by `astro preview`.

- Static payload per route: external JS, inline JS, HTML, CSS — raw, gzip and Brotli per resource; request count; the largest chunks with their source libraries.
- Cold and warm loads per route in Chromium: transferred bytes and request count from the network log.
- Runtime timings, ten repeats each: click-to-result for a roll, a tab switch, and paper-minis upload-to-row, preview and PDF generation.
- Screenshots of every route at 1280 px and 390 px.

Raw results go to `docs/experiments/ui-stack/results/<react|preact|svelte>/`. Reproduction commands live in `docs/experiments/ui-stack/README.md`.

## Progress

Review base: 48c587c626dba17990da59ea1ccb475054d36c35

- [x] H1 · Plan, inventory, parity checklist and follow-up spec. Done: this file committed.
- [x] H2 · Playwright parity suite in `e2e/` against the production preview. Done: green on React.
- [x] H3 · Measurement scripts and React baseline results. Done: `results/react/` holds raw payload, network, timing data and screenshots.
- [x] H4 · React follow-up change on `experiment/ui-stack-react-followup`. Done: diff saved to `results/react/followup.diff`.
- [ ] P1 · Preact toolchain beside React and the Base UI decision. Done: all CI checks green.
- [ ] P2 · Preact primitives, icons and `ReferenceList` with their tests. Done: CI checks green.
- [ ] P3 · Preact weather, locations, encounters and prices with their tests. Done: CI checks green.
- [ ] P4 · Preact paper minis with its tests. Done: CI checks green.
- [ ] P5 · React removed; no React runtime in any bundle; parity suite green; measurements saved. Done: CI checks and e2e green, `results/preact/` filled.
- [ ] P6 · Follow-up change in Preact. Done: own commit, CI checks and e2e green.
- [ ] S1 · Svelte toolchain beside React (`@astrojs/svelte`, svelte-check in `astro check`, prettier for `.svelte`, test support). Done: all CI checks green.
- [ ] S2 · Svelte primitives, icons and `ReferenceList` with their tests. Done: CI checks green.
- [ ] S3 · Svelte weather, locations, encounters and prices with their tests. Done: CI checks green.
- [ ] S4 · Svelte paper minis with its tests. Done: CI checks green.
- [ ] S5 · React removed; no React runtime in any bundle; parity suite green; measurements saved. Done: CI checks and e2e green, `results/svelte/` filled.
- [ ] S6 · Follow-up change in Svelte. Done: own commit, CI checks and e2e green.
- [ ] R1 · `REPORT.md` with numbers, diffs, compatibility findings, limitations and a recommendation. Done: same report in both candidate branches.
- [ ] R2 · Code review of each branch and two PRs. Done: PRs open.
