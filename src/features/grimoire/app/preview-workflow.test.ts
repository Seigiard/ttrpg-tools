import { describe, expect, test } from "bun:test";

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

function controlledTimers(): { runAll(): void; restore(): void } {
  const scheduled = new Map<number, () => void>();
  let nextId = 0;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = ((callback: TimerHandler) => {
    const id = ++nextId;
    scheduled.set(id, () => {
      if (typeof callback === "function") callback();
    });
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    scheduled.delete(Number(id));
  }) as typeof clearTimeout;

  return {
    runAll() {
      const tasks = [...scheduled.values()];
      scheduled.clear();
      for (const task of tasks) task();
    },
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    },
  };
}

describe("preview workflow", () => {
  test("debounces source changes and repaints only the latest source", async () => {
    const timers = controlledTimers();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
    });

    preview.sourceChanged("FIRST AUTOMATIC");
    preview.sourceChanged("LATEST AUTOMATIC");
    expect(htmlCalls).toEqual([]);

    timers.runAll();
    await Promise.resolve();
    timers.restore();

    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toContain("LATEST AUTOMATIC");
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
    const timers = controlledTimers();
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
    preview.sourceChanged("AUTOMATIC");
    timers.runAll();
    preview.automaticRefreshChanged(false, "AUTOMATIC");
    first.resolve(RESULT);
    await first.promise;
    await Promise.resolve();
    timers.restore();
    await Promise.resolve();

    expect(htmlCalls).toHaveLength(1);
  });

  test("destroy cancels an armed automatic repaint", async () => {
    const timers = controlledTimers();
    const htmlCalls: string[] = [];
    const preview = createPreviewWorkflow({
      container: document.createElement("div"),
      paginate: (_container, html) => {
        htmlCalls.push(html);
        return Promise.resolve(RESULT);
      },
      status: statusRecorder(),
    });

    preview.sourceChanged("NEVER PAINTED");
    preview.destroy();
    timers.runAll();
    timers.restore();

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
