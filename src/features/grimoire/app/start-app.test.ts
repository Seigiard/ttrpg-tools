import { describe, expect, test } from "bun:test";

import type { EditorHandle } from "../adapters/editor";
import type { PaginationResult } from "../adapters/pagination";
import { startApp, type AppAdapters, type AppElements } from "./start-app";

const RESULT: PaginationResult = { pageCount: 1, pageSizes: [], overflowingPages: [] };
const input = (): HTMLInputElement => document.createElement("input");
const element = (): HTMLElement => document.createElement("div");

function appElements(): AppElements {
  const autoRefreshControl = input();
  autoRefreshControl.checked = true;
  return {
    editorContainer: element(),
    previewContainer: element(),
    printControl: element(),
    refreshControl: element(),
    autoRefreshControl,
    statusContainer: element(),
    downloadControl: element(),
    loadControl: input(),
  };
}

describe("startApp", () => {
  test("owns all session resources through one idempotent handle", async () => {
    const elements = appElements();
    const calls = { paginate: 0, print: 0, download: 0, load: 0, editorDestroy: 0 };
    const drafts: string[] = [];
    let source = "INITIAL BOOK";
    let editorChanged: ((source: string) => void) | undefined;
    const editor: EditorHandle = {
      getSource: () => source,
      setSource: (next) => {
        source = next;
      },
      destroy: () => {
        calls.editorDestroy += 1;
      },
    };
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => {
          editorChanged = onChange;
          return editor;
        },
      },
      preview: {
        paginate: () => {
          calls.paginate += 1;
          return Promise.resolve(RESULT);
        },
      },
      printing: {
        printBook: () => {
          calls.print += 1;
          return Promise.resolve();
        },
      },
      draft: {
        read: () => source,
        write: (next) => {
          drafts.push(next);
        },
      },
      savedFile: {
        downloadBook: () => {
          calls.download += 1;
        },
        loadBookFile: () => {
          calls.load += 1;
          return Promise.resolve("LOADED BOOK");
        },
      },
    };

    const app = startApp(elements, adapters);
    await new Promise((resolve) => setTimeout(resolve, 0));
    elements.refreshControl.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.paginate).toBe(2);

    editorChanged?.("BEFORE DESTROY");
    app.destroy();
    app.destroy();
    elements.refreshControl.click();
    elements.autoRefreshControl.dispatchEvent(new Event("change"));
    elements.printControl.click();
    elements.downloadControl.click();
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    editorChanged?.("AFTER DESTROY");
    await Promise.resolve();

    expect(app.editor).toBe(editor);
    expect(calls.paginate).toBe(2);
    expect(calls.print).toBe(0);
    expect(calls.download).toBe(0);
    expect(calls.load).toBe(0);
    // Disposal flushes the draft the author was still writing, and nothing after it.
    expect(drafts).toEqual(["BEFORE DESTROY"]);
    expect(calls.editorDestroy).toBe(1);
  });
});
