import { describe, expect, test } from 'bun:test';
import { blackHackPrices, computePricesVersion, totalDiceCount } from './prices';

describe('blackHackPrices', () => {
  test('у каждого предмета непустой ru, имена уникальны в пределах таблицы', () => {
    const names = blackHackPrices.categories.flatMap((c) => c.items.map((i) => i.ru));
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  test('множители предметов — целые >= 2', () => {
    for (const category of blackHackPrices.categories) {
      for (const item of category.items) {
        if (item.multiplier !== undefined) {
          expect(Number.isInteger(item.multiplier)).toBe(true);
          expect(item.multiplier).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  test('формулы категорий валидны: count >= 1, sides >= 2, множитель категории >= 1', () => {
    for (const category of blackHackPrices.categories) {
      expect(category.roll.count).toBeGreaterThanOrEqual(1);
      expect(category.roll.sides).toBeGreaterThanOrEqual(2);
      expect(category.multiplier).toBeGreaterThanOrEqual(1);
    }
  });

  test('суммарное число кубиков таблицы > 0', () => {
    expect(totalDiceCount(blackHackPrices)).toBeGreaterThan(0);
  });

  test('маппинг тип → категории: непустой список, «обычное» есть во всех типах', () => {
    for (const settlement of blackHackPrices.settlements) {
      const keys = blackHackPrices.settlementCategories[settlement];
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('common');
      for (const key of keys) {
        expect(blackHackPrices.categories.some((c) => c.key === key)).toBe(true);
      }
    }
  });
});

describe('computePricesVersion', () => {
  test('детерминирована: два вычисления дают одно значение', () => {
    expect(computePricesVersion(blackHackPrices.categories)).toBe(
      computePricesVersion(blackHackPrices.categories),
    );
  });

  test('меняется при изменении состава предметов', () => {
    // #given таблица без последнего предмета первой категории
    const [first, ...rest] = blackHackPrices.categories;
    const trimmed = [{ ...first, items: first.items.slice(0, -1) }, ...rest];

    expect(computePricesVersion(trimmed)).not.toBe(computePricesVersion(blackHackPrices.categories));
  });

  test('меняется при изменении порядка предметов', () => {
    // #given первые два предмета первой категории переставлены
    const [first, ...rest] = blackHackPrices.categories;
    const [a, b, ...tail] = first.items;
    const swapped = [{ ...first, items: [b, a, ...tail] }, ...rest];

    expect(computePricesVersion(swapped)).not.toBe(computePricesVersion(blackHackPrices.categories));
  });
});
