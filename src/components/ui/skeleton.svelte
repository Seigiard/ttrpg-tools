<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { cn } from '@/lib/utils';

  type Props = HTMLAttributes<HTMLSpanElement> & {
    loading?: boolean;
    children?: Snippet;
  };

  let { loading = false, class: className, children, ...rest }: Props = $props();
</script>

<span
  data-slot="skeleton"
  data-loading={loading ? 'true' : undefined}
  aria-hidden={loading ? 'true' : undefined}
  class={cn(
    'rounded-md',
    loading &&
      'inline-block animate-pulse cursor-default bg-text-muted/20 text-transparent shrink-0 select-none pointer-events-none [&_*]:invisible',
    className,
  )}
  {...rest}
>
  {@render children?.()}
</span>
