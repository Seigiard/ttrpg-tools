import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const selectItemClassName =
  'relative flex min-h-11 cursor-default items-center gap-2 rounded-md px-3 py-2 pr-9 text-left text-sm text-text outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-text data-disabled:pointer-events-none data-disabled:opacity-50';

function Select<Value>({ ...props }: SelectPrimitive.Root.Props<Value>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 text-left text-text outline-none focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectContent({ className, children, ...props }: SelectPrimitive.List.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className="z-50 max-w-[calc(100vw-1rem)]" sideOffset={4}>
        <SelectPrimitive.Popup
          className="w-(--anchor-width) min-w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-surface-elevated text-text shadow-md outline-none"
          finalFocus
        >
          <SelectPrimitive.List
            data-slot="select-content"
            className={cn('max-h-(--available-height) overflow-y-auto p-1', className)}
            {...props}
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, value, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-value={typeof value === 'string' ? value : undefined}
      className={cn(selectItemClassName, className)}
      value={value}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        className="absolute right-3 flex size-4 items-center justify-center"
        data-slot="select-item-indicator"
      >
        <CheckIcon aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, selectItemClassName };
