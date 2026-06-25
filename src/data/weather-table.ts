/**
 * Хелперы над `WeatherTable` — тонкая обёртка над общими range-хелперами
 * (`range-table.ts`) с именами, привязанными к домену погоды.
 */

import { findRangeIndex, pickRange, type RangePick, validateRanges } from './range-table';
import type { WeatherTable } from './types';

export type WeatherPick = RangePick;

/** Индекс строки погоды, чей диапазон содержит `sum`, или `-1`. */
export function findWeatherRow(table: WeatherTable, sum: number): number {
  return findRangeIndex(table.rows, sum);
}

/**
 * Проверяет непрерывное покрытие диапазонов сумм формулой таблицы.
 *
 * @throws RangeError при разрыве, пересечении или неполном покрытии.
 */
export function validateWeatherTable(table: WeatherTable): void {
  validateRanges(table.rows, table.roll);
}

/**
 * Бросает таблицу погоды и возвращает `{ sum, rowIndex }`.
 *
 * @throws RangeError если таблица невалидна или сумма вне диапазонов.
 */
export function pickWeather(table: WeatherTable): WeatherPick {
  return pickRange(table.rows, table.roll);
}
