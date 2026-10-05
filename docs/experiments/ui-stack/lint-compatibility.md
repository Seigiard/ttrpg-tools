# Anti-slop compatibility after merging main

Both candidates incorporate `main` at `5ad97a6`. This brings the vendored
anti-slop rules, Size Limit, and lazy PDF loading into the experiment.

## Coverage

- Preact uses Oxlint on TS and TSX, including JSX expressions and handlers.
- Svelte uses Oxlint on TS and component script blocks. An additional ESLint
  pass uses `svelte-eslint-parser` with `@typescript-eslint/parser` to check
  scripts and template expressions. It imports the same vendored anti-slop
  plugin through its existing ESLint adapter and reads rule levels from
  `.oxlintrc.json`. It also enables the recommended Svelte rules.
- Both candidates include their owned UI primitives in lint coverage.
- Sequential awaits are allowed in the measurement harness and parity tests.
  Measurements need isolated samples. Browser actions depend on earlier actions.
  All other configured rules remain enabled in those files.
- The native `oxc/no-accumulating-spread` rule runs through Oxlint. The Svelte
  ESLint pass shares the anti-slop rules, not native Oxlint rules.

The Svelte pass was checked through its real CLI with an array `filter().map()`
expression in a template. It failed with `anti-slop/no-array-filter-map`.
Existing casts in inline template handlers also produced diagnostics before
being replaced with checks against the domain's allowed values.

## Verification

Each candidate passed lint, format check, typecheck, unit tests, production build,
Size Limit, browser tests, and installation with a frozen lockfile.

| Candidate | Unit tests | Browser tests | All JS, Brotli | CSS, Brotli |
| --- | ---: | ---: | ---: | ---: |
| Preact | 542 | 12 | 219.13 kB | 7.16 kB |
| Svelte | 536 | 12 | 231.98 kB | 7.18 kB |

Budgets remain 360 kB for all JS chunks and 10 kB for CSS. These are aggregate
site assets, including lazy exports. They are not per-page initial payloads.
The earlier runtime and per-page measurements in `REPORT.md` remain historical;
this check does not remeasure interaction timings.

Lazy PDF loading adds an async step before the preview is ready. The Svelte
calibration test now waits for the visible PDF preview before reopening the
editor. Its assertion that unchanged calibration keeps the preview current is
unchanged.
