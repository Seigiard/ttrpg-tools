<script lang="ts" generics="Biome extends string">
  import { onMount } from 'svelte';
  import ReferenceList from '@/components/ReferenceList.svelte';
  import { RefreshCw } from '@/components/icons';
  import Button from '@/components/ui/button.svelte';
  import Card from '@/components/ui/card.svelte';
  import CardContent from '@/components/ui/CardContent.svelte';
  import CardHeader from '@/components/ui/CardHeader.svelte';
  import Skeleton from '@/components/ui/skeleton.svelte';
  import Tabs from '@/components/ui/tabs.svelte';
  import TabsList from '@/components/ui/TabsList.svelte';
  import TabsTrigger from '@/components/ui/TabsTrigger.svelte';
  import type { LocationRow, LocationTable } from '@/data/types';
  import { createLocationStore } from '@/stores/location-store';

  const { table }: { table: LocationTable<Biome> } = $props();
  // svelte-ignore state_referenced_locally -- Astro passes static table data; live table swaps should remount with a key.
  const store = createLocationStore(table);
  const biomeStore = store.$biome;
  const rollStore = store.$roll;

  onMount(() => {
    if (store.$roll.get() === null) store.rollAll();
  });

  let biome = $derived($biomeStore);
  let roll = $derived($rollStore);
  let landmark = $derived(roll ? table.landmarks[biome].rows[roll.landmarkIndex] : null);
  let detail = $derived(roll ? table.details.rows[roll.detailIndex] : null);
  let highlightLandmark = $derived(roll && roll.biome === biome ? roll.landmarkIndex : null);
  let highlightDetail = $derived(roll ? roll.detailIndex : null);
</script>

<div class="space-y-8">
  <div class="space-y-3">
    <span class="font-mono text-xs uppercase tracking-wider text-text-muted">Биом</span>
    <Tabs value={biome} onValueChange={(next) => store.setBiome(next as Biome)}>
      <TabsList>
        {#each table.biomes as b}
          <TabsTrigger value={b}>{table.biomeLabels[b]}</TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
  </div>

  <Button size="lg" onclick={store.rollAll} data-testid="roll-button">Бросить локацию</Button>

  <Card data-testid="result-card">
    <CardHeader>
      <div class="flex items-center justify-between gap-4">
        <span class="font-mono text-xs uppercase tracking-wider text-text-muted">
          Локация · {table.biomeLabels[biome]}
        </span>
        <span class="font-mono text-xs text-text-muted">
          d20 / d20 = <Skeleton loading={!roll}
            >{roll ? `${roll.landmarkIndex + 1} / ${roll.detailIndex + 1}` : '0 / 0'}</Skeleton
          >
        </span>
      </div>
    </CardHeader>
    <CardContent>
      <div class="grid gap-6 md:grid-cols-2">
        <section data-testid="result-landmark">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="font-mono text-xs uppercase tracking-wider text-text-muted">Ориентир</h3>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Перебросить ориентир"
              onclick={store.rerollLandmark}
            >
              <RefreshCw />
            </Button>
          </div>
          <p class="font-display text-2xl text-text">
            <Skeleton loading={!landmark}>{landmark ? landmark.ru : 'Ориентир'}</Skeleton>
          </p>
        </section>

        <section data-testid="result-detail">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="font-mono text-xs uppercase tracking-wider text-text-muted">Деталь</h3>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Перебросить деталь"
              onclick={store.rerollDetail}
            >
              <RefreshCw />
            </Button>
          </div>
          <p class="font-display text-2xl text-text">
            <Skeleton loading={!detail}>{detail ? detail.ru : 'Деталь'}</Skeleton>
          </p>
          {#if detail?.question}
            <em class="mt-2 block text-sm text-text-muted">{detail.question}</em>
          {/if}
        </section>
      </div>
    </CardContent>
  </Card>

  <div class="grid gap-8 md:grid-cols-2">
    <ReferenceList
      title={`Ориентир · ${table.biomeLabels[biome]}`}
      rows={table.landmarks[biome].rows}
      hitIndex={highlightLandmark}
      testId="reference-landmarks"
    >
      {#snippet label(_: LocationRow, i: number)}{i + 1}{/snippet}
      {#snippet children(row: LocationRow)}{row.ru}{/snippet}
    </ReferenceList>
    <ReferenceList
      title="Деталь локации"
      rows={table.details.rows}
      hitIndex={highlightDetail}
      testId="reference-details"
    >
      {#snippet label(_: LocationRow, i: number)}{i + 1}{/snippet}
      {#snippet children(row: LocationRow)}{row.ru}{/snippet}
    </ReferenceList>
  </div>
</div>
