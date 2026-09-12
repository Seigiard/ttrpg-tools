import { describe, expect, test } from "bun:test";

import { createPrintingWorkflow, type PrintingStatus } from "./printing-workflow";
import type { BookPrintError } from "./operation-error";

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function statusRecorder(): PrintingStatus & { events: string[]; failures: BookPrintError[] } {
  const events: string[] = [];
  const failures: BookPrintError[] = [];
  return {
    events,
    failures,
    printFailed: (error) => {
      events.push("failed");
      failures.push(error);
    },
    printSucceeded: () => events.push("succeeded"),
  };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("printing workflow", () => {
  test("prints rendered source for the accepted request", async () => {
    const printed: string[] = [];
    const status = statusRecorder();
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return Promise.resolve();
      },
      status,
    });

    printing.printRequested("# Current book");
    await settlePromises();

    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("Current book");
    expect(status.events).toEqual(["succeeded"]);
  });

  test("ignores repeated requests while one attempt is active before rendering source", async () => {
    const attempt = deferred();
    const printed: string[] = [];
    const status = statusRecorder();
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return attempt.promise;
      },
      status,
    });

    printing.printRequested("# First book");
    printing.printRequested("<UnknownTag>bad</UnknownTag>");
    attempt.resolve();
    await attempt.promise;
    await settlePromises();

    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("First book");
    expect(status.events).toEqual(["succeeded"]);
  });

  test("starts a fresh request after the active attempt settles", async () => {
    const first = deferred();
    const second = deferred();
    const attempts = [first, second];
    const printed: string[] = [];
    const status = statusRecorder();
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return attempts[printed.length - 1]!.promise;
      },
      status,
    });

    printing.printRequested("# First book");
    first.resolve();
    await first.promise;
    await settlePromises();
    printing.printRequested("# Second book");
    second.resolve();
    await second.promise;
    await settlePromises();

    expect(printed).toHaveLength(2);
    expect(printed[0]).toContain("First book");
    expect(printed[1]).toContain("Second book");
    expect(status.events).toEqual(["succeeded", "succeeded"]);
  });

  test("render failures are print failures and release the active attempt", async () => {
    const printed: string[] = [];
    const status = statusRecorder();
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return Promise.resolve();
      },
      status,
    });

    printing.printRequested('<Book theme="missing">\n# Bad\n</Book>');
    printing.printRequested("# Recovery book");
    await settlePromises();

    expect(status.events).toEqual(["failed", "succeeded"]);
    expect(status.failures[0]?.kind).toBe("markup-error");
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("Recovery book");
  });

  test("synchronous print adapter throws become print failures and release the active attempt", async () => {
    const status = statusRecorder();
    let calls = 0;
    const printing = createPrintingWorkflow({
      printBook: () => {
        calls += 1;
        if (calls === 1) throw new Error("printer unavailable");
        return Promise.resolve();
      },
      status,
    });

    printing.printRequested("# First book");
    printing.printRequested("# Recovery book");
    await settlePromises();

    expect(status.events).toEqual(["failed", "succeeded"]);
    expect(status.failures[0]).toEqual({ kind: "print-engine-failure", message: "printer unavailable" });
  });

  test("rejected print promises become print failures and release the active attempt", async () => {
    const status = statusRecorder();
    let calls = 0;
    const printing = createPrintingWorkflow({
      printBook: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error("print rejected"));
        return Promise.resolve();
      },
      status,
    });

    printing.printRequested("# First book");
    await settlePromises();
    printing.printRequested("# Recovery book");
    await settlePromises();

    expect(status.events).toEqual(["failed", "succeeded"]);
    expect(status.failures[0]).toEqual({ kind: "print-engine-failure", message: "print rejected" });
  });

  test("a completion for a replaced book cannot change status", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.bookReplaced();
    attempt.resolve();
    await attempt.promise;
    await settlePromises();

    expect(status.events).toEqual([]);
  });

  test("a rejection for a replaced book cannot change status", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.bookReplaced();
    attempt.reject(new Error("old printer failed"));
    await attempt.promise.catch(() => undefined);
    await settlePromises();

    expect(status.events).toEqual([]);
  });

  test("replacement keeps new requests ignored until the old uncancelable attempt settles", async () => {
    const oldAttempt = deferred();
    const newAttempt = deferred();
    const printed: string[] = [];
    const status = statusRecorder();
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return printed.length === 1 ? oldAttempt.promise : newAttempt.promise;
      },
      status,
    });

    printing.printRequested("# Old book");
    printing.bookReplaced();
    printing.printRequested("# Ignored while old attempt is still active");
    oldAttempt.resolve();
    await oldAttempt.promise;
    await settlePromises();
    printing.printRequested("# Fresh book");
    newAttempt.resolve();
    await newAttempt.promise;
    await settlePromises();

    expect(printed).toHaveLength(2);
    expect(printed[0]).toContain("Old book");
    expect(printed[1]).toContain("Fresh book");
    expect(status.events).toEqual(["succeeded"]);
  });

  test("destroy ignores a late print failure", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.destroy();
    attempt.reject(new Error("printer failed"));
    await attempt.promise.catch(() => undefined);
    await settlePromises();

    expect(status.events).toEqual([]);
  });

  test("destroy ignores a late print success", async () => {
    const attempt = deferred();
    const status = statusRecorder();
    const printing = createPrintingWorkflow({ printBook: () => attempt.promise, status });

    printing.printRequested("BOOK ONE");
    printing.destroy();
    attempt.resolve();
    await attempt.promise;
    await settlePromises();

    expect(status.events).toEqual([]);
  });

  test("destroy makes later print requests inert", async () => {
    const status = statusRecorder();
    const printed: string[] = [];
    const printing = createPrintingWorkflow({
      printBook: (html) => {
        printed.push(html);
        return Promise.resolve();
      },
      status,
    });

    printing.destroy();
    printing.printRequested("# After destroy");
    printing.bookReplaced();
    printing.destroy();
    await settlePromises();

    expect(printed).toEqual([]);
    expect(status.events).toEqual([]);
  });
});
