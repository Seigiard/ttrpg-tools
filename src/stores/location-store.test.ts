import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mausritterLocations } from '@/data/mausritter/locations';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createLocationStore } from './location-store';

// Для d20: result = value % 20 + 1, поэтому mock-value === желаемый индекс (0-based).

describe('createLocationStore', () => {
  let restoreCrypto: (() => void) | null = null;

  beforeEach(() => {});

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: первый биом из таблицы, roll = null', () => {
    const store = createLocationStore(mausritterLocations);
    expect(store.$biome.get()).toBe('countryside');
    expect(store.$roll.get()).toBeNull();
  });

  test('rollAll создаёт roll с обеими частями для текущего биома', () => {
    restoreCrypto = mockCrypto([0, 2]);
    const store = createLocationStore(mausritterLocations);
    store.rollAll();
    const roll = store.$roll.get();
    expect(roll).not.toBeNull();
    expect(roll?.biome).toBe('countryside');
    expect(roll?.landmarkIndex).toBe(0);
    expect(roll?.detailIndex).toBe(2);
  });

  test('rerollLandmark меняет только landmarkIndex, detail и biome сохраняются', () => {
    restoreCrypto = mockCrypto([5, 10, 7]);
    const store = createLocationStore(mausritterLocations);
    store.rollAll();
    const before = store.$roll.get();

    store.rerollLandmark();
    const after = store.$roll.get();

    expect(after?.biome).toBe(before?.biome);
    expect(after?.detailIndex).toBe(before?.detailIndex);
    expect(after?.landmarkIndex).toBe(7);
  });

  test('rerollDetail меняет только detailIndex', () => {
    restoreCrypto = mockCrypto([3, 11, 15]);
    const store = createLocationStore(mausritterLocations);
    store.rollAll();
    const before = store.$roll.get();

    store.rerollDetail();
    const after = store.$roll.get();

    expect(after?.biome).toBe(before?.biome);
    expect(after?.landmarkIndex).toBe(before?.landmarkIndex);
    expect(after?.detailIndex).toBe(15);
  });

  test('rerollLandmark без предварительного rollAll — no-op', () => {
    const store = createLocationStore(mausritterLocations);
    store.rerollLandmark();
    expect(store.$roll.get()).toBeNull();
  });

  test('rerollDetail без предварительного rollAll — no-op', () => {
    const store = createLocationStore(mausritterLocations);
    store.rerollDetail();
    expect(store.$roll.get()).toBeNull();
  });

  test('setBiome меняет биом и автоматически перебрасывает', () => {
    restoreCrypto = mockCrypto([0, 0, 11, 4]);
    const store = createLocationStore(mausritterLocations);
    store.rollAll();
    expect(store.$biome.get()).toBe('countryside');

    store.setBiome('forest');

    expect(store.$biome.get()).toBe('forest');
    const roll = store.$roll.get();
    expect(roll?.biome).toBe('forest');
    expect(roll?.landmarkIndex).toBe(11);
    expect(roll?.detailIndex).toBe(4);
  });

  test('setBiome на текущий биом — no-op (не перебрасывает)', () => {
    restoreCrypto = mockCrypto([0, 0]);
    const store = createLocationStore(mausritterLocations);
    store.rollAll();
    const before = store.$roll.get();

    store.setBiome('countryside');

    expect(store.$roll.get()).toBe(before);
  });

  test('подписка на $roll получает уведомления при каждом броске', () => {
    restoreCrypto = mockCrypto([0, 1, 2, 3]);
    const store = createLocationStore(mausritterLocations);
    const events: Array<number | null> = [];
    const unsubscribe = store.$roll.subscribe((roll) => {
      events.push(roll?.landmarkIndex ?? null);
    });

    store.rollAll();
    store.rerollLandmark();

    unsubscribe();
    // subscribe в nanostores выдаёт инициальное значение синхронно при подписке.
    expect(events).toEqual([null, 0, 2]);
  });
});
