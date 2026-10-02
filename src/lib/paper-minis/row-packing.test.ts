import assert from 'node:assert/strict';
import { packMinis, packRows, GAP_MM, MARGIN_MM, PAGE_SIZES_MM } from './packing.ts';
import { HEIGHT_SLOT_ORDER, slotGeometryLabel } from './sizes.ts';
import type { PackingEntry as Entry } from './types.ts';

import { test as t } from 'bun:test';

// Covers the row candidate and calibrated geometry through the chosen layout.
// layout.test.ts covers placement decisions.

// Helper: build an entry with square art at a given size/count.
const entry = (over: Partial<Entry>): Entry => ({
  heightSlot: 'medium',
  count: 1,
  naturalWidth: 100,
  naturalHeight: 100,
  ...over,
});

const A4 = PAGE_SIZES_MM.a4;
const usableW = A4.w - MARGIN_MM * 2; // 190
const usableH = A4.h - MARGIN_MM * 2; // 277

t('default margin reserves paper around both faces without shrinking the figure', () => {
  // #given
  const entries = [entry({})];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: false });
  const mini = result.pages[0].rows[0].items[0];
  // #then
  assert.deepEqual(
    [
      mini.baseWidthMm,
      mini.imageWidthMm,
      mini.imageHeightMm,
      mini.totalWidthMm,
      mini.totalHeightMm,
      mini.imageOffsetXMm,
      mini.marginMm,
    ],
    [25, 35, 35, 39, 124, 2, 2],
  );
});

t('front calibration scales the artwork height from the marked creature height', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 50, naturalHeight: 100, frontCalibration: { head: 0.25, feet: 0.75 } }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0].placements[0].mini;
  // #then
  assert.deepEqual(
    [
      mini.imageWidthMm,
      mini.imageHeightMm,
      mini.faceHeightMm,
      mini.fitLimits,
      result.limitedEntryFitLimits,
    ],
    [35, 70, 70, [], []],
  );
});

t('front calibration uses a custom figure height as its target', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 30,
      customHeightMm: 30,
      naturalWidth: 50,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual([mini.imageWidthMm, mini.imageHeightMm], [30, 60]);
});

t('front calibration past twice the slot height is scaled down and reported', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 50, naturalHeight: 100, frontCalibration: { head: 0.1, feet: 0.2 } }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual(
    [mini.imageWidthMm, mini.imageHeightMm, mini.imageWidthMm / mini.imageHeightMm, mini.fitLimits],
    [35, 70, 0.5, ['height']],
  );
});

t('front calibration that hits the width cap scales down whole and reports width', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 300, naturalHeight: 100, frontCalibration: { head: 0.25, feet: 0.75 } }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual(
    [mini.imageWidthMm, mini.imageHeightMm, mini.imageWidthMm / mini.imageHeightMm, mini.fitLimits],
    [52.5, 17.5, 3, ['width']],
  );
});

t(
  'front calibration too tall for the page scales to fit and is reported instead of skipped',
  () => {
    // #given
    const entries = [
      entry({
        heightSlot: 'custom',
        customWidthMm: 10,
        customHeightMm: 140,
        naturalWidth: 50,
        naturalHeight: 100,
        frontCalibration: { head: 0.25, feet: 0.75 },
      }),
    ];
    // #when
    const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
    const mini = result.pages[0].placements[0].mini;
    // #then
    assert.deepEqual(
      [
        result.miniCount,
        result.skipped.length,
        mini.imageHeightMm,
        mini.totalHeightMm,
        mini.fitLimits,
        result.limitedEntryFitLimits,
      ],
      [1, 0, 128.5, usableH, ['page'], [{ entryIndex: 0, limits: ['page'] }]],
    );
  },
);

t('a calibrated custom figure fits both page dimensions without changing its aspect', () => {
  // #given: a 10 mm base, 140 mm creature and 3:2 artwork on A4.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 150,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped,
      oversized: result.oversizedEntryIndices,
      warnings: result.limitedEntryFitLimits,
      geometry: result.pages.flatMap((page) =>
        page.placements.map(({ mini, rotated }) => [
          mini.imageWidthMm,
          mini.imageHeightMm,
          mini.totalWidthMm,
          mini.totalHeightMm,
          rotated,
        ]),
      ),
    },
    {
      count: 1,
      skipped: [],
      oversized: [],
      warnings: [{ entryIndex: 0, limits: ['width', 'page'] }],
      geometry: [[186, 124, 190, 272, false]],
    },
  );
});

