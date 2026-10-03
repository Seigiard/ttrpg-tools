<script lang="ts" generics="Row">
  import type { Snippet } from 'svelte';
  import { referenceHitClass } from './reference-list';

  interface Props {
    title: string;
    testId: string;
    rows: readonly Row[];
    hitIndex: number | null;
    label: Snippet<[Row, number]>;
    children: Snippet<[Row]>;
  }

  let { title, testId, rows, hitIndex, label, children }: Props = $props();
</script>

<section data-testid={testId}>
  <h3 class="font-mono text-xs uppercase tracking-wider text-text-muted">{title}</h3>
  <ul class="mt-3 grid grid-cols-[max-content_1fr] divide-y divide-border">
    {#each rows as row, i}
      <li
        data-row-index={i}
        data-hit={i === hitIndex ? 'true' : undefined}
        class={`col-span-2 grid grid-cols-subgrid gap-3 px-2 py-1.5 ${referenceHitClass(i === hitIndex)}`}
      >
        <span class="font-mono text-xs">{@render label(row, i)}</span>
        <span class="text-sm">{@render children(row)}</span>
      </li>
    {/each}
  </ul>
</section>
