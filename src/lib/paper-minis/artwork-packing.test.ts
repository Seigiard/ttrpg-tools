import assert from 'node:assert/strict';
import { packEntries, resolveEntry } from './packing.ts';
import type { PreparedArtwork, Entry } from './types.ts';

import { test as t } from 'bun:test';

const square: PreparedArtwork = { bytes: new Uint8Array(), format: 'png', width: 100, height: 100 };

// Preserve the pre-margin layout contract for prepared artwork.
const opts = { pageSize: 'a4', numberDuplicates: false, marginMm: 0 } as const;

const entry = (count: number, artwork: PreparedArtwork | null = square): Entry => ({
  image: null,
  artwork,
  heightSlot: 'medium',
  count,
});

t('10 prepared medium squares fit one A4 sheet', () => {
  // #given
  const entries = [entry(10)];
  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [10, 1]);
});

t('11 prepared medium squares require two A4 sheets', () => {
  // #given
  const entries = [entry(11)];
  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [11, 2]);
});

t('packEntries uses the current artwork height', () => {
  // #given  11 squares need two sheets; taller art prints narrower than its
  //         25 mm base, so seven stand in a row and 11 fit one
  const e = entry(11);
  // #when
  e.artwork = { ...square, height: 150 };
  const result = packEntries([e], opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [11, 1]);
});

t('unprepared entries preserve the source indices of packed and oversized entries', () => {
  // #given
  const entries = [
    entry(1, null),
    entry(1),
    { ...entry(1), heightSlot: 'custom' as const, customWidthMm: 200, customHeightMm: 30 },
  ];

  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual(
    {
      placed: result.pages[0].placements.map(({ mini }) => mini.entryIndex),
      states: result.entries.map(({ state }) => state),
    },
    { placed: [1], states: ['empty', 'upright', 'oversized'] },
  );
});

t('prepared artwork proportions reach fitting through packEntries', () => {
  // #given  tall art at Medium prints 35 mm tall, whatever its proportions
  const e = { ...entry(1), artwork: { ...square, width: 100, height: 350 } };
  // #when
  const mini = packEntries([e], opts).pages[0].placements[0].mini;
  // #then
  assert.deepEqual([mini.imageHeightMm, mini.imageWidthMm], [35, 10]);
});

t('a custom entry carries both of its dimensions into the fit and the stand', () => {
  // #given
  const e: Entry = { ...entry(1), heightSlot: 'custom', customWidthMm: 30, customHeightMm: 45 };
  // #when
  const mini = packEntries([e], opts).pages[0].placements[0].mini;
  // #then  its tab is half its own base, as a slot's is
  assert.deepEqual(
    [mini.imageHeightMm, mini.imageWidthMm, mini.baseWidthMm, mini.tabHeightMm],
    [45, 45, 30, 15],
  );
});

t('each row reports why it does not print yet', () => {
  // #given
  const file = new File([], 'front.png');

  const entries: Entry[] = [
    entry(1, null),
    { ...entry(1, null), image: file },
    { ...entry(1, null), image: file, frontError: 'broken' },
    { ...entry(1, null), image: file, frontError: 'broken', backImage: new File([], 'back.png') },
    { ...entry(1), image: file, backImage: new File([], 'back.png') },
    { ...entry(1), heightSlot: 'custom', customWidthMm: 30 },
    { ...entry(0), image: file },
    { ...entry(1), image: file },
  ];

  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual(
    result.entries.map(({ state }) => state),
    ['empty', 'loading', 'failed', 'failed', 'loading', 'empty', 'empty', 'upright'],
  );
});

t('resolveEntry reports readiness and the geometry the sheet layout places', () => {
  // #given
  const loading: Entry = { ...entry(1), backImage: new File([], 'back.png') };

  const oversized: Entry = {
    ...entry(1),
    heightSlot: 'custom',
    customWidthMm: 200,
    customHeightMm: 30,
  };

  const empty = entry(0);
  const normal = entry(1);

  // #when
  const resolved = [loading, oversized, empty].map((candidate, entryIndex) =>
    resolveEntry(candidate, entryIndex, opts),
  );

  const resolvedNormal = resolveEntry(normal, 0, opts);
  const placed = packEntries([normal], opts).pages[0].placements[0].mini;
  // #then
  assert.deepEqual(
    {
      loading: resolved[0],
      oversized: resolved[1].status,
      empty: resolved[2],
      normal: { status: resolvedNormal.status, copy: resolvedNormal.mini?.copies[0] },
    },
    {
      loading: { status: { state: 'loading', limits: [] }, mini: undefined },
      oversized: { state: 'oversized', limits: [] },
      empty: { status: { state: 'empty', limits: [] }, mini: undefined },
      normal: { status: { state: 'upright', limits: [] }, copy: placed },
    },
  );
});

t('prepared back artwork proportions reach fitting through packEntries', () => {
  // #given  a 3:2 back behind a square front at Medium
  const e: Entry = {
    ...entry(1),
    backImage: new File([], 'back.png'),
    backArtwork: { ...square, width: 150, height: 100 },
  };

  // #when
  const mini = packEntries([e], opts).pages[0].placements[0].mini;
  // #then
  assert.deepEqual([mini.totalWidthMm, mini.back?.imageWidthMm], [52.5, 52.5]);
});

t(
  'a wide custom mini is rescued clockwise while upright and impossible minis keep their status',
  () => {
    // #given: 210×21 art on a 20 mm base makes a 214×86 cut-out.
    // Turned, its stroked marks need 89.2×217.2 mm, inside A4's 190×277 area.
    const entries: Entry[] = [
      {
        ...entry(1),
        heightSlot: 'custom',
        customWidthMm: 20,
        customHeightMm: 140,
        artwork: { ...square, width: 1000, height: 100 },
      },
      entry(1),
      { ...entry(2), heightSlot: 'custom', customWidthMm: 140, customHeightMm: 140 },
    ];

    // #when
    const result = packEntries(entries, { ...opts, marginMm: 2 });
    // #then
    assert.deepEqual(
      {
        minis: result.miniCount,
        orientations: result.pages
          .flatMap((page) => page.placements.map((p) => [p.mini.entryIndex, p.rotated]))
          .toSorted(),
        states: result.entries.map(({ state }) => state),
      },
      {
        minis: 2,
        orientations: [
          [0, true],
          [1, false],
        ],
        states: ['rotated', 'upright', 'oversized'],
      },
    );
  },
);
