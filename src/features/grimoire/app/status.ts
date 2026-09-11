import type { OverflowingPage } from "../adapters/pagination";
import {
  describeBookPrintError,
  describePreviewRefreshError,
  describeSavedFileLoadError,
  type BookPrintError,
  type PreviewRefreshError,
  type SavedFileLoadError,
} from "./operation-error";

/** Typed workflow transitions for the single author-visible status surface. */
export interface Status {
  previewFailed(error: PreviewRefreshError): void;
  previewSucceeded(overflowingPages: readonly OverflowingPage[]): void;
  printFailed(error: BookPrintError): void;
  clearPrint(): void;
  loadFailed(error: SavedFileLoadError): void;
  savedFileValidated(): void;
  saveFailed(): void;
  saveSucceeded(): void;
}

export function createStatus(container: HTMLElement): Status {
  let previewError: PreviewRefreshError | undefined;
  let overflowingPages: readonly OverflowingPage[] = [];
  let printError: BookPrintError | undefined;
  let loadError: SavedFileLoadError | undefined;
  let saveFailed = false;

  const render = (): void => {
    const messages: string[] = [];
    if (previewError !== undefined) {
      messages.push(`Preview is out of date — ${describePreviewRefreshError(previewError)}`);
    }
    if (overflowingPages.length > 0) messages.push(describeOverflowingPages(overflowingPages));
    if (printError !== undefined) {
      messages.push(`Printing failed — ${describeBookPrintError(printError)}`);
    }
    if (loadError !== undefined) {
      messages.push(`Loading file failed — ${describeSavedFileLoadError(loadError)}`);
    }
    if (saveFailed) messages.push("This book is not being saved — download it before closing this page.");

    container.textContent = messages.join(" ");
    container.hidden = messages.length === 0;
  };

  render();

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
    clearPrint() {
      printError = undefined;
      render();
    },
    loadFailed(error) {
      loadError = error;
      render();
    },
    savedFileValidated() {
      loadError = undefined;
      render();
    },
    saveFailed() {
      saveFailed = true;
      render();
    },
    saveSucceeded() {
      saveFailed = false;
      render();
    },
  };
}

function describeOverflowingPages(pages: readonly OverflowingPage[]): string {
  const heading = pages.length === 1 ? "A page did not fit" : "Some pages did not fit";
  const detail = pages.map((page) => `line ${page.line} took ${page.pages} pages`).join("; ");
  return `${heading} — ${detail}.`;
}
