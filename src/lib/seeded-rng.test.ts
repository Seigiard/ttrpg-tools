import { afterEach, describe, expect, test } from 'bun:test';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createSeededRng, nextFace, randomSeed } from './seeded-rng';

describe('createSeededRng', () => {
  test('одинаковый seed даёт одинаковую последовательность', () => {
    const a = createSeededRng(12345);
    const b = createSeededRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  test('разные seed дают разные последовательности', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  test('значения — uint32', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(0x1_0000_0000);
    }
  });

  test('невалидный seed бросает RangeError', () => {
    expect(() => createSeededRng(-1)).toThrow(RangeError);
    expect(() => createSeededRng(1.5)).toThrow(RangeError);
    expect(() => createSeededRng(0x1_0000_0000)).toThrow(RangeError);
    expect(() => createSeededRng(Number.NaN)).toThrow(RangeError);
  });

  test('GOLDEN: контракт формата ссылок — менять только с bump PRNG_VERSION', () => {
    // Захваченный вывод текущей реализации. Если тест упал — поведение PRNG
    // изменилось и все сохранённые ссылки декодируются в другие грани.
    const rng42 = createSeededRng(42);
    expect(Array.from({ length: 12 }, () => nextFace(rng42, 8))).toEqual([
      5, 3, 1, 6, 3, 4, 5, 2, 7, 2, 2, 4,
    ]);

    const rng0 = createSeededRng(0);
    expect(Array.from({ length: 6 }, () => nextFace(rng0, 8))).toEqual([3, 8, 1, 5, 5, 2]);

    const rngMax = createSeededRng(0xffffffff);
    expect(Array.from({ length: 6 }, () => nextFace(rngMax, 8))).toEqual([4, 5, 1, 5, 8, 8]);
  });
});

describe('nextFace', () => {
  test('грани в [1, sides], покрывает все грани d8', () => {
    const rng = createSeededRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const face = nextFace(rng, 8);
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(8);
      seen.add(face);
    }
    expect(seen.size).toBe(8);
  });

  test('невалидный sides бросает RangeError', () => {
    const rng = createSeededRng(1);
    expect(() => nextFace(rng, 0)).toThrow(RangeError);
    expect(() => nextFace(rng, 1.5)).toThrow(RangeError);
  });
});

describe('randomSeed', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('возвращает мок-значение напрямую (crypto — источник seed)', () => {
    restoreCrypto = mockCrypto([123456]);
    expect(randomSeed()).toBe(123456);
  });

  test('без мока — целое в [0, 2^32)', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(0x1_0000_0000);
  });
});
