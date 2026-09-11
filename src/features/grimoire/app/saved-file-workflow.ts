import type { downloadBook, loadBookFile } from "../adapters/file";
import { toSavedFileLoadError, type SavedFileLoadError } from "./operation-error";

export interface SavedFileStatus {
  loadFailed(error: SavedFileLoadError): void;
}

export interface SavedFileWorkflow {
  downloadRequested(source: string): void;
  fileSelected(file: File): void;
  destroy(): void;
}

interface SavedFileWorkflowOptions {
  readonly downloadBook: typeof downloadBook;
  readonly loadBookFile: typeof loadBookFile;
  readonly confirmReplacement: () => boolean;
  readonly replaceBook: (source: string) => void;
  readonly status: SavedFileStatus;
}

export function createSavedFileWorkflow({
  downloadBook,
  loadBookFile,
  confirmReplacement,
  replaceBook,
  status,
}: SavedFileWorkflowOptions): SavedFileWorkflow {
  let active = true;
  let loadToken = 0;

  return {
    downloadRequested(source) {
      if (active) downloadBook(source);
    },
    fileSelected(file) {
      if (!active) return;
      const token = ++loadToken;

      void loadBookFile(file).then(
        (source) => {
          if (!active || token !== loadToken || !confirmReplacement()) return;
          replaceBook(source);
        },
        (error: unknown) => {
          if (active && token === loadToken) status.loadFailed(toSavedFileLoadError(error));
        },
      );
    },
    destroy() {
      if (!active) return;
      active = false;
      loadToken += 1;
    },
  };
}
