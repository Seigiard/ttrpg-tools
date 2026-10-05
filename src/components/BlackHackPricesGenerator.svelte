<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/ui/button.svelte';
  import Skeleton from '@/components/ui/skeleton.svelte';
  import Tabs from '@/components/ui/tabs.svelte';
  import TabsList from '@/components/ui/TabsList.svelte';
  import TabsTrigger from '@/components/ui/TabsTrigger.svelte';
  import { parse, serialize, type PricesState } from '@/data/the-black-hack/prices-codec';
  import type { PriceCategory, PriceItem, PriceTable } from '@/data/types';
  import {
    createPricesStore,
    itemPrice,
    type PricesRolls,
  } from '@/stores/the-black-hack-prices-store';

  const STORAGE_KEY = 'the-black-hack:prices';

  const { table }: { table: PriceTable } = $props();

  // svelte-ignore state_referenced_locally (Astro passes static table data; live table swaps should remount with a key.)
  const store = createPricesStore(table);

  const settlementStore = store.$settlement;

  const seedStore = store.$seed;

  const rollsStore = store.$rolls;

  let initialized = $state(false);

  let settlement = $derived($settlementStore);

  let seed = $derived($seedStore);

  let rolls = $derived($rollsStore);

  let visibleCategories = $derived(table.settlementCategories[settlement]);

  function readStorage(): PricesState | null {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);

      return value ? parse(value, table) : null;
    } catch {
      return null;
    }
  }

  onMount(() => {
    if (store.$seed.get() === null) {
      const state = parse(window.location.search, table) ?? readStorage();

      if (state) {
        store.hydrate(state);
      } else {
        store.rollAll();
      }
    }

    initialized = true;
  });

  $effect(() => {
    if (!initialized || seed === null) return;
    const query = serialize({ settlement, seed }, table);

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
  });

  function setSettlement(next: string | number) {
    const selected = table.settlements.find((candidate) => candidate === next);

    if (selected !== undefined) store.setSettlement(selected);
  }

  function categoryRolls(allRolls: PricesRolls | null, categoryIndex: number) {
    return allRolls ? allRolls[categoryIndex] : null;
  }

  function priceText(category: PriceCategory, item: PriceItem, faces: readonly number[] | null) {
    return `${faces ? itemPrice(faces, category, item) : 0} мон.`;
  }
</script>

<div class="space-y-8">
  <div class="space-y-3">
    <span class="font-mono text-xs uppercase tracking-wider text-text-muted">Тип поселения</span>
    <Tabs value={settlement} onValueChange={setSettlement}>
      <TabsList>
        {#each table.settlements as s (s)}
          <TabsTrigger value={s}>{table.settlementLabels[s]}</TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
  </div>

  <Button size="lg" onclick={store.rollAll} data-testid="roll-button">Перебросить всё</Button>

  <div class="space-y-8">
    {#each table.categories as category, categoryIndex (category.key)}
      {#if visibleCategories.includes(category.key)}
        {@const categoryFaces = categoryRolls(rolls, categoryIndex)}
        {@const formula = `${category.roll.count}к${category.roll.sides}${category.multiplier > 1 ? `×${category.multiplier}` : ''}`}
        <section data-testid={`category-${category.key}`}>
          <h3 class="font-mono text-xs uppercase tracking-wider text-text-muted">
            {category.ru} · {formula} монет
          </h3>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full border-collapse text-sm">
              <tbody>
                {#each category.items as item, itemIndex (itemIndex)}
                  {@const faces = categoryFaces ? categoryFaces[itemIndex] : null}
                  <tr class="border-b border-border last:border-0">
                    <td class="px-2 py-1.5 text-text">
                      {item.ru}
                      {#if item.note}
                        <span class="ml-2 font-mono text-xs text-text-muted">{item.note}</span>
                      {/if}
                    </td>
                    <td class="px-2 py-1.5 text-right font-mono" data-testid="item-price">
                      <Skeleton loading={faces === null}
                        >{priceText(category, item, faces)}</Skeleton
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {/each}
  </div>
</div>
