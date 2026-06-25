/**
 * Стор для генератора погоды — отвязывает state-машину броска от React-view.
 *
 * Отличие от location-store: один бросок 2d6 общий для всех сезонов, поэтому
 * `setSeason` не перебрасывает — меняет лишь активную колонку. Результат броска
 * (`$roll`) сезон-независим: `{ sum, rowIndex }`.
 */

import { atom, type ReadableAtom } from 'nanostores';
import type { Season, WeatherTable } from '@/data/types';
import { pickWeather } from '@/data/weather-table';

export interface WeatherRoll {
  /** Сумма 2d6. */
  sum: number;
  /** Индекс выпавшей строки в `table.rows`. */
  rowIndex: number;
}

export interface WeatherStore {
  /** Активный сезон — выбран пользователем. */
  $season: ReadableAtom<Season>;
  /** Текущий roll или null до первого броска. */
  $roll: ReadableAtom<WeatherRoll | null>;

  /** Сменить сезон — бросок сохраняется, меняется только читаемая колонка. */
  setSeason(season: Season): void;
  /** Перебросить погоду (2d6). */
  rollWeather(): void;
}

export function createWeatherStore(table: WeatherTable): WeatherStore {
  const firstSeason = table.seasons[0] as Season;
  const $season = atom<Season>(firstSeason);
  const $roll = atom<WeatherRoll | null>(null);

  const rollWeather = () => {
    const pick = pickWeather(table);
    $roll.set({ sum: pick.sum, rowIndex: pick.rowIndex });
  };

  const setSeason = (season: Season) => {
    if (season === $season.get()) return;
    $season.set(season);
  };

  return { $season, $roll, setSeason, rollWeather };
}
