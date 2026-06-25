import { describe, expect, test } from 'bun:test';
import { validateRanges } from '../range-table';
import { mausritterWeather } from './weather';

describe('mausritterWeather', () => {
  test('диапазоны непрерывно покрывают формулу броска', () => {
    expect(() => validateRanges(mausritterWeather.rows, mausritterWeather.roll)).not.toThrow();
  });

  test('каждая клетка имеет непустой ru во всех сезонах (нет пропусков перевода)', () => {
    for (const row of mausritterWeather.rows) {
      for (const season of mausritterWeather.seasons) {
        expect(row.cells[season].ru.length).toBeGreaterThan(0);
      }
    }
  });

  test('seasonLabels заполнены для всех сезонов', () => {
    for (const season of mausritterWeather.seasons) {
      expect(mausritterWeather.seasonLabels[season].length).toBeGreaterThan(0);
    }
  });
});
