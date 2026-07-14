import { describe, expect, test } from 'bun:test';
import type { PriceCategory, PriceTable } from '../types';
import { parse, serialize, type PricesState } from './prices-codec';
import { blackHackPrices, computePricesVersion } from './prices';

const miniCategories: readonly PriceCategory[] = [
  {
    key: 'common',
    ru: 'Обычное',
    roll: { count: 1, sides: 8 },
    multiplier: 1,
    items: [{ ru: 'Верёвка' }, { ru: 'Факел' }],
  },
];

const miniTable: PriceTable = {
  categories: miniCategories,
  settlements: ['rural', 'town', 'city'],
  settlementLabels: { rural: 'Сельская местность', town: 'Город', city: 'Большой город' },
  settlementCategories: {
    rural: ['common'],
    town: ['common'],
    city: ['common'],
  },
  version: computePricesVersion(miniCategories),
};

describe('serialize', () => {
  test('r — seed в base36 с суффиксом версии через точку', () => {
    const query = serialize({ settlement: 'town', seed: 42 }, miniTable);
    expect(query).toBe(`s=town&r=16.${miniTable.version}`);
  });

  test('r остаётся коротким на максимальном seed', () => {
    const query = serialize({ settlement: 'city', seed: 0xffffffff }, blackHackPrices);

    const r = new URLSearchParams(query).get('r') ?? '';
    expect(r).toMatch(/^[0-9a-z]{1,7}\.[0-9a-z]+$/);
  });
});

describe('parse', () => {
  test('roundtrip: parse(serialize(state)) эквивалентен исходному стейту для каждого типа', () => {
    for (const settlement of blackHackPrices.settlements) {
      for (const seed of [0, 1, 42, 123456789, 0xffffffff]) {
        const state: PricesState = { settlement, seed };

        const parsed = parse(serialize(state, blackHackPrices), blackHackPrices);

        expect(parsed).toEqual(state);
      }
    }
  });

  test('null на неизвестный slug', () => {
    expect(parse(`s=village&r=16.${miniTable.version}`, miniTable)).toBeNull();
  });

  test('null на несовпадение версии, отсутствие суффикса или лишние точки', () => {
    expect(parse('s=town&r=16.deadbee', miniTable)).toBeNull();
    expect(parse('s=town&r=16', miniTable)).toBeNull();
    expect(parse(`s=town&r=16.${miniTable.version}.x`, miniTable)).toBeNull();
  });

  test('null на невалидный seed: не base36, пустой, слишком длинный, вне uint32', () => {
    expect(parse(`s=town&r=16!.${miniTable.version}`, miniTable)).toBeNull();
    expect(parse(`s=town&r=.${miniTable.version}`, miniTable)).toBeNull();
    expect(parse(`s=town&r=-16.${miniTable.version}`, miniTable)).toBeNull();
    expect(parse(`s=town&r=12345678.${miniTable.version}`, miniTable)).toBeNull();
    // 'zzzzzzz' (7 символов base36) > 2^32
    expect(parse(`s=town&r=zzzzzzz.${miniTable.version}`, miniTable)).toBeNull();
  });

  test('null при отсутствии любого из параметров и на пустую строку', () => {
    expect(parse(`r=16.${miniTable.version}`, miniTable)).toBeNull();
    expect(parse('s=town', miniTable)).toBeNull();
    expect(parse('', miniTable)).toBeNull();
  });

  test('игнорирует посторонние query-параметры рядом с валидным стейтом', () => {
    const query = `utm_source=x&s=town&r=16.${miniTable.version}&foo=bar`;

    const parsed = parse(query, miniTable);

    expect(parsed).toEqual({ settlement: 'town', seed: 42 });
  });

  test('принимает строку с ведущим «?» (location.search как есть)', () => {
    const parsed = parse(`?s=town&r=16.${miniTable.version}`, miniTable);
    expect(parsed?.settlement).toBe('town');
  });
});
