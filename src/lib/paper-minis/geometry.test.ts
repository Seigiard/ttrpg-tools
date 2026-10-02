import assert from 'node:assert/strict';
import { MARGIN_MM, PAGE_SIZES_MM, fitFigure, resolveMini } from './geometry.ts';
import { type PackResult, packMinis } from './packing.ts';
import {
  HEIGHT_SLOTS,
  HEIGHT_SLOT_ORDER,
  resolveBaseWidthMm,
  resolveFigureHeightMm,
  slotGeometryLabel,
} from './sizes.ts';
import type { PackingEntry as Entry } from './types.ts';

import { test as t } from 'bun:test';

t('every adjacent pair of slots prints a taller figure than the one below it', () => {
  // #given  identical artwork, so only the slot decides the height
  const heights = HEIGHT_SLOT_ORDER.map(
    (slot) =>
      fitFigure(
        {
          baseWidthMm: resolveBaseWidthMm({ heightSlot: slot }),
          figureHeightMm: HEIGHT_SLOTS[slot].figureHeightMm,
        },
        100,
        300,
      ).imageHeightMm,
  );
  // #when
  const rising = heights.every((height, i) => i === 0 || heights[i - 1] < height);
  // #then  ordering holds between neighbours, not merely between categories
  assert.deepEqual([rising, heights], [true, [12, 20, 27, 35, 43, 56, 82, 95, 111]]);
});

// The three Medium figures from printableminimaker ADR-0002: a vine, a warrior with the axe held
// out sideways, an elemental spreading flame. All three sit in one slot.
t('one height slot prints one height whatever the artwork proportions', () => {
  // #given
  const proportions = [
    [100, 240],
    [100, 200],
    [100, 100],
  ];
  const medium = { baseWidthMm: 25, figureHeightMm: 30 };
  // #when
  const heights = proportions.map(([w, h]) => fitFigure(medium, w, h).imageHeightMm);
  // #then
  assert.deepEqual(heights, [30, 30, 30]);
});

t('figure width follows the artwork proportions', () => {
  // #given
  const proportions = [
    [100, 240],
    [100, 100],
    [150, 100],
  ];
  const medium = { baseWidthMm: 25, figureHeightMm: 30 };
  // #when
  const widths = proportions.map(([w, h]) => fitFigure(medium, w, h).imageWidthMm);
  // #then
  assert.deepEqual(widths, [12.5, 30, 45]);
});

t('a figure past the width cap is scaled down whole with its aspect intact', () => {
  // #given  a 30 mm Medium figure is capped at 45 mm wide
  const medium = { baseWidthMm: 25, figureHeightMm: 30 };
  const uncapped = medium.figureHeightMm * 4;
  // #when
  const { imageWidthMm, imageHeightMm } = fitFigure(medium, 400, 100);
  // #then
  assert.deepEqual(
    [uncapped > imageWidthMm, imageWidthMm, imageHeightMm, imageWidthMm / imageHeightMm],
    [true, 45, 11.25, 4],
  );
});

// The acceptance criterion this whole ticket rests on, asserted on what prints
// rather than on the table: a capped figure used to lose its slot entirely,
// because the cap was a multiple of the base width and every slot of a category
// shares one base.
t('slots of one category stay apart when the artwork is wide enough to cap', () => {
  // #given  a dwarf and a bugbear, both Medium, on artwork three times as wide as it is tall
  const dwarf = { baseWidthMm: 25, figureHeightMm: 27 };
  const bugbear = { baseWidthMm: 25, figureHeightMm: 43 };
  // #when
  const heights = [dwarf, bugbear].map((slot) => fitFigure(slot, 300, 100).imageHeightMm);
  // #then  both are scaled down, and the bugbear still prints the taller
  assert.deepEqual(
    [heights, heights[0] < heights[1], heights[1] / heights[0]],
    [[13.5, 21.5], true, bugbear.figureHeightMm / dwarf.figureHeightMm],
  );
});

t('the tallest slot’s widest figure still fits the page', () => {
  // #given  the reserved column is the figure plus a margin each side
  const gargantuan = { baseWidthMm: 75, figureHeightMm: HEIGHT_SLOTS.gargantuan.figureHeightMm };
  // #when  artwork far too wide to print uncapped
  const { imageWidthMm } = fitFigure(gargantuan, 1000, 100);
  // #then  A4 leaves 190 mm of usable width
  assert.deepEqual([imageWidthMm, imageWidthMm + 2 * 2 <= 190], [166.5, true]);
});

