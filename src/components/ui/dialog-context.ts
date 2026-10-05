import type { Snippet } from 'svelte';

export const dialogContextKey = Symbol('dialog');

export interface DialogContext {
  open: boolean;
  titleId: string;
  previouslyFocused: HTMLElement | null;
  setOpen(open: boolean): void;
}

export interface DialogChildrenProps {
  children?: Snippet;
}
