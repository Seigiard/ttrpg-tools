<script lang="ts">
  import ReferenceList from '@/components/ReferenceList.svelte';

  type Row = { code: string; outcome: string };

  let {
    rows,
    hitIndex,
  }: {
    rows: readonly Row[];
    hitIndex: number | null;
  } = $props();
</script>

<ReferenceList title="Outcomes" testId="reference" {rows} {hitIndex}>
  {#snippet label(row: Row, i: number)}
    {i + 1}: {row.code}
  {/snippet}

  {#snippet children(row: Row)}
    <em>{row.outcome}</em>
  {/snippet}
</ReferenceList>
