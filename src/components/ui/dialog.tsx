import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  Dialog as DialogPrimitive,
  Heading,
  Modal,
  ModalOverlay,
  type DialogProps,
  type HeadingProps,
  type ModalOverlayProps,
} from 'react-aria-components';
import { cn } from '@/lib/utils';

const DialogContext = createContext<(() => void) | null>(null);

function Dialog({
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [isOpen, setOpen] = useState(defaultOpen);
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  return isOpen ? <DialogContext.Provider value={close}>{children}</DialogContext.Provider> : null;
}

function DialogContent({
  className,
  children,
  ...props
}: DialogProps & Pick<ModalOverlayProps, 'isDismissable'>) {
  const close = useContext(DialogContext);

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) close?.();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center-safe bg-overlay p-4"
    >
      <Modal>
        <DialogPrimitive
          className={cn(
            'max-h-[90dvh] w-full max-w-3xl overflow-auto overscroll-contain rounded-xl border border-border bg-surface p-4 shadow-xl [scrollbar-gutter:stable]',
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive>
      </Modal>
    </ModalOverlay>
  );
}

function DialogTitle({ className, slot: _, ...props }: HeadingProps) {
  return <Heading slot="title" className={className} {...props} />;
}

export { Dialog, DialogContent, DialogTitle };
