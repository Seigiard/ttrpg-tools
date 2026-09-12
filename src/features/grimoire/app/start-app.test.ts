import { afterEach, describe, expect, test } from "bun:test";

import type { EditorHandle } from "../adapters/editor";
import type { PaginationResult } from "../adapters/pagination";
import { startApp, type AppAdapters, type AppElements } from "./start-app";

const RESULT: PaginationResult = { pageCount: 1, pageSizes: [], overflowingPages: [] };
const input = (): HTMLInputElement => document.createElement("input");
const element = (): HTMLElement => document.createElement("div");
const originalConfirm = window.confirm;

afterEach(() => {
  window.confirm = originalConfirm;
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
    app.destroy();
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
    app.destroy();
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
    app.destroy();
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
    app.destroy();
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
    app.destroy();
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
    app.destroy();
    expect(drafts).toEqual([invalidSource]);
    window.confirm = confirm;
  });

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
    app.destroy();
  });
});
