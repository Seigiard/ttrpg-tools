<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { dialogContextKey, type DialogChildrenProps, type DialogContext } from './dialog-context';

  type Props = HTMLAttributes<HTMLDivElement> &
    DialogChildrenProps & {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    };

  let { open = false, onOpenChange, children }: Props = $props();

  const dialog: DialogContext = $state({
    open: untrack(() => open),
    titleId: `dialog-title-${Math.random().toString(36).slice(2)}`,
    previouslyFocused: null,
    setOpen(next) {
      if (next && !dialog.open) {
        dialog.previouslyFocused =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }

      dialog.open = next;
      onOpenChange?.(next);
    },
  });

  setContext(dialogContextKey, dialog);

  $effect(() => {
    if (open && !dialog.open) {
      dialog.previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    dialog.open = open;
  });
</script>

{@render children?.()}
