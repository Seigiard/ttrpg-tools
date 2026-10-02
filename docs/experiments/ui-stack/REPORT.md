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
| Unit and component tests | 518 | 531 | 530 |
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

Main's own paper-minis browser suite (WebP decoding, trimming, decode failure, front-and-back PDF) also passes on both candidates. Zip export and import are covered by component tests only, as on main.

Behaviour that had to be rebuilt by hand, because Base UI has no Preact or Svelte version:

| Primitive | React | Preact | Svelte |
| --- | --- | --- | --- |
| Tabs | Base UI | own, roving focus, arrows/Home/End | own, roving focus, arrows |
| Dialog | Base UI (portal, focus guards, inert) | own `div` + `aria-modal` + keydown trap | native `<dialog>` + `showModal()` |
| Icons | `lucide-react` | `lucide-preact` | `@lucide/svelte` |
| Store binding | `@nanostores/react` | `@nanostores/preact` | Svelte store contract (`$store`), no adapter |

The Preact dialog passes the focus-trap test, but its background is not `inert`. Svelte gets real modality from the browser top layer.

## Payload

The figures are static analysis of `dist/` and count every JS chunk the route loads, following imports (gzip, bytes). They agree with the cold network transfer measured in Chromium (second table).

Initial-load JS:

| Route | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| encounters | 87,400 | 21,688 | 34,312 |
| weather | 95,222 | 23,217 | 35,301 |
| locations | 96,440 | 24,368 | 36,878 |
| prices | 95,813 | 23,852 | 35,891 |
| paper-minis | 296,499 | 213,031 | 227,940 |

Lazy JS, loaded only on demand: the zip export chunk on paper minis (6.1 KB in every build). Preact adds 3.0 KB on every island page for `@preact/signals`, which `@astrojs/preact` imports dynamically. The candidates' encounters page includes the follow-up change (about 300 B); React's does not.

Cold load, all bytes transferred (HTML + CSS + JS, uncompressed transfer from `vite preview`):

| Route | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| encounters | 104,332 | 39,316 | 52,295 |
| weather | 113,287 | 41,423 | 53,098 |
| paper-minis | 312,146 | 228,935 | 243,460 |

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
| weather click-to-result | 71 (61–85) | 63 (60–76) | 58 (55–88) |
| prices tab switch | 41 (40–57) | 80 (78–83) | 51 (49–55) |
| paper-minis upload-to-row | 51 (49–57) | 39 (38–40) | 43 (43–53) |
| paper-minis preview ready | 73 (68–84) | 80 (67–87) | 75 (64–84) |
| paper-minis PDF generation | 69 (65–84) | 76 (61–86) | 73 (61–76) |

These timings include Playwright round trips. Most ranges overlap and show no interaction problem.

The one clear gap is the prices tab switch on Preact: 80 ms, with ranges that do not overlap React's 41 ms. The scenario stops when the URL changes, and the URL is written in an effect. Preact runs `useEffect` after the next paint, while React flushes it right after a discrete click. So the likely cause is a later URL write, not a slower tab render; this was not profiled. A `useLayoutEffect` for the URL sync would test the hypothesis.

An earlier version of this table measured the prices tab switch on clicks into an already selected tab. Review caught it, and all three builds were remeasured.

## Expressiveness and reuse

Line counts are supporting evidence, not a score. They are counted after formatting, on `src/components/**`.

| | React | Preact | Svelte |
| --- | ---: | ---: | ---: |
| UI source lines | 1,915 | 2,148 | 1,989 |
| of which UI primitives (`ui/`) | 272 | 495 | 629 |
| Component test lines | 1,578 | 1,921 | 1,657 |
| UI source files | 11 | 12 | 30 |
| Paper minis component | 902 (1 file) | 948 (1 file) | 807 (3 files) |

