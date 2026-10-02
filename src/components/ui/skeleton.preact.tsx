/** @jsxImportSource preact */
import type { JSX } from 'preact';

import { cn } from '@/lib/utils';

function Skeleton({
  loading = false,
  className,
  children,
  ...props
}: JSX.IntrinsicElements['span'] & { loading?: boolean }) {
  return (
    <span
      data-slot="skeleton"
      data-loading={loading || undefined}
      aria-hidden={loading || undefined}
      className={cn(
        'rounded-md',
        loading &&
          'inline-block animate-pulse cursor-default bg-text-muted/20 text-transparent shrink-0 select-none pointer-events-none [&_*]:invisible',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Skeleton };
