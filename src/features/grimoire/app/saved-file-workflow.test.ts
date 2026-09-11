import { describe, expect, test } from "bun:test";

import { createSavedFileWorkflow, type SavedFileStatus } from "./saved-file-workflow";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function statusRecorder(): SavedFileStatus & { failures: unknown[] } {
  const failures: unknown[] = [];
  return {
    failures,
    loadFailed: (error) => failures.push(error),
  };
}

describe("saved-file workflow", () => {
  test("only the latest of two file selections may replace the book", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const replacements: string[] = [];
    const workflow = createSavedFileWorkflow({
      downloadBook: () => undefined,
      loadBookFile: (file) => (file.name === "slow.json" ? slow.promise : fast.promise),
      confirmReplacement: () => true,
      replaceBook: (source) => replacements.push(source),
      status: statusRecorder(),
    });

    workflow.fileSelected(new File([], "slow.json"));
    workflow.fileSelected(new File([], "fast.json"));
    fast.resolve("FAST BOOK");
    await fast.promise;
    await Promise.resolve();
    slow.resolve("SLOW BOOK");
    await slow.promise;
    await Promise.resolve();

    expect(replacements).toEqual(["FAST BOOK"]);
  });

  test("destroy prevents a pending file read from replacing the book", async () => {
    const pending = deferred<string>();
    const replacements: string[] = [];
    const status = statusRecorder();
    const workflow = createSavedFileWorkflow({
      downloadBook: () => undefined,
      loadBookFile: () => pending.promise,
      confirmReplacement: () => true,
      replaceBook: (source) => replacements.push(source),
      status,
    });

    workflow.fileSelected(new File([], "book.json"));
    workflow.destroy();
    pending.resolve("LATE BOOK");
    await pending.promise;
    await Promise.resolve();

    expect(replacements).toEqual([]);
    expect(status.failures).toEqual([]);
  });
});
