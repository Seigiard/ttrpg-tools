import { cn } from '@/lib/utils';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import {
  Button,
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading,
  type ButtonProps,
  type DisclosureGroupProps,
  type DisclosurePanelProps,
  type DisclosureProps,
} from 'react-aria-components';
import type { ReactNode } from 'react';

function Accordion({ className, ...props }: DisclosureGroupProps) {
  return (
    <DisclosureGroup
      data-slot="accordion"
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  value,
  ...props
}: Omit<DisclosureProps, 'id'> & { value: string }) {
  return (
    <Disclosure
      data-slot="accordion-item"
      id={value}
      className={cn('group/accordion-item not-last:border-be', className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: Omit<ButtonProps, 'children'> & { children?: ReactNode }) {
  return (
    <Heading className="flex">
      <Button
        slot="trigger"
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex min-h-11 flex-1 items-start justify-between gap-2 rounded-lg border border-transparent py-2.5 text-start text-sm font-medium hover:underline active:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ms-auto **:data-[slot=accordion-trigger-icon]:h-[1lh] **:data-[slot=accordion-trigger-icon]:w-[1em] **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
        />
      </Button>
    </Heading>
  );
}

function AccordionContent({ className, children, ...props }: DisclosurePanelProps) {
  return (
    <DisclosurePanel
      data-slot="accordion-content"
      className="overflow-clip text-sm motion-safe:group-data-[expanded]/accordion-item:animate-accordion-down"
      {...props}
    >
      <div
        className={cn(
          'pbs-0 pbe-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mbe-4',
          className,
        )}
      >
        {children}
      </div>
    </DisclosurePanel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
