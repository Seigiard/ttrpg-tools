# Guillotine layout for paper minis

We use full-width strips, columns and stacks, with first fit across sheets. This keeps cuts straight while filling space beside taller minis. Minis sort by footprint height, then width, both descending; equal sizes keep their order. On each sheet, we try existing stacks, new columns, then a new strip before moving to the next sheet. The legacy width-sorted row layout remains a candidate: fewer sheets wins, with guillotine winning ties.

The packer returns positions measured from the usable area's top-left corner. The PDF writer draws those placements rather than calculating its own layout. The live counter and PDF therefore share one layout decision.

## Trade-offs

- MaxRects can fill irregular holes but does not preserve straight cuts across each piece. Easy cutting matters more than those extra packing opportunities.
- A separate dense mode would make users choose between paper usage and cutting. One automatic guillotine layout serves both needs, with the row candidate preventing regressions in sheet count.
- Rotation is reserved for rescuing a mini that cannot fit upright. If it fits turned, both the guillotine and row candidates place it in a dedicated strip. The turned footprint reserves the stroked cut marks (`CUT_MARK_EXTENT_MM`) on every edge. The PDF writer turns the whole mini clockwise. Minis that fit neither orientation are reported as oversized. Rotation for density adds complexity without saving a sheet in the prototype described in [spec #70](https://github.com/Seigiard/ttrpg-tools/issues/70).
- The 4 mm gap and existing corner cut marks stay. Shared cut lines would remove the clearance between neighbours' marks and change the cutting workflow. Stacked minis need the same clearance as adjacent columns and strips.

## Evidence

The hand-built stacking case uses one 92×264 mm footprint and four 44×124 mm footprints. They fit in three columns on one A4 sheet, while rows need two. Tests also check bounds, clearance, copy conservation, deterministic output, straight-cut partitions and sheet counts against the row candidate on mixed inputs.

The [25-mini fixture](../../src/lib/paper-minis/fixtures/pdf-70.md) reconstructs the #70 set from transcribed PDF raster measurements. Its tests check the prototype's 4 A4 / 3 Letter budget on rounded and raw inputs, with all copies preserved. This is a geometry reconstruction, not an exact archive: it has no back art and does not cover PDF rendering. The upper sensitivity sample needs 4 Letter sheets, so the tested budget does not extend to every measurement perturbation.
