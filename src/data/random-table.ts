/**
 * Хелперы над `RandomTable<T>` — резолв формулы, валидация совместимости
 * длины и спецификации, и бросок с возвратом 0-based индекса.
 *
 * Логика отделена от типов (`types.ts`) и от RNG (`lib/dice.ts`) —
 * это связующий слой data-уровня. Используется store'ом.
 */

import { type RollSpec, rollDice } from '@/lib/dice';
import type { RandomTable } from './types';

/** Возвращает фактическую спеку для таблицы — заданную или дефолтную `1d{length}`. */
export function resolveSpec<T>(table: RandomTable<T>): RollSpec {
  return table.roll ?? { count: 1, sides: table.rows.length };
}

/**
 * Размер допустимого диапазона сумм для формулы `count d sides`.
 * `1d20` → 20. `2d6` → 11. `3d4` → 10.
 */
export function rangeSize(spec: RollSpec): number {
  return spec.count * (spec.sides - 1) + 1;
}

/**
 * Проверяет, что длина таблицы соответствует формуле броска.
 * Бросает `RangeError` при несоответствии.
 *
 * Удобно вызывать в data-файлах при инициализации, чтобы поймать
 * расхождение между переводом и rollSpec на этапе модульного теста.
 */
export function validateTable<T>(table: RandomTable<T>): void {
  const spec = resolveSpec(table);
  const expected = rangeSize(spec);
  if (table.rows.length !== expected) {
    throw new RangeError(
      `RandomTable: длина ${table.rows.length} не соответствует формуле ${spec.count}d${spec.sides} (ожидается ${expected})`,
    );
  }
}

/**
 * Бросает таблицу и возвращает `{ index, value }`.
 * Индекс — 0-based, в диапазоне `[0, rows.length - 1]`.
 *
 * @throws RangeError если таблица пуста или длина не совпадает со спекой.
 */
export function pickFromTable<T>(table: RandomTable<T>): { index: number; value: T } {
  if (table.rows.length === 0) {
    throw new RangeError('pickFromTable: таблица пуста');
  }
  const spec = resolveSpec(table);
  validateTable(table);
  const sum = rollDice(spec);
  // Минимальная сумма count d sides — это count (каждый кубик минимум 1).
  const index = sum - spec.count;
  return { index, value: table.rows[index] as T };
}
