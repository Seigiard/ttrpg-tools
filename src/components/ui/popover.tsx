import type { ReactNode } from 'react';
import {
  Dialog,
  DialogTrigger,
  Popover as PopoverPrimitive,
  type DialogProps,
  type DialogTriggerProps,
  type PopoverProps as PopoverPrimitiveProps,
} from 'react-aria-components';

import { cn } from '@/lib/utils';

function PopoverTrigger({ children, ...props }: DialogTriggerProps) {
  return (
    <DialogTrigger data-slot="popover-trigger" {...props}>
      {children}
    </DialogTrigger>
  );
}

function Popover({
  className,
  placement = 'bottom',
  offset = 4,
  crossOffset = 0,
  ...props
}: Omit<PopoverPrimitiveProps, 'className'> & {
  className?: string;
}) {
  return (
    <PopoverPrimitive
      data-slot="popover-content"
      placement={placement}
      offset={offset}
      crossOffset={crossOffset}
      className={cn(
        'z-50 flex w-72 origin-(--trigger-anchor-point) flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-entering:animate-in data-entering:fade-in-0 motion-safe:data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 motion-safe:data-exiting:zoom-out-95 motion-safe:data-[placement=bottom]:slide-in-from-top-2 motion-safe:data-[placement=left]:slide-in-from-right-2 motion-safe:data-[placement=right]:slide-in-from-left-2 motion-safe:data-[placement=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  );
}

function PopoverContent({ className, children, ...props }: DialogProps & { children?: ReactNode }) {
  return (
    <Dialog data-slot="popover-dialog" className={cn('outline-hidden', className)} {...props}>
      {children}
    </Dialog>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
