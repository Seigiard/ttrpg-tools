<script lang="ts">
  let count = $state(0);
</script>

<button
  class="rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90"
  data-count={count}
  data-testid="svelte-hydration-probe"
  type="button"
  onclick={() => {
    count += 1;
  }}
>
  Svelte island ready: {count}
</button>
