/**
 * Детерминированный PRNG (mulberry32) — воспроизводимые последовательности из 32-битного seed.
 *
 * Назначение: компактный шареабельный стейт — в URL хранится seed, грани кубиков
 * выводятся из него заново. Для честной случайности это НЕ замена `lib/dice.ts`:
 * crypto остаётся источником самих seed'ов (см. `randomSeed`).
 *
 * КОНТРАКТ ЗАМОРОЖЕН: алгоритм, маппинг в грань (`value % sides + 1`) и порядок
 * потребления значений — часть формата сохранённых ссылок. Любое изменение
 * поведения требует bump `PRNG_VERSION`, иначе старые ссылки молча декодируются
 * в другие значения. Golden-тест в `seeded-rng.test.ts` сторожит это машинно.
 */

/** Версия поведения PRNG — входит в версию данных сериализованного стейта. */
export const PRNG_VERSION = 1;

const UINT32_RANGE = 0x1_0000_0000;

/** Случайный 32-битный seed из crypto — единственная точка настоящей случайности. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] as number;
}

/**
 * mulberry32: последовательность uint32 из 32-битного seed.
 * Возвращает функцию-генератор; одинаковый seed → одинаковая последовательность.
 *
 * @throws RangeError если seed не целое в [0, 2^32).
 */
export function createSeededRng(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new RangeError(`createSeededRng: seed должен быть целым в [0, 2^32), получено ${seed}`);
  }
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * Грань кубика из очередного значения генератора: `value % sides + 1`.
 * Для sides — степеней двойки (d8) распределение точное, без modulo-bias.
 */
export function nextFace(rng: () => number, sides: number): number {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`nextFace: sides должно быть целым >= 1, получено ${sides}`);
  }
  return (rng() % sides) + 1;
}