t('a page-width cap shrinks the inherited back and front to the same height', () => {
  // #given: the back is wider than the calibrated front; neither may be cropped.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 50,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
      backNaturalWidth: 150,
      backNaturalHeight: 100,
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped,
      warnings: result.limitedEntryFitLimits,
      geometry: result.pages.flatMap((page) =>
        page.placements.map(({ mini }) => [
          mini.imageWidthMm,
          mini.imageHeightMm,
          mini.back?.imageWidthMm,
          mini.back?.imageHeightMm,
          mini.totalWidthMm,
          mini.totalHeightMm,
        ]),
      ),
    },
    {
      count: 1,
      skipped: [],
      warnings: [{ entryIndex: 0, limits: ['width', 'page'] }],
      geometry: [[62, 124, 186, 124, 190, 272]],
    },
  );
});

t('page fit prints the former too-wide page-cap case at zero margin', () => {
  // #given: this case used to lose its page warning and be skipped after a height-only cap.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 130,
      naturalWidth: 150,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  // #then: millimetres rounded to a micron for the repeating 3:2 height.
  assert.deepEqual(
    {
      skipped: result.skipped,
      warnings: result.limitedEntryFitLimits,
      geometry: result.pages.flatMap((page) =>
        page.placements.map(({ mini }) => [
          mini.imageWidthMm,
          Number(mini.imageHeightMm.toFixed(3)),
          mini.totalWidthMm,
          Number(mini.totalHeightMm.toFixed(3)),
        ]),
      ),
    },
    {
      skipped: [],
      warnings: [{ entryIndex: 0, limits: ['width', 'page'] }],
      geometry: [[190, 126.667, 190, 273.333]],
    },
  );
});

t(
  'page fit bounds an independently calibrated back without forcing the front to its height',
  () => {
    // #given: a narrow unmarked front and a wider back with its own calibration.
    const entries = [
      entry({
        heightSlot: 'custom',
        customWidthMm: 10,
        customHeightMm: 140,
        naturalWidth: 25,
        naturalHeight: 100,
        backNaturalWidth: 150,
        backNaturalHeight: 100,
        backCalibration: { head: 0.25, feet: 0.75 },
      }),
    ];
    // #when
    const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
    // #then
    assert.deepEqual(
      {
        skipped: result.skipped,
        warnings: result.limitedEntryFitLimits,
        geometry: result.pages.flatMap((page) =>
          page.placements.map(({ mini }) => [
            mini.imageWidthMm,
            mini.imageHeightMm,
            mini.back?.imageWidthMm,
            mini.back?.imageHeightMm,
            mini.totalWidthMm,
            mini.totalHeightMm,
          ]),
        ),
      },
      {
        skipped: [],
        warnings: [{ entryIndex: 0, limits: ['page', 'width'] }],
        geometry: [[31.625, 126.5, 186, 124, 190, 277]],
      },
    );
  },
);

t('an uncalibrated custom figure is not shrunk to the page', () => {
  // #given: the same 10/140, 3:2 artwork, with no head and feet lines.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 150,
      naturalHeight: 100,
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      pages: result.pages,
      skipped: result.skipped,
      warnings: result.limitedEntryFitLimits,
    },
    {
      pages: [],
      skipped: [{ entryIndex: 0, copyIndex: 0, baseWidthMm: 10, totalHeightMm: 304 }],
      warnings: [],
    },
  );
});

t('back calibration scales the back artwork height from its own marked creature height', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 100,
      naturalHeight: 100,
      backNaturalWidth: 50,
      backNaturalHeight: 100,
      backCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual(
    [mini.imageHeightMm, mini.back?.imageWidthMm, mini.back?.imageHeightMm],
    [35, 35, 70],
  );
});

t('an inherited square back shrinks both faces together at its width cap', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 50,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
      backNaturalWidth: 100,
      backNaturalHeight: 100,
    }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual(
    [
      mini.imageWidthMm,
      mini.imageHeightMm,
      mini.back?.imageWidthMm,
      mini.back?.imageHeightMm,
      mini.fitLimits,
    ],
    [26.25, 52.5, 52.5, 52.5, ['width']],
  );
});

