/**
 * Общие хелперы для таблиц, где суммы кубиков сгруппированы в диапазоны
 * (`2d6` → `3–5`; `d6` → `3–6`). Используются генераторами погоды и встреч.
 *
 * Отличие от `random-table.ts`: там один индекс на каждую сумму (`pickFromTable`),
 * здесь несколько сумм схлопываются в одну строку через `{ min, max }`.
 */

import { type RollSpec, rollDice } from '@/lib/dice';

/** Минимальные требования к строке range-таблицы — границы диапазона сумм. */
export interface RangeBounds {
  /** Минимальная сумма броска для строки (включительно). */
  readonly min: number;
  /** Максимальная сумма броска (включительно). */
  readonly max: number;
}

export interface RangePick {
  /** Сумма броска. */
  sum: number;
  /** Индекс строки, чей диапазон содержит сумму. */
  rowIndex: number;
}

/** Индекс строки, чей диапазон содержит `sum`, или `-1`. */
export function findRangeIndex(rows: readonly RangeBounds[], sum: number): number {
  return rows.findIndex((row) => sum >= row.min && sum <= row.max);
}

/**
 * Проверяет, что диапазоны строк непрерывно покрывают весь диапазон формулы
 * (`[count, count * sides]`) без пропусков и пересечений.
 *
 * @throws RangeError при разрыве, пересечении, неполном покрытии или `max < min`.
 */
export function validateRanges(rows: readonly RangeBounds[], roll: RollSpec): void {
  const min = roll.count;
  const max = roll.count * roll.sides;
  let expected = min;
  for (const row of rows) {
    if (row.max < row.min) {
      throw new RangeError(`RangeTable: max ${row.max} меньше min ${row.min}`);
    }
    if (row.min !== expected) {
      throw new RangeError(
        `RangeTable: разрыв или пересечение у строки ${row.min}–${row.max}, ожидалось начало ${expected}`,
      );
    }
    expected = row.max + 1;
  }
  if (expected !== max + 1) {
    throw new RangeError(
      `RangeTable: строки покрывают до ${expected - 1}, ожидалось до ${max} (формула ${roll.count}d${roll.sides})`,
    );
  }
}

/**
 * Валидирует строки, бросает по формуле и возвращает `{ sum, rowIndex }`.
 *
 * @throws RangeError если строки невалидны или сумма вне диапазонов.
 */
export function pickRange(rows: readonly RangeBounds[], roll: RollSpec): RangePick {
  validateRanges(rows, roll);
  const sum = rollDice(roll);
  const rowIndex = findRangeIndex(rows, sum);
  if (rowIndex === -1) {
    throw new RangeError(`pickRange: сумма ${sum} вне диапазонов таблицы`);
  }
  return { sum, rowIndex };
}
