import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { pdf70Entries, type Pdf70Reconstruction } from './fixtures/pdf-70.ts';
import { packMinis, packRows } from './packing.ts';

// #70's budget describes the observed set, not every possible perturbation.
// The lower/upper sensitivity results and the failing upper Letter budget
// are recorded in fixtures/pdf-70.md; they have no independent budget oracle.
const reconstructions: Pdf70Reconstruction[] = ['rounded', 'raw'];

for (const reconstruction of reconstructions) {
  for (const pageSize of ['a4', 'letter'] as const) {
    test(`${reconstruction} PDF reconstruction reproduces the original ${pageSize} sheet count`, () => {
      // #given: #70 reports four A4 sheets and five Letter sheets with rows.
      const entries = pdf70Entries(reconstruction);
      // #when
      const result = packRows(entries, { pageSize, numberDuplicates: false });
      // #then
      assert.deepEqual(
        { pages: result.pageCount, placed: result.miniCount, skipped: result.skipped },
        { pages: pageSize === 'a4' ? 4 : 5, placed: 25, skipped: [] },
      );
    });

    test(`${reconstruction} PDF reconstruction meets the ${pageSize} printing budget without losing minis`, () => {
      // #given: the independent prototype in #70 sets the printing budget.
      const entries = pdf70Entries(reconstruction);
      // #when
      const result = packMinis(entries, { pageSize, numberDuplicates: false });
      // #then: a budget allows a future denser layout, but not dropped copies.
      assert.deepEqual(
        {
          withinBudget: result.pageCount <= (pageSize === 'a4' ? 4 : 3),
          copies: result.pages
            .flatMap((page) => page.placements.map(({ mini }) => [mini.entryIndex, mini.copyIndex]))
            .toSorted((a, b) => a[0] - b[0]),
          placed: result.miniCount,
          skipped: result.skipped,
        },
        {
          withinBudget: true,
          copies: Array.from({ length: 25 }, (_, index) => [index, 0]),
          placed: 25,
          skipped: [],
        },
      );
    });
  }
}