t('an inherited wide back stays printable with matching heights and unchanged proportions', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 50,
      naturalHeight: 100,
      frontCalibration: { head: 0.25, feet: 0.75 },
      backNaturalWidth: 300,
      backNaturalHeight: 100,
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  const mini = result.pages[0]?.placements[0].mini;
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped,
      front: [mini?.imageWidthMm, mini?.imageHeightMm],
      back: mini?.back,
      warnings: result.limitedEntryFitLimits,
    },
    {
      count: 1,
      skipped: [],
      front: [8.75, 17.5],
      back: { imageWidthMm: 52.5, imageHeightMm: 17.5, imageOffsetXMm: 2 },
      warnings: [{ entryIndex: 0, limits: ['width'] }],
    },
  );
});

t('back-only calibration is capped to the page and reports every active limit', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'gargantuan',
      naturalWidth: 50,
      naturalHeight: 100,
      backNaturalWidth: 100,
      backNaturalHeight: 100,
      backCalibration: { head: 0, feet: 0.25 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0]?.placements[0].mini;
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped.length,
      front: mini?.imageHeightMm,
      back: mini?.back,
      limits: result.limitedEntryFitLimits,
    },
    {
      count: 1,
      skipped: 0,
      front: 111,
      back: { imageWidthMm: 125.5, imageHeightMm: 125.5, imageOffsetXMm: 0 },
      limits: [{ entryIndex: 0, limits: ['height', 'width', 'page'] }],
    },
  );
});

t('back-only calibration fits an oversized custom front and back onto the page', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 50,
      naturalHeight: 100,
      backNaturalWidth: 25,
      backNaturalHeight: 100,
      backCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0]?.placements[0].mini;
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped,
      front: [mini?.imageWidthMm, mini?.imageHeightMm],
      back: [mini?.back?.imageWidthMm, mini?.back?.imageHeightMm],
      total: mini?.totalHeightMm,
      warnings: result.limitedEntryFitLimits,
    },
    {
      count: 1,
      skipped: [],
      front: [64.25, 128.5],
      back: [32.125, 128.5],
      total: 277,
      warnings: [{ entryIndex: 0, limits: ['page'] }],
    },
  );
});

t('a calibrated mini with an oversized base does not claim it was fitted to the page', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 200,
      customHeightMm: 140,
      backNaturalWidth: 50,
      backNaturalHeight: 100,
      backCalibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  // #then
  assert.deepEqual(
    [result.miniCount, result.oversizedEntryIndices, result.limitedEntryFitLimits],
    [0, [0], []],
  );
});

t('fit warnings describe placed copies, not a skipped entry that hit the height cap', () => {
  // #given: the oversized base cannot fit either orientation, even after its height cap.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 200,
      customHeightMm: 140,
      frontCalibration: { head: 0.2, feet: 0.3 },
      count: 2,
    }),
    entry({ naturalWidth: 50, frontCalibration: { head: 0.1, feet: 0.2 }, count: 2 }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      skipped: result.skipped.map(({ entryIndex, copyIndex }) => [entryIndex, copyIndex]),
      oversized: result.oversizedEntryIndices,
      warnings: result.limitedEntryFitLimits,
    },
    {
      count: 2,
      skipped: [
        [0, 0],
        [0, 1],
      ],
      oversized: [0],
      warnings: [{ entryIndex: 1, limits: ['height'] }],
    },
  );
});

t('calibrated slots keep their height order with the same marked lines', () => {
  // #given
  const shared = {
    naturalWidth: 50,
    naturalHeight: 100,
    frontCalibration: { head: 0.25, feet: 0.75 },
  };
  const entries = [
    entry({ ...shared, heightSlot: 'medium-short' }),
    entry({ ...shared, heightSlot: 'medium-tall' }),
  ];
  // #when
  const bySlot = Object.fromEntries(
    packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages.flatMap(
      (page) => page.placements.map(({ mini }) => [mini.heightSlot, mini.imageHeightMm]),
    ),
  );
  // #then
  assert.deepEqual(bySlot, { 'medium-short': 54, 'medium-tall': 86 });
});

// --- counting & expansion ---

t('empty input yields zero pages and zero minis', () => {
  const r = packRows([], { pageSize: 'a4', numberDuplicates: false });
  assert.equal(r.pageCount, 0);
  assert.equal(r.miniCount, 0);
  assert.equal(r.pages.length, 0);
});

t('count expands into that many placed minis', () => {
  const r = packRows([entry({ count: 5 })], { pageSize: 'a4', numberDuplicates: false });
  assert.equal(r.miniCount, 5);
});

