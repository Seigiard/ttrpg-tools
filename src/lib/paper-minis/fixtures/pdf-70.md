# Raster reconstruction of the #70 PDF set

## Evidence and scope

- [Spec #70](https://github.com/Seigiard/ttrpg-tools/issues/70) names 25 minis: one Large-tall, one Large, one Medium-tall, 18 Medium, two Medium-short and two Small.
- [The prototype comment](https://github.com/Seigiard/ttrpg-tools/issues/70#issuecomment-5943758723) reports rows at 4 A4 / 5 Letter, strips at 4 / 4, and strips with stacks at 4 / 3.
- The user supplied four rendered PDF page images and transcribed cut-mark x coordinates on 2026-10-02. The binary PDF and source artwork were not exposed to this task. The agent used the transcription, not a fresh image inspection.
- Every page has the same 100 mm ruler at x=33..662: 629 raster pixels. `pdf-70.ts` preserves all 25 pairs in page/row order. One-based IDs below follow that order.

This is a geometry reconstruction, not an exact archive of the original set. There are no invented source-image pixel dimensions. `naturalWidth` and `naturalHeight` carry a ratio in millimetre-derived units, which is all the packer consumes. Four separate backs mentioned in the spec cannot be identified or recovered. Each reconstructed front represents the observed outer envelope; this fixture does not cover back-art fitting or PDF rendering.

## Resolving the slot ambiguity

The user's rough heights of 84, 58, 45 and 37 mm match artwork heights of 82, 56, 43 and 35 mm plus a 2 mm figure margin. `fitFigure` in `geometry.ts` fits to the slot height and only scales **down** if art exceeds the width cap (1.5 times slot height). Wide art cannot make a Medium taller.

The supplied dwarf y measurements give `(402−130)×100/629 = 43.243 mm` and `(698−427)×100/629 = 43.084 mm`. Normal art gives `(351−130)×100/629 = 35.135 mm`. The dwarf is therefore Medium-tall (43 mm art), not Large or Medium. Its measured outline is only `234×100/629 = 37.202 mm` wide; Large requires at least 37+4 = 41 mm.

The tall orc on page 2 is Large, with 56 mm art and a 190 mm outline. The large snake is Large-tall. The spider and green snake on page 1 are Medium. This assignment also matches all six slot counts in the spec.

At the default 2 mm figure margin, an outline has two artwork faces, two margins and four tabs. A tab is half the category base:

| Slot | Art height | Base width | Outline height |
| --- | ---: | ---: | ---: |
| Large-tall | 82 | 37 | 242 |
| Large | 56 | 37 | 190 |
| Medium-tall | 43 | 25 | 140 |
| Medium | 35 | 25 | 124 |
| Medium-short | 27 | 25 | 108 |
| Small | 20 | 25 | 94 |

All numbers are mm. For example, Medium is `2×35 + 2×2 + 4×12.5 = 124`.

## Widths and uncertainty

Outline width is `(right−left)×100/629`. Subtract 4 mm to represent the art envelope. A base-limited outline does not reveal the narrower art inside it; the fixture uses that envelope rather than guessing hidden artwork. The packer retains the category's minimum outline width. Thus a measured 182 px (28.935 mm) Medium resolves to 29 mm, within raster error.

Measured outline widths rounded to 0.1 mm, grouped like the supplied images:

| Page / row | Widths (mm) |
| --- | --- |
| 1 | 75.4, 55.3, 48.5 |
| 2 | 43.2, 41.2, 39.4, 39.6 |
| 3 top | 38.3, 37.2, 36.9, 35.0 |
| 3 bottom | 34.2, 31.3, 30.8, 29.1, 29.1 |
| 4 top | 28.9, 29.3, 28.9, 28.9, 29.1 |
| 4 bottom | 28.9, 29.3, 28.9, 28.9 |

`rounded` uses these tenths; `raw` keeps the rational conversion without decimal rounding. The sensitivity samples assume each picked endpoint may be off by one pixel, including the ruler endpoints:

- `lower`: `(span−2)×100/631`.
- `upper`: `(span+2)×100/627`.

These are simultaneous width extremes, not an exhaustive interval proof. Heights are slot inferences, not independently known source dimensions. Near-equal widths can change order, so original per-page identities and exact coordinates are not regression expectations.

## Page-count oracle and arithmetic check

The budget oracle comes from #70's prototype, not from running `packMinis`. The dedicated test checks the original row counts and the new upper budgets, while requiring all 25 distinct copies to survive. It tests both rounded and raw measurements.

A separate arithmetic check confirms that the rounded geometry admits a three-sheet Letter layout. Letter's usable area is 196×259 mm under the project's 216×279 mm convention. In this constructive witness, commas separate columns, `/` stacks two minis, and each strip is cut independently:

| Sheet | Strip columns (one-based IDs) | Width with 4 mm gaps | Height |
| --- | --- | ---: | ---: |
| 1 | 1, 5, 9/23, 18/21 | 195.1 | 242 |
| 2 top | 2, 3, 4, 10 | 195.9 | 124 |
| 2 bottom | 7, 6, 8, 11 | 164.3 | 124 |
| 3 top | 12, 13, 14, 15, 16 | 170.5 | 124 |
| 3 bottom | 17, 20, 22, 25, 19, 24 | 194.0 | 124 |

The stacks are `140+4+94 = 238` and `124+4+108 = 236` mm, both below 242. Two normal strips need `124+4+124 = 252` mm, below 259. Each ID appears once. This is a feasibility witness, not a required placement order or a proof of optimality.

The raw outline widths of the 22 Small/Medium/Medium-short minis sum to 751.987 mm. With 21 gaps that is 835.987 mm, **not** the spec's approximate 822 mm. The fixture does not reproduce that secondary estimate or claim the spec's four-A4 lower-bound argument has been independently proved.

Observed results at `47660a6`:

| Reconstruction | Rows A4 | Rows Letter | New A4 | New Letter |
| --- | ---: | ---: | ---: | ---: |
| Rounded | 4 | 5 | 4 | 3 |
| Raw | 4 | 5 | 4 | 3 |
| Lower sensitivity sample | 4 | 5 | 4 | 3 |
| Upper sensitivity sample | 4 | 5 | 4 | **4** |

The upper sample exceeds the three-Letter budget. For example, the first sheet's four witness columns grow from 195.1 to about 196.848 mm, beyond 196. The original PDF budget is not an independently established guarantee for every perturbation. An initial test applied it to those samples too; the upper Letter assertion failed. That unsupported interval guarantee was withdrawn, not fixed by changing dimensions. Sensitivity modes remain reproducible in the fixture. The surviving tests cover the supplied measurements and their stated rounding only.

## Regression calibration

A temporary Bun loader replaced only the candidate-selection expression in memory with `rowPlacements(rows.pages)`. Production files were not edited. All four Letter budget assertions in that initial run failed; row counts, copy conservation and A4 checks passed (12 pass / 4 fail). The temporary loader was removed. The final raw/rounded suite passes 8 tests with the real packer and fails its two Letter budget tests with that same row-only mutation.
