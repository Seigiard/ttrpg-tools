import { expect, test } from 'bun:test';
import { packMinis, type Placement } from './packing';
import { packRowCandidate } from '@/test-utils/pack-row-candidate';
import { HEIGHT_SLOT_ORDER } from './sizes';
import type { PackingEntry } from './types';

const rescue: PackingEntry = {
  heightSlot: 'custom',
  customWidthMm: 20,
  customHeightMm: 140,
  naturalWidth: 10,
  naturalHeight: 1,
  count: 1,
};

for (const pageSize of ['a4', 'letter'] as const) {
  test(`${pageSize}: rescued minis own strips even when a neighbour would fit beside them`, () => {
    // #given: a turned 89.2×217.2 footprint leaves room beside it for a Tiny,
    // but its dedicated strip leaves too little height below for the 68 mm Tiny.
    const entries: PackingEntry[] = [
      rescue,
      { heightSlot: 'tiny', naturalWidth: 1, naturalHeight: 1, count: 1 },
    ];
    const opts = { pageSize, numberDuplicates: false };
    // #when
    const result = packMinis(entries, opts);
    const rows = packRowCandidate(entries, opts);
    // #then
    expect({
      pages: result.pages.map((page) => page.placements.map((p) => [p.mini.entryIndex, p.rotated])),
      rowPages: rows.pages.map((p) => p.rows.map((r) => [r.items.length, r.rotated ?? false])),
    }).toEqual({ pages: [[[0, true]], [[1, false]]], rowPages: [[[1, false]], [[1, true]]] });
  });
}

test('a rescue cannot join an upright strip even when its turned footprint fits beside it', () => {
  // #given: 92×264 upright plus 89.2×217.2 turned would fit side by side.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 88,
      customHeightMm: 42,
      naturalWidth: 1,
      naturalHeight: 1,
      count: 1,
    },
    rescue,
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(
    result.pages.map((page) => page.placements.map((p) => [p.mini.entryIndex, p.rotated])),
  ).toEqual([[[0, false]], [[1, true]]]);
});

test('row rescues scan earlier sheets before opening another dedicated strip', () => {
  // #given: a 109×35 row on page one; a 109×35 and 44×264 row on page two.
  // The 217.2 mm rescue strip fits below the first row, but not the second.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 5,
      customHeightMm: 70,
      naturalWidth: 10,
      naturalHeight: 1,
      count: 2,
    },
    {
      heightSlot: 'custom',
      customWidthMm: 40,
      customHeightMm: 90,
      naturalWidth: 1,
      naturalHeight: 100,
      count: 1,
    },
    rescue,
  ];
  // #when
  const result = packRowCandidate(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(result.pages.map((p) => p.rows.map((r) => r.items.map((m) => m.entryIndex)))).toEqual([
    [[0], [2]],
    [[0, 1]],
  ]);
});

test('rescue fitting includes the stroked marks at the usable height boundary', () => {
  // #given: 270 mm art + 3.8 mm margins + 3.2 mm stroked marks = 277 mm.
  // Raising the requested height by 0.01 mm exceeds the A4 usable height.
  const entries = [
    { ...rescue, customHeightMm: 180 },
    { ...rescue, customHeightMm: 180.01 },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 1.9 });
  // #then
  expect({
    placed: result.pages.flatMap((page) =>
      page.placements.map((p) => [p.mini.entryIndex, p.rotated]),
    ),
    oversized: result.oversizedEntryIndices,
  }).toEqual({ placed: [[0, true]], oversized: [1] });
});

test('short minis stack beside a tall mini instead of opening a second sheet', () => {
  // #given: one 92×264 and four 44×124 footprints on 190×277 paper.
  // A tall column plus two short columns is 188 mm wide. Each short column
  // holds two minis (252 mm). Rows need 264+4+124 mm and thus two sheets.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 88,
      customHeightMm: 42,
      count: 1,
      naturalWidth: 1,
      naturalHeight: 1,
    },
    {
      heightSlot: 'custom',
      customWidthMm: 40,
      customHeightMm: 20,
      count: 4,
      naturalWidth: 1,
      naturalHeight: 1,
    },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(result.pageCount).toBe(1);
});

// Find bands by projecting rectangles onto an axis. This checks whether cuts
// exist in the result, without consulting the packer's strips or columns.
// A rotated reservation holds the cut-out and 1.6 mm of stroked marks per edge.
const placedWidth = (p: Placement) =>
  p.rotated ? p.mini.totalHeightMm + 3.2 : p.mini.totalWidthMm;