t('entries without natural dimensions are not packed', () => {
  const r = packRows([entry({ naturalWidth: undefined, naturalHeight: undefined })], {
    pageSize: 'a4',
    numberDuplicates: false,
  });
  assert.equal(r.miniCount, 0);
  assert.equal(r.pageCount, 0);
});

t('custom entry without a valid width is not packed', () => {
  const r = packRows([entry({ heightSlot: 'custom', customWidthMm: undefined })], {
    pageSize: 'a4',
    numberDuplicates: false,
  });
  assert.equal(r.miniCount, 0);
});

// --- row grouping respects usable width/height ---

t('medium squares at zero margin pack 4 per row, 2 rows per A4 page', () => {
  // medium = 35mm figure on a 25mm base, square art => image 35x35, reserved
  // width 35, totalHeight = 35*2 + four 12.5mm tabs = 120mm.
  // width: 4*35 + 3*4 = 152 <= 190; 5 would be 191 > 190.
  // height: 2 rows = 120+4+120 = 244 <= 277; a 3rd = 368 > 277.
  const r = packRows([entry({ count: 8 })], {
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
  const r = packRows([entry({ count: 100 })], { pageSize: 'a4', numberDuplicates: false });
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
  const r = packRows([entry({ count: 9 })], {
    pageSize: 'a4',
    numberDuplicates: false,
    marginMm: 0,
  });
  assert.equal(r.pageCount, 2);
});

// --- oversized reporting ---

t('mini wider than the page is reported as skipped, not silently dropped', () => {
  const r = packRows(
    // 200 mm base, 204 mm including margins > 190 usable width
    [entry({ heightSlot: 'custom', customWidthMm: 200, customHeightMm: 30 })],
    { pageSize: 'a4', numberDuplicates: false },
  );
  assert.equal(r.miniCount, 0);
  assert.equal(r.pageCount, 0);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].entryIndex, 0);
  assert.deepEqual(r.oversizedEntryIndices, [0]);
});

t('mini taller than the page is reported as skipped', () => {
  // custom 140mm base and 140mm figure: image 140x140, totalHeight = 140*2 + 2*2 + 4*70 = 564 > 277.
  const r = packRows([entry({ heightSlot: 'custom', customWidthMm: 140, customHeightMm: 140 })], {
    pageSize: 'a4',
    numberDuplicates: false,
  });
  assert.equal(r.miniCount, 0);
  assert.equal(r.skipped.length, 1);
  assert.ok(r.skipped[0].totalHeightMm > usableH);
});

t('oversized entry is skipped while a fitting entry in the same batch is placed', () => {
  const r = packRows(
    [
      entry({ count: 2 }),
      entry({ heightSlot: 'custom', customWidthMm: 300, customHeightMm: 30 }),
      entry({ count: 3 }),
    ],
    { pageSize: 'a4', numberDuplicates: false },
  );
  assert.equal(r.miniCount, 5); // 2 + 3 placed
  assert.deepEqual(r.oversizedEntryIndices, [1]);
});

// --- gap/margin math at boundaries ---

t('a row exactly filling usable width packs as one row', () => {
  // Widths that exactly hit the boundary: a 44.5mm base under a short figure,
  // 4 of them: 4*44.5 + 3*4 = 190. Landscape art is capped at 30 x 10mm, well
  // inside the base.
  const r = packRows(
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
    [[4, 190]],
  );
});

