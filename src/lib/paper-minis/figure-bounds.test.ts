import assert from 'node:assert/strict';
import { findFigureBounds } from './figure-bounds.ts';

import { test as t } from 'bun:test';

function rgba(alpha: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(alpha.flatMap((a) => [120, 60, 30, a]));
}

t('transparent margins leave the exact figure rectangle', () => {
  // #given
  const pixels = rgba([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);
  // #when
  const bounds = findFigureBounds(pixels, 4, 4);
  // #then
  assert.deepEqual(bounds, { x: 1, y: 1, width: 2, height: 2 });
});

t('a uniform opaque colour has no figure', () => {
  // #given
  const pixels = rgba([255, 255, 255, 255]);
  // #when
  const bounds = findFigureBounds(pixels, 2, 2);
  // #then
  assert.equal(bounds, null);
});

t('alpha 8 is background while alpha 9 belongs to the figure', () => {
  // #given
  const pixels = rgba([0, 8, 9, 8, 0]);
  // #when
  const bounds = findFigureBounds(pixels, 5, 1);
  // #then
  assert.deepEqual(bounds, { x: 2, y: 0, width: 1, height: 1 });
});

t('a tight figure touching all edges keeps the full rectangle', () => {
  // #given
  const pixels = rgba([0, 255, 0, 255, 255, 255, 0, 255, 0]);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3);
  // #then
  assert.deepEqual(bounds, { x: 0, y: 0, width: 3, height: 3 });
});

t('fully transparent artwork has no figure', () => {
  // #given
  const pixels = rgba([0, 0, 0, 0]);
  // #when
  const bounds = findFigureBounds(pixels, 2, 2);
  // #then
  assert.equal(bounds, null);
});

t('a barely visible halo alone has no figure', () => {
  // #given
  const pixels = rgba([1, 8, 3, 0]);
  // #when
  const bounds = findFigureBounds(pixels, 2, 2);
  // #then
  assert.equal(bounds, null);
});

t('a custom threshold excludes pixels at that threshold', () => {
  // #given
  const pixels = rgba([20, 21, 20]);
  // #when
  const bounds = findFigureBounds(pixels, 3, 1, 20);
  // #then
  assert.deepEqual(bounds, { x: 1, y: 0, width: 1, height: 1 });
});

t('opaque artwork on a coloured background trims to its figure', () => {
  // #given
  const pixels = new Uint8ClampedArray(5 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([40, 90, 150, 255], i);
  pixels.set([200, 30, 60, 255], (1 * 5 + 2) * 4);
  pixels.set([200, 30, 60, 255], (2 * 5 + 3) * 4);
  // #when
  const bounds = findFigureBounds(pixels, 5, 4);
  // #then
  assert.deepEqual(bounds, { x: 2, y: 1, width: 2, height: 2 });
});

t('a single border outlier beyond tolerance rejects a scenic background', () => {
  // #given
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([100, 100, 113, 255], 0);
  pixels.set([200, 0, 0, 255], 4 * 4);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3);
  // #then
  assert.equal(bounds, null);
});

t('a custom colour tolerance keeps a smaller contrast as figure', () => {
  // #given
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([106, 100, 100, 255], 4 * 4);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3, 8, 5);
  // #then
  assert.deepEqual(bounds, { x: 1, y: 1, width: 1, height: 1 });
});

t('the border median tolerates a corner offset of 12 and detects a difference of 13', () => {
  // #given
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 80, 60, 255], i);
  pixels.set([112, 92, 72, 255], 0);
  pixels.set([112, 92, 72, 255], (1 * 5 + 1) * 4);
  pixels.set([100, 80, 73, 255], (2 * 5 + 2) * 4);
  // #when
  const bounds = findFigureBounds(pixels, 5, 5);
  // #then
  assert.deepEqual(bounds, { x: 2, y: 2, width: 1, height: 1 });
});

t('similar-coloured pixels do not erase a row containing a contrasting figure pixel', () => {
  // #given
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([101, 100, 100, 255], (1 * 5 + 1) * 4);
  pixels.set([200, 100, 100, 255], (1 * 5 + 3) * 4);
  pixels.set([100, 200, 100, 255], (3 * 5 + 1) * 4);
  // #when
  const bounds = findFigureBounds(pixels, 5, 5);
  // #then
  assert.deepEqual(bounds, { x: 1, y: 1, width: 3, height: 3 });
});

t('any transparency keeps the alpha path even on a flat colour background', () => {
  // #given
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([100, 100, 100, 254], 0);
  pixels.set([200, 0, 0, 255], 4 * 4);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3);
  // #then
  assert.deepEqual(bounds, { x: 0, y: 0, width: 3, height: 3 });
});

for (const [width, height] of [
  [0, 0],
  [1, 1],
  [1, 3],
  [3, 1],
]) {
  t(`uniform ${width} by ${height} artwork has no figure`, () => {
    // #given
    const pixels = rgba(Array(width * height).fill(255));
    // #when
    const bounds = findFigureBounds(pixels, width, height);
    // #then
    assert.equal(bounds, null);
  });
}

t('border colours more than 12 apart are not flat even when each is near the median', () => {
  // #given
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([88, 100, 100, 255], 0);
  pixels.set([112, 100, 100, 255], 8 * 4);
  pixels.set([200, 0, 0, 255], 4 * 4);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3);
  // #then
  assert.equal(bounds, null);
});

t('hidden RGB contrast cannot supply bounds when alpha finds no figure', () => {
  // #given
  const pixels = rgba([0, 0, 0, 0, 8, 0, 0, 0, 0]);
  pixels.set([250, 200, 200, 8], 4 * 4);
  // #when
  const bounds = findFigureBounds(pixels, 3, 3);
  // #then
  assert.equal(bounds, null);
});