const placedHeight = (p: Placement) =>
  p.rotated ? p.mini.totalWidthMm + 3.2 : p.mini.totalHeightMm;
function bands(items: Placement[], axis: 'x' | 'y'): Placement[][] {
  const start = (p: Placement) => (axis === 'x' ? p.xMm : p.yMm);
  const end = (p: Placement) => start(p) + (axis === 'x' ? placedWidth(p) : placedHeight(p));
  const groups: Placement[][] = [];
  let edge = -Infinity;
  for (const item of items.toSorted((a, b) => start(a) - start(b))) {
    if (start(item) >= edge) groups.push([]);
    groups.at(-1)!.push(item);
    edge = Math.max(edge, end(item));
  }
  return groups;
}

for (const pageSize of ['a4', 'letter'] as const) {
  test(`${pageSize}: mixed layouts stay in bounds, keep gaps, conserve copies and allow straight cuts`, () => {
    // #given: varied sizes, aspect ratios, counts, backs and custom dimensions.
    // The oracle is physical paper (190×277 / 196×259), a 4 mm gap and the
    // independent input inventory. The row candidate retains its original tests.
    const batches = Array.from({ length: 36 }, (_, n): PackingEntry[] => [
      ...HEIGHT_SLOT_ORDER.map((heightSlot, i) => ({
        heightSlot,
        count: (n + i) % 5,
        naturalWidth: [50, 100, 150, 400][(n + i) % 4],
        naturalHeight: 100,
        backNaturalWidth: 100,
        backNaturalHeight: 200,
      })),
      {
        heightSlot: 'custom',
        customWidthMm: 20 + n,
        customHeightMm: 15 + n,
        count: 3,
        naturalWidth: 100,
        naturalHeight: 200,
      },
      {
        heightSlot: 'custom',
        customWidthMm: 300,
        customHeightMm: 30,
        count: 2,
        naturalWidth: 100,
        naturalHeight: 100,
      },
      { ...rescue, customWidthMm: 5 + n, count: 1 + (n % 2) },
    ]);
    // #when
    const violations: string[] = [];
    for (const [n, entries] of batches.entries()) {
      const opts = { pageSize, numberDuplicates: true, marginMm: n % 6 };
      const result = packMinis(entries, opts);
      const width = pageSize === 'a4' ? 190 : 196;
      const height = pageSize === 'a4' ? 277 : 259;
      if (result.pageCount > packRowCandidate(entries, opts).pageCount) violations.push('more sheets');
      if (JSON.stringify(result) !== JSON.stringify(packMinis(entries, opts)))
        violations.push('nondeterministic');
      const placed = result.pages.flatMap((page) => page.placements);
      const expected = entries
        .flatMap((e, i) => Array.from({ length: e.count }, (_, j) => `${i}:${j}`))
        .toSorted();
      const actual = [...placed.map((p) => p.mini), ...result.skipped]
        .map((m) => `${m.entryIndex}:${m.copyIndex}`)
        .toSorted();
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        violations.push('lost or repeated copy');
      if (placed.length !== result.miniCount || result.pages.length !== result.pageCount)
        violations.push('count');
      if (JSON.stringify(result.oversizedEntryIndices) !== '[10]') violations.push('oversize');
      for (const page of result.pages) {
        for (const [i, a] of page.placements.entries()) {
          if (
            a.xMm < 0 ||
            a.yMm < 0 ||
            a.xMm + placedWidth(a) > width + 1e-9 ||
            a.yMm + placedHeight(a) > height + 1e-9
          )
            violations.push('bounds');
          if (a.rotated && a.mini.totalWidthMm <= width && a.mini.totalHeightMm <= height)
            violations.push('unneeded rotation');
          if (a.mini.label !== String(a.mini.copyIndex + 1)) violations.push('label');
          for (const b of page.placements.slice(i + 1)) {
            const separated =
              a.xMm + placedWidth(a) + 4 <= b.xMm + 1e-9 ||
              b.xMm + placedWidth(b) + 4 <= a.xMm + 1e-9 ||
              a.yMm + placedHeight(a) + 4 <= b.yMm + 1e-9 ||
              b.yMm + placedHeight(b) + 4 <= a.yMm + 1e-9;
            if (!separated) violations.push('gap');
          }
        }
        for (const strip of bands(page.placements, 'y')) {
          if (strip.some((p) => p.rotated) && strip.length !== 1)
            violations.push('shared rescue strip');
          for (const column of bands(strip, 'x')) {
            if (bands(column, 'y').some((stackItem) => stackItem.length !== 1))
              violations.push('not guillotine');
          }
        }
      }
    }
    // #then
    expect(violations).toEqual([]);
  });
}

