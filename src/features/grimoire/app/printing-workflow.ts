import type { printBook } from "../adapters/printing";
import { renderBook } from "../core/render-book";
import { toPreviewError, type PreviewError } from "./preview-error";

export interface PrintingStatus {
  printFailed(error: PreviewError): void;
  printSucceeded(): void;
}

export interface PrintingWorkflow {
  printRequested(source: string): void;
  bookReplaced(): void;
  destroy(): void;
}

interface PrintingWorkflowOptions {
  readonly printBook: typeof printBook;
  readonly status: PrintingStatus;
}

export function createPrintingWorkflow({ printBook, status }: PrintingWorkflowOptions): PrintingWorkflow {
  let active = true;
  let requestToken = 0;

  return {
    printRequested(source) {
      if (!active) return;
      const token = ++requestToken;

      let html: string;
      try {
        html = renderBook({ source });
      } catch (error) {
        if (token === requestToken) status.printFailed(toPreviewError(error));
        return;
      }

      void printBook(html)
        .then(() => {
          if (active && token === requestToken) status.printSucceeded();
        })
        .catch((error: unknown) => {
          if (active && token === requestToken) status.printFailed(toPreviewError(error));
        });
    },
    bookReplaced() {
      requestToken += 1;
    },
    destroy() {
      if (!active) return;
      active = false;
      requestToken += 1;
    },
  };
}