t('a custom size honours both of its numbers', () => {
  // #given
  const e = { heightSlot: 'custom' as const, customWidthMm: 20, customHeightMm: 45 };
  const dimensions = {
    baseWidthMm: resolveBaseWidthMm(e),
    figureHeightMm: resolveFigureHeightMm(e),
  };
  // #when
  const fit = fitFigure(dimensions, 100, 300);
  // #then
  assert.deepEqual([fit.imageWidthMm, fit.imageHeightMm], [15, 45]);
});

// Mini geometry asserted through the packer's interface: what each placement
// carries and each row's status. row-packing.test.ts pins the row candidate's
// layout; layout.test.ts covers where minis land.

// Helper: build an entry with square art at a given size/count.
const entry = (over: Partial<Entry>): Entry => ({
  heightSlot: 'medium',
  count: 1,
  naturalWidth: 100,
  naturalHeight: 100,
  ...over,
});

// Placement order follows the chosen layout, so read minis back in entry order.
const placedMinis = (result: PackResult) =>
  result.pages
    .flatMap((page) => page.placements.map(({ mini }) => mini))
    .toSorted((a, b) => a.entryIndex - b.entryIndex || a.copyIndex - b.copyIndex);

const usableH = PAGE_SIZES_MM.a4.h - MARGIN_MM * 2; // 277
const sheetOpts = { pageSize: 'a4', numberDuplicates: false } as const;

t('default margin reserves paper around both faces without shrinking the figure', () => {
  // #given
  const entries = [entry({})];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  const mini = result.pages[0].placements[0].mini;
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

t('calibration scales the artwork height from the marked creature height', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 50, naturalHeight: 100, calibration: { head: 0.25, feet: 0.75 } }),
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
      result.entries,
    ],
    [35, 70, 70, [], [{ state: 'upright', limits: [] }]],
  );
});

t('calibration uses a custom figure height as its target', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 30,
      customHeightMm: 30,
      naturalWidth: 50,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual([mini.imageWidthMm, mini.imageHeightMm], [30, 60]);
});

t('calibration past twice the slot height is scaled down and reported', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 50, naturalHeight: 100, calibration: { head: 0.1, feet: 0.2 } }),
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

t('calibration that hits the width cap scales down whole and reports width', () => {
  // #given
  const entries = [
    entry({ naturalWidth: 300, naturalHeight: 100, calibration: { head: 0.25, feet: 0.75 } }),
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

t('calibration too tall for the page scales to fit and is reported instead of left out', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 50,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0].placements[0].mini;
  // #then
  assert.deepEqual(
    [
      result.miniCount,
      mini.imageHeightMm,
      mini.totalHeightMm,
      mini.fitLimits,
      result.entries,
    ],
    [1, 128.5, usableH, ['page'], [{ state: 'upright', limits: ['page'] }]],
  );
});

t('a fractional page-capped mini stays exactly within the usable page height', () => {
  // #given  the face cap leaves exactly 277 mm for an A4 mini with a fractional base
  const fractional = entry({
    heightSlot: 'custom',
    customWidthMm: 22.1,
    customHeightMm: 300,
    naturalWidth: 50,
    naturalHeight: 100,
    calibration: { head: 0.25, feet: 0.75 },
  });
  // #when
  const resolved = resolveMini(fractional, 0, {
    pageSize: 'a4',
    numberDuplicates: false,
    marginMm: 2,
  })!;
  const mini = resolved.copies[0];
  // #then
  assert.deepEqual(
    [resolved.orientation, mini.totalHeightMm, mini.levels.topMm],
    ['upright', 277, 277],
  );
});

t('a calibrated custom figure fits both page dimensions without changing its aspect', () => {
  // #given: a 10 mm base, 140 mm creature and 3:2 artwork on A4.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 150,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      entries: result.entries,
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
      entries: [{ state: 'upright', limits: ['width', 'page'] }],
      geometry: [[186, 124, 190, 272, false]],
    },
  );
});

t('a page-width cap shrinks both calibrated faces to the same height', () => {
  // #given: the back is wider than the calibrated front; neither may be cropped.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 50,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
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
      entries: result.entries,
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
      entries: [{ state: 'upright', limits: ['width', 'page'] }],
      geometry: [[62, 124, 186, 124, 190, 272]],
    },
  );
});

