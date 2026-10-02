import type { Snippet } from 'svelte';

export const tabsContextKey = Symbol('tabs');

export interface TabsContext {
  value: string | number;
  orientation: 'horizontal' | 'vertical';
  setValue(value: string | number): void;
}

export interface TabsChildrenProps {
  children?: Snippet;
}
