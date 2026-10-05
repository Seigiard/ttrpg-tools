/**
 * Стор для генератора погоды — отвязывает state-машину броска от Preact-view.
 *
 * Отличие от location-store: один бросок 2d6 общий для всех сезонов, поэтому
 * `setSeason` не перебрасывает — меняет лишь активную колонку. Результат броска
 * (`$roll`) сезон-независим: `{ sum, rowIndex }`.
 */

import { atom, type ReadableAtom } from 'nanostores';
import type { RangePick } from '@/data/range-table';
import type { Season, WeatherTable } from '@/data/types';
import { pickWeather } from '@/data/weather-table';

export interface WeatherStore {
  /** Активный сезон — выбран пользователем. */
  $season: ReadableAtom<Season>;
  /** Текущий roll или null до первого броска. */
  $roll: ReadableAtom<RangePick | null>;

  /** Сменить сезон — бросок сохраняется, меняется только читаемая колонка. */
  setSeason(season: Season): void;
  /** Перебросить погоду (2d6). */
  rollWeather(): void;
}

export function createWeatherStore(table: WeatherTable): WeatherStore {
  const firstSeason = table.seasons[0];
  const $season = atom<Season>(firstSeason);
  const $roll = atom<RangePick | null>(null);

  const rollWeather = () => {
    $roll.set(pickWeather(table));
  };

  const setSeason = (season: Season) => {
    if (season === $season.get()) return;
    $season.set(season);
  };

  return { $season, $roll, setSeason, rollWeather };
}
