import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parse, serialize, type PricesState } from '@/data/the-black-hack/prices-codec';
import type { PriceCategory, PriceItem, PriceTable, SettlementType } from '@/data/types';
import {
  createPricesStore,
  itemPrice,
  type PricesRolls,
} from '@/stores/the-black-hack-prices-store';

const STORAGE_KEY = 'the-black-hack:prices';

interface Props {
  table: PriceTable;
}

export function BlackHackPricesGenerator({ table }: Props) {
  // useMemo гарантирует, что стор создаётся один раз на жизнь компонента.
  const store = useMemo(() => createPricesStore(table), [table]);
  const settlement = useStore(store.$settlement);
  const rolls = useStore(store.$rolls);
  // До инициализации эффект синхронизации молчит — иначе дефолтный стейт
  // перезатёр бы входящий из URL/localStorage.
  const [initialized, setInitialized] = useState(false);

  // Инициализация на клиенте (не в store-init — SSR-снепшот без цен, hydration не ломается).
  // Источник по приоритету: URL → localStorage → свежий бросок (KTD2 плана).
  useEffect(() => {
    if (store.$rolls.get() === null) {
      const state = parse(window.location.search, table) ?? readStorage(table);
      if (state) {
        store.hydrate(state);
      } else {
        store.rollAll();
      }
    }
    setInitialized(true);
  }, [store, table]);

  // Каждое изменение стейта — в оба синка (R10): URL через replaceState (KTD3),
  // localStorage той же canonical-строкой (KTD4).
  useEffect(() => {
    if (!initialized || rolls === null) return;
    const query = serialize({ settlement, rolls }, table);

    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of new URLSearchParams(query)) {
      params.set(key, value);
    }
    history.replaceState(null, '', `${window.location.pathname}?${params}${window.location.hash}`);

    try {
      window.localStorage.setItem(STORAGE_KEY, query);
    } catch {
      console.warn('localStorage недоступен — цены сохранятся только в URL');
    }
  }, [initialized, settlement, rolls, table]);

  const handleSettlementChange = (next: string | number | null) => {
    if (next === null) return;
    store.setSettlement(next as SettlementType);
  };

  const visibleCategories = table.settlementCategories[settlement];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
          Тип поселения
        </span>
        <Tabs value={settlement} onValueChange={handleSettlementChange}>
          <TabsList>
            {table.settlements.map((s) => (
              <TabsTrigger key={s} value={s}>
                {table.settlementLabels[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Button size="lg" onClick={store.rollAll} data-testid="roll-button">
        Перебросить всё
      </Button>

      {table.categories.map((category, categoryIndex) =>
        visibleCategories.includes(category.key) ? (
          <CategorySection
            key={category.key}
            category={category}
            rolls={rolls ? (rolls[categoryIndex] ?? null) : null}
          />
        ) : null,
      )}
    </div>
  );
}

function readStorage(table: PriceTable): PricesState | null {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY) ?? '', table);
  } catch {
    return null;
  }
}

interface CategorySectionProps {
  category: PriceCategory;
  rolls: PricesRolls[number] | null;
}

function CategorySection({ category, rolls }: CategorySectionProps) {
  const { count, sides } = category.roll;
  const formula = `${count}к${sides}${category.multiplier > 1 ? `×${category.multiplier}` : ''}`;

  return (
    <section data-testid={`category-${category.key}`}>
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-muted">
        {category.ru} · {formula} монет
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {category.items.map((item, itemIndex) => (
              <PriceRow
                key={item.ru}
                category={category}
                item={item}
                faces={rolls ? (rolls[itemIndex] ?? null) : null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface PriceRowProps {
  category: PriceCategory;
  item: PriceItem;
  faces: readonly number[] | null;
}

function PriceRow({ category, item, faces }: PriceRowProps) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-2 py-1.5 text-text">
        {item.ru}
        {item.note ? (
          <span className="ml-2 font-mono text-xs text-text-muted">{item.note}</span>
        ) : null}
      </td>
      <td className="px-2 py-1.5 text-right font-mono" data-testid="item-price">
        <Skeleton loading={faces === null}>
          {faces ? itemPrice(faces, category, item) : 0} мон.
        </Skeleton>
      </td>
    </tr>
  );
}
