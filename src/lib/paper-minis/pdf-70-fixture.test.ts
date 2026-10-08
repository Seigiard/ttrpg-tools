import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { pdf70Entries, type Pdf70Reconstruction } from './fixtures/pdf-70.ts';
import { packMinis } from './packing.ts';

// #70's budget describes the observed set, not every possible perturbation.
// The lower/upper sensitivity results and the failing upper Letter budget
// are recorded in fixtures/pdf-70.md; they have no independent budget oracle.
const reconstructions: Pdf70Reconstruction[] = ['rounded', 'raw'];

for (const reconstruction of reconstructions) {
  for (const pageSize of ['a4', 'letter'] as const) {
    test(`${reconstruction} PDF reconstruction fits the default printer-scale budget without losing minis`, () => {
      // #given: the observed fixture and the default printer scale define the sheet budget.
      const entries = pdf70Entries(reconstruction);
      // #when
      const result = packMinis(entries, { pageSize, numberDuplicates: false });
      // #then: every mini remains printable, although the former #70 budget no longer applies.
      assert.deepEqual(
        {
          pages: result.pageCount,
          copies: result.pages
            .flatMap((page) => page.placements.map(({ mini }) => [mini.entryIndex, mini.copyIndex]))
            .toSorted((a, b) => a[0] - b[0]),
          placed: result.miniCount,
          oversized: result.entries.some(({ state }) => state === 'oversized'),
        },
        {
          pages: 3,
          copies: Array.from({ length: 25 }, (_, index) => [index, 0]),
          placed: 25,
          oversized: false,
        },
      );
    });
  }
}
