<script lang="ts">
  import { onMount } from 'svelte';
  import ReferenceList from '@/components/ReferenceList.svelte';
  import Button from '@/components/ui/button.svelte';
  import Card from '@/components/ui/card.svelte';
  import CardContent from '@/components/ui/CardContent.svelte';
  import CardHeader from '@/components/ui/CardHeader.svelte';
  import Skeleton from '@/components/ui/skeleton.svelte';
  import { formatRangeLabel } from '@/data/range-table';
  import type {
    EncounterCheckOutcome,
    EncounterCheckRow,
    EncounterTable,
    ReactionRow,
  } from '@/data/types';
  import { createEncounterStore } from '@/stores/encounter-store';

  const { table }: { table: EncounterTable } = $props();

  // svelte-ignore state_referenced_locally (Astro passes static table data; live table swaps should remount with a key.)
  const store = createEncounterStore(table);

  const checkStore = store.$check;

  const reactionStore = store.$reaction;

  let checkHistory = $state<Array<{ sum: number; label: string }>>([]);

  const outcomeTone: Record<EncounterCheckOutcome, string> = {
    encounter: 'text-secondary',
    omen: 'text-warning',
    clear: 'text-text-muted',
  };

  function rollCheck() {
    store.rollCheck();
    const nextCheck = store.$check.get();

    if (!nextCheck) return;

    checkHistory = [
      { sum: nextCheck.sum, label: table.check.rows[nextCheck.rowIndex]!.ru },
      ...checkHistory,
    ].slice(0, 5);
  }

  onMount(() => {
    if (store.$check.get() === null) rollCheck();

    if (store.$reaction.get() === null) store.rollReaction();
  });

  let check = $derived($checkStore);

  let reaction = $derived($reactionStore);

  let checkRow = $derived(check ? table.check.rows[check.rowIndex] : null);

  let reactionRow = $derived(reaction ? table.reactions.rows[reaction.rowIndex] : null);
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <h2 class="font-display text-2xl text-text">Проверка столкновения</h2>
    <Button size="lg" onclick={rollCheck} data-testid="check-roll-button">Проверить (d6)</Button>

    <Card data-testid="check-result-card">
      <CardHeader>
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-wider text-text-muted">Проверка</span>
          <span class="font-mono text-xs text-text-muted">
            d6 = <Skeleton loading={!checkRow}>{check ? check.sum : 0}</Skeleton>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div data-testid="check-result" data-outcome={checkRow?.outcome}>
          <p
            class={`font-display text-3xl ${checkRow ? outcomeTone[checkRow.outcome] : 'text-text-muted'}`}
          >
            <Skeleton loading={!checkRow}>{checkRow ? checkRow.ru : 'Проверка'}</Skeleton>
          </p>
          <p class="mt-2 text-sm text-text-muted">
            <Skeleton loading={!checkRow}
              >{checkRow ? checkRow.hint : 'Бросаем кубик столкновения этой зоны…'}</Skeleton
            >
          </p>
        </div>
      </CardContent>
    </Card>

    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-display text-lg text-text">Последние проверки</h3>
        <Button
          variant="outline"
          size="sm"
          onclick={() => (checkHistory = [])}
          data-testid="check-history-clear"
        >
          Очистить
        </Button>
      </div>
      <ul class="space-y-2" data-testid="check-history">
        {#each checkHistory as item, index (`${item.sum}-${item.label}-${index}`)}
          <li
            class="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <!-- prettier-ignore -->
            <span class="font-mono text-xs text-text-muted">d6 = {item.sum}</span><span
              class="font-semibold text-text">{item.label}</span
            >
          </li>
        {/each}
      </ul>
    </div>

    <ReferenceList
      title="Исходы · d6"
      testId="check-reference"
      rows={table.check.rows}
      hitIndex={check ? check.rowIndex : null}
    >
      {#snippet label(row: EncounterCheckRow)}{formatRangeLabel(row)}{/snippet}
      {#snippet children(referenceRow: EncounterCheckRow)}
        <span class="font-semibold text-text">{referenceRow.ru}.</span> {referenceRow.hint}
      {/snippet}
    </ReferenceList>
  </section>

  <section class="space-y-6">
    <h2 class="font-display text-2xl text-text">Реакция</h2>
    <Button size="lg" onclick={store.rollReaction} data-testid="reaction-roll-button">
      Бросить реакцию (2d6)
    </Button>

    <Card data-testid="reaction-result-card">
      <CardHeader>
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-wider text-text-muted">Реакция</span>
          <span class="font-mono text-xs text-text-muted">
            2d6 = <Skeleton loading={!reactionRow}>{reaction ? reaction.sum : 0}</Skeleton>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div data-testid="reaction-result">
          <p class="font-display text-3xl">
            <Skeleton loading={!reactionRow}>{reactionRow ? reactionRow.ru : 'Реакция'}</Skeleton>
          </p>
          <p class="mt-1 text-sm italic text-text-muted">
            <Skeleton loading={!reactionRow}>
              <em>{reactionRow ? reactionRow.question : 'Как существо относится к мышам?'}</em>
            </Skeleton>
          </p>
        </div>
      </CardContent>
    </Card>

    <ReferenceList
      title="Отношение · 2d6"
      testId="reaction-reference"
      rows={table.reactions.rows}
      hitIndex={reaction ? reaction.rowIndex : null}
    >
      {#snippet label(row: ReactionRow)}{formatRangeLabel(row)}{/snippet}
      {#snippet children(referenceRow: ReactionRow)}
        <span class="font-semibold text-text">{referenceRow.ru}.</span>
        <span class="italic">{referenceRow.question}</span>
      {/snippet}
    </ReferenceList>
  </section>
</div>
