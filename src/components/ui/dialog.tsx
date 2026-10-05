import { createContext, type ComponentChildren, type JSX, type RefObject } from 'preact';
import { useContext, useEffect, useId, useRef, useState } from 'preact/hooks';

import { cn } from '@/lib/utils';

type DialogElementProps = JSX.IntrinsicElements['dialog'];

type HeadingProps = JSX.IntrinsicElements['h2'];

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

let scrollLockDepth = 0;

let previousBodyOverflow = '';

interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ComponentChildren;
}

function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const titleId = useId();
  const currentOpen = open ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <DialogContext.Provider value={{ open: currentOpen, setOpen, titleId }}>
      {children}
    </DialogContext.Provider>
  );
}

interface DialogContentProps extends DialogElementProps {
  finalFocus?: RefObject<HTMLElement | null>;
}

function DialogContent({ className, finalFocus, children, onClick, ...props }: DialogContentProps) {
  const context = useContext(DialogContext);
  const popupRef = useRef<HTMLDialogElement>(null);
  const setOpenRef = useRef<(open: boolean) => void>(() => {});
  const finalFocusRef = useRef<RefObject<HTMLElement | null> | undefined>(undefined);

  if (!context) throw new Error('DialogContent must be used inside Dialog');
  const { open, setOpen, titleId } = context;

  useEffect(() => {
    setOpenRef.current = setOpen;
    finalFocusRef.current = finalFocus;
  });

  useEffect(() => {
    if (!open) return;

    const dialog = popupRef.current;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (dialog && !dialog.open) dialog.showModal();
    const target = firstFocusable(dialog) ?? dialog;
    target?.focus();

    if (scrollLockDepth === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    scrollLockDepth += 1;

    const onCancel = (event: Event) => {
      event.preventDefault();
      setOpenRef.current(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        trapFocus(event, dialog);
      }
    };

    dialog?.addEventListener('cancel', onCancel);
    dialog?.addEventListener('keydown', onKeyDown);

    return () => {
      dialog?.removeEventListener('cancel', onCancel);
      dialog?.removeEventListener('keydown', onKeyDown);

      if (dialog?.open) dialog.close();
      scrollLockDepth -= 1;

      if (scrollLockDepth === 0) document.body.style.overflow = previousBodyOverflow;
      const restoreTarget = finalFocusRef.current?.current ?? previousFocus;
      restoreTarget?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={popupRef}
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-50 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-xl border border-border bg-surface p-4 shadow-xl backdrop:bg-black/60',
        className,
      )}
      {...props}
      onClick={(event) => {
        onClick?.(event);

        // Clicks on the ::backdrop and on the dialog's own padding both target the
        // dialog element; only a point outside its box is a backdrop click.
        if (event.defaultPrevented || event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();

        const inside =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;

        if (!inside) setOpen(false);
      }}
    >
      {children}
    </dialog>
  );
}

function DialogTitle({ className, ...props }: HeadingProps) {
  const context = useContext(DialogContext);

  return <h2 id={context?.titleId} className={className} {...props} />;
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function firstFocusable(container: HTMLElement | null) {
  return focusableElements(container)[0] ?? null;
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const focusable = focusableElements(container);

  if (focusable.length === 0) {
    event.preventDefault();
    container?.focus();

    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === container)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === container)
  ) {
    event.preventDefault();
    first?.focus();
  }
}

export { Dialog, DialogContent, DialogTitle };
