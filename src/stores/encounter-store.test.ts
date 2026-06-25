import { afterEach, describe, expect, test } from 'bun:test';
import { mausritterEncounters } from '@/data/mausritter/encounters';
import { mockCrypto } from '@/test-utils/mock-crypto';
import { createEncounterStore } from './encounter-store';

describe('createEncounterStore', () => {
  let restoreCrypto: (() => void) | null = null;

  afterEach(() => {
    if (restoreCrypto) {
      restoreCrypto();
      restoreCrypto = null;
    }
  });

  test('начальное состояние: оба броска null', () => {
    const store = createEncounterStore(mausritterEncounters);
    expect(store.$check.get()).toBeNull();
    expect(store.$reaction.get()).toBeNull();
  });

  test('rollCheck = 1 → исход «столкновение» (строка 0)', () => {
    restoreCrypto = mockCrypto([0]);
    const store = createEncounterStore(mausritterEncounters);
    store.rollCheck();
    expect(store.$check.get()).toEqual({ sum: 1, rowIndex: 0 });
  });

  test('rollCheck = 4 → исход «ничего» (строка 3–6)', () => {
    restoreCrypto = mockCrypto([3]);
    const store = createEncounterStore(mausritterEncounters);
    store.rollCheck();
    expect(store.$check.get()).toEqual({ sum: 4, rowIndex: 2 });
  });

  test('rollReaction = 12 → строка «дружелюбное» (последняя)', () => {
    restoreCrypto = mockCrypto([5, 5]);
    const store = createEncounterStore(mausritterEncounters);
    store.rollReaction();
    expect(store.$reaction.get()).toEqual({ sum: 12, rowIndex: 4 });
  });

  test('rollCheck не трогает $reaction и наоборот', () => {
    restoreCrypto = mockCrypto([0, 0, 0]);
    const store = createEncounterStore(mausritterEncounters);
    store.rollReaction();
    const reactionBefore = store.$reaction.get();

    store.rollCheck();

    expect(store.$reaction.get()).toBe(reactionBefore);
  });
});
