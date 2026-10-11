import { cva, type VariantProps } from 'class-variance-authority';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs as TabsPrimitive,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from 'react-aria-components';

import { cn } from '@/lib/utils';

function Tabs({
  className,
  orientation = 'horizontal',
  value,
  onValueChange,
  ...props
}: Omit<TabsProps, 'onSelectionChange' | 'selectedKey'> & {
  value?: string | number;
  onValueChange?: (value: string | number) => void;
}) {
  return (
    <TabsPrimitive
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
      orientation={orientation}
      keyboardActivation="manual"
      selectedKey={value}
      onSelectionChange={onValueChange}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-lg p-[3px] text-muted-foreground group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
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

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabListProps<object> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabList
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, value, ...props }: Omit<TabProps, 'id'> & { value: string }) {
  return (
    <Tab
      data-slot="tabs-trigger"
      id={value}
      className={cn(
        "relative inline-flex min-h-11 min-w-11 flex-auto items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-sm font-medium whitespace-nowrap text-text-muted transition-colors duration-150 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground active:bg-background active:text-foreground disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pe-1 has-data-[icon=inline-start]:ps-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=default]/tabs-list:data-selected:shadow-sm group-data-[variant=line]/tabs-list:data-selected:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.2cap]",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-selected:bg-transparent',
        'data-selected:bg-primary data-selected:text-primary-foreground group-data-[variant=default]/tabs-list:data-selected:hover:bg-primary-hover group-data-[variant=default]/tabs-list:data-selected:hover:text-primary-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:inset-be-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-inset-e-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-selected:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  value,
  ...props
}: Omit<TabPanelProps, 'id'> & { value: string }) {
  return (
    <TabPanel
      data-slot="tabs-content"
      id={value}
      className={cn('min-w-0 flex-1 text-sm', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
