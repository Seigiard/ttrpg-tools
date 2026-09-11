import type { OverflowingPage } from "../adapters/pagination";
import { describePreviewError, describePrintError, type PreviewError } from "./preview-error";

export interface AppStatus {
  previewFailed(error: PreviewError): void;
  previewSucceeded(pages: readonly OverflowingPage[]): void;
  printFailed(error: PreviewError): void;
  printSucceeded(): void;
  loadFailed(error: PreviewError): void;
  draftSaveChanged(failed: boolean): void;
  bookReplaced(): void;
}

export function createStatus(container: HTMLElement): AppStatus {
  let previewError: PreviewError | undefined;
  let printError: PreviewError | undefined;
  let loadError: PreviewError | undefined;
  let saveFailed = false;
  let overflowingPages: readonly OverflowingPage[] = [];

  const render = (): void => {
    const parts: string[] = [];
    if (previewError !== undefined) parts.push(`Preview is out of date — ${describePreviewError(previewError)}`);
    if (overflowingPages.length > 0) parts.push(describeOverflowingPages(overflowingPages));
    if (printError !== undefined) parts.push(`Printing failed — ${describePrintError(printError)}`);
    if (loadError !== undefined) parts.push(`Loading file failed — ${describePreviewError(loadError)}`);
    if (saveFailed) parts.push("This book is not being saved — download it before closing this page.");
    container.textContent = parts.join(" ");
    container.hidden = parts.length === 0;
  };

  return {
    previewFailed(error) {
      previewError = error;
      render();
    },
    previewSucceeded(pages) {
      previewError = undefined;
      overflowingPages = pages;
      render();
    },
    printFailed(error) {
      printError = error;
      render();
    },
    printSucceeded() {
      printError = undefined;
      render();
    },
    loadFailed(error) {
      loadError = error;
      render();
    },
    draftSaveChanged(failed) {
      saveFailed = failed;
      render();
    },
    bookReplaced() {
      printError = undefined;
      loadError = undefined;
      render();
    },
  };
}

function describeOverflowingPages(pages: readonly OverflowingPage[]): string {
  const heading = pages.length === 1 ? "A page did not fit" : "Some pages did not fit";
  const detail = pages.map((page) => `line ${page.line} took ${page.pages} pages`).join("; ");
  return `${heading} — ${detail}.`;
}
