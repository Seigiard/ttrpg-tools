import type { printBook } from "../adapters/printing";
import { renderBook } from "../core/render-book";
import { toBookMarkupError, toBookPrintError, type BookPrintError } from "./operation-error";

export interface PrintingStatus {
  printFailed(error: BookPrintError): void;
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
  let runningToken: number | undefined;

  const finish = (token: number): void => {
    if (runningToken === token) runningToken = undefined;
  };

  return {
    printRequested(source) {
      if (!active || runningToken !== undefined) return;
      const token = ++requestToken;
      runningToken = token;

      let html: string;
      try {
        html = renderBook({ source });
      } catch (error) {
        try {
          if (active && token === requestToken) status.printFailed(toBookMarkupError(error));
        } finally {
          finish(token);
        }
        return;
      }

      let printed: Promise<void>;
      try {
        printed = Promise.resolve(printBook(html));
      } catch (error) {
        try {
          if (active && token === requestToken) status.printFailed(toBookPrintError(error));
        } finally {
          finish(token);
        }
        return;
      }

      void printed
        .then(() => {
          if (active && token === requestToken) status.printSucceeded();
        })
        .catch((error: unknown) => {
          if (active && token === requestToken) status.printFailed(toBookPrintError(error));
        })
        .finally(() => finish(token));
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
