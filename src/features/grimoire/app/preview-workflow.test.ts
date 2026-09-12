import { describe, expect, test } from "bun:test";

import { createControlledScheduler } from "../adapters/private/scheduler";
import type { PaginationResult } from "../adapters/pagination";
import { createPreviewWorkflow, type PreviewStatus } from "./preview-workflow";

const RESULT: PaginationResult = { pageCount: 1, pageSizes: [], overflowingPages: [] };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function statusRecorder(): PreviewStatus & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    previewFailed: () => events.push("failed"),
    previewSucceeded: () => events.push("succeeded"),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("preview workflow", () => {
  test("debounces source changes and repaints only the latest source", async () => {
    const controlled = createControlledScheduler();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      scheduler: controlled.scheduler,
    });

    preview.sourceChanged("FIRST AUTOMATIC");
    preview.sourceChanged("LATEST AUTOMATIC");
    expect(htmlCalls).toEqual([]);
    expect(controlled.pendingCount()).toBe(1);

    controlled.advanceBy(399);
    expect(htmlCalls).toEqual([]);
    controlled.advanceBy(1);
    await settle();

    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toContain("LATEST AUTOMATIC");
  });

  test("manual refresh cancels an armed automatic repaint and runs the latest source now", async () => {
    const controlled = createControlledScheduler();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      scheduler: controlled.scheduler,
    });

    preview.sourceChanged("AUTOMATIC");
    preview.refreshRequested("MANUAL");
    await settle();
    controlled.advanceBy(400);
    await settle();

    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toContain("MANUAL");
    expect(htmlCalls[0]).not.toContain("AUTOMATIC");
  });

  test("coalesces requests made during a repaint and runs only the latest next", async () => {
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const status = statusRecorder();
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? first.promise : Promise.resolve(RESULT);
      },
      status,
    });

    preview.refreshRequested("FIRST MARKER");
    preview.refreshRequested("SECOND MARKER");
    preview.refreshRequested("LATEST MARKER");

    expect(htmlCalls).toHaveLength(1);
    first.resolve(RESULT);
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("LATEST MARKER");
    expect(htmlCalls[1]).not.toContain("SECOND MARKER");
  });

  test("a newer automatic source may replace an older queued manual snapshot", async () => {
    const controlled = createControlledScheduler();
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? first.promise : Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      scheduler: controlled.scheduler,
    });

    preview.refreshRequested("RUNNING");
    preview.refreshRequested("QUEUED MANUAL");
    preview.sourceChanged("LATEST AUTOMATIC");
    controlled.advanceBy(400);
    first.resolve(RESULT);
    await first.promise;
    await settle();

    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("LATEST AUTOMATIC");
    expect(htmlCalls[1]).not.toContain("QUEUED MANUAL");
  });

  test("a resize refreshes the displayed source rather than an unpublished draft", async () => {
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      automaticRefresh: false,
    });

    preview.refreshRequested("PUBLISHED BOOK");
    await Promise.resolve();
    await Promise.resolve();
    preview.sourceChanged("UNPUBLISHED DRAFT");
    preview.sizeChanged();
    await Promise.resolve();
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("PUBLISHED BOOK");
    expect(htmlCalls[1]).not.toContain("UNPUBLISHED DRAFT");
  });

  test("turning automatic refresh off discards one queued behind a running repaint", async () => {
    const controlled = createControlledScheduler();
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? first.promise : Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      scheduler: controlled.scheduler,
    });

    preview.refreshRequested("RUNNING");
    preview.sourceChanged("AUTOMATIC");
    controlled.advanceBy(400);
    preview.automaticRefreshChanged(false, "AUTOMATIC");
    first.resolve(RESULT);
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(1);
  });

  test("turning automatic refresh off preserves a queued manual repaint", async () => {
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? first.promise : Promise.resolve(RESULT);
      },
      status: statusRecorder(),
    });

    preview.refreshRequested("RUNNING");
    preview.refreshRequested("QUEUED MANUAL");
    preview.automaticRefreshChanged(false, "CURRENT SOURCE");
    first.resolve(RESULT);
    await first.promise;
    await settle();

    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("QUEUED MANUAL");
  });

  test("turning automatic refresh on queues the latest source behind a running repaint", async () => {
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? first.promise : Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      automaticRefresh: false,
    });

    preview.refreshRequested("RUNNING");
    preview.automaticRefreshChanged(true, "LATEST SOURCE");
    first.resolve(RESULT);
    await first.promise;
    await settle();

    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("LATEST SOURCE");
  });

  test("a synchronous pagination throw reports failure, cleans up running state, and continues queued work", async () => {
    const htmlCalls: string[] = [];
    const status = statusRecorder();
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        if (htmlCalls.length === 1) throw new Error("sync pagination failure");
        return Promise.resolve(RESULT);
      },
      status,
    });

    preview.refreshRequested("FAILS");
    preview.refreshRequested("RECOVERS");
    await settle();

    expect(status.events).toEqual(["failed", "succeeded"]);
    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("RECOVERS");
  });

  test("a rejected pagination promise cleans up running state and continues queued work", async () => {
    const failure = Promise.reject(new Error("async pagination failure"));
    failure.catch(() => undefined);
    const htmlCalls: string[] = [];
    const status = statusRecorder();
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return htmlCalls.length === 1 ? failure : Promise.resolve(RESULT);
      },
      status,
    });

    preview.refreshRequested("FAILS");
    preview.refreshRequested("RECOVERS");
    await settle();

    expect(status.events).toEqual(["failed", "succeeded"]);
    expect(htmlCalls).toHaveLength(2);
    expect(htmlCalls[1]).toContain("RECOVERS");
  });

  test("destroy cancels an armed automatic repaint", async () => {
    const controlled = createControlledScheduler();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
      scheduler: controlled.scheduler,
    });

    preview.sourceChanged("NEVER PAINTED");
    preview.destroy();
    controlled.advanceBy(400);

    expect(htmlCalls).toEqual([]);
  });

  test("destroy cancels queued work and ignores a running repaint's result", async () => {
    const first = deferred<PaginationResult>();
    const htmlCalls: string[] = [];
    const status = statusRecorder();
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return first.promise;
      },
      status,
    });

    preview.refreshRequested("RUNNING");
    preview.refreshRequested("QUEUED");
    preview.destroy();
    first.resolve(RESULT);
    await first.promise;
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(1);
    expect(status.events).toEqual([]);
  });
});
