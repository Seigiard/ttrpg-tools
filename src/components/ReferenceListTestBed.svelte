<script lang="ts">
  import ReferenceList from './ReferenceList.svelte';

  type Row = { code: string; outcome: string };

  let { rows, hitIndex }: { rows: Row[]; hitIndex: number | null } = $props();
</script>

<ReferenceList title="Reference" testId="reference-list" {rows} {hitIndex}>
  {#snippet label(row: Row, index: number)}
    {index + 1}: {row.code}
  {/snippet}
  {#snippet children(row: Row)}
    {row.outcome}
  {/snippet}
</ReferenceList>
