<script lang="ts">
  import type { CardPartProps } from './card.svelte';
  import { cn } from '@/lib/utils';

  let { class: className, children, ...rest }: CardPartProps = $props();
</script>

<div
  data-slot="card-footer"
  class={cn('flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)', className)}
  {...rest}
>
  {@render children?.()}
</div>
