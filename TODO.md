# #90 — Paper minis: resolve each mini's geometry and status once

Plan: GitHub issue #90 (body + the "Decisions" comment; the comment wins).

## Progress

Review base: 8e5ec819a0bcf0114971db20f46aa9f62d4d01bc

- [x] G1 · `geometry.ts` holds `fitFigure` (from `sizes.ts`) and `fitMiniFaces` (from `packing.ts`); no behavior change.
      Done: `sizes.ts` keeps only size tables and labels; all checks green.
- [ ] G2 · one "resolve one mini" step in `geometry.ts` (faces, tabs, offsets, limits, orientation, state), run once before both layout candidates; `packRows` takes resolved minis and only lays out.
      Done: `packMinis` no longer gets geometry through `packRows`; all checks green.
- [ ] G3 · `PackResult.entries` (`empty | loading | failed | upright | rotated | oversized` + `limits`) replaces `skipped`, `oversizedEntryIndices`, `limitedEntryFitLimits`; `frontError` moves onto `Entry`; `pdf.ts` filters nothing itself.
      Done: grep finds none of the old fields; all checks green.
- [ ] G4 · the component renders row status from `entries[i]`; the calibration preview uses the resolve step.
      Done: the component computes no loading / error / oversized flags itself; all checks green.
- [ ] G5 · geometry tests go through `packMinis` / `packEntries`; `packRows` tests keep only ADR-0001 layout comparisons.
      Done: `packRows` in tests appears only in layout comparisons; all checks green.
