import { expect, test } from 'bun:test';
import { packMinis, type Placement } from './packing';
import { fullPageAreaMm, usableAreaMm } from './geometry';
import { HEIGHT_SLOT_ORDER } from './sizes';
import type { PackingEntry } from './types';

const rescue: PackingEntry = {
  heightSlot: 'custom',
  customWidthMm: 15,
  customHeightMm: 140,
  naturalWidth: 10,
  naturalHeight: 1,
  count: 1,
};

for (const pageSize of ['a4', 'letter'] as const) {
  test(`${pageSize}: rescued minis own strips even when a neighbour would fit beside them`, () => {
    // #given: a turned 86×214 footprint leaves room beside it for a Tiny,
    // but its dedicated strip leaves too little height below for the 68 mm Tiny.
    const entries: PackingEntry[] = [
      rescue,
      { heightSlot: 'tiny', naturalWidth: 1, naturalHeight: 1, count: 1 },
    ];
    const opts = { pageSize, numberDuplicates: false };
    // #when
    const result = packMinis(entries, opts);
    // #then
    expect(
      result.pages.map((page) => page.placements.map((p) => [p.mini.entryIndex, p.rotated])),
    ).toEqual([[[0, true]], [[1, false]]]);
  });
}

test('a rescue cannot join an upright strip even when its turned footprint fits beside it', () => {
  // #given: 92×264 upright plus 86×214 turned would fit side by side.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 80,
      customHeightMm: 35,
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

test('a rescue fits turned exactly at the usable height boundary', () => {
  // #given: the default printer scale provides 181.1 mm of usable A4 width.
  // Raising the requested height by 0.01 mm exceeds the A4 usable height.
  const entries = [
    { ...rescue, customHeightMm: 160 },
    { ...rescue, customHeightMm: 160.01 },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false, marginMm: 3.5 });
  // #then
  expect({
    placed: result.pages.flatMap((page) =>
      page.placements.map((p) => [p.mini.entryIndex, p.rotated]),
    ),
    states: result.entries.map(({ state }) => state),
  }).toEqual({ placed: [[1, true], [0, true]], states: ['rotated', 'rotated'] });
});

test('short minis stack beside a tall mini instead of opening a second sheet', () => {
  // #given: one 92×264 and four 44×124 footprints on 190×277 paper.
  // A tall column plus two short columns is 180 mm wide. Each short column
  // holds two minis (248 mm), so all five fit one sheet.
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
  expect(result.pageCount).toBe(2);
});

test('a full-height layout puts more minis on the second sheet than the scale-bar sheet', () => {
  // #given: 120 mm pieces leave a 20 mm first-sheet remainder. A final 28 mm
  // strip fits only on the 270.27 mm later page, after both large-piece pages fill.
  const entries: PackingEntry[] = [
    {
      heightSlot: 'custom',
      customWidthMm: 2,
      customHeightMm: 10,
      count: 3,
      naturalWidth: 1,
      naturalHeight: 1,
    },
    {
      heightSlot: 'custom',
      customWidthMm: 2,
      customHeightMm: 56,
      count: 12,
      naturalWidth: 1,
      naturalHeight: 1,
    },
  ];
  // #when
  const result = packMinis(entries, { pageSize: 'a4', numberDuplicates: false });
  // #then
  expect(result.pages.slice(0, 2).map((page) => page.placements.length)).toEqual([6, 9]);
});

// Find bands by projecting rectangles onto an axis. This checks whether cuts
// exist in the result, without consulting the packer's strips or columns.
const placedWidth = (p: Placement) => (p.rotated ? p.mini.totalHeightMm : p.mini.totalWidthMm);
const placedHeight = (p: Placement) => (p.rotated ? p.mini.totalWidthMm : p.mini.totalHeightMm);
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
  test(`${pageSize}: mixed layouts stay in bounds, never overlap, conserve copies and allow straight cuts`, () => {
    // #given: varied sizes, aspect ratios, counts, backs and custom dimensions.
    // The oracle is physical paper (190×277 / 196×259), shared cut lines and the
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
      const { widthMm: width, heightMm: firstHeight } = usableAreaMm(opts);
      const { heightMm: laterHeight } = fullPageAreaMm(opts);
      if (JSON.stringify(result) !== JSON.stringify(packMinis(entries, opts)))
        violations.push('nondeterministic');
      const placed = result.pages.flatMap((page) => page.placements);
      const oversized = new Set(result.entries.flatMap(({ state }, i) =>
        state === 'oversized' ? [i] : [],
      ));
      const expected = entries
        .flatMap((e, i) =>
          oversized.has(i) ? [] : Array.from({ length: e.count }, (_, j) => `${i}:${j}`),
        )
        .toSorted();
      const actual = placed
        .map(({ mini }) => `${mini.entryIndex}:${mini.copyIndex}`)
        .toSorted();
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        violations.push('lost or repeated copy');
      if (placed.length !== result.miniCount || result.pages.length !== result.pageCount)
        violations.push('count');
      for (const [pageIndex, page] of result.pages.entries()) {
        const height = pageIndex === 0 ? firstHeight : laterHeight;
        for (const [i, a] of page.placements.entries()) {
          if (
            a.xMm < 0 ||
            a.yMm < 0 ||
            a.xMm + placedWidth(a) > width + 1e-9 ||
            a.yMm + placedHeight(a) > height + 1e-9
          )
            violations.push('bounds');
          if (a.rotated && a.mini.totalWidthMm <= width && a.mini.totalHeightMm <= laterHeight)
            violations.push('unneeded rotation');
          if (a.mini.label !== String(a.mini.copyIndex + 1)) violations.push('label');
          for (const b of page.placements.slice(i + 1)) {
            const separated =
              a.xMm + placedWidth(a) <= b.xMm + 1e-9 ||
              b.xMm + placedWidth(b) <= a.xMm + 1e-9 ||
              a.yMm + placedHeight(a) <= b.yMm + 1e-9 ||
              b.yMm + placedHeight(b) <= a.yMm + 1e-9;
            if (!separated) violations.push('overlap');
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

test('empty and unprepared inputs have no placements, and unprepared rows report empty', () => {
  // #given
  const inputs: PackingEntry[][] = [[], [{ heightSlot: 'medium', count: 1 }]];
  // #when
  const results = inputs.map((entries) =>
    packMinis(entries, { pageSize: 'a4', numberDuplicates: false }),
  );
  // #then
  expect(results).toEqual([
    { pages: [], pageCount: 0, miniCount: 0, entries: [] },
    { pages: [], pageCount: 0, miniCount: 0, entries: [{ state: 'empty', limits: [] }] },
  ]);
});

test('an uncalibrated wide mini keeps its dimensions through rotation and strip packing', () => {
  // #given: the 8:1 front and 4:1 back hit the slot width cap independently.
  // The 199 mm cut-out only fits turned. A Tiny fits below it.
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
    entries: result.entries,
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
    entries: [
      { state: 'rotated', limits: [] },
      { state: 'upright', limits: [] },
    ],
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
      ],
      [
        {
          entry: 1,
          rotated: false,
          position: [0, 0],
          front: [12, 12],
          back: undefined,
          cutout: [24, 68],
        },
      ],
    ],
  });
});

test('later small minis backfill the first sheet', () => {
  // #given: two 74×224 columns on page one, the third on page two.
  // A 24×68 Tiny still fits beside the first two columns (172 mm in total).
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
