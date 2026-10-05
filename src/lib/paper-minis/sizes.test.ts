import assert from 'node:assert/strict';
import {
  HEIGHT_SLOTS,
  HEIGHT_SLOT_ORDER,
  resolveFigureHeightMm,
  resolveSizeDimensionsMm,
  slotLabel,
  slotName,
} from './sizes.ts';
import type { HeightSlot, SizeCategory } from './types.ts';

import { test as t } from 'bun:test';

const sizeCategories = [...new Set(HEIGHT_SLOT_ORDER.map((slot) => HEIGHT_SLOTS[slot].category))];

const slotsOfCategory = (category: SizeCategory): HeightSlot[] =>
  HEIGHT_SLOT_ORDER.filter((slot) => HEIGHT_SLOTS[slot].category === category);

const resolveBaseWidthMm = (entry: Parameters<typeof resolveSizeDimensionsMm>[0]): number =>
  resolveSizeDimensionsMm(entry).baseWidthMm;

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
  // #given
  const categories = sizeCategories.map(slotsOfCategory);

  // #when
  const bases = categories.map((slots) =>
    slots.map((slot) => resolveBaseWidthMm({ heightSlot: slot })),
  );

  // #then
  assert.equal(
    bases.every((widths) => new Set(widths).size === 1),
    true,
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
  // #when
  const categories = sizeCategories.map((category) =>
    slotsOfCategory(category).map((slot) => slotName(slot)),
  );

  // #then  every name opens with its category; siblings differ; a lone slot is
  //        named the category and nothing more
  assert.deepEqual(
    categories.map((names) => ({
      oneCategoryName: new Set(names.map((name) => name.split(', ')[0])).size === 1,
      distinct: new Set(names).size === names.length,
      loneSlotIsBare: names.length > 1 || !names[0].includes(', '),
    })),
    sizeCategories.map(() => ({
      oneCategoryName: true,
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