t('page fit prints the former too-wide page-cap case at zero margin', () => {
  // #given: this case used to lose its page warning and be left out after a height-only cap.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 130,
      naturalWidth: 150,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  // #then: millimetres rounded to a micron for the repeating 3:2 height.
  assert.deepEqual(
    {
      entries: result.entries,
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
      entries: [{ state: 'upright', limits: ['width', 'page'] }],
      geometry: [[190, 126.667, 190, 273.333]],
    },
  );
});

t('page fit gives both calibrated faces the same height under the wider face cap', () => {
  // #given: a narrow front and a wider back share one calibration.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 10,
      customHeightMm: 140,
      naturalWidth: 25,
      naturalHeight: 100,
      backNaturalWidth: 150,
      backNaturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      entries: result.entries,
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
      entries: [{ state: 'upright', limits: ['width', 'page'] }],
      geometry: [[31, 124, 186, 124, 190, 272]],
    },
  );
});

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
  const opts = { pageSize: 'a4', numberDuplicates: false } as const;
  // #when
  const result = packMinis(entries, opts);
  // #then
  assert.deepEqual(
    {
      pages: result.pages,
      entries: result.entries,
      resolved: resolveMini(entries[0], 0, opts)?.copies.map(
        ({ baseWidthMm, totalHeightMm }) => [baseWidthMm, totalHeightMm],
      ),
    },
    {
      pages: [],
      entries: [{ state: 'oversized', limits: [] }],
      resolved: [[10, 304]],
    },
  );
});

t('shared calibration gives differently shaped faces the same printed height', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 100,
      naturalHeight: 100,
      backNaturalWidth: 50,
      backNaturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const mini = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 }).pages[0]
    .placements[0].mini;
  // #then
  assert.deepEqual(
    [mini.imageHeightMm, mini.back?.imageWidthMm, mini.back?.imageHeightMm],
    [52.5, 26.25, 52.5],
  );
});

t('a square back shrinks both calibrated faces together at its width cap', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 50,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
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

t('a wide back stays printable with matching calibrated heights and unchanged proportions', () => {
  // #given
  const entries = [
    entry({
      naturalWidth: 50,
      naturalHeight: 100,
      calibration: { head: 0.25, feet: 0.75 },
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
      front: [mini?.imageWidthMm, mini?.imageHeightMm],
      back: mini?.back,
      entries: result.entries,
    },
    {
      count: 1,
      front: [8.75, 17.5],
      back: { imageWidthMm: 52.5, imageHeightMm: 17.5, imageOffsetXMm: 2 },
      entries: [{ state: 'upright', limits: ['width'] }],
    },
  );
});

t('shared calibration is capped to the page and reports every active limit', () => {
  // #given
  const entries = [
    entry({
      heightSlot: 'gargantuan',
      naturalWidth: 50,
      naturalHeight: 100,
      backNaturalWidth: 100,
      backNaturalHeight: 100,
      calibration: { head: 0, feet: 0.25 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0]?.placements[0].mini;
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      front: mini?.imageHeightMm,
      back: mini?.back,
      entries: result.entries,
    },
    {
      count: 1,
      front: 125.5,
      back: { imageWidthMm: 125.5, imageHeightMm: 125.5, imageOffsetXMm: 0 },
      entries: [{ state: 'upright', limits: ['height', 'width', 'page'] }],
    },
  );
});

t('shared calibration fits an oversized custom front and back onto the page', () => {
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
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  const mini = result.pages[0]?.placements[0].mini;
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      front: [mini?.imageWidthMm, mini?.imageHeightMm],
      back: [mini?.back?.imageWidthMm, mini?.back?.imageHeightMm],
      total: mini?.totalHeightMm,
      entries: result.entries,
    },
    {
      count: 1,
      front: [64.25, 128.5],
      back: [32.125, 128.5],
      total: 277,
      entries: [{ state: 'upright', limits: ['page'] }],
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
      calibration: { head: 0.25, feet: 0.75 },
    }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 0 });
  // #then
  assert.deepEqual(
    [result.miniCount, result.entries],
    [0, [{ state: 'oversized', limits: [] }]],
  );
});

t('fit warnings describe placed copies, not an oversized entry that hit the height cap', () => {
  // #given: the oversized base cannot fit either orientation, even after its height cap.
  const entries = [
    entry({
      heightSlot: 'custom',
      customWidthMm: 200,
      customHeightMm: 140,
      calibration: { head: 0.2, feet: 0.3 },
      count: 2,
    }),
    entry({ naturalWidth: 50, calibration: { head: 0.1, feet: 0.2 }, count: 2 }),
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    {
      count: result.miniCount,
      entries: result.entries,
    },
    {
      count: 2,
      entries: [
        { state: 'oversized', limits: [] },
        { state: 'upright', limits: ['height'] },
      ],
    },
  );
});

