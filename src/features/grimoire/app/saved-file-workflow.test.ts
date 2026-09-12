import { describe, expect, test } from "bun:test";

import { createSavedFileWorkflow, type SavedFileStatus } from "./saved-file-workflow";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function statusRecorder(): SavedFileStatus & { failures: unknown[]; validations: string[] } {
  const failures: unknown[] = [];
  const validations: string[] = [];
  return {
    failures,
    validations,
    loadFailed: (error) => failures.push(error),
    savedFileValidated: () => validations.push("validated"),
  };
}

describe("saved-file workflow", () => {
  test("a no-file selection does not supersede an in-flight read", async () => {
    const pending = deferred<string>();
    const replacements: string[] = [];
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => pending.promise,
      confirmReplacement: () => true,
      replaceBook: (source) => replacements.push(source),
      status: statusRecorder(),
    });

    workflow.fileSelected(new File([], "book.json"));
    workflow.fileSelected(undefined);
    pending.resolve("LOADED BOOK");
    await pending.promise;
    await settle();

    expect(replacements).toEqual(["LOADED BOOK"]);
  });

  test("only the latest of two file selections may replace the book", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const replacements: string[] = [];
    const workflow = createSavedFileWorkflow({
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

  test("stale successes cannot request confirmation", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const events: string[] = [];
    const workflow = createSavedFileWorkflow({
      loadBookFile: (file) => (file.name === "slow.json" ? slow.promise : fast.promise),
      confirmReplacement: () => {
        events.push("confirmed");
        return true;
      },
      replaceBook: (source) => events.push(source),
      status: statusRecorder(),
    });

    workflow.fileSelected(new File([], "slow.json"));
    workflow.fileSelected(new File([], "fast.json"));
    fast.resolve("FAST BOOK");
    await fast.promise;
    await settle();
    slow.resolve("SLOW BOOK");
    await slow.promise;
    await settle();

    expect(events).toEqual(["confirmed", "FAST BOOK"]);
  });

  test("stale failures cannot update Load status after a later file is selected", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const status = statusRecorder();
    const replacements: string[] = [];
    const workflow = createSavedFileWorkflow({
      loadBookFile: (file) => {
        if (file.name === "slow.json") return slow.promise.then(() => Promise.reject(new Error("stale failure")));
        return fast.promise;
      },
      confirmReplacement: () => true,
      replaceBook: (source) => replacements.push(source),
      status,
    });

    workflow.fileSelected(new File([], "slow.json"));
    workflow.fileSelected(new File([], "fast.json"));
    fast.resolve("FAST BOOK");
    await fast.promise;
    await settle();
    slow.resolve("ignored");
    await slow.promise.catch(() => undefined);
    await settle();

    expect(replacements).toEqual(["FAST BOOK"]);
    expect(status.failures).toEqual([]);
  });

  test("destroy prevents a pending file read from replacing the book", async () => {
    const pending = deferred<string>();
    const replacements: string[] = [];
    const status = statusRecorder();
    const workflow = createSavedFileWorkflow({
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
    expect(status.validations).toEqual([]);
  });

  test("destroy prevents a pending file read from asking for confirmation or changing status", async () => {
    const pending = deferred<string>();
    const events: string[] = [];
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => pending.promise,
      confirmReplacement: () => {
        events.push("confirmed");
        return true;
      },
      replaceBook: () => events.push("replaced"),
      status: {
        loadFailed: () => events.push("failed"),
        savedFileValidated: () => events.push("validated"),
      },
    });

    workflow.fileSelected(new File([], "book.json"));
    workflow.destroy();
    pending.resolve("LATE BOOK");
    await pending.promise;
    await settle();

    expect(events).toEqual([]);
  });

  test("clears a previous load failure after validation, before asking to replace", async () => {
    const events: string[] = [];
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => Promise.resolve("VALID BOOK"),
      confirmReplacement: () => {
        events.push("confirmed");
        return false;
      },
      replaceBook: () => events.push("replaced"),
      status: {
        loadFailed: () => undefined,
        savedFileValidated: () => events.push("validated"),
      },
    });

    workflow.fileSelected(new File([], "book.json"));
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["validated", "confirmed"]);
  });

  test("declining replacement leaves the current book untouched after validation", async () => {
    const replacements: string[] = [];
    const status = statusRecorder();
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => Promise.resolve("VALID BOOK"),
      confirmReplacement: () => false,
      replaceBook: (source) => replacements.push(source),
      status,
    });

    workflow.fileSelected(new File([], "book.json"));
    await settle();

    expect(status.validations).toEqual(["validated"]);
    expect(replacements).toEqual([]);
  });

  test("a synchronous load adapter throw becomes Saved-file Load status", async () => {
    const status = statusRecorder();
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => {
        throw new Error("reader exploded");
      },
      confirmReplacement: () => true,
      replaceBook: () => undefined,
      status,
    });

    workflow.fileSelected(new File([], "book.json"));
    await settle();

    expect(status.failures).toEqual([{ kind: "load-failure", message: "reader exploded" }]);
  });

  test("an asynchronous load adapter rejection becomes Saved-file Load status", async () => {
    const status = statusRecorder();
    const workflow = createSavedFileWorkflow({
      loadBookFile: () => Promise.reject(new Error("reader rejected")),
      confirmReplacement: () => true,
      replaceBook: () => undefined,
      status,
    });

    workflow.fileSelected(new File([], "book.json"));
    await settle();

    expect(status.failures).toEqual([{ kind: "load-failure", message: "reader rejected" }]);
  });
});
