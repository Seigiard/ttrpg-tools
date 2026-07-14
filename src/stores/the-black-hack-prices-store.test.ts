import { afterEach, describe, expect, test } from 'bun:test';
import { blackHackPrices, expandRolls } from '@/data/the-black-hack/prices';
import type { PriceCategory } from '@/data/types';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createPricesStore, itemPrice } from './the-black-hack-prices-store';

describe('createPricesStore', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: первый тип поселения, seed и rolls = null', () => {
    const store = createPricesStore(blackHackPrices);
    expect(store.$settlement.get()).toBe(blackHackPrices.settlements[0]);
    expect(store.$seed.get()).toBeNull();
    expect(store.$rolls.get()).toBeNull();
  });

  test('rollAll: seed из crypto, rolls выведены из него детерминированно', () => {
    restoreCrypto = mockCrypto([12345]);
    const store = createPricesStore(blackHackPrices);

    store.rollAll();

    expect(store.$seed.get()).toBe(12345);
    expect(store.$rolls.get()).toEqual(expandRolls(12345, blackHackPrices));
  });

  test('структура rolls: у каждой категории число значений = предметы × кубики формулы', () => {
    restoreCrypto = mockCrypto([7]);
    const store = createPricesStore(blackHackPrices);

    store.rollAll();

    const rolls = store.$rolls.get();
    expect(rolls).not.toBeNull();
    blackHackPrices.categories.forEach((category, i) => {
      expect(rolls?.[i]).toHaveLength(category.items.length);
      for (const faces of rolls?.[i] ?? []) {
        expect(faces).toHaveLength(category.roll.count);
        for (const face of faces) {
          expect(face).toBeGreaterThanOrEqual(1);
          expect(face).toBeLessThanOrEqual(category.roll.sides);
        }
      }
    });
  });

  test('setSettlement меняет тип и перебрасывает все цены (новый seed)', () => {
    // #given AE4
    restoreCrypto = mockCrypto([100, 200]);
    const store = createPricesStore(blackHackPrices);
    store.rollAll();

    store.setSettlement('city');

    expect(store.$settlement.get()).toBe('city');
    expect(store.$seed.get()).toBe(200);
    expect(store.$rolls.get()).toEqual(expandRolls(200, blackHackPrices));
  });

  test('setSettlement на текущий тип — no-op, без переброса', () => {
    restoreCrypto = mockCrypto([100]);
    const store = createPricesStore(blackHackPrices);
    store.rollAll();

    store.setSettlement(store.$settlement.get());

    expect(store.$seed.get()).toBe(100);
  });

  test('hydrate применяет стейт без обращения к crypto и перезаписывает прежний seed', () => {
    // #given пустой мок: любой вызов crypto упадёт
    restoreCrypto = mockCrypto([]);
    const store = createPricesStore(blackHackPrices);

    store.hydrate({ settlement: 'town', seed: 777 });

    expect(store.$settlement.get()).toBe('town');
    expect(store.$seed.get()).toBe(777);
    expect(store.$rolls.get()).toEqual(expandRolls(777, blackHackPrices));
  });

  test('подписка на $rolls получает уведомление на каждый rollAll', () => {
    restoreCrypto = mockCrypto([10, 20]);
    const store = createPricesStore(blackHackPrices);
    const events: Array<number | null> = [];
    const unsubscribe = store.$seed.subscribe((seed) => {
      events.push(seed);
    });

    store.rollAll();
    store.rollAll();

    unsubscribe();
    expect(events).toEqual([null, 10, 20]);
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
