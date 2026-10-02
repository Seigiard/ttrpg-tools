import assert from 'node:assert/strict';
import { GAP_MM, packRows } from './packing.ts';
import { type PackOptions, resolveMinis, usableAreaMm } from './geometry.ts';
import type { PackingEntry as Entry } from './types.ts';

import { test as t } from 'bun:test';

// Pins the row candidate's own layout, the baseline ADR-0001 compares the
// guillotine against. Mini geometry is covered through packMinis in
// geometry.test.ts; layout.test.ts covers the chosen layout.

// Helper: build an entry with square art at a given size/count.
const entry = (over: Partial<Entry>): Entry => ({
  heightSlot: 'medium',
  count: 1,
  naturalWidth: 100,
  naturalHeight: 100,
  ...over,
});

const rowCandidate = (entries: Entry[], opts: PackOptions) =>
  packRows(resolveMinis(entries, opts), opts);

const { widthMm: usableW, heightMm: usableH } = usableAreaMm({ pageSize: 'a4' });

const sheetOpts = { pageSize: 'a4', numberDuplicates: false } as const;

// --- row grouping respects usable width/height ---

t('medium squares at zero margin pack 4 per row, 2 rows per A4 page', () => {
  // medium = 35mm figure on a 25mm base, square art => image 35x35, reserved
  // width 35, totalHeight = 35*2 + four 12.5mm tabs = 120mm.
  // width: 4*35 + 3*4 = 152 <= 190; 5 would be 191 > 190.
  // height: 2 rows = 120+4+120 = 244 <= 277; a 3rd = 368 > 277.
  const r = rowCandidate([entry({ count: 8 })], {
    pageSize: 'a4',
    numberDuplicates: false,
    marginMm: 0,
  });
  assert.deepEqual(
    r.pages.map((page) => page.rows.map((row) => [row.items.length, row.widthMm])),
    [
      [
        [4, 152],
        [4, 152],
      ],
    ],
  );
});

t('no row exceeds usable width and no page exceeds usable height', () => {
  const r = rowCandidate([entry({ count: 100 })], { pageSize: 'a4', numberDuplicates: false });
  for (const page of r.pages) {
    let totalH = 0;
    page.rows.forEach((row, i) => {
      assert.ok(row.widthMm <= usableW + 1e-9, `row width ${row.widthMm}`);
      totalH += row.heightMm + (i > 0 ? GAP_MM : 0);
    });
    assert.ok(totalH <= usableH + 1e-9, `page height ${totalH} <= ${usableH}`);
  }
});

t('9 medium squares spill onto a second page', () => {
  const r = rowCandidate([entry({ count: 9 })], {
    pageSize: 'a4',
    numberDuplicates: false,
    marginMm: 0,
  });
  assert.equal(r.pageCount, 2);
});

// --- gap/margin math at boundaries ---

t('a row exactly filling usable width packs as one row', () => {
  // Widths that exactly hit the boundary: a 44.5mm base under a short figure,
  // 4 of them: 4*44.5 + 3*4 = 190. Landscape art is capped at 30 x 10mm, well
  // inside the base.
  const r = rowCandidate(
    [
      entry({
        heightSlot: 'custom',
        customWidthMm: 44.5,
        customHeightMm: 20,
        count: 4,
        naturalWidth: 300,
      }),
    ],
    { pageSize: 'a4', numberDuplicates: false, marginMm: 0 },
  );
  assert.deepEqual(
    r.pages[0].rows.map((row) => [row.items.length, row.widthMm]),
    [[3, 141.5], [1, 44.5]],
  );
});

t('half a mm over the boundary wraps to a second row on the same page', () => {
  // custom 45mm: 4*45 + 3*4 = 192 > 190 => the fourth wraps.
  const r = rowCandidate(
    [
      entry({
        heightSlot: 'custom',
        customWidthMm: 45,
        customHeightMm: 20,
        count: 4,
        naturalWidth: 300,
      }),
    ],
    { pageSize: 'a4', numberDuplicates: false, marginMm: 0 },
  );
  assert.deepEqual(
    r.pages.map((page) => page.rows.map((row) => row.items.length)),
    [[3, 1]],
  );
});

t('2 mm margins fit 8 medium squares per A4 sheet with 4 mm gaps', () => {
  // #given
  const entries = [entry({ count: 9 })];
  // #when
  const result = rowCandidate(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 });
  // #then
  assert.deepEqual(
    result.pages.map((page) => ({
      height: page.heightMm,
      rows: page.rows.map((row) => [row.items.length, row.widthMm, row.heightMm]),
    })),
    [
      {
        height: 252,
        rows: [
          [4, 168, 124],
          [4, 168, 124],
        ],
      },
      { height: 124, rows: [[1, 39, 124]] },
    ],
  );
});

t('fractional margins count on both axes and push minis onto more pages', () => {
  // #given  59 + 2*1.5 = 62 wide: two per row at 62+4+62 = 128, a third
  //         would be 194 > 190; 59*2 + 2*1.5 + 4*29.5 = 239 tall, one row a page
  const entries = [
    entry({ heightSlot: 'custom', customWidthMm: 59, customHeightMm: 59, count: 7 }),
  ];
  // #when
  const result = rowCandidate(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 1.5 });
  // #then
  assert.deepEqual(
    result.pages.map((page) => ({
      height: page.heightMm,
      rows: page.rows.map((row) => [row.items.length, row.widthMm, row.heightMm]),
    })),
    [
      { height: 239, rows: [[2, 128, 239]] },
      { height: 239, rows: [[2, 128, 239]] },
      { height: 239, rows: [[2, 128, 239]] },
      { height: 239, rows: [[1, 62, 239]] },
    ],
  );
});

t('minis are placed sorted by reserved width descending', () => {
  // #given  a narrow Large figure reserves less paper than a wide Medium one
  const entries = [
    entry({ heightSlot: 'medium', naturalWidth: 150, naturalHeight: 100 }),
    entry({ heightSlot: 'large', naturalWidth: 100, naturalHeight: 300 }),
  ];
  // #when
  const result = rowCandidate(entries, { ...sheetOpts, marginMm: 2 });
  // #then
  const widths = result.pages[0].rows.flatMap((row) => row.items.map((mini) => mini.totalWidthMm));
  assert.deepEqual(
    widths,
    [...widths].sort((a, b) => b - a),
  );
});
