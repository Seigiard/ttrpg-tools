import assert from 'node:assert/strict';
import {
  CATEGORY_BASE_WIDTH_MM,
  CATEGORY_NAMES,
  HEIGHT_SLOTS,
  HEIGHT_SLOT_ORDER,
  SIZE_CATEGORY_ORDER,
  resolveBaseWidthMm,
  resolveFigureHeightMm,
  slotLabel,
  slotName,
  slotsOfCategory,
} from './sizes.ts';
import type { HeightSlot } from './types.ts';

import { test as t } from 'bun:test';

t('nine slots grade height across the range, each on its category’s base', () => {
  // #given
  const slots = HEIGHT_SLOT_ORDER;
  // #when
  const table = slots.map((slot) => [
    slot,
    resolveBaseWidthMm({ heightSlot: slot }),
    resolveFigureHeightMm({ heightSlot: slot }),
  ]);
  // #then
  assert.deepEqual(table, [
    ['tiny', 20, 12],
    ['small', 25, 20],
    ['medium-short', 25, 27],
    ['medium', 25, 35],
    ['medium-tall', 25, 43],
    ['large', 37, 56],
    ['large-tall', 37, 82],
    ['huge', 50, 95],
    ['gargantuan', 75, 111],
  ]);
});

t('a slot’s base width comes from its category, so slots sharing one cannot disagree', () => {
  // #given  three Medium slots and two Large ones
  const medium = slotsOfCategory('medium');
  const large = slotsOfCategory('large');
  // #when
  const bases = [...medium, ...large].map((slot) => resolveBaseWidthMm({ heightSlot: slot }));
  // #then
  assert.deepEqual(
    [medium, large, bases],
    [
      ['medium-short', 'medium', 'medium-tall'],
      ['large', 'large-tall'],
      [
        CATEGORY_BASE_WIDTH_MM.medium,
        CATEGORY_BASE_WIDTH_MM.medium,
        CATEGORY_BASE_WIDTH_MM.medium,
        CATEGORY_BASE_WIDTH_MM.large,
        CATEGORY_BASE_WIDTH_MM.large,
      ],
    ],
  );
});

// Printable Heroes sells the paper minis this tool is most often fed, and their
// human prints about 35 mm tall; a Medium that prints shorter stands a head
// below their own figures on the same table.
t('Medium prints a human at Printable Heroes’ scale', () => {
  // #given
  const entry = { heightSlot: 'medium' as const };
  // #when
  const dimensions = [resolveBaseWidthMm(entry), resolveFigureHeightMm(entry)];
  // #then
  assert.deepEqual(dimensions, [25, 35]);
});

t('a dwarf and a bugbear, both Medium, print at visibly different heights', () => {
  // #given  the same artwork in the short and tall Medium slots
  const slots = ['medium-short', 'medium-tall'] as const;
  // #when
  const heights = slots.map((heightSlot) => resolveFigureHeightMm({ heightSlot }));
  // #then  a 60% gap reads instantly on the table
  assert.deepEqual([heights, heights[1] / heights[0] > 1.5], [[27, 43], true]);
});

t('a halfling prints shorter than a dwarf, and a dwarf shorter than a human', () => {
  // #given
  const slots = ['small', 'medium-short', 'medium'] as const;
  // #when
  const heights = slots.map((heightSlot) => resolveFigureHeightMm({ heightSlot }));
  // #then
  assert.deepEqual(
    [heights, heights[0] < heights[1] && heights[1] < heights[2]],
    [[20, 27, 35], true],
  );
});

// One example pins the shape of the text itself, which is a contract with the
// reader rather than with the code. The rules the labels have to obey are the
// three tests below, which do not read the table back.
t('an option reads as name, creature height, examples', () => {
  // #when
  const options = (['medium', 'custom'] as const).map(slotLabel);
  // #then
  assert.deepEqual(options, ['Средний · 1,7 м · человек, эльф, орк', 'Свой размер']);
});

t('a slot’s name is its category, told apart from its siblings', () => {
  // #given  the user reads a name to find a category and to pick within it
  const named = (slot: HeightSlot) => slotName(slot);
  // #when
  const categories = SIZE_CATEGORY_ORDER.map((category) => ({
    category,
    names: slotsOfCategory(category).map(named),
  }));
  // #then  every name opens with its category; siblings differ; a lone slot is
  //        named the category and nothing more
  assert.deepEqual(
    categories.map(({ category, names }) => ({
      opensWithCategory: names.every((name) => name.startsWith(CATEGORY_NAMES[category])),
      distinct: new Set(names).size === names.length,
      loneSlotIsBare: names.length > 1 || names[0] === CATEGORY_NAMES[category],
    })),
    SIZE_CATEGORY_ORDER.map(() => ({
      opensWithCategory: true,
      distinct: true,
      loneSlotIsBare: true,
    })),
  );
});

// The dropdown is where printableminimaker#24's defect would come back: three Medium slots that
// read alike are the dwarf and the bugbear again, one step earlier.
t('no two options read alike, and each carries its own slot’s height', () => {
  // #when
  const options = HEIGHT_SLOT_ORDER.map(slotLabel);
  // #then
  assert.deepEqual(
    {
      distinct: new Set(options).size,
      carriesOwnHeight: HEIGHT_SLOT_ORDER.every((slot, i) =>
        options[i].includes(HEIGHT_SLOTS[slot].realHeight),
      ),
    },
    { distinct: HEIGHT_SLOT_ORDER.length, carriesOwnHeight: true },
  );
});

t('custom dimensions come from the entry rather than the table', () => {
  // #given
  const entry = { heightSlot: 'custom' as const, customWidthMm: 32, customHeightMm: 47 };
  // #when
  const dimensions = [resolveBaseWidthMm(entry), resolveFigureHeightMm(entry)];
  // #then
  assert.deepEqual(dimensions, [32, 47]);
});

for (const value of [undefined, 0, -1, NaN, Infinity]) {
  t(`invalid custom dimensions (${value}) are not packable`, () => {
    // #given
    const entry = { heightSlot: 'custom' as const, customWidthMm: value, customHeightMm: value };
    // #when
    const dimensions = [resolveBaseWidthMm(entry), resolveFigureHeightMm(entry)];
    // #then
    assert.deepEqual(dimensions, [0, 0]);
  });
}
