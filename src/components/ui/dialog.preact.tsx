/** @jsxImportSource preact */
import { createContext, type ComponentChildren, type JSX, type RefObject } from 'preact';
import { useContext, useEffect, useId, useRef, useState } from 'preact/hooks';

import { cn } from '@/lib/utils';

type DivProps = JSX.IntrinsicElements['div'];
type HeadingProps = JSX.IntrinsicElements['h2'];

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

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

  return <DialogContext.Provider value={{ open: currentOpen, setOpen, titleId }}>{children}</DialogContext.Provider>;
}

interface DialogContentProps extends DivProps {
  finalFocus?: RefObject<HTMLElement | null>;
}

function DialogContent({ className, finalFocus, children, ...props }: DialogContentProps) {
  const context = useContext(DialogContext);
  const popupRef = useRef<HTMLDivElement>(null);
  if (!context) throw new Error('DialogContent must be used inside Dialog');

  useEffect(() => {
    if (!context.open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = firstFocusable(popupRef.current) ?? popupRef.current;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        context.setOpen(false);
      }
      if (event.key === 'Tab') {
        trapFocus(event, popupRef.current);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const restoreTarget = finalFocus?.current ?? previousFocus;
      restoreTarget?.focus();
    };
  }, [context, finalFocus]);

  if (!context.open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" aria-hidden="true" onClick={() => context.setOpen(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={popupRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={context.titleId}
          tabIndex={-1}
          className={cn(
            'max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-surface p-4 shadow-xl',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    </>
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
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
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
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export { Dialog, DialogContent, DialogTitle };
