<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/ui/button.svelte';
  import Card from '@/components/ui/card.svelte';
  import CardContent from '@/components/ui/CardContent.svelte';
  import CardHeader from '@/components/ui/CardHeader.svelte';
  import Skeleton from '@/components/ui/skeleton.svelte';
  import Tabs from '@/components/ui/tabs.svelte';
  import TabsList from '@/components/ui/TabsList.svelte';
  import TabsTrigger from '@/components/ui/TabsTrigger.svelte';
  import { formatRangeLabel, type RangePick } from '@/data/range-table';
  import type { Season, WeatherTable } from '@/data/types';
  import { createWeatherStore } from '@/stores/weather-store';
  import { referenceHitClass } from './reference-list';

  const { table }: { table: WeatherTable } = $props();
  // svelte-ignore state_referenced_locally -- Astro passes static table data; live table swaps should remount with a key.
  const store = createWeatherStore(table);
  const seasonStore = store.$season;
  const rollStore = store.$roll;

  onMount(() => {
    if (store.$roll.get() === null) store.rollWeather();
  });

  let season = $derived($seasonStore);
  let roll = $derived($rollStore);
  let cell = $derived(roll ? table.rows[roll.rowIndex]?.cells[season] : null);
  let loading = $derived(!cell);
</script>

<div class="space-y-8">
  <div class="space-y-3">
    <span class="font-mono text-xs uppercase tracking-wider text-text-muted">Сезон</span>
    <Tabs value={season} onValueChange={(next) => store.setSeason(next as Season)}>
      <TabsList>
        {#each table.seasons as s}
          <TabsTrigger value={s}>{table.seasonLabels[s]}</TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
  </div>

  <Button size="lg" onclick={store.rollWeather} data-testid="roll-button">Бросить погоду</Button>

  <Card data-testid="result-card">
    <CardHeader>
      <div class="flex items-center justify-between">
        <span class="font-mono text-xs uppercase tracking-wider text-text-muted">
          Погода · {table.seasonLabels[season]}
        </span>
        <span class="font-mono text-xs text-text-muted">
          2d6 = <Skeleton {loading}>{roll ? roll.sum : 0}</Skeleton>
        </span>
      </div>
    </CardHeader>
    <CardContent>
      <div data-testid="result-weather" data-harsh={cell?.harsh ? 'true' : undefined}>
        <p class="font-display text-3xl">
          <Skeleton {loading}>{cell ? cell.ru : 'Погода'}</Skeleton>
        </p>
        {#if cell?.harsh}
          <p class="mt-3 text-sm text-warning">
            Не подходит для путешествия. За каждую вахту в пути каждая мышь проходит спасбросок силы
            или получает карточку состояния «Изнурён».
          </p>
        {/if}
      </div>
    </CardContent>
  </Card>

  <section data-testid="reference-weather">
    <h3 class="font-mono text-xs uppercase tracking-wider text-text-muted">Таблица погоды · 2d6</h3>
    <div class="mt-3 overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-border">
            <th
              class="px-2 py-2 text-left font-mono text-xs font-medium uppercase tracking-wider text-text-muted"
            >
              2d6
            </th>
            {#each table.seasons as s}
              <th
                data-season={s}
                class={`px-2 py-2 text-left font-mono text-xs font-medium uppercase tracking-wider ${s === season ? 'text-primary' : 'text-text-muted'}`}
              >
                {table.seasonLabels[s]}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each table.rows as row, i}
            {@const rangeLabel = formatRangeLabel(row)}
            {@const isHitRow = i === roll?.rowIndex}
            <tr data-row-index={i} class="border-b border-border last:border-0">
              <td class="px-2 py-1.5 font-mono text-xs text-text-muted">{rangeLabel}</td>
              {#each table.seasons as s}
                {@const c = row.cells[s]}
                {@const isHit = isHitRow && s === season}
                {@const tone = !isHit && s === season ? 'text-text' : referenceHitClass(isHit)}
                <td
                  data-season={s}
                  data-hit={isHit ? 'true' : undefined}
                  class={`px-2 py-1.5 ${c.harsh ? 'font-semibold' : ''} ${tone}`}
                >
                  {c.ru}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-text-muted">
      <span class="font-semibold text-text">Жирным</span> — погода, не подходящая для путешествия.
    </p>
  </section>
</div>