t('half a mm over the boundary wraps to a second row on the same page', () => {
  // custom 45mm: 4*45 + 3*4 = 192 > 190 => the fourth wraps.
  const r = packRows(
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

// --- labels ---

t('numberDuplicates labels copies 1..N per entry', () => {
  const r = packRows([entry({ count: 3 })], { pageSize: 'a4', numberDuplicates: true });
  const labels = r.pages[0].rows.flatMap((row) => row.items.map((m) => m.label));
  assert.deepEqual([...labels].sort(), ['1', '2', '3']);
});

t('no labels when numberDuplicates is off', () => {
  const r = packRows([entry({ count: 3 })], { pageSize: 'a4', numberDuplicates: false });
  const anyLabel = r.pages[0].rows.some((row) => row.items.some((m) => m.label != null));
  assert.equal(anyLabel, false);
});

t('a Medium unfolds to both faces, two margins and four half-base tabs', () => {
  // #given  the stand folds as _||_: a 12.5 mm tab under each face and a
  //         25 mm floor strip, two tabs deep, under the front one
  const entries = [entry({ heightSlot: 'medium' })];
  // #when
  const m = packRows(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 }).pages[0]
    .rows[0].items[0];
  // #then  35*2 + 2*2 + 12.5*4
  assert.deepEqual([m.totalHeightMm, m.tabHeightMm], [124, 12.5]);
});

t('2 mm margins fit 8 medium squares per A4 sheet with 4 mm gaps', () => {
  // #given
  const entries = [entry({ count: 9 })];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 });
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

t('margin alone can make a mini too wide or too tall for A4', () => {
  // #given
  const entries = [
    // 187 + two margins = 191 > 190 wide;
    // 69*2 + two margins + four 34.5 tabs = 138 + 4 + 138 = 280 > 277 tall,
    // where zero margin leaves it at 276
    entry({ heightSlot: 'custom', customWidthMm: 187, customHeightMm: 18, naturalWidth: 1000 }),
    entry({ heightSlot: 'custom', customWidthMm: 69, customHeightMm: 69 }),
  ];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 });
  // #then
  assert.deepEqual(
    [result.pageCount, result.miniCount, result.oversizedEntryIndices],
    [0, 0, [0, 1]],
  );
});

t('fractional margins count on both axes and push minis onto more pages', () => {
  // #given  59 + 2*1.5 = 62 wide: two per row at 62+4+62 = 128, a third
  //         would be 194 > 190; 59*2 + 2*1.5 + 4*29.5 = 239 tall, one row a page
  const entries = [
    entry({ heightSlot: 'custom', customWidthMm: 59, customHeightMm: 59, count: 7 }),
  ];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 1.5 });
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

t('shared tall artwork keeps each size centred within the same margin', () => {
  // #given
  const artwork = { naturalWidth: 100, naturalHeight: 200 };
  const entries = [
    entry({ ...artwork, heightSlot: 'tiny' }),
    entry({ ...artwork, heightSlot: 'large' }),
  ];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 3 });
  // #then
  assert.deepEqual(
    result.pages.flatMap((page) =>
      page.rows.flatMap((row) =>
        row.items.map((mini) => [
          mini.baseWidthMm,
          mini.imageWidthMm,
          mini.imageHeightMm,
          mini.totalWidthMm,
          mini.totalHeightMm,
          mini.imageOffsetXMm,
          mini.marginMm,
        ]),
      ),
    ),
    [
      [37, 28, 56, 43, 192, 7.5, 3],
      [20, 6, 12, 26, 70, 10, 3],
    ],
  );
});

t('a numbered mini at zero margin centres its base under the figure', () => {
  // #given  square art at Medium prints 35 mm tall, overhanging its 25 mm base
  const entries = [entry({})];
  // #when
  const result = packRows(entries, { pageSize: 'a4', numberDuplicates: true, marginMm: 0 });
  // #then
  assert.deepEqual(result.pages, [
    {
      heightMm: 120,
      rows: [
        {
          widthMm: 35,
          heightMm: 120,
          items: [
            {
              entryIndex: 0,
              copyIndex: 0,
              heightSlot: 'medium',
              baseWidthMm: 25,
              imageWidthMm: 35,
              imageHeightMm: 35,
              imageOffsetXMm: 0,
              faceHeightMm: 35,
              fitLimits: [],
              totalWidthMm: 35,
              baseOffsetXMm: 5,
              tabHeightMm: 12.5,
              totalHeightMm: 120,
              marginMm: 0,
              label: '1',
            },
          ],
        },
      ],
    },
  ]);
});

const sheetOpts = { pageSize: 'a4', numberDuplicates: false } as const;

t('a mini reserves the greater of figure width and base width, plus margins', () => {
  // #given  wide art overhangs a Medium base; tall art stays well inside it
  const entries = [
    entry({ naturalWidth: 150, naturalHeight: 100 }),
    entry({ naturalWidth: 100, naturalHeight: 350 }),
  ];
  // #when
  const result = packRows(entries, { ...sheetOpts, marginMm: 2 });
  // #then
  assert.deepEqual(
    result.pages[0].rows[0].items.map((mini) => [
      mini.baseWidthMm,
      mini.imageWidthMm,
      mini.imageHeightMm,
      mini.totalWidthMm,
      mini.imageOffsetXMm,
    ]),
    [
      [25, 52.5, 35, 56.5, 2],
      [25, 10, 35, 29, 9.5],
    ],
  );
});

