/**
 * Стор страницы цен The Black Hack — state-машина без React и без персистенса.
 *
 * Источник истины — seed: `$rolls` детерминированно выводится из него (`expandRolls`).
 * Тип поселения фильтрует только отображение категорий — смена типа берёт новый seed,
 * то есть перебрасывает всё. URL/localStorage-синхронизация живёт в компоненте;
 * стор получает восстановленный стейт через `hydrate` — без обращения к crypto.
 */

import { atom, computed, type ReadableAtom } from 'nanostores';
import { expandRolls, type PricesRolls } from '@/data/the-black-hack/prices';
import type { PricesState } from '@/data/the-black-hack/prices-codec';
import type { PriceCategory, PriceItem, PriceTable, SettlementType } from '@/data/types';
import { randomSeed } from '@/lib/seeded-rng';

export type { PricesRolls };

export interface PricesStore {
  /** Активный тип поселения. */
  $settlement: ReadableAtom<SettlementType>;
  /** Seed текущего «поселения» или null до первого броска. */
  $seed: ReadableAtom<number | null>;
  /** Грани всех предметов (категория → предмет → кубики), выведенные из seed. */
  $rolls: ReadableAtom<PricesRolls | null>;

  /** Перебросить цены всех предметов — «прибытие в новое место». */
  rollAll(): void;
  /** Сменить тип поселения — новое поселение, все цены перебрасываются (R6). */
  setSettlement(settlement: SettlementType): void;
  /** Применить восстановленный стейт (URL/localStorage) без обращения к crypto. */
  hydrate(state: PricesState): void;
}

export function createPricesStore(table: PriceTable): PricesStore {
  const $settlement = atom<SettlementType>(table.settlements[0] as SettlementType);
  const $seed = atom<number | null>(null);
  const $rolls = computed($seed, (seed) => (seed === null ? null : expandRolls(seed, table)));

  const rollAll = () => {
    $seed.set(randomSeed());
  };

  const setSettlement = (settlement: SettlementType) => {
    if (settlement === $settlement.get()) return;
    $settlement.set(settlement);
    rollAll();
  };

  const hydrate = (state: PricesState) => {
    $settlement.set(state.settlement);
    $seed.set(state.seed);
  };

  return { $settlement, $seed, $rolls, rollAll, setSettlement, hydrate };
}

/** Итоговая цена предмета: сумма граней × множитель категории × множитель предмета. */
export function itemPrice(
  faces: readonly number[],
  category: PriceCategory,
  item: PriceItem,
): number {
  const sum = faces.reduce((acc, face) => acc + face, 0);
  return sum * category.multiplier * (item.multiplier ?? 1);
}
