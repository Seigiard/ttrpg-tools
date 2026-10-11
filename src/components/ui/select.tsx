import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select as SelectPrimitive,
  SelectValue as SelectValuePrimitive,
  type ButtonProps,
  type ListBoxItemProps,
  type ListBoxProps,
  type SelectProps,
  type SelectValueProps,
} from 'react-aria-components';

import { cn } from '@/lib/utils';

const selectItemClassName =
  'relative flex min-h-11 cursor-default items-center gap-2 rounded-md px-3 py-2 pr-9 text-left text-sm text-text outline-hidden select-none data-[focused]:bg-muted data-[focused]:text-text data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

function Select({ ...props }: SelectProps<string>) {
  return <SelectPrimitive data-slot="select" {...props} />;
}

function SelectTrigger({
  className,
  children,
  title,
  'aria-label': ariaLabel,
  ...props
}: Omit<ButtonProps, 'children'> & { children?: ReactNode; title?: string }) {
  return (
    <Button
      data-slot="select-trigger"
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 text-left text-text outline-none focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      render={(buttonProps) => {
        const { 'aria-labelledby': _, ...domProps } = buttonProps;

        return <button {...domProps} aria-label={ariaLabel} title={title} />;
      }}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </Button>
  );
}

function SelectValue({ ...props }: SelectValueProps<string>) {
  return <SelectValuePrimitive data-slot="select-value" {...props} />;
}

function SelectContent({ className, children, ...props }: ListBoxProps<string>) {
  return (
    <Popover
      offset={4}
      className="z-50 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-surface-elevated text-text shadow-md outline-none"
    >
      <ListBox
        data-slot="select-content"
        className={cn(
          'max-h-[min(20rem,var(--visual-viewport-height))] overflow-y-auto p-1',
          className,
        )}
        {...props}
      >
        {children}
      </ListBox>
    </Popover>
  );
}

function SelectItem({
  className,
  children,
  value,
  title,
  'aria-description': ariaDescription,
  ...props
}: Omit<ListBoxItemProps<string>, 'id' | 'value'> & {
  value: string;
  title?: string;
  'aria-description'?: string;
}) {
  return (
    <ListBoxItem
      data-slot="select-item"
      data-value={value}
      className={cn(selectItemClassName, className)}
      id={value}
      render={(itemProps) =>
        'href' in itemProps ? (
          <a {...itemProps} aria-description={ariaDescription} title={title} />
        ) : (
          <div {...itemProps} aria-description={ariaDescription} title={title} />
        )
      }
      textValue={typeof children === 'string' ? children : undefined}
      {...props}
    >
      {({ isSelected }) => (
        <>
          <span className="min-w-0 flex-1">{children as ReactNode}</span>
          {isSelected && (
            <span
              className="absolute right-3 flex size-4 items-center justify-center"
              data-slot="select-item-indicator"
            >
              <CheckIcon aria-hidden="true" className="size-4" />
            </span>
          )}
        </>
      )}
    </ListBoxItem>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, selectItemClassName };