t('overhanging figures never overlap their neighbours', () => {
  // #given  four wide Medium figures, each overhanging its base
  const entries = [entry({ naturalWidth: 150, naturalHeight: 100, count: 4 })];
  // #when
  const result = packRows(entries, { ...sheetOpts, marginMm: 2 });
  // #then  walk each row as the row candidate lays it out
  const rows = result.pages
    .flatMap((page) => page.rows)
    .map((row) => {
      let xMm = 0;
      return row.items.map((mini) => {
        const left = xMm + mini.imageOffsetXMm;
        xMm += mini.totalWidthMm + GAP_MM;
        return [left, left + mini.imageWidthMm];
      });
    });
  assert.deepEqual(
    {
      figures: rows.flat().length,
      overhanging: rows.flat().every(([left, right]) => right - left === 52.5),
      overlapping: rows.some((figures) =>
        figures.some(([, right], i) => i + 1 < figures.length && right > figures[i + 1][0]),
      ),
    },
    { figures: 4, overhanging: true, overlapping: false },
  );
});

t('a custom entry without a figure height is not packable', () => {
  // #given  a base width alone does not say how tall the figure prints
  const entries = [entry({ heightSlot: 'custom', customWidthMm: 30 })];
  // #when
  const result = packRows(entries, sheetOpts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [0, 0]);
});

t('minis are placed sorted by reserved width descending', () => {
  // #given  a narrow Large figure reserves less paper than a wide Medium one
  const entries = [
    entry({ heightSlot: 'medium', naturalWidth: 150, naturalHeight: 100 }),
    entry({ heightSlot: 'large', naturalWidth: 100, naturalHeight: 300 }),
  ];
  // #when
  const result = packRows(entries, { ...sheetOpts, marginMm: 2 });
  // #then
  const widths = result.pages[0].rows.flatMap((row) => row.items.map((mini) => mini.totalWidthMm));
  assert.deepEqual(
    widths,
    [...widths].sort((a, b) => b - a),
  );
});

// A tab is half its base, so front and back together make the footprint as
// deep as it is wide. Huge and Gargantuan cannot have that and stay on Letter,
// so theirs are the deepest half-millimetre tabs that keep them there through
// a 5 mm margin: (259 - 2*95 - 2*5) / 4 = 14.75 and (259 - 2*111 - 2*5) / 4 = 6.75.
t('a tab is half its base, until the page cuts Huge and Gargantuan short', () => {
  // #given  artwork taller than it is wide, so no figure is capped
  const entries = HEIGHT_SLOT_ORDER.map((heightSlot) =>
    entry({ heightSlot, naturalWidth: 100, naturalHeight: 200 }),
  );
  // #when
  const minis = packRows(entries, { ...sheetOpts, marginMm: 2 }).pages.flatMap((page) =>
    page.rows.flatMap((row) => row.items),
  );
  // #then
  assert.deepEqual(
    Object.fromEntries(
      HEIGHT_SLOT_ORDER.map((slot) => [
        slot,
        minis.find((m) => m.heightSlot === slot)!.tabHeightMm,
      ]),
    ),
    {
      tiny: 10,
      small: 12.5,
      'medium-short': 12.5,
      medium: 12.5,
      'medium-tall': 12.5,
      large: 18.5,
      'large-tall': 18.5,
      huge: 14.5,
      gargantuan: 6.5,
    },
  );
});

t('every slot’s unfolded mini fits both supported pages at the default margin', () => {
  // #given  artwork taller than it is wide at every slot, on each page in turn,
  //         so the width cap cannot shorten a figure before the page sees it
  const entries = HEIGHT_SLOT_ORDER.map((heightSlot) =>
    entry({ heightSlot, naturalWidth: 100, naturalHeight: 200 }),
  );
  // #when
  const results = (['a4', 'letter'] as const).map((pageSize) =>
    packRows(entries, { pageSize, numberDuplicates: false }),
  );
  // #then  the tallest slot is cut to the paper, so none of them is skipped
  assert.deepEqual(
    results.map((result) => [result.miniCount, result.skipped.length]),
    [
      [HEIGHT_SLOT_ORDER.length, 0],
      [HEIGHT_SLOT_ORDER.length, 0],
    ],
  );
});

