# Guillotine layout for paper minis

We use full-width strips, columns and stacks, with first fit across sheets. This keeps cuts straight while filling space beside taller minis. Minis sort by footprint height, then width, both descending; equal sizes keep their order. On each sheet, we try existing stacks, new columns, then a new strip before moving to the next sheet. The legacy width-sorted row layout remains a candidate: fewer sheets wins, with guillotine winning ties.

The packer returns positions measured from the usable area's top-left corner. The PDF writer draws those placements rather than calculating its own layout. The live counter and PDF therefore share one layout decision.

## Trade-offs

- MaxRects can fill irregular holes but does not preserve straight cuts across each piece. Easy cutting matters more than those extra packing opportunities.
- A separate dense mode would make users choose between paper usage and cutting. One automatic guillotine layout serves both needs, with the row candidate preventing regressions in sheet count.
- Rotation is reserved for rescuing a mini that cannot fit upright. Rotation for density adds complexity without saving a sheet in the prototype described in [spec #70](https://github.com/Seigiard/ttrpg-tools/issues/70). Oversize rescue and whole-mini rotated drawing belong to #72; #71 keeps all placements upright and preserves oversized reporting.
- The 4 mm gap and existing corner cut marks stay. Shared cut lines would remove the clearance between neighbours' marks and change the cutting workflow. Stacked minis need the same clearance as adjacent columns and strips.

## Evidence

The hand-built stacking case uses one 92×264 mm footprint and four 44×124 mm footprints. They fit in three columns on one A4 sheet, while rows need two. Tests also check bounds, clearance, copy conservation, deterministic output, straight-cut partitions and sheet counts against the row candidate on mixed inputs.

The exact 25-mini prototype from #70 is not available in this checkout, its branch history or the issue comments. The description gives slot counts but omits image dimensions and the four separate backs. Its reported 4 A4 / 3 Letter result is not an exact regression fixture here. An original export or the prototype's geometry is needed to verify that acceptance item without inventing its inputs.
