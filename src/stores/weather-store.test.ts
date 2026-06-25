import { afterEach, describe, expect, test } from 'bun:test';
import { mausritterWeather } from '@/data/mausritter/weather';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createWeatherStore } from './weather-store';

describe('createWeatherStore', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: первый сезон, roll = null', () => {
    const store = createWeatherStore(mausritterWeather);
    expect(store.$season.get()).toBe('spring');
    expect(store.$roll.get()).toBeNull();
  });

  test('rollWeather создаёт roll с суммой и индексом строки', () => {
    // #given 4+3 = 7 → строка 6–8 (индекс 2)
    restoreCrypto = mockCrypto([3, 2]);
    const store = createWeatherStore(mausritterWeather);
    store.rollWeather();
    const roll = store.$roll.get();
    expect(roll?.sum).toBe(7);
    expect(roll?.rowIndex).toBe(2);
  });

  test('setSeason меняет сезон, но НЕ перебрасывает (тот же roll)', () => {
    restoreCrypto = mockCrypto([0, 0]);
    const store = createWeatherStore(mausritterWeather);
    store.rollWeather();
    const before = store.$roll.get();

    store.setSeason('winter');

    expect(store.$season.get()).toBe('winter');
    expect(store.$roll.get()).toBe(before);
  });

  test('setSeason на текущий сезон — no-op', () => {
    const store = createWeatherStore(mausritterWeather);
    store.setSeason('spring');
    expect(store.$season.get()).toBe('spring');
  });

  test('подписка на $roll получает уведомления при каждом броске', () => {
    restoreCrypto = mockCrypto([0, 0, 5, 5]);
    const store = createWeatherStore(mausritterWeather);
    const events: Array<number | null> = [];
    const unsubscribe = store.$roll.subscribe((roll) => {
      events.push(roll?.sum ?? null);
    });

    store.rollWeather();
    store.rollWeather();

    unsubscribe();
    expect(events).toEqual([null, 2, 12]);
  });
});
