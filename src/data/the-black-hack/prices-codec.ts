/**
 * Кодек стейта страницы цен: тип поселения + seed ↔ canonical query-строка.
 *
 * Формат: `s=<slug>&r=<seed в base36>.<версия данных>`. Грани кубиков в стейте
 * не хранятся — они детерминированно выводятся из seed (`expandRolls` в `prices.ts`).
 * Версия — суффикс `r`: она проверяет совместимость seed с текущей таблицей и
 * версией PRNG, отдельного параметра не заслуживает.
 *
 * Валидация — всё или ничего: любой провал → `null`, без частичного восстановления.
 * Кодек не знает про `window` — одна и та же строка живёт в URL и localStorage.
 */

import type { PriceTable, SettlementType } from '../types';

const UINT32_RANGE = 0x1_0000_0000;

/** Полный стейт страницы: тип поселения + seed всех бросков. */
export interface PricesState {
  readonly settlement: SettlementType;
  readonly seed: number;
}

/** Сериализует стейт в canonical query-строку `s=…&r=…` (без «?»). */
export function serialize(state: PricesState, table: PriceTable): string {
  return `s=${state.settlement}&r=${state.seed.toString(36)}.${table.version}`;
}

/**
 * Парсит query-строку (с ведущим «?» или без) в стейт.
 * Посторонние параметры игнорируются. Любой провал валидации → `null`.
 */
export function parse(query: string, table: PriceTable): PricesState | null {
  const params = new URLSearchParams(query);
  const s = params.get('s');
  const r = params.get('r');
  if (s === null || r === null) return null;

  if (!table.settlements.includes(s as SettlementType)) return null;

  const [seedPart, versionPart, ...rest] = r.split('.');
  if (rest.length > 0 || versionPart !== table.version) return null;
  if (seedPart === undefined || !/^[0-9a-z]{1,7}$/.test(seedPart)) return null;

  const seed = parseInt(seedPart, 36);
  if (!Number.isInteger(seed) || seed >= UINT32_RANGE) return null;

  return { settlement: s as SettlementType, seed };
}
