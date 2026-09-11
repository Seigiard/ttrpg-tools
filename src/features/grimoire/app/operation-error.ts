import { EngineTimeoutError } from "../adapters/engine-timeout";
import { UnreadableBookFileError } from "../adapters/file";
import { MarkupError, UnknownTagError } from "../core/markup-error";

export type BookMarkupError =
  | { readonly kind: "markup-error"; readonly message: string; readonly line: number }
  | { readonly kind: "unknown-tag"; readonly tag: string; readonly line: number };

export type PreviewRefreshError =
  | BookMarkupError
  | { readonly kind: "preview-engine-failure"; readonly message: string }
  | { readonly kind: "preview-timeout"; readonly seconds: number };

export type BookPrintError =
  | BookMarkupError
  | { readonly kind: "print-engine-failure"; readonly message: string }
  | { readonly kind: "print-timeout"; readonly seconds: number };

export type SavedFileLoadError =
  | { readonly kind: "unreadable-file"; readonly message: string }
  | { readonly kind: "load-failure"; readonly message: string };

/** Classifies the documented errors from core's `renderBook`; defects pass through. */
export function toBookMarkupError(error: unknown): BookMarkupError {
  if (error instanceof UnknownTagError) {
    return { kind: "unknown-tag", tag: error.tag, line: error.line };
  }
  if (error instanceof MarkupError) {
    return { kind: "markup-error", message: error.message, line: error.line };
  }
  throw error;
}

/** Classifies a rejection from the pagination adapter. */
export function toPreviewRefreshError(error: unknown): PreviewRefreshError {
  if (error instanceof EngineTimeoutError) {
    return { kind: "preview-timeout", seconds: error.seconds };
  }
  return {
    kind: "preview-engine-failure",
    message: errorMessage(error),
  };
}

export function describePreviewRefreshError(error: PreviewRefreshError): string {
  switch (error.kind) {
    case "preview-engine-failure":
      return `the pagination engine could not lay out the book: ${error.message}`;
    case "preview-timeout":
      return `the pagination engine did not answer within ${error.seconds} seconds; reload the editor to try again`;
    default:
      return describeBookMarkupError(error);
  }
}

/** Classifies a rejection from the printing adapter. */
export function toBookPrintError(error: unknown): BookPrintError {
  if (error instanceof EngineTimeoutError) {
    return { kind: "print-timeout", seconds: error.seconds };
  }
  return {
    kind: "print-engine-failure",
    message: errorMessage(error),
  };
}

export function describeBookPrintError(error: BookPrintError): string {
  switch (error.kind) {
    case "print-engine-failure":
      return error.message;
    case "print-timeout":
      return `the print engine did not answer within ${error.seconds} seconds; reload the editor and print again`;
    default:
      return describeBookMarkupError(error);
  }
}

/** Classifies a rejection from the saved-file adapter. */
export function toSavedFileLoadError(error: unknown): SavedFileLoadError {
  if (error instanceof UnreadableBookFileError) {
    return { kind: "unreadable-file", message: error.message };
  }
  return { kind: "load-failure", message: errorMessage(error) };
}

export function describeSavedFileLoadError(error: SavedFileLoadError): string {
  switch (error.kind) {
    case "unreadable-file":
    case "load-failure":
      return error.message;
    default: {
      const exhaustive: never = error;
      throw new Error(`unhandled saved file load error kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describeBookMarkupError(error: BookMarkupError): string {
  switch (error.kind) {
    case "markup-error":
      return `line ${error.line}: ${error.message}`;
    case "unknown-tag":
      return `line ${error.line}: <${error.tag}> is not a tag this editor recognizes`;
    default: {
      const exhaustive: never = error;
      throw new Error(`unhandled Book markup error kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
