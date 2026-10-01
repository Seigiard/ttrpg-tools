import assert from 'node:assert/strict';
import { packEntries } from './packing.ts';
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

t('8 prepared medium squares fit one A4 sheet', () => {
  // #given
  const entries = [entry(8)];
  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [8, 1]);
});

t('9 prepared medium squares require two A4 sheets', () => {
  // #given
  const entries = [entry(9)];
  // #when
  const result = packEntries(entries, opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [9, 2]);
});

t('packEntries omits entries with null artwork', () => {
  // #given
  const e = entry(29);
  // #when
  e.artwork = null;
  const result = packEntries([e], opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [0, 0]);
});

t('packEntries uses the current artwork height', () => {
  // #given  9 squares need two sheets; taller art prints narrower than its
  //         25 mm base, so six stand in a row and 9 fit one
  const e = entry(9);
  // #when
  e.artwork = { ...square, height: 150 };
  const result = packEntries([e], opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [9, 1]);
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
      placed: result.pages[0].rows[0].items.map((mini) => mini.entryIndex),
      oversized: result.oversizedEntryIndices,
    },
    { placed: [1], oversized: [2] },
  );
});

t('prepared artwork proportions reach fitting through packEntries', () => {
  // #given  tall art at Medium prints 35 mm tall, whatever its proportions
  const e = { ...entry(1), artwork: { ...square, width: 100, height: 350 } };
  // #when
  const mini = packEntries([e], opts).pages[0].rows[0].items[0];
  // #then
  assert.deepEqual([mini.imageHeightMm, mini.imageWidthMm], [35, 10]);
});

t('a custom entry carries both of its dimensions into the fit and the stand', () => {
  // #given
  const e: Entry = { ...entry(1), heightSlot: 'custom', customWidthMm: 30, customHeightMm: 45 };
  // #when
  const mini = packEntries([e], opts).pages[0].rows[0].items[0];
  // #then  its tab is half its own base, as a slot's is
  assert.deepEqual(
    [mini.imageHeightMm, mini.imageWidthMm, mini.baseWidthMm, mini.tabHeightMm],
    [45, 45, 30, 15],
  );
});

t('an entry waits while its back artwork loads', () => {
  // #given  a back file is chosen but not prepared yet
  const e: Entry = { ...entry(1), backImage: new File([], 'back.png') };
  // #when
  const result = packEntries([e], opts);
  // #then
  assert.deepEqual([result.miniCount, result.pageCount], [0, 0]);
});

t('prepared back artwork proportions reach fitting through packEntries', () => {
  // #given  a 3:2 back behind a square front at Medium
  const e: Entry = {
    ...entry(1),
    backImage: new File([], 'back.png'),
    backArtwork: { ...square, width: 150, height: 100 },
  };
  // #when
  const mini = packEntries([e], opts).pages[0].rows[0].items[0];
  // #then
  assert.deepEqual([mini.totalWidthMm, mini.back?.imageWidthMm], [52.5, 52.5]);
});
