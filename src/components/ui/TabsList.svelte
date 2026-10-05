<script lang="ts">
  import { getContext } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cva, type VariantProps } from 'class-variance-authority';
  import { cn } from '@/lib/utils';
  import { tabsContextKey, type TabsChildrenProps, type TabsContext } from './tabs-context';

  const tabsListVariants = cva(
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
    {
      variants: {
        variant: {
          default: 'bg-muted',
          line: 'gap-1 bg-transparent',
        },
      },
      defaultVariants: {
        variant: 'default',
      },
    },
  );

  type Props = HTMLAttributes<HTMLDivElement> &
    TabsChildrenProps &
    VariantProps<typeof tabsListVariants>;

  let { class: className, variant = 'default', children, ...rest }: Props = $props();

  const tabs = getContext<TabsContext>(tabsContextKey);

  function moveFocus(event: KeyboardEvent) {
    const keys =
      tabs.orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];

    if (![...keys, 'Home', 'End'].includes(event.key)) return;

    const list = event.currentTarget;

    if (!(list instanceof HTMLElement)) return;

    const triggers = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );

    if (!triggers.length) return;

    event.preventDefault();

    const current = Math.max(
      0,
      triggers.findIndex((trigger) => trigger === document.activeElement),
    );

    let next = current;

    if (event.key === 'Home') next = 0;

    if (event.key === 'End') next = triggers.length - 1;

    if (event.key === keys[0]) next = (current - 1 + triggers.length) % triggers.length;

    if (event.key === keys[1]) next = (current + 1) % triggers.length;

    triggers[next]?.focus();
    triggers[next]?.click();
  }
</script>

<div
  role="tablist"
  aria-orientation={tabs.orientation}
  data-slot="tabs-list"
  data-variant={variant}
  class={cn(tabsListVariants({ variant }), className)}
  onkeydown={moveFocus}
  {...rest}
>
  {@render children?.()}
</div>
