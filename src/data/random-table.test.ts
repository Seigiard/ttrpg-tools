import { afterEach, describe, expect, test } from 'bun:test';
import type { RandomTable } from './types';
import { pickFromTable, rangeSize, resolveSpec, validateTable } from './random-table';

function mockCrypto(sequence: number[]) {
  const original = crypto.getRandomValues.bind(crypto);
  let i = 0;
  crypto.getRandomValues = ((buf: Uint32Array) => {
    const value = sequence[i++];
    if (value === undefined) throw new Error('тестовая последовательность исчерпана');
    buf[0] = value;
    return buf;
  }) as typeof crypto.getRandomValues;
  return () => {
    crypto.getRandomValues = original;
  };
}

describe('resolveSpec', () => {
  test('без явного roll возвращает 1d{length}', () => {
    const table: RandomTable<string> = { rows: ['a', 'b', 'c', 'd', 'e'] };
    expect(resolveSpec(table)).toEqual({ count: 1, sides: 5 });
  });

  test('с явным roll возвращает его как есть', () => {
    const table: RandomTable<string> = {
      rows: Array.from({ length: 11 }, (_, i) => String(i)),
      roll: { count: 2, sides: 6 },
    };
    expect(resolveSpec(table)).toEqual({ count: 2, sides: 6 });
  });
});

describe('rangeSize', () => {
  test('1d20 → 20', () => {
    expect(rangeSize({ count: 1, sides: 20 })).toBe(20);
  });
  test('2d6 → 11', () => {
    expect(rangeSize({ count: 2, sides: 6 })).toBe(11);
  });
  test('3d4 → 10', () => {
    expect(rangeSize({ count: 3, sides: 4 })).toBe(10);
  });
  test('1d27 → 27 (произвольная длина без override)', () => {
    expect(rangeSize({ count: 1, sides: 27 })).toBe(27);
  });
});

describe('validateTable', () => {
  test('1d20 + 20 строк проходит', () => {
    const table: RandomTable<number> = { rows: Array.from({ length: 20 }, (_, i) => i) };
    expect(() => validateTable(table)).not.toThrow();
  });

  test('2d6 + 11 строк проходит', () => {
    const table: RandomTable<number> = {
      rows: Array.from({ length: 11 }, (_, i) => i),
      roll: { count: 2, sides: 6 },
    };
    expect(() => validateTable(table)).not.toThrow();
  });

  test('2d6 + 12 строк — ошибка', () => {
    const table: RandomTable<number> = {
      rows: Array.from({ length: 12 }, (_, i) => i),
      roll: { count: 2, sides: 6 },
    };
    expect(() => validateTable(table)).toThrow(RangeError);
  });
});

describe('pickFromTable', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('равномерная таблица d27: индекс соответствует mock-значению', () => {
    // 1d27 → value % 27 + 1, индекс = это - 1 = value % 27.
    // Используем value = 5 → index = 5.
    restoreCrypto = mockCrypto([5]);
    const rows = Array.from({ length: 27 }, (_, i) => `row-${i}`);
    const table: RandomTable<string> = { rows };
    const result = pickFromTable(table);
    expect(result.index).toBe(5);
    expect(result.value).toBe('row-5');
  });

  test('2d6 таблица: суммы корректно переводятся в индекс [0, 10]', () => {
    // 2d6 = roll(6) + roll(6). value % 6 + 1.
    // mock=0 → roll=1; mock=5 → roll=6.
    // Хотим сумму 2 → два mock=0 → индекс 0.
    restoreCrypto = mockCrypto([0, 0]);
    const rows = Array.from({ length: 11 }, (_, i) => `bg-${i}`);
    const table: RandomTable<string> = { rows, roll: { count: 2, sides: 6 } };
    const result = pickFromTable(table);
    expect(result.index).toBe(0);
    expect(result.value).toBe('bg-0');
  });

  test('2d6 таблица: сумма 12 → индекс 10 (последний)', () => {
    restoreCrypto = mockCrypto([5, 5]);
    const rows = Array.from({ length: 11 }, (_, i) => `bg-${i}`);
    const table: RandomTable<string> = { rows, roll: { count: 2, sides: 6 } };
    const result = pickFromTable(table);
    expect(result.index).toBe(10);
    expect(result.value).toBe('bg-10');
  });

  test('2d6 таблица: сумма 7 (4+3) → индекс 5 (середина)', () => {
    restoreCrypto = mockCrypto([3, 2]); // roll 4 + roll 3 = 7
    const rows = Array.from({ length: 11 }, (_, i) => `bg-${i}`);
    const table: RandomTable<string> = { rows, roll: { count: 2, sides: 6 } };
    const result = pickFromTable(table);
    expect(result.index).toBe(5);
    expect(result.value).toBe('bg-5');
  });

  test('пустая таблица — RangeError', () => {
    const table: RandomTable<string> = { rows: [] };
    expect(() => pickFromTable(table)).toThrow(RangeError);
  });

  test('таблица с несовместимой длиной — RangeError', () => {
    const table: RandomTable<string> = {
      rows: ['a', 'b', 'c'],
      roll: { count: 2, sides: 6 }, // ожидает 11 строк
    };
    expect(() => pickFromTable(table)).toThrow(RangeError);
  });

  test('таблица любой длины без override работает (1d{length})', () => {
    restoreCrypto = mockCrypto([6]);
    const rows = Array.from({ length: 100 }, (_, i) => i);
    const table: RandomTable<number> = { rows };
    const result = pickFromTable(table);
    expect(result.index).toBe(6);
    expect(result.value).toBe(6);
  });
});
