import { describe, expect, test } from 'bun:test';
import { mausritterLocations } from './locations';

describe('mausritterLocations', () => {
  test('ровно 4 биома', () => {
    expect(mausritterLocations.biomes).toHaveLength(4);
    expect(new Set(mausritterLocations.biomes).size).toBe(4);
  });

  test('каждый биом landmarks содержит 20 строк', () => {
    for (const biome of mausritterLocations.biomes) {
      expect(mausritterLocations.landmarks[biome]).toHaveLength(20);
    }
  });

  test('таблица details содержит 20 строк', () => {
    expect(mausritterLocations.details).toHaveLength(20);
  });

  test('biomeLabels покрывает все биомы и значения непустые', () => {
    for (const biome of mausritterLocations.biomes) {
      const label = mausritterLocations.biomeLabels[biome];
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('каждый landmark и detail имеет непустое поле ru', () => {
    for (const biome of mausritterLocations.biomes) {
      for (const row of mausritterLocations.landmarks[biome]) {
        expect(row.ru.length).toBeGreaterThan(0);
      }
    }
    for (const row of mausritterLocations.details) {
      expect(row.ru.length).toBeGreaterThan(0);
    }
  });

  test('details — поле question заполнено везде (это особенность исходной таблицы)', () => {
    for (const row of mausritterLocations.details) {
      expect(row.question).toBeDefined();
      expect((row.question ?? '').length).toBeGreaterThan(0);
    }
  });
});
