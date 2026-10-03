<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { cn } from '@/lib/utils';

  export type CardPartProps = HTMLAttributes<HTMLElement> & {
    children?: Snippet;
  };
</script>

<script lang="ts">
  type Props = HTMLAttributes<HTMLDivElement> & {
    size?: 'default' | 'sm';
    children?: Snippet;
  };

  let { class: className, size = 'default', children, ...rest }: Props = $props();
</script>

<div
  data-slot="card"
  data-size={size}
  class={cn(
    'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
    className,
  )}
  {...rest}
>
  {@render children?.()}
</div>
