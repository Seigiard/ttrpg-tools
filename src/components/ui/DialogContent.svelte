<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { cn } from '@/lib/utils';
  import { dialogContextKey, type DialogContext } from './dialog-context';

  type Props = HTMLAttributes<HTMLDivElement> & {
    children?: Snippet;
    finalFocus?: HTMLElement | null;
  };

  let { class: className, children, finalFocus = null, ...rest }: Props = $props();
  const dialog = getContext<DialogContext>(dialogContextKey);
  let element = $state<HTMLDialogElement>();

  const focusableSelector = [
    'a[href]:not([tabindex="-1"])',
    'button:not(:disabled):not([tabindex="-1"])',
    'input:not(:disabled):not([tabindex="-1"])',
    'select:not(:disabled):not([tabindex="-1"])',
    'textarea:not(:disabled):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function restoreFocus() {
    const target = finalFocus ?? dialog.previouslyFocused;
    dialog.previouslyFocused = null;
    target?.focus();
  }

  function close() {
    if (element?.open) element.close();
    dialog.setOpen(false);
    restoreFocus();
  }

  function trapFocus(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    if (!element) return;

    const focusable = Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (node) => !node.hasAttribute('disabled'),
    );
    if (!focusable.length) {
      event.preventDefault();
      element.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  $effect(() => {
    if (!element) return;
    if (dialog.open && !element.open) {
      element.showModal();
      const current = element;
      tick().then(() => {
        const target = current.querySelector<HTMLElement>(focusableSelector) ?? current;
        target.focus();
      });
      return () => {
        if (!dialog.open || !current.open) return;
        current.close();
        restoreFocus();
      };
    } else if (!dialog.open && element.open) {
      element.close();
      restoreFocus();
    }
  });
</script>

{#if dialog.open}
  <dialog
    bind:this={element}
    aria-labelledby={dialog.titleId}
    class="fixed inset-0 m-0 h-screen w-screen max-h-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60"
    oncancel={(event) => {
      event.preventDefault();
      close();
    }}
    onkeydown={trapFocus}
  >
    <button
      type="button"
      aria-label="Закрыть диалог"
      tabindex="-1"
      class="fixed inset-0 z-50 cursor-default bg-transparent"
      onclick={close}
    ></button>
    <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class={cn(
          'pointer-events-auto max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-surface p-4 shadow-xl',
          className,
        )}
        {...rest}
      >
        {@render children?.()}
      </div>
    </div>
  </dialog>
{/if}
