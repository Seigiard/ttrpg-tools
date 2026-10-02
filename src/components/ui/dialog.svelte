<script lang="ts">
  import { setContext } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { dialogContextKey, type DialogChildrenProps, type DialogContext } from './dialog-context';

  type Props = HTMLAttributes<HTMLDivElement> &
    DialogChildrenProps & {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    };

  let { open = false, onOpenChange, children }: Props = $props();

  const dialog: DialogContext = $state({
    open: false,
    titleId: `dialog-title-${Math.random().toString(36).slice(2)}`,
    previouslyFocused: null,
    setOpen(next) {
      if (next && !dialog.open) {
        dialog.previouslyFocused = document.activeElement as HTMLElement | null;
      }
      dialog.open = next;
      onOpenChange?.(next);
    },
  });

  setContext(dialogContextKey, dialog);

  $effect(() => {
    if (open && !dialog.open) {
      dialog.previouslyFocused = document.activeElement as HTMLElement | null;
    }
    dialog.open = open;
  });
</script>

{@render children?.()}
