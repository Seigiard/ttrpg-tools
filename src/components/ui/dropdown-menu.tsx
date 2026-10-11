import {
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  type MenuItemProps,
  type MenuProps,
  type MenuSectionProps,
  type MenuTriggerProps,
} from 'react-aria-components';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

function DropdownMenuTrigger({ ...props }: MenuTriggerProps) {
  return <MenuTrigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = 'start',
  className,
  children,
  ...props
}: MenuProps<object> & { align?: 'start' | 'end'; children?: ReactNode }) {
  return (
    <Popover
      placement={align === 'end' ? 'bottom end' : 'bottom start'}
      offset={4}
      className="isolate z-50 max-h-[var(--visual-viewport-height)] w-[var(--trigger-width)] min-w-32 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border"
    >
      <Menu data-slot="dropdown-menu-content" className={cn('outline-none', className)} {...props}>
        {children}
      </Menu>
    </Popover>
  );
}

function DropdownMenuGroup({ ...props }: MenuSectionProps<object>) {
  return <MenuSection data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Header>) {
  return (
    <Header
      data-slot="dropdown-menu-label"
      className={cn('px-1.5 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

function DropdownMenuItem({ className, title, ...props }: MenuItemProps & { title?: string }) {
  return (
    <MenuItem
      data-slot="dropdown-menu-item"
      className={cn(
        "group/dropdown-menu-item relative flex min-h-11 cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm select-none data-[focused]:bg-accent data-[focused]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.2cap]",
        className,
      )}
      render={(itemProps) =>
        'href' in itemProps ? (
          <a {...itemProps} title={title} />
        ) : (
          <div {...itemProps} title={title} />
        )
      }
      {...props}
    />
  );
}

export {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
};
