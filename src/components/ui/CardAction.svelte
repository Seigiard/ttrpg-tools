<script lang="ts">
  import type { CardPartProps } from './card.svelte';
  import { cn } from '@/lib/utils';

  let { class: className, children, ...rest }: CardPartProps = $props();
</script>

<div
  data-slot="card-action"
  class={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
  {...rest}
>
  {@render children?.()}
</div>
