import type { createEditor, EditorHandle } from "../adapters/editor";
import type { downloadBook, loadBookFile } from "../adapters/file";
import type { paginate } from "../adapters/pagination";
import type { DraftPersistence } from "../adapters/persistence";
import type { printBook } from "../adapters/printing";
import { createPreviewWorkflow } from "./preview-workflow";
import { createPrintingWorkflow } from "./printing-workflow";
import { createSavedFileWorkflow } from "./saved-file-workflow";
import { createStatus } from "./status";

const INITIAL_SOURCE = [
  '<Book theme="default-ru">',
  "# Untitled book",
  "",
  "Start writing your book here.",
  "</Book>",
  "",
].join("\n");

export interface AppElements {
  readonly editorContainer: HTMLElement;
  readonly previewContainer: HTMLElement;
  readonly printControl: HTMLElement;
  readonly refreshControl: HTMLElement;
  readonly autoRefreshControl: HTMLInputElement;
  readonly statusContainer: HTMLElement;
  readonly downloadControl: HTMLElement;
  readonly loadControl: HTMLInputElement;
}

export interface AppAdapters {
  readonly editor: { readonly create: typeof createEditor };
  readonly preview: { readonly paginate: typeof paginate };
  readonly printing: { readonly printBook: typeof printBook };
  readonly draft: DraftPersistence;
  readonly savedFile: {
    readonly downloadBook: typeof downloadBook;
    readonly loadBookFile: typeof loadBookFile;
  };
}

export interface AppHandle {
  readonly editor: EditorHandle;
  destroy(): void;
}

/**
 * Owns one editor session. The workflows hide scenario-specific ordering and
 * scheduling; this module maps DOM events onto those interfaces and releases every
 * resource acquired for the session through one idempotent `destroy` operation.
 */
export function startApp(elements: AppElements, adapters: AppAdapters): AppHandle {
  const status = createStatus(elements.statusContainer);
  const preview = createPreviewWorkflow({
    container: elements.previewContainer,
    paginate: adapters.preview.paginate,
    status,
    automaticRefresh: elements.autoRefreshControl.checked,
  });
  const printing = createPrintingWorkflow({ printBook: adapters.printing.printBook, status });
  const initialSource = adapters.draft.read() ?? INITIAL_SOURCE;
  let active = true;

  const onChange = (source: string): void => {
    if (!active) return;
    adapters.draft.write(source, (error) => {
      if (active) status.draftSaveChanged(error !== undefined);
    });
    preview.sourceChanged(source);
  };

  const editor = adapters.editor.create(elements.editorContainer, initialSource, onChange);

  const replaceBook = (source: string): void => {
    if (!active) return;
    editor.setSource(source);
    preview.refreshRequested(source);
    printing.bookReplaced();
    status.bookReplaced();
  };

  const savedFile = createSavedFileWorkflow({
    downloadBook: adapters.savedFile.downloadBook,
    loadBookFile: adapters.savedFile.loadBookFile,
    confirmReplacement: () =>
      window.confirm("Loading this file replaces the book you are currently editing. Continue?"),
    replaceBook,
    status,
  });

  const onRefresh = (): void => preview.refreshRequested(editor.getSource());
  const onAutomaticRefreshChange = (): void =>
    preview.automaticRefreshChanged(elements.autoRefreshControl.checked, editor.getSource());
  const onPrint = (): void => printing.printRequested(editor.getSource());
  const onDownload = (): void => savedFile.downloadRequested(editor.getSource());
  const onLoad = (): void => {
    const file = elements.loadControl.files?.[0];
    elements.loadControl.value = "";
    if (file !== undefined) savedFile.fileSelected(file);
  };

  elements.refreshControl.addEventListener("click", onRefresh);
  elements.autoRefreshControl.addEventListener("change", onAutomaticRefreshChange);
  elements.printControl.addEventListener("click", onPrint);
  elements.downloadControl.addEventListener("click", onDownload);
  elements.loadControl.addEventListener("change", onLoad);

  preview.refreshRequested(initialSource);

  return {
    editor,
    destroy() {
      if (!active) return;
      active = false;

      elements.refreshControl.removeEventListener("click", onRefresh);
      elements.autoRefreshControl.removeEventListener("change", onAutomaticRefreshChange);
      elements.printControl.removeEventListener("click", onPrint);
      elements.downloadControl.removeEventListener("click", onDownload);
      elements.loadControl.removeEventListener("change", onLoad);

      savedFile.destroy();
      printing.destroy();
      preview.destroy();
      adapters.draft.destroy();
      editor.destroy();
    },
  };
}
