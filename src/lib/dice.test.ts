import { afterEach, describe, expect, test } from 'bun:test';
import { pick, roll, rollDice } from './dice';

describe('roll(sides)', () => {
  test('возвращает значения только в [1, sides]', () => {
    for (let i = 0; i < 1000; i++) {
      const v = roll(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test('покрывает все значения d20 за 10к бросков, среднее близко к 10.5', () => {
    const counts: number[] = Array.from({ length: 20 }, () => 0);
    const N = 10_000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = roll(20);
      counts[v - 1] = (counts[v - 1] ?? 0) + 1;
      sum += v;
    }
    // Каждое значение должно появиться хотя бы раз.
    expect(counts.every((c) => c > 0)).toBe(true);
    // Среднее в широком CI: ожидаемое 10.5, допуск ±0.5 на 10k бросков.
    const mean = sum / N;
    expect(mean).toBeGreaterThan(10.0);
    expect(mean).toBeLessThan(11.0);
  });

  test('распределение d20 проходит χ²-тест на 100к бросков', () => {
    const counts: number[] = Array.from({ length: 20 }, () => 0);
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const v = roll(20);
      counts[v - 1] = (counts[v - 1] ?? 0) + 1;
    }
    const expectedPerBin = N / 20;
    let chi = 0;
    for (const c of counts) {
      const diff = (c as number) - expectedPerBin;
      chi += (diff * diff) / expectedPerBin;
    }
    // 19 степеней свободы, α=0.001 → критическое значение 43.82.
    // Под честным RNG p > 0.001 практически всегда, тест не флэйковый.
    expect(chi).toBeLessThan(43.82);
  });

  test('sides=1 всегда возвращает 1', () => {
    for (let i = 0; i < 100; i++) {
      expect(roll(1)).toBe(1);
    }
  });

  test('sides=256 (степень двойки) даёт все значения', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50_000 && seen.size < 256; i++) {
      seen.add(roll(256));
    }
    expect(seen.size).toBe(256);
  });

  test('невалидный sides бросает RangeError', () => {
    expect(() => roll(0)).toThrow(RangeError);
    expect(() => roll(-5)).toThrow(RangeError);
    expect(() => roll(1.5)).toThrow(RangeError);
    expect(() => roll(Number.NaN)).toThrow(RangeError);
    expect(() => roll(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('pick(table)', () => {
  test('возвращает { index, value } где table[index] === value', () => {
    const table = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) {
      const { index, value } = pick(table);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(table.length);
      expect(table[index]).toBe(value);
    }
  });

  test('пустая таблица — RangeError', () => {
    expect(() => pick([])).toThrow(RangeError);
  });

  test('покрывает все элементы за достаточное число попыток', () => {
    const table = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500 && seen.size < 3; i++) {
      seen.add(pick(table).value);
    }
    expect(seen.size).toBe(3);
  });
});

describe('rollDice({ count, sides })', () => {
  test('1d20 эквивалентен roll(20) по диапазону', () => {
    for (let i = 0; i < 500; i++) {
      const v = rollDice({ count: 1, sides: 20 });
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  test('2d6 даёт значения в [2, 12]', () => {
    for (let i = 0; i < 1000; i++) {
      const v = rollDice({ count: 2, sides: 6 });
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  test('2d6 распределение пиковое в 7 (среднее ≈ 7.0)', () => {
    const N = 10_000;
    let sum = 0;
    const counts: number[] = Array.from({ length: 13 }, () => 0);
    for (let i = 0; i < N; i++) {
      const v = rollDice({ count: 2, sides: 6 });
      sum += v;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const mean = sum / N;
    expect(mean).toBeGreaterThan(6.7);
    expect(mean).toBeLessThan(7.3);
    // 7 должно быть самым частым исходом
    const max = Math.max(...counts);
    expect(counts[7]).toBe(max);
  });

  test('3d4 даёт значения в [3, 12]', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rollDice({ count: 3, sides: 4 });
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(12);
      seen.add(v);
    }
    // За 5к бросков должны увидеть все 10 возможных сумм
    expect(seen.size).toBe(10);
  });

  test('невалидный count бросает RangeError', () => {
    expect(() => rollDice({ count: 0, sides: 6 })).toThrow(RangeError);
    expect(() => rollDice({ count: -1, sides: 6 })).toThrow(RangeError);
    expect(() => rollDice({ count: 1.5, sides: 6 })).toThrow(RangeError);
  });

  test('невалидный sides проксируется в roll() как RangeError', () => {
    expect(() => rollDice({ count: 2, sides: 0 })).toThrow(RangeError);
    expect(() => rollDice({ count: 1, sides: -3 })).toThrow(RangeError);
  });
});

describe('rejection sampling корректность', () => {
  const originalGetRandomValues = crypto.getRandomValues.bind(crypto);

  afterEach(() => {
    crypto.getRandomValues = originalGetRandomValues;
  });

  test('значение из «хвоста» отбрасывается, берётся следующее валидное', () => {
    // Для d20: limit = floor(2^32 / 20) * 20 = 214748364 * 20 = 4294967280.
    // Значения >= 4294967280 должны отбрасываться.
    const limit = Math.floor(0x1_0000_0000 / 20) * 20;
    // ВНИМАНИЕ: Uint32Array truncate'ит значения >= 2^32, поэтому используем
    // только значения, влезающие в Uint32: [limit, 2^32 - 1] — для «отбрасываемых».
    const sequence = [
      limit + 5, // отбрасывается (>= limit)
      limit + 15, // отбрасывается (Uint32_MAX = 4294967295)
      42, // принимается → 42 % 20 + 1 == 3
    ];
    let i = 0;
    crypto.getRandomValues = ((buf: Uint32Array) => {
      const value = sequence[i++];
      if (value === undefined) throw new Error('тестовая последовательность исчерпана');
      buf[0] = value;
      return buf;
    }) as typeof crypto.getRandomValues;

    expect(roll(20)).toBe(3);
    expect(i).toBe(3); // все три значения были потреблены
  });
});
