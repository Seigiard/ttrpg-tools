/**
 * Стор для генератора локаций — отвязывает state-машину бросков от React-view.
 *
 * Фабрика `createLocationStore(table)` возвращает реактивные атомы и операции.
 * Компонент подписывается через `useStore` из `@nanostores/react`; тесты дёргают
 * операции напрямую без рендера.
 *
 * Расширение: для журнала бросков или AI-описаний — добавить производные сторы
 * (`computed`) или новые операции, не трогая компонент.
 */

import { atom, type ReadableAtom } from 'nanostores';
import type { LocationTable } from '@/data/types';
import { pick } from '@/lib/dice';

export interface Roll<Biome extends string> {
  biome: Biome;
  landmarkIndex: number;
  detailIndex: number;
}

export interface LocationStore<Biome extends string> {
  /** Активный биом — выбран пользователем. */
  $biome: ReadableAtom<Biome>;
  /** Текущий roll или null до первого броска. */
  $roll: ReadableAtom<Roll<Biome> | null>;

  /** Сменить биом — автоматически перебрасывает результат под новый биом. */
  setBiome(biome: Biome): void;
  /** Перебросить обе части под текущим биомом. */
  rollAll(): void;
  /** Перебросить только ориентир (deal остаётся). */
  rerollLandmark(): void;
  /** Перебросить только деталь (landmark остаётся). */
  rerollDetail(): void;
}

export function createLocationStore<Biome extends string>(
  table: LocationTable<Biome>,
): LocationStore<Biome> {
  const firstBiome = table.biomes[0] as Biome;
  const $biome = atom<Biome>(firstBiome);
  const $roll = atom<Roll<Biome> | null>(null);

  const freshRoll = (biome: Biome): Roll<Biome> => {
    const landmarkPick = pick(table.landmarks[biome]);
    const detailPick = pick(table.details);
    return { biome, landmarkIndex: landmarkPick.index, detailIndex: detailPick.index };
  };

  const rollAll = () => {
    $roll.set(freshRoll($biome.get()));
  };

  const rerollLandmark = () => {
    const current = $roll.get();
    if (!current) return;
    const landmarkPick = pick(table.landmarks[current.biome]);
    $roll.set({ ...current, landmarkIndex: landmarkPick.index });
  };

  const rerollDetail = () => {
    const current = $roll.get();
    if (!current) return;
    const detailPick = pick(table.details);
    $roll.set({ ...current, detailIndex: detailPick.index });
  };

  const setBiome = (biome: Biome) => {
    if (biome === $biome.get()) return;
    $biome.set(biome);
    // Смена биома → новый roll, чтобы не было стейл-landmark из старого биома.
    rollAll();
  };

  return { $biome, $roll, setBiome, rollAll, rerollLandmark, rerollDetail };
}
