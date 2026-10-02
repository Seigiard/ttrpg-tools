import { expect, test } from 'bun:test';
import { packMinis, packRows, type Placement } from './packing';
import { HEIGHT_SLOT_ORDER } from './sizes';
import type { PackingEntry } from './types';

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
function bands(items: Placement[], axis: 'x' | 'y'): Placement[][] {
  const start = (p: Placement) => (axis === 'x' ? p.xMm : p.yMm);
  const end = (p: Placement) =>
    start(p) + (axis === 'x' ? p.mini.totalWidthMm : p.mini.totalHeightMm);
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
    ]);
    // #when
    const violations: string[] = [];
    for (const [n, entries] of batches.entries()) {
      const opts = { pageSize, numberDuplicates: true, marginMm: n % 6 };
      const result = packMinis(entries, opts);
      const width = pageSize === 'a4' ? 190 : 196;
      const height = pageSize === 'a4' ? 277 : 259;
      if (result.pageCount > packRows(entries, opts).pageCount) violations.push('more sheets');
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
            a.rotated ||
            a.xMm < 0 ||
            a.yMm < 0 ||
            a.xMm + a.mini.totalWidthMm > width + 1e-9 ||
            a.yMm + a.mini.totalHeightMm > height + 1e-9
          )
            violations.push('bounds');
          if (a.mini.label !== String(a.mini.copyIndex + 1)) violations.push('label');
          for (const b of page.placements.slice(i + 1)) {
            const separated =
              a.xMm + a.mini.totalWidthMm + 4 <= b.xMm + 1e-9 ||
              b.xMm + b.mini.totalWidthMm + 4 <= a.xMm + 1e-9 ||
              a.yMm + a.mini.totalHeightMm + 4 <= b.yMm + 1e-9 ||
              b.yMm + b.mini.totalHeightMm + 4 <= a.yMm + 1e-9;
            if (!separated) violations.push('gap');
          }
        }
        for (const strip of bands(page.placements, 'y')) {
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
    })),
  );
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

test('the row candidate saves a sheet when height-first columns leave unusable gaps', () => {
  // #given: A=42×120 (3 copies), B=46×214 (5), C=58×176 (5).
  // Width-sorted rows are CCC / CCB / BBB / BAAA, each on its own sheet.
  // Height-first gives BBB / BBC / CCC / CAA / A: no remaining column
  // has 46 mm for A plus its gap, and no strip can stack a second mini.
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
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(result.pageCount).toBe(4);
});