// printableminimaker ADR-0002's headroom decision: the figure margin is a setting a user raises to
// cut more comfortably, and every extra millimetre of it costs two of height.
// Huge and Gargantuan are cut below true scale, and stand on shallow tabs, so
// that raising it does not silently drop the biggest minis off the sheet.
t('no slot is lost when the figure margin is raised to 5 mm', () => {
  // #given  artwork taller than it is wide at every slot, so nothing is capped
  const entries = HEIGHT_SLOT_ORDER.map((heightSlot) =>
    entry({ heightSlot, naturalWidth: 100, naturalHeight: 200 }),
  );
  // #when  on the smaller page as well as the larger one
  const results = (['a4', 'letter'] as const).map((pageSize) =>
    packRows(entries, { pageSize, numberDuplicates: false, marginMm: 5 }),
  );
  // #then
  assert.deepEqual(
    results.map((result) => [result.miniCount, result.skipped.length]),
    [
      [HEIGHT_SLOT_ORDER.length, 0],
      [HEIGHT_SLOT_ORDER.length, 0],
    ],
  );
});

// The dropdown's tooltip is a promise about paper, and it reaches the user
// through the resolvers; the row candidate resolves the mini's geometry.
t('the tooltip promises the millimetres the packer actually produces', () => {
  // #given  every slot on artwork too tall to reach the width cap, so each
  //         figure prints at its slot's own height
  const entries = HEIGHT_SLOT_ORDER.map((heightSlot) =>
    entry({ heightSlot, naturalWidth: 100, naturalHeight: 200 }),
  );
  // #when
  const minis = packRows(entries, { ...sheetOpts, marginMm: 2 }).pages.flatMap((page) =>
    page.rows.flatMap((row) => row.items),
  );
  // #then
  assert.deepEqual(
    HEIGHT_SLOT_ORDER.map(slotGeometryLabel),
    HEIGHT_SLOT_ORDER.map((slot) => {
      const mini = minis.find((m) => m.heightSlot === slot)!;
      return `Основание ${mini.baseWidthMm} мм · высота ${mini.imageHeightMm} мм`;
    }),
  );
});

// A back artwork is sized from the same slot as the front, under its own
// width cap, and the cut-out has to hold whichever face is wider.
t('a back artwork wider than its front sets the cut width and centres the front', () => {
  // #given  a square front at Medium prints 35 mm wide; a 3:2 back prints 52.5
  const entries = [entry({ backNaturalWidth: 150, backNaturalHeight: 100 })];
  // #when
  const m = packRows(entries, { ...sheetOpts, marginMm: 2 }).pages[0].rows[0].items[0];
  // #then
  assert.deepEqual(
    {
      total: m.totalWidthMm,
      front: [m.imageWidthMm, m.imageOffsetXMm],
      back: m.back,
      base: m.baseOffsetXMm,
    },
    {
      total: 56.5,
      front: [35, 10.75],
      back: { imageWidthMm: 52.5, imageHeightMm: 35, imageOffsetXMm: 2 },
      base: 15.75,
    },
  );
});

t('a back artwork the width cap shortens still stands on a full-height face', () => {
  // #given  a 4:1 back hits the cap and prints 52.5 x 13.125 behind a 35 mm front
  const entries = [entry({ backNaturalWidth: 400, backNaturalHeight: 100 })];
  // #when
  const m = packRows(entries, { ...sheetOpts, marginMm: 2 }).pages[0].rows[0].items[0];
  // #then  both halves keep the taller face, so the tabs still meet the floor
  assert.deepEqual([m.faceHeightMm, m.back!.imageHeightMm, m.totalHeightMm], [35, 13.125, 124]);
});

t('a back taller than its capped front sets the face height either way round', () => {
  // #given  a 4:1 front, capped to 13.125 mm tall, before a 35 mm square back
  const entries = [
    entry({ naturalWidth: 400, naturalHeight: 100, backNaturalWidth: 100, backNaturalHeight: 100 }),
  ];
  // #when
  const m = packRows(entries, { ...sheetOpts, marginMm: 2 }).pages[0].rows[0].items[0];
  // #then
  assert.deepEqual([m.faceHeightMm, m.imageHeightMm, m.totalHeightMm], [35, 13.125, 124]);
});

t('a mini without a back artwork carries no back face geometry', () => {
  // #when
  const m = packRows([entry({})], sheetOpts).pages[0].rows[0].items[0];
  // #then
  assert.deepEqual([m.back, m.faceHeightMm], [undefined, m.imageHeightMm]);
});
