/**
 * Цены снаряжения The Black Hack — экономика по редкости.
 *
 * Источник: The Black Hack (Дэвид Блэк), раздел «Снаряжение и экономика» (см. docs/prices.md).
 * Перевод авторский.
 *
 * Каждый предмет получает собственный бросок по формуле категории.
 * Аннотации: КИ — кость использования, ЗБ — защита брони.
 * Правило доступности: обычное — везде, редкое — не в сельской местности,
 * экзотическое — только в больших городах.
 */

import type { PriceCategory, PriceTable } from '../types';

const categories: readonly PriceCategory[] = [
  {
    key: 'common',
    ru: 'Обычное / дешёвое',
    roll: { count: 1, sides: 8 },
    multiplier: 1,
    items: [
      { ru: 'Стрелы/боеприпасы', note: 'КИ8' },
      { ru: 'Рюкзаки/мешки' },
      { ru: 'Свечи', note: 'КИ4' },
      { ru: 'Парусина/ткань' },
      { ru: '10-футовая цепь' },
      { ru: 'Мел', note: 'КИ6' },
      { ru: 'Одежда простолюдина' },
      { ru: 'Монтировка и рабочие инструменты' },
      { ru: 'Фляги/бурдюки' },
      { ru: 'Альпинистский крюк' },
      { ru: 'Снаряжение для восхождений' },
      { ru: 'Кремень и огниво' },
      { ru: 'Чеснок/травы', note: 'КИ6' },
      { ru: 'Чернила и перо', note: 'КИ6' },
      { ru: 'Кувшин масла', note: 'КИ6' },
      { ru: 'Одноручное оружие' },
      { ru: 'Лёгкий лук' },
      { ru: 'Пергамент' },
      { ru: '10-футовый шест' },
      { ru: 'Кастрюли/посуда для готовки' },
      { ru: '50 футов верёвки' },
      { ru: 'Сухие рационы', note: 'КИ8' },
      { ru: 'Воск', note: 'КИ4' },
      { ru: 'Свисток' },
      { ru: 'Железные клинья', note: 'КИ6' },
      { ru: 'Маленькая палатка' },
      { ru: 'Факелы', note: 'КИ6' },
      { ru: 'Матерчатая броня', note: 'ЗБ1' },
      { ru: 'Одна сломанная КБ матерчатой брони' },
      { ru: 'Щит' },
      { ru: 'Шлем' },
    ],
  },
  {
    key: 'rare',
    ru: 'Редкое / ценное',
    roll: { count: 2, sides: 8 },
    multiplier: 5,
    items: [
      { ru: 'Эксклюзивное или экзотическое оружие' },
      { ru: 'Двуручное оружие' },
      { ru: 'Тяжёлый лук' },
      { ru: 'Арбалет' },
      { ru: 'Ежи (противопехотные шипы)' },
      { ru: 'Маскировка' },
      { ru: 'Добротная одежда' },
      { ru: 'Священный символ' },
      { ru: 'Святая вода', note: 'КИ6' },
      { ru: 'Замок' },
      { ru: 'Музыкальный инструмент' },
      { ru: 'Инструменты вора' },
      { ru: 'Кожаная броня', note: 'ЗБ2', multiplier: 2 },
      { ru: 'Одна сломанная КБ кожаной брони' },
    ],
  },
  {
    key: 'exotic',
    ru: 'Экзотическое / дорогое',
    roll: { count: 4, sides: 8 },
    multiplier: 10,
    items: [
      { ru: 'Хорошие драгоценности' },
      { ru: 'Алхимические ингредиенты', note: 'КИ4' },
      { ru: 'Яд', note: 'КИ6' },
      { ru: 'Секстант и инструменты для навигации' },
      { ru: 'Точная карта' },
      { ru: 'Материалы для алхимии и магии' },
      { ru: 'Кольчужная броня', note: 'ЗБ3', multiplier: 3 },
      { ru: 'Одна сломанная КБ кольчужной брони' },
      { ru: 'Латная броня', note: 'ЗБ4', multiplier: 4 },
      { ru: 'Одна сломанная КБ латной брони' },
    ],
  },
];

/**
 * Версия данных — FNV-1a-хеш состава таблицы в base36.
 *
 * Учитывает порядок и ключи категорий, формулы, множители и названия предметов:
 * любое изменение автоматически инвалидирует сериализованный стейт (KTD1 плана).
 */
export function computePricesVersion(cats: readonly PriceCategory[]): string {
  const fingerprint = cats
    .map((c) =>
      [
        c.key,
        c.roll.count,
        c.roll.sides,
        c.multiplier,
        c.items.map((i) => `${i.ru}×${i.multiplier ?? 1}`).join('|'),
      ].join(';'),
    )
    .join('\n');

  let hash = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i++) {
    hash ^= fingerprint.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Суммарное число кубиков на полный бросок таблицы — длина `r` в сериализованном стейте. */
export function totalDiceCount(table: PriceTable): number {
  return table.categories.reduce((sum, c) => sum + c.items.length * c.roll.count, 0);
}

export const blackHackPrices: PriceTable = {
  categories,
  settlements: ['rural', 'town', 'city'],
  settlementLabels: {
    rural: 'Сельская местность',
    town: 'Город',
    city: 'Большой город',
  },
  settlementCategories: {
    rural: ['common'],
    town: ['common', 'rare'],
    city: ['common', 'rare', 'exotic'],
  },
  version: computePricesVersion(categories),
};
