<script lang="ts">
  import type { CardPartProps } from './card.svelte';
  import { cn } from '@/lib/utils';

  let { class: className, children, ...rest }: CardPartProps = $props();
</script>

<div
  data-slot="card-title"
  class={cn('text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', className)}
  {...rest}
>
  {@render children?.()}
</div>
