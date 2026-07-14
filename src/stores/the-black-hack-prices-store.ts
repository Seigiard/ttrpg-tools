/**
 * Стор страницы цен The Black Hack — state-машина без React и без персистенса.
 *
 * Тип поселения фильтрует только отображение категорий: `rollAll` всегда бросает
 * все предметы всех категорий, поэтому смена типа не теряет и не досоздаёт грани.
 * URL/localStorage-синхронизация живёт в компоненте (KTD5 плана); стор получает
 * восстановленный стейт через `hydrate` — без бросков.
 */

import { atom, type ReadableAtom } from 'nanostores';
import type { PricesState } from '@/data/the-black-hack/prices-codec';
import type { PriceCategory, PriceItem, PriceTable, SettlementType } from '@/data/types';
import { rollValues } from '@/lib/dice';

export type PricesRolls = PricesState['rolls'];

export interface PricesStore {
  /** Активный тип поселения. */
  $settlement: ReadableAtom<SettlementType>;
  /** Грани всех предметов (категория → предмет → кубики) или null до первого броска. */
  $rolls: ReadableAtom<PricesRolls | null>;

  /** Перебросить цены всех предметов — «прибытие в новое место». */
  rollAll(): void;
  /** Сменить тип поселения — новое поселение, все цены перебрасываются (R6). */
  setSettlement(settlement: SettlementType): void;
  /** Применить восстановленный стейт (URL/localStorage) без бросков. */
  hydrate(state: PricesState): void;
}

export function createPricesStore(table: PriceTable): PricesStore {
  const $settlement = atom<SettlementType>(table.settlements[0] as SettlementType);
  const $rolls = atom<PricesRolls | null>(null);

  const rollAll = () => {
    $rolls.set(table.categories.map((c) => c.items.map(() => rollValues(c.roll))));
  };

  const setSettlement = (settlement: SettlementType) => {
    if (settlement === $settlement.get()) return;
    $settlement.set(settlement);
    rollAll();
  };

  const hydrate = (state: PricesState) => {
    $settlement.set(state.settlement);
    $rolls.set(state.rolls);
  };

  return { $settlement, $rolls, rollAll, setSettlement, hydrate };
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
