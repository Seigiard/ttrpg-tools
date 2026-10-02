import assert from 'node:assert/strict';
import { fitFigure } from './geometry.ts';
import { HEIGHT_SLOTS, HEIGHT_SLOT_ORDER, resolveBaseWidthMm, resolveFigureHeightMm } from './sizes.ts';

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
