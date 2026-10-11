import type { DragEventHandler, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Button as ButtonPrimitive, type ButtonProps } from 'react-aria-components';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex min-h-11 min-w-11 shrink-0 self-start items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.2cap]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-hover aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-danger-subtle text-destructive hover:bg-danger-pressed active:bg-danger-pressed',
        link: 'text-primary underline-offset-4 hover:underline active:text-secondary active:underline',
      },
      size: {
        default:
          'gap-1.5 px-3 py-2 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
        xs: 'gap-1 rounded-md px-2 py-2 text-xs',
        sm: 'gap-1 rounded-md px-2.5 py-2 text-sm',
        lg: 'min-h-12 gap-1.5 px-4 py-2 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3',
        icon: 'size-11',
        'icon-xs': 'size-11 rounded-md',
        'icon-sm': 'size-11 rounded-md',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  disabled,
  title,
  onDragOver,
  onDrop,
  children,
  ...props
}: Omit<ButtonProps, 'children' | 'isDisabled'> &
  VariantProps<typeof buttonVariants> & {
    children?: ReactNode;
    disabled?: boolean;
    title?: string;
    onDragOver?: DragEventHandler<HTMLButtonElement>;
    onDrop?: DragEventHandler<HTMLButtonElement>;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      isDisabled={disabled}
      render={(buttonProps) => (
        <button {...buttonProps} title={title} onDragOver={onDragOver} onDrop={onDrop} />
      )}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
