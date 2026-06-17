import { describe, expect, test } from 'bun:test';
import { validateTable } from '../random-table';
import { mausritterLocations } from './locations';

describe('mausritterLocations', () => {
  test('ровно 4 биома', () => {
    expect(mausritterLocations.biomes).toHaveLength(4);
    expect(new Set(mausritterLocations.biomes).size).toBe(4);
  });

  test('каждый landmark-таблица содержит 20 строк', () => {
    for (const biome of mausritterLocations.biomes) {
      expect(mausritterLocations.landmarks[biome].rows).toHaveLength(20);
    }
  });

  test('details таблица содержит 20 строк', () => {
    expect(mausritterLocations.details.rows).toHaveLength(20);
  });

  test('все таблицы валидны по rollSpec (дефолт 1d20)', () => {
    for (const biome of mausritterLocations.biomes) {
      expect(() => validateTable(mausritterLocations.landmarks[biome])).not.toThrow();
    }
    expect(() => validateTable(mausritterLocations.details)).not.toThrow();
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
      for (const row of mausritterLocations.landmarks[biome].rows) {
        expect(row.ru.length).toBeGreaterThan(0);
      }
    }
    for (const row of mausritterLocations.details.rows) {
      expect(row.ru.length).toBeGreaterThan(0);
    }
  });

  test('details — поле question заполнено везде', () => {
    for (const row of mausritterLocations.details.rows) {
      expect(row.question).toBeDefined();
      expect((row.question ?? '').length).toBeGreaterThan(0);
    }
  });
});
