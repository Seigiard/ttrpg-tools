<script lang="ts">
  import { getContext } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { dialogContextKey, type DialogContext } from './dialog-context';

  type Props = HTMLAttributes<HTMLHeadingElement> & {
    children?: Snippet;
  };

  let { children, ...rest }: Props = $props();

  const dialog = getContext<DialogContext>(dialogContextKey);
</script>

<h2 id={dialog.titleId} {...rest}>
  {@render children?.()}
</h2>
