import { describe, expect, test } from "bun:test";

import { createPrintingWorkflow, type PrintingStatus } from "./printing-workflow";

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function statusRecorder(): PrintingStatus & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    printFailed: () => events.push("failed"),
    printSucceeded: () => events.push("succeeded"),
  };
}

describe("printing workflow", () => {
  test("a completion for a replaced book cannot change status", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.bookReplaced();
    attempt.resolve();
    await attempt.promise;
    await Promise.resolve();

    expect(status.events).toEqual([]);
  });

  test("destroy ignores a late print failure", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.destroy();
    attempt.reject(new Error("printer failed"));
    await attempt.promise.catch(() => undefined);
    await Promise.resolve();

    expect(status.events).toEqual([]);
  });
});
