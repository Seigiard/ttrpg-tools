<script lang="ts">
  import type { CardPartProps } from './card.svelte';
  import { cn } from '@/lib/utils';

  let { class: className, children, ...rest }: CardPartProps = $props();
</script>

<div data-slot="card-content" class={cn('px-(--card-spacing)', className)} {...rest}>
  {@render children?.()}
</div>
