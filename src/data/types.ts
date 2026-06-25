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

/** Сезон — колонка таблицы погоды. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Одна клетка таблицы погоды: текст погоды + флаг «суровая». */
export interface WeatherCell {
  /** Текст погоды (например «Пасмурно»). */
  ru: string;
  /**
   * `true` → погода не подходит для путешествия (в оригинале выделена жирным).
   * За каждую вахту в пути — спасбросок силы или карточка состояния «Изнурён».
   */
  harsh?: boolean;
}

/**
 * Строка таблицы погоды: диапазон сумм 2d6 + клетки по сезонам.
 * Диапазоны соседних строк должны быть смежными и без пропусков
 * (см. `validateWeatherTable` в `data/weather-table.ts`).
 */
export interface WeatherRangeRow {
  /** Минимальная сумма 2d6 для этой строки (включительно). */
  readonly min: number;
  /** Максимальная сумма 2d6 (включительно). */
  readonly max: number;
  readonly cells: Readonly<Record<Season, WeatherCell>>;
}

/**
 * Полный набор данных для генератора погоды.
 *
 * `roll` — формула броска (`2d6` для Mausritter, колоколообразное распределение).
 * Один бросок применяется ко всем сезонам — сезон выбирает лишь колонку.
 */
export interface WeatherTable {
  readonly seasons: readonly Season[];
  readonly seasonLabels: Readonly<Record<Season, string>>;
  readonly rows: readonly WeatherRangeRow[];
  readonly roll: RollSpec;
}

/** Исход проверки столкновения (бросок d6). */
export type EncounterCheckOutcome = 'encounter' | 'omen' | 'clear';

/** Строка таблицы проверки столкновения: диапазон d6 + исход. */
export interface EncounterCheckRow {
  /** Минимальное значение d6 для строки (включительно). */
  readonly min: number;
  /** Максимальное значение d6 (включительно). */
  readonly max: number;
  readonly outcome: EncounterCheckOutcome;
  /** Краткая подпись исхода («Столкновение»). */
  readonly ru: string;
  /** Пояснение к исходу. */
  readonly hint: string;
}

/** Строка таблицы реакций: диапазон 2d6 + отношение существа. */
export interface ReactionRow {
  /** Минимальная сумма 2d6 (включительно). */
  readonly min: number;
  /** Максимальная сумма 2d6 (включительно). */
  readonly max: number;
  /** Отношение («Враждебное»). */
  readonly ru: string;
  /** Открытый вопрос-зацепка («Чем мыши его разозлили?»). */
  readonly question: string;
}

export interface EncounterCheckTable {
  readonly rows: readonly EncounterCheckRow[];
  readonly roll: RollSpec;
}

export interface ReactionTable {
  readonly rows: readonly ReactionRow[];
  readonly roll: RollSpec;
}

/** Полный набор данных для генератора встреч: проверка столкновения + реакции. */
export interface EncounterTable {
  readonly check: EncounterCheckTable;
  readonly reactions: ReactionTable;
}
