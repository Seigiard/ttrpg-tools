/**
 * Общие типы для табличных генераторов TTRPG.
 *
 * Идея: каждая система кладёт свои данные в `src/data/<system>/`, реализуя
 * интерфейс `LocationTable`. Компонент-генератор работает с любой системой
 * через общий интерфейс — добавление новой системы не требует переписывать UI.
 */

/** Одна строка таблицы d20: основной текст + опциональный «открытый вопрос» в скобках. */
export interface LocationRow {
  /** Основной текст (например «Деревенский колодец»). */
  ru: string;
  /** Опциональный вопрос-зацепка («Что туда упало?»). Рендерится italic под основным текстом. */
  question?: string;
}

/** Кортеж из ровно 20 строк — гарантирует длину d20-таблицы на этапе компиляции. */
export type LocationTableD20 = readonly [
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
  LocationRow,
];

/**
 * Полный набор данных для генератора локаций в конкретной системе.
 * Параметризован union'ом ключей биомов (например `'countryside' | 'forest' | 'river' | 'human-town'`).
 */
export interface LocationTable<Biome extends string> {
  /** Все доступные биомы. */
  readonly biomes: readonly Biome[];
  /** Русские названия биомов для UI. */
  readonly biomeLabels: Readonly<Record<Biome, string>>;
  /** Landmarks по биомам: для каждого биома — d20-таблица. */
  readonly landmarks: Readonly<Record<Biome, LocationTableD20>>;
  /** Детали локации — единая d20-таблица. */
  readonly details: LocationTableD20;
}