- **Preact** keeps the React authoring model: JSX, hooks and `useStore`. Generator components port almost line for line. The extra lines are the hand-written Tabs and Dialog. The Preact tests are longer: Preact plus happy-dom needs explicit waits after Nanostores-driven re-renders, and pointer capture is stubbed in tests, which the browser suite covers.
- **Svelte** removes the store adapter (`$store`), and templates are shorter per component. One `.svelte` file holds one component, so sub-components and Card parts become separate files: 30 files against 11. Generic render props become snippets. Svelte also warns when a prop is captured to build a store; the code suppresses this, because Astro props are static.

## Change cost (follow-up change)

The change was fixed before anyone implemented it: a history of the last five encounter checks, newest first, with a clear button.

| | React | Preact | Svelte |
| --- | --- | --- | --- |
| Files touched | 2 | 2 | 2 |
| Component diff | +34 −1 | +26 −1 | +40 −4 |
| Test diff | +52 | +85 | +48 |
| Shape | `useState` + `useEffect` on the roll | identical to React | `$state` + a wrapper around `rollCheck` |

Diffs: `results/{react,preact,svelte}/followup.diff`. The Svelte diff contains formatter noise: prettier re-wrapped a `Button` line that the change did not touch. It also needs one `<!-- prettier-ignore -->`, because prettier otherwise changes the whitespace between two `<span>`s. The first Preact attempt was over-engineered; one review round brought it to the React shape.

## Maintenance and toolchain

| | Preact | Svelte |
| --- | --- | --- |
| Config files changed vs main | 3 (`astro.config`, `package.json`, `tsconfig`) | 6 (+ `test-setup.ts`, `.prettierrc.json`, CI) |
| Dependencies | −10, +5 | −10, +7 |
| Type checking | `astro check` covers `.tsx` as before | `astro check` does **not** check `.svelte` types (verified with a deliberate error); `svelte-check` added to `typecheck` |
| Formatting | `oxfmt` as before | `oxfmt` for TS + `prettier-plugin-svelte` for `.svelte` |
| Unit tests under Bun | work as before; component tests need explicit waits after store updates | needs a 60-line Bun preload plugin that compiles `.svelte` and redirects `svelte` to its client build. Plain `bun test` fails 25 tests, because parallel files share one happy-dom document. CI runs `bun test --parallel=1` |
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

## Limitations

- One machine, one browser (Chromium 153), local `vite preview`. There is no CDN, HTTP/2 or real-network measurement, and no Lighthouse run.
- Timings ran while other builds were running; treat them as a smoke check.
- Screenshots exist for every route at 1280 and 390 px (`results/*/screenshots/`). They were compared by eye, not pixel-diffed.
- Coding agents wrote the candidates under review. A second pass by a framework expert could shrink either one, most likely Svelte's test setup and Preact's test waits.
- The earlier loot-splitter prototype (in the issue) measured a smaller Svelte runtime than this app needs: 20.6 KB gzip there, about 34 KB here. A larger component set pulls in more of the Svelte runtime.

## Recommendation

**Preact.** On this project it gives the smallest payload: about 22–24 KB of JS per generator page, against 34–37 KB for Svelte and 87–96 KB for React. It changes the fewest files and keeps the authoring model and the test tooling the codebase already uses. The follow-up change came out identical in shape to React.

What it costs: owning Tabs and Dialog (about 220 extra lines), longer component tests, and a dialog that is not `inert` like a native one. Switching that Dialog to `<dialog>.showModal()`, as Svelte did, is the first follow-up worth doing.

Svelte is a reasonable choice if shorter templates and the adapter-free store binding matter more than payload. On this app it ships about 12 KB more per page than Preact. Its toolchain also needs three additions that React and Preact do not: `svelte-check`, a Bun compile plugin and serial unit tests.

Keeping React costs about 65–70 KB of extra JS per generator page and buys Base UI's maintained primitives. It is a valid choice if that payload does not matter for this site.

Maintainer's choice and rationale: _pending_.
