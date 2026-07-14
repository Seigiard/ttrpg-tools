import { describe, expect, test } from 'bun:test';
import type { PriceCategory, PriceTable } from '../types';
import { parse, serialize, type PricesState } from './prices-codec';
import { blackHackPrices, computePricesVersion, totalDiceCount } from './prices';

/** Грани всех предметов таблицы: face(n) задаёт грань n-го кубика в каноническом порядке. */
function makeRolls(table: PriceTable, face: (n: number) => number): PricesState['rolls'] {
  let n = 0;
  return table.categories.map((c) =>
    c.items.map(() => Array.from({ length: c.roll.count }, () => face(n++))),
  );
}

const miniCategories: readonly PriceCategory[] = [
  {
    key: 'common',
    ru: 'Обычное',
    roll: { count: 1, sides: 8 },
    multiplier: 1,
    items: [{ ru: 'Верёвка' }, { ru: 'Факел' }],
  },
  {
    key: 'rare',
    ru: 'Редкое',
    roll: { count: 2, sides: 8 },
    multiplier: 5,
    items: [{ ru: 'Замок' }],
  },
];

const miniTable: PriceTable = {
  categories: miniCategories,
  settlements: ['rural', 'town', 'city'],
  settlementLabels: { rural: 'Сельская местность', town: 'Город', city: 'Большой город' },
  settlementCategories: {
    rural: ['common'],
    town: ['common', 'rare'],
    city: ['common', 'rare'],
  },
  version: computePricesVersion(miniCategories),
};

describe('serialize', () => {
  test('r состоит только из символов [1-8] и имеет длину = числу кубиков таблицы', () => {
    const state: PricesState = {
      settlement: 'city',
      rolls: makeRolls(blackHackPrices, (n) => (n % 8) + 1),
    };

    const query = serialize(state, blackHackPrices);

    const r = new URLSearchParams(query).get('r') ?? '';
    expect(r).toMatch(/^[1-8]+$/);
    expect(r.length).toBe(totalDiceCount(blackHackPrices));
  });

  test('канонический порядок: грани предмета занимают ожидаемую позицию в r', () => {
    // #given Верёвка → позиция 0, Факел → 1, Замок (2 кубика) → 2–3
    const state: PricesState = {
      settlement: 'town',
      rolls: [[[3], [5]], [[7, 2]]],
    };

    const r = new URLSearchParams(serialize(state, miniTable)).get('r');

    expect(r).toBe('3572');
  });

  test('перестановка граней двух соседних предметов меняет строку предсказуемо', () => {
    const swapped: PricesState = {
      settlement: 'town',
      rolls: [[[5], [3]], [[7, 2]]],
    };

    const r = new URLSearchParams(serialize(swapped, miniTable)).get('r');

    expect(r).toBe('5372');
  });
});

describe('parse', () => {
  test('roundtrip: parse(serialize(state)) эквивалентен исходному стейту для каждого типа', () => {
    for (const settlement of blackHackPrices.settlements) {
      const state: PricesState = {
        settlement,
        rolls: makeRolls(blackHackPrices, (n) => ((n * 3) % 8) + 1),
      };

      const parsed = parse(serialize(state, blackHackPrices), blackHackPrices);

      expect(parsed).toEqual(state);
    }
  });

  test('null на неизвестный slug', () => {
    expect(parse(`s=village&v=${miniTable.version}&r=1234`, miniTable)).toBeNull();
  });

  test('null на несовпадение версии', () => {
    expect(parse('s=town&v=deadbeef&r=1234', miniTable)).toBeNull();
  });

  test('null на неверную длину r', () => {
    expect(parse(`s=town&v=${miniTable.version}&r=123`, miniTable)).toBeNull();
    expect(parse(`s=town&v=${miniTable.version}&r=12345`, miniTable)).toBeNull();
  });

  test('null на символы вне [1-8]', () => {
    expect(parse(`s=town&v=${miniTable.version}&r=1290`, miniTable)).toBeNull();
    expect(parse(`s=town&v=${miniTable.version}&r=12a4`, miniTable)).toBeNull();
  });

  test('null при отсутствии любого из параметров и на пустую строку', () => {
    expect(parse(`v=${miniTable.version}&r=1234`, miniTable)).toBeNull();
    expect(parse(`s=town&r=1234`, miniTable)).toBeNull();
    expect(parse(`s=town&v=${miniTable.version}`, miniTable)).toBeNull();
    expect(parse('', miniTable)).toBeNull();
  });

  test('игнорирует посторонние query-параметры рядом с валидным стейтом', () => {
    const query = `utm_source=x&s=town&v=${miniTable.version}&r=3572&foo=bar`;

    const parsed = parse(query, miniTable);

    expect(parsed).toEqual({ settlement: 'town', rolls: [[[3], [5]], [[7, 2]]] });
  });

  test('принимает строку с ведущим «?» (location.search как есть)', () => {
    const parsed = parse(`?s=town&v=${miniTable.version}&r=3572`, miniTable);
    expect(parsed?.settlement).toBe('town');
  });
});
