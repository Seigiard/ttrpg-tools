import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { pdf70Entries, type Pdf70Reconstruction } from './fixtures/pdf-70.ts';
import { resolveMinis } from './geometry.ts';
import { packMinis, packRows } from './packing.ts';

// #70's budget describes the observed set, not every possible perturbation.
// The lower/upper sensitivity results and the failing upper Letter budget
// are recorded in fixtures/pdf-70.md; they have no independent budget oracle.
const reconstructions: Pdf70Reconstruction[] = ['rounded', 'raw'];

for (const reconstruction of reconstructions) {
  for (const pageSize of ['a4', 'letter'] as const) {
    test(`${reconstruction} PDF reconstruction reproduces the original ${pageSize} sheet count`, () => {
      // #given: Scale to Fit reduces the available page area from #70's original budget.
      const entries = pdf70Entries(reconstruction);
      // #when
      const opts = { pageSize, numberDuplicates: false };
      const minis = resolveMinis(entries, opts);
      const result = packRows(minis, opts);
      // #then
      assert.deepEqual(
        {
          pages: result.pageCount,
          placed: result.pages.flatMap((page) => page.rows.flatMap((row) => row.items)).length,
          oversized: minis.some(({ orientation }) => orientation === 'oversized'),
        },
        {
          pages: pageSize === 'a4' ? 5 : 6,
          placed: pageSize === 'a4' ? 25 : 24,
          oversized: pageSize === 'letter',
        },
      );
    });

    test(`${reconstruction} PDF reconstruction meets the ${pageSize} printing budget without losing minis`, () => {
      // #given: the independent prototype in #70 sets the printing budget.
      const entries = pdf70Entries(reconstruction);
      // #when
      const result = packMinis(entries, { pageSize, numberDuplicates: false });
      // #then: every mini remains printable, although the former #70 budget no longer applies.
      assert.deepEqual(
        {
          withinBudget: result.pageCount <= (pageSize === 'a4' ? 4 : 3),
          copies: result.pages
            .flatMap((page) => page.placements.map(({ mini }) => [mini.entryIndex, mini.copyIndex]))
            .toSorted((a, b) => a[0] - b[0]),
          placed: result.miniCount,
          oversized: result.entries.some(({ state }) => state === 'oversized'),
        },
        {
          withinBudget: pageSize === 'a4',
          copies: Array.from({ length: pageSize === 'a4' ? 25 : 24 }, (_, index) => [index + (pageSize === 'a4' ? 0 : 1), 0]),
          placed: pageSize === 'a4' ? 25 : 24,
          oversized: pageSize === 'letter',
        },
      );
    });
  }
}
