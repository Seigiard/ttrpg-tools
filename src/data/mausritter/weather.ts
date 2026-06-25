/**
 * Погода Mausritter — генератор по сезонам.
 *
 * Источник: правила Mausritter, таблица погоды (бросок 2d6 каждый день).
 * Лицензия: Mausritter Third Party License (см. AttributionFooter и README).
 *
 * Перевод авторский, без официального русского релиза Mausritter на момент создания.
 *
 * `harsh: true` — в оригинале погода выделена жирным: не подходит для
 * путешествия (спасбросок силы или карточка состояния «Изнурён» за вахту в пути).
 */

import type { WeatherRangeRow, WeatherTable } from '../types';

const rows: readonly WeatherRangeRow[] = [
  {
    min: 2,
    max: 2,
    cells: {
      spring: { ru: 'Буря с дождём', harsh: true },
      summer: { ru: 'Буря и гроза', harsh: true },
      autumn: { ru: 'Сильный ветер', harsh: true },
      winter: { ru: 'Метель', harsh: true },
    },
  },
  {
    min: 3,
    max: 5,
    cells: {
      spring: { ru: 'Изморось' },
      summer: { ru: 'Ужасная жара', harsh: true },
      autumn: { ru: 'Проливной дождь', harsh: true },
      winter: { ru: 'Мокрый снег' },
    },
  },
  {
    min: 6,
    max: 8,
    cells: {
      spring: { ru: 'Пасмурно' },
      summer: { ru: 'Ясно и жарко' },
      autumn: { ru: 'Прохлада' },
      winter: { ru: 'Мороз' },
    },
  },
  {
    min: 9,
    max: 11,
    cells: {
      spring: { ru: 'Ясно и солнечно' },
      summer: { ru: 'Солнечно' },
      autumn: { ru: 'Прерывистый дождь' },
      winter: { ru: 'Пасмурно' },
    },
  },
  {
    min: 12,
    max: 12,
    cells: {
      spring: { ru: 'Тепло и ясно' },
      summer: { ru: 'Идеально тепло' },
      autumn: { ru: 'Ясно и свежо' },
      winter: { ru: 'Ясно и свежо' },
    },
  },
];

export const mausritterWeather: WeatherTable = {
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  seasonLabels: {
    spring: 'Весна',
    summer: 'Лето',
    autumn: 'Осень',
    winter: 'Зима',
  },
  rows,
  roll: { count: 2, sides: 6 },
};
