/**
 * Кодек стейта страницы цен: тип поселения + все выпавшие грани ↔ canonical query-строка.
 *
 * Формат: `s=<slug>&v=<версия данных>&r=<грани>` (KTD1 плана). `r` — конкатенация граней
 * всех кубиков в каноническом порядке: категории в порядке объявления таблицы, предметы —
 * в порядке объявления внутри категории, кубики предмета — подряд. По символу на кубик,
 * поэтому формат работает только для sides <= 9.
 *
 * Валидация — всё или ничего (KTD2): любой провал → `null`, без частичного восстановления.
 * Кодек не знает про `window` — одна и та же строка живёт в URL и localStorage.
 */

import type { PriceTable, SettlementType } from '../types';
import { totalDiceCount } from './prices';

/** Полный стейт страницы: тип поселения + грани по категориям → предметам → кубикам. */
export interface PricesState {
  readonly settlement: SettlementType;
  readonly rolls: readonly (readonly (readonly number[])[])[];
}

/** Сериализует стейт в canonical query-строку `s=…&v=…&r=…` (без «?»). */
export function serialize(state: PricesState, table: PriceTable): string {
  const r = state.rolls.flat(2).join('');
  return `s=${state.settlement}&v=${table.version}&r=${r}`;
}

/**
 * Парсит query-строку (с ведущим «?» или без) в стейт.
 * Посторонние параметры игнорируются. Любой провал валидации → `null`.
 */
export function parse(query: string, table: PriceTable): PricesState | null {
  const params = new URLSearchParams(query);
  const s = params.get('s');
  const v = params.get('v');
  const r = params.get('r');
  if (s === null || v === null || r === null) return null;

  if (!table.settlements.includes(s as SettlementType)) return null;
  if (v !== table.version) return null;
  if (r.length !== totalDiceCount(table) || !/^[1-9]+$/.test(r)) return null;

  let n = 0;
  const rolls: number[][][] = [];
  for (const category of table.categories) {
    const items: number[][] = [];
    for (let i = 0; i < category.items.length; i++) {
      const faces: number[] = [];
      for (let d = 0; d < category.roll.count; d++) {
        const face = Number(r[n++]);
        if (face > category.roll.sides) return null;
        faces.push(face);
      }
      items.push(faces);
    }
    rolls.push(items);
  }

  return { settlement: s as SettlementType, rolls };
}
