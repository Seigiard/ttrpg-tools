<script lang="ts">
  import { getContext } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { cn } from '@/lib/utils';
  import { tabsContextKey, type TabsContext } from './tabs-context';

  type Props = HTMLAttributes<HTMLDivElement> & {
    value: string | number;
    children?: Snippet;
  };

  let { class: className, value, children, ...rest }: Props = $props();

  const tabs = getContext<TabsContext>(tabsContextKey);

  let active = $derived(tabs.value === value);
</script>

{#if active}
  <div
    role="tabpanel"
    data-slot="tabs-content"
    class={cn('flex-1 text-sm outline-none', className)}
    {...rest}
  >
    {@render children?.()}
  </div>
{/if}
