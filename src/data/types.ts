/**
 * Общие типы для табличных генераторов TTRPG.
 *
 * `RandomTable<T>` — массив строк произвольной длины + опциональная
 * формула броска `RollSpec`. По умолчанию формула — `1d{rows.length}`
 * (равномерное распределение). Если задана своя `roll`, длина массива
 * должна соответствовать диапазону формулы (см. `validateTable` в
 * `data/random-table.ts`).
 *
 * Зачем переопределять формулу: чтобы получить колоколообразное
 * распределение — крайние значения редкие, центральные частые
 * (`2d6`: 11 значений, пик в индексе 5).
 */

import type { RollSpec } from '@/lib/dice';

/** Одна строка таблицы: основной текст + опциональный «открытый вопрос» в скобках. */
export interface LocationRow {
  /** Основной текст (например «Деревенский колодец»). */
  ru: string;
  /** Опциональный вопрос-зацепка («Что туда упало?»). Рендерится italic под основным текстом. */
  question?: string;
}

/**
 * Случайная таблица: строки + опциональная формула броска.
 *
 * Если `roll` не задан — равномерное `1d{rows.length}`.
 * Если задан — `count d sides`; длина `rows` должна быть
 * `count * (sides - 1) + 1` (количество возможных сумм).
 */
export interface RandomTable<T> {
  readonly rows: readonly T[];
  readonly roll?: RollSpec;
}

/**
 * Полный набор данных для генератора локаций в конкретной системе.
 * Параметризован union'ом ключей биомов.
 */
export interface LocationTable<Biome extends string> {
  readonly biomes: readonly Biome[];
  readonly biomeLabels: Readonly<Record<Biome, string>>;
  readonly landmarks: Readonly<Record<Biome, RandomTable<LocationRow>>>;
  readonly details: RandomTable<LocationRow>;
}
