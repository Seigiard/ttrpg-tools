import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { EditorHandle } from "../adapters/editor";
import type { PaginationResult } from "../adapters/pagination";
import { startApp, type AppAdapters, type AppElements } from "./start-app";

const RESULT: PaginationResult = { pageCount: 1, pageSizes: [], overflowingPages: [] };
const input = (): HTMLInputElement => document.createElement("input");
const element = (): HTMLElement => document.createElement("div");
const originalConfirm = window.confirm;
const consoleErrors = spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  window.confirm = originalConfirm;
  consoleErrors.mockClear();
});

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

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("startApp", () => {
  test("downloads the current editor source directly through the saved-file adapter", () => {
    const elements = appElements();
    const downloads: string[] = [];
    let source = "# Current book";
    const adapters: AppAdapters = {
      editor: {
        create: () => ({
          getSource: () => source,
          setSource: (next) => {
            source = next;
          },
          destroy: () => undefined,
        }),
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: { read: () => source, write: () => undefined },
      savedFile: {
        downloadBook: (next) => downloads.push(next),
        loadBookFile: () => Promise.resolve("LOADED BOOK"),
      },
    };

    const app = startApp(elements, adapters);
    source = "# Latest book";
    elements.downloadControl.click();

    expect(downloads).toEqual(["# Latest book"]);
    app.dispose();
  });

  test("clears the file input after every change so the same file can be selected again", async () => {
    const elements = appElements();
    const loaded: string[] = [];
    const file = new File([], "book.json");
    const adapters: AppAdapters = {
      editor: {
        create: () => ({
          getSource: () => "CURRENT BOOK",
          setSource: () => undefined,
          destroy: () => undefined,
        }),
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: { read: () => "CURRENT BOOK", write: () => undefined },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: (next) => {
          loaded.push(next.name);
          return Promise.resolve("LOADED BOOK");
        },
      },
    };

    const confirm = window.confirm;
    window.confirm = () => false;
    const app = startApp(elements, adapters);
    Object.defineProperty(elements.loadControl, "files", { configurable: true, value: [file] });
    elements.loadControl.value = "C:\\fakepath\\book.json";
    elements.loadControl.dispatchEvent(new Event("change"));
    await settle();
    expect(elements.loadControl.value).toBe("");

    elements.loadControl.value = "C:\\fakepath\\book.json";
    elements.loadControl.dispatchEvent(new Event("change"));
    await settle();

    expect(elements.loadControl.value).toBe("");
    expect(loaded).toEqual(["book.json", "book.json"]);
    app.dispose();
    window.confirm = confirm;
  });

  test("a load change without a file does not supersede an in-flight file read", async () => {
    const elements = appElements();
    const pending = new Promise<string>((resolve) => setTimeout(() => resolve("LOADED BOOK"), 0));
    let source = "CURRENT BOOK";
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => ({
          getSource: () => source,
          setSource: (next) => {
            source = next;
            onChange(next);
          },
          destroy: () => undefined,
        }),
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: { read: () => source, write: () => undefined },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => pending,
      },
    };

    const confirm = window.confirm;
    window.confirm = () => true;
    const app = startApp(elements, adapters);
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    Object.defineProperty(elements.loadControl, "files", { configurable: true, value: [] });
    elements.loadControl.dispatchEvent(new Event("change"));
    await pending;
    await settle();

    expect(source).toBe("LOADED BOOK");
    app.dispose();
    window.confirm = confirm;
  });

  test("runs the initial preview refresh even when automatic refresh starts disabled", async () => {
    const elements = appElements();
    elements.autoRefreshControl.checked = false;
    const htmlCalls: string[] = [];
    const adapters: AppAdapters = {
      editor: {
        create: (_container, initialSource) => ({
          getSource: () => initialSource,
          setSource: () => undefined,
          destroy: () => undefined,
        }),
      },
      preview: {
        paginate: (_container, html) => {
          htmlCalls.push(html);
          return Promise.resolve(RESULT);
        },
      },
      printing: { printBook: () => Promise.resolve() },
      draft: {
        read: () => "RESTORED DRAFT",
        write: () => undefined,
      },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve("LOADED BOOK"),
      },
    };

    const app = startApp(elements, adapters);
    await Promise.resolve();
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toContain("RESTORED DRAFT");
    app.dispose();
  });

  test("accepting replacement persists, clears obsolete status, and immediately repaints exactly once", async () => {
    const elements = appElements();
    elements.autoRefreshControl.checked = false;
    const drafts: string[] = [];
    const htmlCalls: string[] = [];
    let source = "OLD BOOK";
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => ({
          getSource: () => source,
          setSource: (next) => {
            source = next;
            onChange(next);
          },
          destroy: () => undefined,
        }),
      },
      preview: {
        paginate: (_container, html) => {
          htmlCalls.push(html);
          return Promise.resolve(RESULT);
        },
      },
      printing: { printBook: () => Promise.resolve() },
      draft: { read: () => source, write: (next) => drafts.push(next) },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve("LOADED BOOK"),
      },
    };

    const confirm = window.confirm;
    window.confirm = () => true;
    const app = startApp(elements, adapters);
    await settle();
    htmlCalls.length = 0;
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    await settle();

    expect(source).toBe("LOADED BOOK");
    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toContain("LOADED BOOK");
    expect(elements.statusContainer.textContent).not.toContain("Loading file failed");
    app.dispose();
    expect(drafts).toEqual(["LOADED BOOK"]);
    window.confirm = confirm;
  });

  test("accepting invalid saved markup replaces the editor and reports through Preview status", async () => {
    const elements = appElements();
    const invalidSource = "<Book>\n<Section>\n<Section>\n</Section>\n</Section>\n</Book>";
    let source = "OLD BOOK";
    const drafts: string[] = [];
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => ({
          getSource: () => source,
          setSource: (next) => {
            source = next;
            onChange(next);
          },
          destroy: () => undefined,
        }),
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: { read: () => source, write: (next) => drafts.push(next) },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve(invalidSource),
      },
    };

    const confirm = window.confirm;
    window.confirm = () => true;
    const app = startApp(elements, adapters);
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    await settle();

    expect(source).toBe(invalidSource);
    expect(elements.statusContainer.textContent).toContain("Preview is out of date");
    app.dispose();
    expect(drafts).toEqual([invalidSource]);
    window.confirm = confirm;
  });

  test("owns all session resources through one idempotent handle", async () => {
    const elements = appElements();
    const calls = { paginate: 0, print: 0, download: 0, load: 0, editorDestroy: 0 };
    const drafts: string[] = [];
    const disposalOrder: string[] = [];
    let source = "INITIAL BOOK";
    let editorChanged: ((source: string) => void) | undefined;
    const editor: EditorHandle = {
      getSource: () => source,
      setSource: (next) => {
        source = next;
      },
      destroy: () => {
        calls.editorDestroy += 1;
        disposalOrder.push("editor");
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
          disposalOrder.push("draft");
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

    editorChanged?.("BEFORE DISPOSE");
    app.dispose();
    app.dispose();
    elements.refreshControl.click();
    elements.autoRefreshControl.dispatchEvent(new Event("change"));
    elements.printControl.click();
    elements.downloadControl.click();
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    editorChanged?.("AFTER DISPOSE");
    await Promise.resolve();

    expect(app.editor).toBe(editor);
    expect(calls.paginate).toBe(2);
    expect(calls.print).toBe(0);
    expect(calls.download).toBe(0);
    expect(calls.load).toBe(0);
    // Disposal flushes the draft the author was still writing before the editor is destroyed.
    expect(drafts).toEqual(["BEFORE DISPOSE"]);
    expect(disposalOrder).toEqual(["draft", "editor"]);
    expect(calls.editorDestroy).toBe(1);
  });

  test("late child completions cannot mutate UI after root disposal", async () => {
    const elements = appElements();
    let source = "CURRENT BOOK";
    let finishPreview: ((value: PaginationResult) => void) | undefined;
    let finishPrint: (() => void) | undefined;
    let finishLoad: ((value: string) => void) | undefined;
    let editorChanged: ((source: string) => void) | undefined;
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => {
          editorChanged = onChange;
          return {
            getSource: () => source,
            setSource: (next) => {
              source = next;
            },
            destroy: () => undefined,
          };
        },
      },
      preview: {
        paginate: () =>
          new Promise<PaginationResult>((resolve) => {
            finishPreview = resolve;
          }),
      },
      printing: {
        printBook: () =>
          new Promise<void>((resolve) => {
            finishPrint = resolve;
          }),
      },
      draft: {
        read: () => source,
        write: () => undefined,
      },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () =>
          new Promise<string>((resolve) => {
            finishLoad = resolve;
          }),
      },
    };

    const confirm = window.confirm;
    window.confirm = () => true;
    const app = startApp(elements, adapters);
    elements.printControl.click();
    Object.defineProperty(elements.loadControl, "files", {
      configurable: true,
      value: [new File([], "book.json")],
    });
    elements.loadControl.dispatchEvent(new Event("change"));
    editorChanged?.("UNFLUSHED DRAFT");

    app.dispose();
    finishPreview?.(RESULT);
    finishPrint?.();
    finishLoad?.("LOADED AFTER DISPOSE");
    await settle();

    expect(source).toBe("CURRENT BOOK");
    expect(elements.statusContainer.textContent).toBe("");
    window.confirm = confirm;
  });

  test("a successful pending draft flush during disposal does not mutate status UI", async () => {
    const elements = appElements();
    let source = "CURRENT BOOK";
    let failWrites = true;
    let editorChanged: ((source: string) => void) | undefined;
    const drafts: string[] = [];
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => {
          editorChanged = onChange;
          return {
            getSource: () => source,
            setSource: (next) => {
              source = next;
            },
            destroy: () => undefined,
          };
        },
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: {
        read: () => source,
        write: (next) => {
          if (failWrites) throw new Error("Storage unavailable");
          drafts.push(next);
        },
      },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve("LOADED BOOK"),
      },
    };

    const app = startApp(elements, adapters);
    editorChanged?.("UNSAVED FIRST EDIT");
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    const statusBeforeDisposal = elements.statusContainer.textContent;

    failWrites = false;
    editorChanged?.("DISPOSAL FLUSHED EDIT");
    app.dispose();
    await settle();

    expect(drafts).toEqual(["DISPOSAL FLUSHED EDIT"]);
    expect(statusBeforeDisposal).toContain("This book is not being saved");
    expect(elements.statusContainer.textContent).toBe(statusBeforeDisposal);
  });

  test("a failed pending draft flush during disposal does not mutate status UI", async () => {
    const elements = appElements();
    let source = "CURRENT BOOK";
    let editorChanged: ((source: string) => void) | undefined;
    const adapters: AppAdapters = {
      editor: {
        create: (_container, _initialSource, onChange) => {
          editorChanged = onChange;
          return {
            getSource: () => source,
            setSource: (next) => {
              source = next;
            },
            destroy: () => undefined,
          };
        },
      },
      preview: { paginate: () => Promise.resolve(RESULT) },
      printing: { printBook: () => Promise.resolve() },
      draft: {
        read: () => source,
        write: () => {
          throw new Error("Storage unavailable");
        },
      },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve("LOADED BOOK"),
      },
    };

    const app = startApp(elements, adapters);
    const statusBeforeDisposal = elements.statusContainer.textContent;
    editorChanged?.("DISPOSAL FAILED EDIT");

    app.dispose();
    await settle();

    expect(statusBeforeDisposal).toBe("");
    expect(elements.statusContainer.textContent).toBe(statusBeforeDisposal);
  });

  test("prints the current editor source independently of preview refresh", async () => {
    const elements = appElements();
    elements.autoRefreshControl.checked = false;
    const printed: string[] = [];
    let source = "# Restored draft";
    const adapters: AppAdapters = {
      editor: {
        create: () => ({
          getSource: () => source,
          setSource: (next) => {
            source = next;
          },
          destroy: () => undefined,
        }),
      },
      preview: {
        paginate: () => Promise.resolve(RESULT),
      },
      printing: {
        printBook: (html) => {
          printed.push(html);
          return Promise.resolve();
        },
      },
      draft: {
        read: () => source,
        write: () => undefined,
      },
      savedFile: {
        downloadBook: () => undefined,
        loadBookFile: () => Promise.resolve("# Loaded book"),
      },
    };

    const app = startApp(elements, adapters);
    await Promise.resolve();
    source = "# Current editor book";
    elements.printControl.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("Current editor book");
    expect(printed[0]).not.toContain("Restored draft");
    app.dispose();
  });
});
