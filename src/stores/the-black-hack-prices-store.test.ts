import { afterEach, describe, expect, test } from 'bun:test';
import { blackHackPrices, totalDiceCount } from '@/data/the-black-hack/prices';
import type { PricesState } from '@/data/the-black-hack/prices-codec';
import type { PriceCategory } from '@/data/types';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createPricesStore, itemPrice } from './the-black-hack-prices-store';

/** Мок-последовательность на полный бросок таблицы: n-й кубик получает грань (n % 8) + 1. */
function fullSequence(offset = 0): number[] {
  return Array.from({ length: totalDiceCount(blackHackPrices) }, (_, n) => (n + offset) % 8);
}

/** Ожидаемые грани в структуре $rolls для последовательности fullSequence(offset). */
function expectedRolls(offset = 0): PricesState['rolls'] {
  let n = 0;
  return blackHackPrices.categories.map((c) =>
    c.items.map(() => Array.from({ length: c.roll.count }, () => ((n++ + offset) % 8) + 1)),
  );
}

describe('createPricesStore', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: первый тип поселения, rolls = null', () => {
    const store = createPricesStore(blackHackPrices);
    expect(store.$settlement.get()).toBe(blackHackPrices.settlements[0]);
    expect(store.$rolls.get()).toBeNull();
  });

  test('rollAll: у каждой категории число значений = предметы × кубики, грани из мок-последовательности', () => {
    restoreCrypto = mockCrypto(fullSequence());
    const store = createPricesStore(blackHackPrices);

    store.rollAll();

    expect(store.$rolls.get()).toEqual(expectedRolls());
  });

  test('setSettlement меняет тип и перебрасывает все цены', () => {
    // #given AE4: два полных броска с разными последовательностями
    restoreCrypto = mockCrypto([...fullSequence(0), ...fullSequence(1)]);
    const store = createPricesStore(blackHackPrices);
    store.rollAll();

    store.setSettlement('city');

    expect(store.$settlement.get()).toBe('city');
    expect(store.$rolls.get()).toEqual(expectedRolls(1));
  });

  test('setSettlement на текущий тип — no-op, без переброса', () => {
    restoreCrypto = mockCrypto(fullSequence());
    const store = createPricesStore(blackHackPrices);
    store.rollAll();
    const before = store.$rolls.get();

    store.setSettlement(store.$settlement.get());

    expect(store.$rolls.get()).toBe(before);
  });

  test('hydrate применяет стейт без обращения к RNG и перезаписывает прежние грани', () => {
    // #given пустой мок: любой вызов RNG упадёт
    restoreCrypto = mockCrypto([]);
    const store = createPricesStore(blackHackPrices);
    const state: PricesState = { settlement: 'town', rolls: expectedRolls(3) };

    store.hydrate(state);

    expect(store.$settlement.get()).toBe('town');
    expect(store.$rolls.get()).toEqual(expectedRolls(3));
  });

  test('подписка на $rolls получает уведомление на каждый rollAll', () => {
    restoreCrypto = mockCrypto([...fullSequence(0), ...fullSequence(1)]);
    const store = createPricesStore(blackHackPrices);
    const events: Array<PricesState['rolls'] | null> = [];
    const unsubscribe = store.$rolls.subscribe((rolls) => {
      events.push(rolls);
    });

    store.rollAll();
    store.rollAll();

    unsubscribe();
    expect(events).toEqual([null, expectedRolls(0), expectedRolls(1)]);
  });
});

describe('itemPrice', () => {
  const rare: PriceCategory = {
    key: 'rare',
    ru: 'Редкое',
    roll: { count: 2, sides: 8 },
    multiplier: 5,
    items: [],
  };

  test('грани [3, 4] в редкой категории → (3+4)×5 = 35', () => {
    expect(itemPrice([3, 4], rare, { ru: 'Замок' })).toBe(35);
  });

  test('предмет с множителем ×2 → 70', () => {
    expect(itemPrice([3, 4], rare, { ru: 'Кожаная броня', multiplier: 2 })).toBe(70);
  });
});
