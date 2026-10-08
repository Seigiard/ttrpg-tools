import { afterEach, describe, expect, test } from 'bun:test';
import { mockCrypto } from '@/test-utils/mock-crypto';
import {
  findRangeIndex,
  formatRangeLabel,
  pickRange,
  type RangeBounds,
  validateRanges,
} from './range-table';

describe('formatRangeLabel', () => {
  test.each([
    [{ min: 2, max: 2 }, '2'],
    [{ min: 3, max: 5 }, '3–5'],
  ] as const)('formats %o as %s', (row, expected) => {
    // #given a reference table range
    // #when its label is rendered
    const label = formatRangeLabel(row);
    // #then a single value or an en-dash range identifies the outcome
    expect(label).toBe(expected);
  });
});

const d6: readonly RangeBounds[] = [
  { min: 1, max: 1 },
  { min: 2, max: 2 },
  { min: 3, max: 6 },
];

const twoD6: readonly RangeBounds[] = [
  { min: 2, max: 2 },
  { min: 3, max: 5 },
  { min: 6, max: 8 },
  { min: 9, max: 11 },
  { min: 12, max: 12 },
];

describe('findRangeIndex', () => {
  test('значение внутри диапазона 3–6 → индекс 2', () => {
    expect(findRangeIndex(d6, 3)).toBe(2);
    expect(findRangeIndex(d6, 6)).toBe(2);
  });

  test('значение вне диапазонов → -1', () => {
    expect(findRangeIndex(d6, 7)).toBe(-1);
  });
});

describe('validateRanges', () => {
  test('d6: 1 / 2 / 3–6 покрывает [1,6]', () => {
    expect(() => validateRanges(d6, { count: 1, sides: 6 })).not.toThrow();
  });

  test('2d6: 5 диапазонов покрывают [2,12]', () => {
    expect(() => validateRanges(twoD6, { count: 2, sides: 6 })).not.toThrow();
  });

  test('разрыв в покрытии — RangeError', () => {
    const broken: RangeBounds[] = [
      { min: 1, max: 1 },
      { min: 3, max: 6 },
    ];

    expect(() => validateRanges(broken, { count: 1, sides: 6 })).toThrow(RangeError);
  });

  test('неполное покрытие (не доходит до max) — RangeError', () => {
    const broken: RangeBounds[] = [{ min: 1, max: 4 }];
    expect(() => validateRanges(broken, { count: 1, sides: 6 })).toThrow(RangeError);
  });

  test('max меньше min — RangeError', () => {
    const broken: RangeBounds[] = [{ min: 4, max: 2 }];
    expect(() => validateRanges(broken, { count: 1, sides: 6 })).toThrow(RangeError);
  });
});

describe('pickRange', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('d6 = 1 → первая строка', () => {
    // #given mock 0 → roll 1
    restoreCrypto = mockCrypto([0]);
    const pick = pickRange(d6, { count: 1, sides: 6 });
    expect(pick.sum).toBe(1);
    expect(pick.rowIndex).toBe(0);
  });

  test('d6 = 4 → строка 3–6 (индекс 2)', () => {
    restoreCrypto = mockCrypto([3]);
    const pick = pickRange(d6, { count: 1, sides: 6 });
    expect(pick.sum).toBe(4);
    expect(pick.rowIndex).toBe(2);
  });

  test('2d6 = 7 (4+3) → средняя строка (индекс 2)', () => {
    restoreCrypto = mockCrypto([3, 2]);
    const pick = pickRange(twoD6, { count: 2, sides: 6 });
    expect(pick.sum).toBe(7);
    expect(pick.rowIndex).toBe(2);
  });

  test('невалидные строки — RangeError до броска', () => {
    const broken: RangeBounds[] = [{ min: 1, max: 1 }];
    expect(() => pickRange(broken, { count: 1, sides: 6 })).toThrow(RangeError);
  });
});