t('calibrated slots keep their height order with the same marked lines', () => {
  // #given
  const shared = {
    naturalWidth: 50,
    naturalHeight: 100,
    calibration: { head: 0.25, feet: 0.75 },
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
  // #when
  const r = packMinis([], { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual([r.pageCount, r.miniCount, r.pages, r.entries], [0, 0, [], []]);
});

t('count expands into that many placed minis', () => {
  // #given
  const entries = [entry({ count: 5 })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual([r.miniCount, placedMinis(r).map((m) => m.copyIndex)], [5, [0, 1, 2, 3, 4]]);
});

t('entries without natural dimensions are not packed', () => {
  // #given
  const entries = [entry({ naturalWidth: undefined, naturalHeight: undefined })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    [r.miniCount, r.pageCount, r.entries],
    [0, 0, [{ state: 'empty', limits: [] }]],
  );
});

t('custom entry without a valid width is not packed', () => {
  // #given
  const entries = [entry({ heightSlot: 'custom', customWidthMm: undefined })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual([r.miniCount, r.entries], [0, [{ state: 'empty', limits: [] }]]);
});

// --- oversized reporting ---

t('mini wider than the page is reported as oversized, not silently dropped', () => {
  // #given  200 mm base, 204 mm including margins > 190 usable width
  const entries = [entry({ heightSlot: 'custom', customWidthMm: 200, customHeightMm: 30 })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    [r.miniCount, r.pageCount, r.entries],
    [0, 0, [{ state: 'oversized', limits: [] }]],
  );
});

t('mini taller than the page is reported as oversized', () => {
  // #given  custom 140mm base and 140mm figure: image 140x140,
  //         totalHeight = 140*2 + 2*2 + 4*70 = 564 > 277
  const tall = entry({ heightSlot: 'custom', customWidthMm: 140, customHeightMm: 140 });
  const opts = { pageSize: 'a4', numberDuplicates: false } as const;
  // #when
  const r = packMinis([tall], opts);
  // #then  an oversized mini is never placed, so its height is read from the resolve step
  assert.deepEqual(
    [r.miniCount, r.entries, resolveMini(tall, 0, opts)?.copies[0].totalHeightMm],
    [0, [{ state: 'oversized', limits: [] }], 564],
  );
});

t('oversized entry is left out while a fitting entry in the same batch is placed', () => {
  // #given
  const entries = [
    entry({ count: 2 }),
    entry({ heightSlot: 'custom', customWidthMm: 300, customHeightMm: 30 }),
    entry({ count: 3 }),
  ];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then  2 + 3 placed
  assert.deepEqual(
    [r.miniCount, placedMinis(r).map((m) => m.entryIndex), r.entries.map(({ state }) => state)],
    [5, [0, 0, 2, 2, 2], ['upright', 'oversized', 'upright']],
  );
});

// --- labels ---

t('numberDuplicates labels copies 1..N per entry', () => {
  // #given
  const entries = [entry({ count: 3 })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: true });
  // #then
  assert.deepEqual(
    placedMinis(r).map((m) => m.label),
    ['1', '2', '3'],
  );
});

t('no labels when numberDuplicates is off', () => {
  // #given
  const entries = [entry({ count: 3 })];
  // #when
  const r = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  assert.deepEqual(
    placedMinis(r).map((m) => m.label),
    [undefined, undefined, undefined],
  );
});

t('a Medium unfolds to both faces, two margins and four half-base tabs', () => {
  // #given  the stand folds as _||_: a 12.5 mm tab under each face and a
  //         25 mm floor strip, two tabs deep, under the front one
  const entries = [entry({ heightSlot: 'medium' })];
  // #when
  const m = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 }).pages[0].placements[0].mini;
  // #then  35*2 + 2*2 + 12.5*4
  assert.deepEqual([m.totalHeightMm, m.tabHeightMm], [124, 12.5]);
});

t('a Medium resolves every internal level and the back badge offset in millimetres', () => {
  // #given  a 25 mm base, 12.5 mm tabs, 35 mm faces and 2 mm around the fold
  const entries = [entry({ heightSlot: 'medium' })];
  // #when
  const mini = packMinis(entries, { ...sheetOpts, marginMm: 2 }).pages[0].placements[0].mini;
  // #then
  assert.deepEqual(
    {
      levels: mini.levels,
      backBadgeOffsetXMm: mini.backBadgeOffsetXMm,
      totalHeightMm: mini.totalHeightMm,
    },
    {
      levels: {
        floorStripTopMm: 25,
        frontTabTopMm: 37.5,
        frontFaceTopMm: 72.5,
        foldMm: 74.5,
        backFaceBottomMm: 76.5,
        backFaceTopMm: 111.5,
        topMm: 124,
        cutMarks: {
          crossesMm: [0, 74.5, 124],
          halvesMm: [25, 37.5, 111.5],
        },
      },
      backBadgeOffsetXMm: 5,
      totalHeightMm: 124,
    },
  );
});

t('resolved levels cover a taller back, a custom margin and a rotated rescue', () => {
  // #given  three hand-worked unfoldings that exercise the layout inputs independently
  const cases = [
    {
      entry: entry({
        naturalWidth: 400,
        naturalHeight: 100,
        backNaturalWidth: 100,
        backNaturalHeight: 100,
      }),
      marginMm: 2,
      expected: {
        orientation: false,
        levels: [25, 37.5, 72.5, 74.5, 76.5, 111.5, 124],
        crosses: [0, 74.5, 124],
        halves: [25, 37.5, 111.5],
        badge: 5,
        totalMatchesTop: true,
      },
    },
    {
      entry: entry({}),
      marginMm: 5,
      expected: {
        orientation: false,
        levels: [25, 37.5, 72.5, 77.5, 82.5, 117.5, 130],
        crosses: [0, 77.5, 130],
        halves: [25, 37.5, 117.5],
        badge: 5,
        totalMatchesTop: true,
      },
    },
    {
      entry: entry({
        heightSlot: 'custom',
        customWidthMm: 20,
        customHeightMm: 140,
        naturalWidth: 1000,
        naturalHeight: 100,
      }),
      marginMm: 2,
      expected: {
        orientation: true,
        levels: [20, 30, 51, 53, 55, 76, 86],
        crosses: [0, 53, 86],
        halves: [20, 30, 76],
        badge: 95,
        totalMatchesTop: true,
      },
    },
  ];
  // #when
  const actual = cases.map(({ entry: testEntry, marginMm }) => {
    const placement = packMinis([testEntry], { ...sheetOpts, marginMm }).pages[0].placements[0];
    const { levels, backBadgeOffsetXMm, totalHeightMm } = placement.mini;
    return {
      orientation: placement.rotated,
      levels: [
        levels.floorStripTopMm,
        levels.frontTabTopMm,
        levels.frontFaceTopMm,
        levels.foldMm,
        levels.backFaceBottomMm,
        levels.backFaceTopMm,
        levels.topMm,
      ],
      crosses: levels.cutMarks.crossesMm,
      halves: levels.cutMarks.halvesMm,
      badge: backBadgeOffsetXMm,
      totalMatchesTop: totalHeightMm === levels.topMm,
    };
  });
  // #then
  assert.deepEqual(actual, cases.map(({ expected }) => expected));
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
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 2 });
  // #then
  assert.deepEqual(
    [result.pageCount, result.miniCount, result.entries.map(({ state }) => state)],
    [0, 0, ['oversized', 'oversized']],
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
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 3 });
  // #then
  assert.deepEqual(
    placedMinis(result).map((mini) => [
      mini.baseWidthMm,
      mini.imageWidthMm,
      mini.imageHeightMm,
      mini.totalWidthMm,
      mini.totalHeightMm,
      mini.imageOffsetXMm,
      mini.marginMm,
    ]),
    [
      [20, 6, 12, 26, 70, 10, 3],
      [37, 28, 56, 43, 192, 7.5, 3],
    ],
  );
});

