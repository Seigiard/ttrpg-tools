/**
 * Стор для генератора встреч — две независимые state-машины бросков:
 * проверка столкновения (d6) и реакция существа (2d6).
 *
 * Части независимы: проверка отвечает «есть ли столкновение», реакция нужна
 * лишь когда мыши уже столкнулись с существом. Оба броска — обёртки над
 * общим `pickRange` (см. `data/range-table.ts`).
 */

import { atom, type ReadableAtom } from 'nanostores';
import { pickRange, type RangePick } from '@/data/range-table';
import type { EncounterTable } from '@/data/types';

export interface EncounterStore {
  /** Результат проверки столкновения (d6) или null до первого броска. */
  $check: ReadableAtom<RangePick | null>;
  /** Результат броска реакции (2d6) или null до первого броска. */
  $reaction: ReadableAtom<RangePick | null>;

  /** Перебросить проверку столкновения. */
  rollCheck(): void;
  /** Перебросить реакцию. */
  rollReaction(): void;
}

export function createEncounterStore(table: EncounterTable): EncounterStore {
  const $check = atom<RangePick | null>(null);
  const $reaction = atom<RangePick | null>(null);

  const rollCheck = () => {
    $check.set(pickRange(table.check.rows, table.check.roll));
  };

  const rollReaction = () => {
    $reaction.set(pickRange(table.reactions.rows, table.reactions.roll));
  };

  return { $check, $reaction, rollCheck, rollReaction };
}
