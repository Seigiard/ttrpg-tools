<script lang="ts">
  import { setContext } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';
  import { tabsContextKey, type TabsChildrenProps, type TabsContext } from './tabs-context';

  type Props = HTMLAttributes<HTMLDivElement> &
    TabsChildrenProps & {
      value: string | number;
      orientation?: 'horizontal' | 'vertical';
      onValueChange?: (value: string | number) => void;
    };

  let {
    class: className,
    value,
    orientation = 'horizontal',
    onValueChange,
    children,
    ...rest
  }: Props = $props();

  const tabs: TabsContext = $state({
    value: '',
    orientation: 'horizontal',
    setValue(next) {
      tabs.value = next;
      onValueChange?.(next);
    },
  });

  setContext(tabsContextKey, tabs);

  $effect(() => {
    tabs.value = value;
    tabs.orientation = orientation;
  });
</script>

<div
  data-slot="tabs"
  data-orientation={orientation}
  data-horizontal={orientation === 'horizontal' ? '' : undefined}
  data-vertical={orientation === 'vertical' ? '' : undefined}
  class={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
  {...rest}
>
  {@render children?.()}
</div>