t('a numbered mini at zero margin centres its base under the figure', () => {
  // #given  square art at Medium prints 35 mm tall, overhanging its 25 mm base
  const entries = [entry({})];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: true, marginMm: 0 });
  // #then
  assert.deepEqual(
    placedMinis(result).map(({ imageWidthMm, baseWidthMm, baseOffsetXMm, label }) => ({
      imageWidthMm,
      baseWidthMm,
      baseOffsetXMm,
      label,
    })),
    [{ imageWidthMm: 35, baseWidthMm: 25, baseOffsetXMm: 5, label: '1' }],
  );
});

t('a mini reserves the greater of figure width and base width, plus margins', () => {
  // #given  wide art overhangs a Medium base; tall art stays well inside it
  const entries = [
    entry({ naturalWidth: 150, naturalHeight: 100 }),
    entry({ naturalWidth: 100, naturalHeight: 350 }),
  ];
  // #when
  const result = packMinis(entries, { ...sheetOpts, marginMm: 2 });
  // #then
  assert.deepEqual(
    placedMinis(result).map((mini) => [
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
  const result = packMinis(entries, { ...sheetOpts, marginMm: 2 });
  // #then  each figure spans its overhang across its cut-out's height, where it was placed
  const sheets = result.pages.map((page) =>
    page.placements.map(({ mini, xMm, yMm }) => {
      const left = xMm + mini.imageOffsetXMm;
      return { left, right: left + mini.imageWidthMm, top: yMm, bottom: yMm + mini.totalHeightMm };
    }),
  );
  const figures = sheets.flat();
  assert.deepEqual(
    {
      figures: figures.length,
      overhanging: figures.every(({ left, right }) => right - left === 52.5),
      overlapping: sheets.some((sheet) =>
        sheet.some((a, i) =>
          sheet
            .slice(i + 1)
            .some((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
        ),
      ),
    },
    { figures: 4, overhanging: true, overlapping: false },
  );
});

t('a custom entry without a figure height is not packable', () => {
  // #given  a base width alone does not say how tall the figure prints
  const entries = [entry({ heightSlot: 'custom', customWidthMm: 30 })];
  // #when
  const result = packMinis(entries, sheetOpts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [0, 0]);
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
  const minis = placedMinis(packMinis(entries, { ...sheetOpts, marginMm: 2 }));
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
    packMinis(entries, { pageSize, numberDuplicates: false }),
  );
  // #then  the tallest slot is cut to the paper, so none of them is oversized
  assert.deepEqual(
    results.map((result) => [
      result.miniCount,
      result.entries.filter(({ state }) => state === 'oversized').length,
    ]),
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
    packMinis(entries, { pageSize, numberDuplicates: false, marginMm: 5 }),
  );
  // #then
  assert.deepEqual(
    results.map((result) => [
      result.miniCount,
      result.entries.filter(({ state }) => state === 'oversized').length,
    ]),
    [
      [HEIGHT_SLOT_ORDER.length, 0],
      [HEIGHT_SLOT_ORDER.length, 0],
    ],
  );
});

// The dropdown's tooltip is a promise about paper, and it reaches the user
// through the resolvers; resolveMini fixes the geometry before either layout.
t('the tooltip promises the millimetres the packer actually produces', () => {
  // #given  every slot on artwork too tall to reach the width cap, so each
  //         figure prints at its slot's own height
  const entries = HEIGHT_SLOT_ORDER.map((heightSlot) =>
    entry({ heightSlot, naturalWidth: 100, naturalHeight: 200 }),
  );
  // #when
  const minis = placedMinis(packMinis(entries, { ...sheetOpts, marginMm: 2 }));
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
  const m = packMinis(entries, { ...sheetOpts, marginMm: 2 }).pages[0].placements[0].mini;
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
  const m = packMinis(entries, { ...sheetOpts, marginMm: 2 }).pages[0].placements[0].mini;
  // #then  both halves keep the taller face, so the tabs still meet the floor
  assert.deepEqual([m.faceHeightMm, m.back!.imageHeightMm, m.totalHeightMm], [35, 13.125, 124]);
});

t('a back taller than its capped front sets the face height either way round', () => {
  // #given  a 4:1 front, capped to 13.125 mm tall, before a 35 mm square back
  const entries = [
    entry({ naturalWidth: 400, naturalHeight: 100, backNaturalWidth: 100, backNaturalHeight: 100 }),
  ];
  // #when
  const m = packMinis(entries, { ...sheetOpts, marginMm: 2 }).pages[0].placements[0].mini;
  // #then
  assert.deepEqual([m.faceHeightMm, m.imageHeightMm, m.totalHeightMm], [35, 13.125, 124]);
});

t('a mini without a back artwork carries no back face geometry', () => {
  // #when
  const m = packMinis([entry({})], sheetOpts).pages[0].placements[0].mini;
  // #then
  assert.deepEqual([m.back, m.faceHeightMm], [undefined, m.imageHeightMm]);
});
