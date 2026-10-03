import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, type ComponentChildren, type JSX } from 'preact';
import { useContext, useId, useState } from 'preact/hooks';

import { cn } from '@/lib/utils';

type TabValue = string | number;

interface TabsContextValue {
  value: TabValue | null;
  setValue: (value: TabValue) => void;
  focusedTabId: string | null;
  setFocusedTabId: (id: string) => void;
  orientation: 'horizontal' | 'vertical';
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function tabId(baseId: string, value: TabValue) {
  return `${baseId}-tab-${String(value)}`;
}

function panelId(baseId: string, value: TabValue) {
  return `${baseId}-panel-${String(value)}`;
}

type DivProps = JSX.IntrinsicElements['div'];
type ButtonProps = JSX.IntrinsicElements['button'];
type ButtonKeyDownEvent = Parameters<NonNullable<ButtonProps['onKeyDown']>>[0];

interface TabsProps extends Omit<DivProps, 'onChange'> {
  value?: TabValue | null;
  defaultValue?: TabValue;
  onValueChange?: (value: TabValue) => void;
  orientation?: 'horizontal' | 'vertical';
}

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  orientation = 'horizontal',
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState<TabValue | null>(defaultValue ?? null);
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);
  const currentValue = value !== undefined ? value : uncontrolledValue;

  const setValue = (next: TabValue) => {
    if (value === undefined) {
      setUncontrolledValue(next);
    }
    setFocusedTabId(tabId(baseId, next));
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue, focusedTabId, setFocusedTabId, orientation, baseId }}>
      <div
        data-slot="tabs"
        data-orientation={orientation}
        data-horizontal={orientation === 'horizontal' ? '' : undefined}
        data-vertical={orientation === 'vertical' ? '' : undefined}
        className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

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

interface TabsListProps extends DivProps, VariantProps<typeof tabsListVariants> {}

function TabsList({ className, variant = 'default', ...props }: TabsListProps) {
  const context = useContext(TabsContext);
  return (
    <div
      role="tablist"
      aria-orientation={context?.orientation}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

interface TabsTriggerProps extends Omit<ButtonProps, 'value'> {
  value: TabValue;
}

function TabsTrigger({ className, value, disabled, onClick, onKeyDown, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used inside Tabs');
  const selected = context.value === value;
  const id = tabId(context.baseId, value);

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId(context.baseId, value)}
      aria-selected={selected}
      disabled={disabled}
      tabIndex={(context.focusedTabId ?? (selected ? id : null)) === id ? 0 : -1}
      data-slot="tabs-trigger"
      data-active={selected ? '' : undefined}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) context.setValue(value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        moveFocus(event, context.orientation, context.setFocusedTabId);
      }}
      {...props}
    />
  );
}

interface TabsContentProps extends DivProps {
  value: TabValue;
  children?: ComponentChildren;
}

function TabsContent({ className, value, ...props }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used inside Tabs');
  const selected = context.value === value;
  return (
    <div
      role="tabpanel"
      id={panelId(context.baseId, value)}
      aria-labelledby={tabId(context.baseId, value)}
      hidden={!selected}
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  );
}

function moveFocus(
  event: ButtonKeyDownEvent,
  orientation: 'horizontal' | 'vertical',
  setFocusedTabId: (id: string) => void,
) {
  const forwardKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backwardKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  if (event.key !== forwardKey && event.key !== backwardKey && event.key !== 'Home' && event.key !== 'End') {
    return;
  }

  const list = event.currentTarget.closest('[role="tablist"]');
  const tabs = Array.from(list?.querySelectorAll('[role="tab"]:not(:disabled)') ?? []) as HTMLButtonElement[];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex === -1 || tabs.length === 0) return;

  event.preventDefault();
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === forwardKey
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  if (!next) return;
  setFocusedTabId(next.id);
  next.focus();
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
