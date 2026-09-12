import type { loadBookFile } from "../adapters/file";
import { toSavedFileLoadError, type SavedFileLoadError } from "./operation-error";

export interface SavedFileStatus {
  loadFailed(error: SavedFileLoadError): void;
  savedFileValidated(): void;
}

export interface SavedFileWorkflow {
  fileSelected(file: File | undefined): void;
  destroy(): void;
}

interface SavedFileWorkflowOptions {
  readonly loadBookFile: typeof loadBookFile;
  readonly confirmReplacement: () => boolean;
  readonly replaceBook: (source: string) => void;
  readonly status: SavedFileStatus;
}

export function createSavedFileWorkflow({
  loadBookFile,
  confirmReplacement,
  replaceBook,
  status,
}: SavedFileWorkflowOptions): SavedFileWorkflow {
  let active = true;
  let loadToken = 0;

  return {
    fileSelected(file) {
      if (!active || file === undefined) return;
      const token = ++loadToken;

      let load: Promise<string>;
      try {
        load = Promise.resolve(loadBookFile(file));
      } catch (error) {
        status.loadFailed(toSavedFileLoadError(error));
        return;
      }

      void load.then(
        (source) => {
          if (!active || token !== loadToken) return;
          status.savedFileValidated();
          if (!confirmReplacement()) return;
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
