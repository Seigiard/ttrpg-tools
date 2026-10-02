# Guillotine layout for paper minis

We use full-width strips, columns and stacks, with first fit across sheets. This keeps cuts straight while filling space beside taller minis. Minis sort by footprint height, then width, both descending; equal sizes keep their order. On each sheet, we try existing stacks, new columns, then a new strip before moving to the next sheet. It is the only layout: the legacy width-sorted row layout used to run beside it as a fallback candidate and was removed.

The packer returns positions measured from the usable area's top-left corner. The PDF writer draws those placements rather than calculating its own layout. The live counter and PDF therefore share one layout decision.

Geometry also owns the internal layout of each mini. It resolves the Floor strip, Tabs, Faces, Fold, cut-mark levels and back badge offset in millimetres, and derives the mini's total height from those levels. The PDF writer converts the resolved values to points and draws them without rebuilding the vertical stack.

## Trade-offs

- MaxRects can fill irregular holes but does not preserve straight cuts across each piece. Easy cutting matters more than those extra packing opportunities.
- A separate dense mode would make users choose between paper usage and cutting. One automatic guillotine layout serves both needs.
- The row candidate is gone. It only won on hand-built inputs, and keeping it doubled the layout code and its tests for a sheet that real sets did not save.
- Rotation is reserved for rescuing a mini that cannot fit upright. If it fits turned, the guillotine places it in a dedicated strip. Its footprint is the cut-out turned, with no reserve for marks. The PDF writer turns the whole mini clockwise. Minis that fit neither orientation are reported as oversized. Rotation for density adds complexity without saving a sheet in the prototype described in [spec #70](https://github.com/Seigiard/ttrpg-tools/issues/70).
- Minis abut with no gap: neighbouring columns, stacked minis and strips share one cut line. This replaces the earlier 4 mm gap, which kept outside cut marks apart. The marks now sit on the piece itself: an inward corner at each outer corner and a tick on each edge at every fold, each arm pointing into the piece. Every arm runs along a cut edge or a fold, so no stray line stays on the cut mini, and one cut separates two neighbours.

## Evidence

The hand-built stacking case uses one 92×264 mm footprint and four 44×124 mm footprints. They fit in three columns on one A4 sheet. Tests also check bounds, no overlap, copy conservation, deterministic output and straight-cut partitions on mixed inputs.

The [25-mini fixture](../../src/lib/paper-minis/fixtures/pdf-70.md) reconstructs the #70 set from transcribed PDF raster measurements. Its tests check the prototype's 4 A4 / 3 Letter budget on rounded and raw inputs, with all copies preserved. This is a geometry reconstruction, not an exact archive: it has no back art and does not cover PDF rendering. The upper sensitivity sample needs 4 Letter sheets, so the tested budget does not extend to every measurement perturbation.
