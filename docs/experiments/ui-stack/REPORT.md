# UI stack experiment: results (#86)

The whole interactive UI was rewritten twice, once in Preact and once in Svelte. Both rewrites start from the same pinned `main` (`0c530f37`). This report compares them with the React baseline. The choice belongs to the maintainer; a recommendation is at the end.

- Preact candidate: branch `experiment/preact-ui`
- Svelte candidate: branch `experiment/svelte-ui`
- React follow-up reference: branch `experiment/ui-stack-react-followup` (no PR)
- Raw data: `docs/experiments/ui-stack/results/{react,preact,svelte}/`
- Reproduction: `docs/experiments/ui-stack/README.md`
- Per-candidate working notes: `notes-preact.md`, `notes-svelte.md`

## Parity gate

Both candidates pass the gate.

| Check | React | Preact | Svelte |
| --- | --- | --- | --- |
| Lint, format, typecheck, build | pass | pass | pass |
| Unit and component tests | 520 | 536 | 534 |
| Browser tests (main's paper-minis suite + parity suite) | 12/12 | 12/12 | 12/12 |
| React runtime in `dist/` | — | none | none |

Each React component test was ported with the same test count, or more, and the same assertion intent. The parity suite runs the same specs against all three builds. It selects only by role, label or `data-testid`. It covers:

- static content without JavaScript;
- hydration with no console errors;
- every generator's roll and tab behaviour;
- prices URL over localStorage;
- paper-minis upload, size edit, keyboard calibration, focus restore, PDF preview and a valid PDF download;
- a dialog focus trap;
- no horizontal scroll at 390 px.

Main's own paper-minis browser suite (WebP decoding, trimming, decode failure, front-and-back PDF) also passes on both candidates. Zip export is covered by component tests and zip import by store tests (`paper-minis-store.test.ts`); neither has a browser test, as on main.

Behaviour that had to be rebuilt by hand, because Base UI has no Preact or Svelte version:

| Primitive | React | Preact | Svelte |
| --- | --- | --- | --- |
| Tabs | Base UI | own, roving focus, arrows/Home/End | own, roving focus, arrows |
| Dialog | Base UI (portal, focus guards, inert, scroll lock) | native `<dialog>` + `showModal()` + scroll lock | native `<dialog>` + `showModal()` + scroll lock |
| Icons | `lucide-react` | `lucide-preact` | `@lucide/svelte` |
| Store binding | `@nanostores/react` | `@nanostores/preact` | Svelte store contract (`$store`), no adapter |

Both candidates get modality from the browser top layer, and both add the page scroll lock that Base UI provided. The first Preact dialog was a `div` with a keydown trap. Review showed that Shift+Tab from the dialog container reached the page, so it was replaced.

## Payload

The figures are static analysis of `dist/` and count every JS chunk the route loads, following imports (gzip, bytes). They agree with the cold network transfer measured in Chromium (second table).

Initial-load JS:

| Route | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| encounters | 87,400 | 21,714 | 34,312 |
| weather | 95,222 | 23,289 | 35,301 |
| locations | 96,440 | 24,440 | 36,878 |
| prices | 95,813 | 23,923 | 35,891 |
| paper-minis | 296,499 | 213,098 | 228,093 |

Lazy JS, loaded only on demand: the zip export chunk on paper minis (6.1 KB in every build). Preact builds also emit a 3.0 KB `@preact/signals` chunk; `@astrojs/preact` imports it only for islands that receive signal props, and none here does, so pages never fetch it. The candidates' encounters page includes the follow-up change (about 300 B); React's does not.

Cold load, all bytes on the wire (HTML + CSS + JS as served gzip-encoded by `vite preview`; Chrome's `encodedDataLength`):

| Route | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| encounters | 104,332 | 39,365 | 52,295 |
| weather | 113,287 | 41,515 | 53,098 |
| paper-minis | 312,146 | 229,024 | 243,616 |

Warm loads are 1.1–1.7 KB in all three (cache revalidation only).

What accounts for the numbers:

- **React.** `react-dom` client 65.7 KB + Base UI 14.0 KB per page.
- **Preact.** Runtime 4.7 KB + hooks 1.3 KB. A shared 10.8 KB chunk holds `tailwind-merge`, `clsx` and `cva`. React and Svelte ship the same code inside other chunks.
- **Svelte.** Runtime 18.7 KB. A shared 10.3 KB chunk holds `tailwind-merge` and Nanostores.
- **Paper minis, in all three.** About 190 KB is `pdf-lib` and image code, loaded on first paint. No build splits PDF generation into a lazy chunk. Lazy-loading it would save more than any framework switch does on this page.

Inline JS (1.9 KB, Astro island bootstrap) and CSS (8.1–8.6 KB) are about the same in all three.

## Runtime

Ten repeats per scenario in Playwright Chromium 153 on an Apple M1 Pro. Values are medians in ms (min–max).

| Scenario | React | Preact | Svelte |
| --- | --- | --- | --- |
| weather click-to-result | 33 (28–63) | 76 (58–87) | 39 (36–64) |
| prices tab switch | 53 (42–59) | 80 (68–82) | 51 (37–54) |
| paper-minis upload-to-row | 26 (25–31) | 22 (22–25) | 26 (25–31) |
| paper-minis preview ready | 77 (69–86) | 68 (57–83) | 70 (60–80) |
| paper-minis PDF generation | 70 (62–80) | 62 (53–67) | 66 (59–78) |

Every scenario waits until all islands have hydrated, then stops the clock only once its action is visible: a new result, a new URL, a new row, a ready preview, or a finished PDF. The timings include Playwright round trips.

Paper minis timings are within noise of each other. The generators are not: Preact is about 30–40 ms slower than React and Svelte on both interaction scenarios, and the ranges barely overlap. This was not profiled. Two likely contributors: Preact runs `useEffect` after the next paint, and both the prices URL sync and the first-roll logic live in effects; also, `@nanostores/preact` subscribes through an effect. Nothing here is visible as lag to a person, but it is the one measured runtime cost of Preact in this experiment.

Earlier versions of this table had two harness defects. Some scenarios clicked before hydration, and the prices scenario clicked an already selected tab. Review caught both, and all three builds were remeasured.

## Expressiveness and reuse

Line counts are supporting evidence, not a score. They are counted after formatting, on `src/components/**`.

| | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| UI source lines | 1,915 | 2,148 | 1,989 |
| of which UI primitives (`ui/`) | 272 | 495 | 629 |
| Component test lines | 1,578 | 1,921 | 1,657 |
| UI source files | 11 | 12 | 30 |
| Paper minis component | 902 (1 file) | 948 (1 file) | 807 (3 files) |

- **Preact** keeps the React authoring model: JSX, hooks and `useStore`. Generator components port almost line for line. The extra lines are the hand-written Tabs and Dialog. The Preact tests are longer: Preact plus happy-dom needs explicit waits after Nanostores-driven re-renders, and pointer capture is stubbed in tests. No browser test drags the calibration lines in any build either; keyboard calibration is covered.
- **Svelte** removes the store adapter (`$store`), and templates are shorter per component. One `.svelte` file holds one component, so sub-components and Card parts become separate files: 30 files against 11. Generic render props become snippets. Svelte also warns when a prop is captured to build a store; the code suppresses this, because Astro props are static.

## Change cost (follow-up change)

The change was fixed before anyone implemented it: a history of the last five encounter checks, newest first, with a clear button.

| | React | Preact | Svelte |
| --- | --- | --- | --- |
| Files touched | 2 | 2 | 2 |
| Component diff | +34 −1 | +26 −1 | +40 −4 |
| Test diff | +52 | +85 | +48 |
| Shape | `useState` + `useEffect` on the roll | the React shape, plus a ref guard (+8 lines) | `$state` + a wrapper around `rollCheck` |

Diffs: `results/{react,preact,svelte}/followup.diff`. The Svelte diff contains formatter noise: prettier re-wrapped a `Button` line that the change did not touch. It also needs one `<!-- prettier-ignore -->`, because prettier otherwise changes the whitespace between two `<span>`s. The first Preact attempt was over-engineered and one review round brought it to the React shape. A later review then found a race in that shape: Preact runs the effect after paint, so a roll followed quickly by «Очистить» could add the entry back. React flushes the effect after the click and does not race. The Preact fix is a ref guard, 8 more lines.

## Maintenance and toolchain

| | Preact | Svelte |
| --- | --- | --- |
| Config files changed vs main | 3 (`astro.config`, `package.json`, `tsconfig`) | 6 (+ `test-setup.ts`, `.prettierrc.json`, CI) |
| Dependencies | −10, +5 | −10, +7 |
| Type checking | `astro check` covers `.tsx` as before | `astro check` does **not** check `.svelte` types (verified with a deliberate error); `svelte-check` added to `typecheck` |
| Formatting | `oxfmt` as before | `oxfmt` for TS + `prettier-plugin-svelte` for `.svelte` |
| Unit tests under Bun | work as before; component tests need explicit waits after store updates, and one test had to scope its queries because CI runs test files concurrently on one happy-dom document | needs a 60-line Bun preload plugin that compiles `.svelte` and redirects `svelte` to its client build. Plain `bun test` fails 25 tests, because parallel files share one happy-dom document. CI runs `bun test --parallel=1` |
| UI library | none left; own Tabs/Dialog to maintain | none left; own Tabs/Dialog to maintain |

Both candidates drop the shadcn CLI package. The nine Tailwind variants the primitives use (`data-active:`, `data-horizontal/…`) are vendored into `global.css`. The first cut of each candidate got this wrong: Preact silently lost the variants, and Svelte kept an import of a removed package that only built because of a stale `node_modules`.

## Migration cost and adoption path

What stays in either case: Astro pages and layouts, `src/data`, `src/lib`, `src/stores`, the domain tests, and main's paper-minis browser suite. No shared-layer code changed, except comments that named React.

To adopt a candidate:

1. Review and merge its PR. It already replaces every island and removes React.
2. Keep the parity suite and the measurement scripts, or drop them. They live in `e2e/`, `scripts/ui-stack/` and `docs/experiments/ui-stack/`.
3. Close the other candidate's PR without merging.
4. Optional, any stack: lazy-load the PDF/image code on paper minis (≈190 KB of first-load JS).

To keep React: close both PRs. The harness commits are still useful on their own: the parity suite, the payload and network scripts, and the dialog focus test.

## Findings outside the comparison

- The attribution footer has two missing spaces on every tool page, in all three builds (`Mausritter` + `Айзека`, `условиях` + `Mausritter`). It predates the experiment.
- Paper minis ships `pdf-lib` on first load; see Payload.

## Review status

Each candidate went through four rounds of automated multi-agent review (codex reviewers, `revmux`); confirmed findings were fixed between rounds.

- **Svelte:** the last round reported no findings.
- **Preact:** the last round reported six minor findings and no major ones. Two were fixed: a dialog padding click closed the dialog, and the notes were stale. Four remain open:
  - the history-clear guard reads the roll from the last render, so a roll and a clear inside one frame can still race;
  - the race test does not force the deferred effect to run late;
  - one preview test checks the store instead of the rendered preview;
  - the PDF timing check in `scripts/ui-stack/timings.test.ts` confirms only that the button is visible.

## Limitations

- One machine, one browser (Chromium 153), local `vite preview`. There is no CDN, HTTP/2 or real-network measurement, and no Lighthouse run.
- Timings ran while other builds were running; treat them as a smoke check.
- Screenshots exist for every route at 1280 and 390 px (`results/*/screenshots/`). They were compared by eye, not pixel-diffed.
- Coding agents wrote the candidates under review. A second pass by a framework expert could shrink either one, most likely Svelte's test setup and Preact's test waits.
- The earlier loot-splitter prototype (in the issue) measured a smaller Svelte runtime than this app needs: 20.6 KB gzip there, about 34 KB here. A larger component set pulls in more of the Svelte runtime.

## Recommendation

**Preact, by a narrower margin than the payload alone suggests.**

For Preact:
- the smallest payload: about 22–24 KB of JS per generator page, against 34–37 KB for Svelte and 87–96 KB for React;
- the fewest config changes and no new test tooling;
- the same JSX and hooks model the code already uses.

Against it, both measured on this branch:
- generator interactions run 30–40 ms slower than React and Svelte;
- Preact runs effects after paint, and this produced one real race in the follow-up change.

Neither delay is visible to a person, but any effect that must happen before the next interaction needs care in Preact. Profiling that lag is the first follow-up worth doing.

**Svelte is the close second.** It ships about 12 KB more JS per page than Preact and has the shortest templates. It binds stores with no adapter and matches React's interaction timings. Its cost is in tooling: `svelte-check`, a Bun compile plugin and serial unit tests, none of which React or Preact need.

**Keeping React** costs about 65–70 KB of extra JS per generator page and buys Base UI's maintained primitives. It is a valid choice if that payload does not matter for this site.

Both candidates now own their Tabs and Dialog: about 220 extra lines in Preact and about 360 in Svelte.

Maintainer's choice and rationale: _pending_.
