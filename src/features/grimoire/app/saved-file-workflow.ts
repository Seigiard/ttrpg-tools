import type { downloadBook, loadBookFile } from "../adapters/file";
import { toPreviewError, type PreviewError } from "./preview-error";

export interface SavedFileStatus {
  loadFailed(error: PreviewError): void;
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

      void loadBookFile(file)
        .then((source) => {
          if (!active || token !== loadToken || !confirmReplacement()) return;
          replaceBook(source);
        })
        .catch((error: unknown) => {
          if (active && token === loadToken) status.loadFailed(toPreviewError(error));
        });
    },
    destroy() {
      if (!active) return;
      active = false;
      loadToken += 1;
    },
  };
}
