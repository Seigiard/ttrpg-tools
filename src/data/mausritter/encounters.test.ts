import { describe, expect, test } from 'bun:test';
import { validateRanges } from '../range-table';
import { mausritterEncounters } from './encounters';

describe('mausritterEncounters', () => {
  test('проверка: диапазоны непрерывно покрывают формулу', () => {
    expect(() =>
      validateRanges(mausritterEncounters.check.rows, mausritterEncounters.check.roll),
    ).not.toThrow();
  });

  test('реакции: диапазоны непрерывно покрывают формулу', () => {
    expect(() =>
      validateRanges(mausritterEncounters.reactions.rows, mausritterEncounters.reactions.roll),
    ).not.toThrow();
  });

  test('каждый исход проверки имеет непустые ru и hint', () => {
    for (const row of mausritterEncounters.check.rows) {
      expect(row.ru.length).toBeGreaterThan(0);
      expect(row.hint.length).toBeGreaterThan(0);
    }
  });

  test('каждая реакция имеет непустые ru и question', () => {
    for (const row of mausritterEncounters.reactions.rows) {
      expect(row.ru.length).toBeGreaterThan(0);
      expect(row.question.length).toBeGreaterThan(0);
    }
  });

  test('исходы encounter и omen встречаются ровно по одному разу', () => {
    const outcomes = mausritterEncounters.check.rows.map((row) => row.outcome);
    expect(outcomes.filter((o) => o === 'encounter')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'omen')).toHaveLength(1);
  });
});