test('empty and unprepared inputs have no placements or skipped copies', () => {
  // #given
  const inputs: PackingEntry[][] = [[], [{ heightSlot: 'medium', count: 1 }]];
  // #when
  const results = inputs.map((entries) =>
    packMinis(entries, { pageSize: 'a4', numberDuplicates: false }),
  );
  // #then
  expect(results).toEqual(
    Array.from({ length: 2 }, () => ({
      pages: [],
      pageCount: 0,
      miniCount: 0,
      skipped: [],
      oversizedEntryIndices: [],
      limitedEntryFitLimits: [],
    })),
  );
});

test('an uncalibrated wide mini keeps its dimensions through rotation and strip packing', () => {
  // #given: the 8:1 front and 4:1 back hit the slot width cap independently.
  // The 199 mm cut-out only fits turned, including marks. A Tiny fits below it.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 30,
      customHeightMm: 130,
      count: 1,
      naturalWidth: 800,
      naturalHeight: 100,
      backNaturalWidth: 400,
      backNaturalHeight: 100,
    },
    { heightSlot: 'tiny', count: 1, naturalWidth: 1, naturalHeight: 1 },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect({
    count: result.miniCount,
    skipped: result.skipped,
    warnings: result.limitedEntryFitLimits,
    pages: result.pages.map((page) =>
      page.placements.map(({ mini, rotated, xMm, yMm }) => ({
        entry: mini.entryIndex,
        rotated,
        position: [xMm, yMm],
        front: [mini.imageWidthMm, mini.imageHeightMm],
        back: mini.back && [mini.back.imageWidthMm, mini.back.imageHeightMm],
        cutout: [mini.totalWidthMm, mini.totalHeightMm],
      })),
    ),
  }).toEqual({
    count: 2,
    skipped: [],
    warnings: [],
    pages: [
      [
        {
          entry: 0,
          rotated: true,
          position: [0, 0],
          front: [195, 24.375],
          back: [195, 48.75],
          cutout: [199, 161.5],
        },
        {
          entry: 1,
          rotated: false,
          position: [0, 206.2],
          front: [12, 12],
          back: undefined,
          cutout: [24, 68],
        },
      ],
    ],
  });
});

test('later small minis backfill the first sheet; guillotine wins a sheet-count tie', () => {
  // #given: two 74×224 columns on page one, the third on page two.
  // A 24×68 Tiny still fits beside the first two columns (180 mm in total).
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 70,
      customHeightMm: 40,
      count: 3,
      naturalWidth: 1,
      naturalHeight: 1,
    },
    { heightSlot: 'tiny', count: 1, naturalWidth: 1, naturalHeight: 1 },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(result.pages.map((page) => page.placements.map(({ mini }) => mini.entryIndex))).toEqual([
    [0, 0, 1],
    [0],
  ]);
});

test.each([
  { extra: [], pages: 4, rotated: 0 },
  { extra: [rescue], pages: 5, rotated: 1 },
])('the row candidate saves a sheet with $rotated rescued minis', ({ extra, pages, rotated }) => {
  // #given: A=42×120 (3 copies), B=46×214 (5), C=58×176 (5).
  // Width-sorted rows are CCC / CCB / BBB / BAAA, each on its own sheet.
  // Height-first gives BBB / BBC / CCC / CAA / A: no remaining column
  // has 46 mm for A plus its gap, and no strip can stack a second mini.
  // A rescue adds its own sheet to either candidate; rows must retain its turn.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 38,
      customHeightMm: 20,
      count: 3,
      naturalWidth: 1,
      naturalHeight: 1,
    },
    {
      heightSlot: 'custom',
      customWidthMm: 35,
      customHeightMm: 70,
      count: 5,
      naturalWidth: 60,
      naturalHeight: 100,
    },
    {
      heightSlot: 'custom',
      customWidthMm: 54,
      customHeightMm: 32,
      count: 5,
      naturalWidth: 1,
      naturalHeight: 1,
    },
    ...extra,
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect({
    pages: result.pageCount,
    rotated: result.pages.flatMap((p) => p.placements).filter((p) => p.rotated).length,
  }).toEqual({ pages, rotated });
});
