import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createControlledScheduler } from "../adapters/private/scheduler";
import type { DraftStorage } from "../adapters/persistence";
import { createDraftPersistence } from "./persistence";

interface StorageProbe {
  readonly storage: DraftStorage;
  readonly writes: string[];
  failWith(error: unknown): void;
  recover(): void;
}

function storageProbe(stored?: string): StorageProbe {
  const writes: string[] = [];
  let failure: unknown;

  return {
    storage: {
      read: () => stored,
      write(source) {
        if (failure !== undefined) throw failure;
        writes.push(source);
      },
    },
    writes,
    failWith(error) {
      failure = error;
    },
    recover() {
      failure = undefined;
    },
  };
}

const consoleErrors = spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  consoleErrors.mockClear();
});

describe("draft persistence", () => {
  test("restores an empty draft as empty and reports only a missing one as absent", () => {
    const empty = storageProbe("");
    const missing = storageProbe(undefined);
    const controlled = createControlledScheduler();

    const emptyDraft = createDraftPersistence({
      storage: empty.storage,
      scheduler: controlled.scheduler,
    });
    const missingDraft = createDraftPersistence({
      storage: missing.storage,
      scheduler: controlled.scheduler,
    });

    expect(emptyDraft.read()).toBe("");
    expect(missingDraft.read()).toBeUndefined();

    // #then: opening the editor reads only -- a restored draft is not written back
    controlled.advanceBy(10_000);
    expect(empty.writes).toEqual([]);
    expect(missing.writes).toEqual([]);

    emptyDraft.dispose();
    missingDraft.dispose();
  });

  test("a burst of changes writes only the latest source, a second after the last one", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });

    persistence.write("FIRST");
    controlled.advanceBy(600);
    persistence.write("SECOND");
    controlled.advanceBy(999);

    expect(probe.writes).toEqual([]);

    controlled.advanceBy(1);

    expect(probe.writes).toEqual(["SECOND"]);
    expect(controlled.pendingCount()).toBe(0);
    persistence.dispose();
  });

  test("only the latest requested write reports a result", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });
    const superseded: unknown[] = [];
    const latest: unknown[] = [];

    persistence.write("SUPERSEDED", (error) => superseded.push(error));
    persistence.write("LATEST", (error) => latest.push(error));
    controlled.advanceBy(1000);

    expect(superseded).toEqual([]);
    expect(latest).toEqual([undefined]);
    persistence.dispose();
  });

  test("a failed write warns the author, and a later successful one clears the warning", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });
    const results: unknown[] = [];
    const quotaExceeded = new Error("Storage quota exceeded");

    probe.failWith(quotaExceeded);
    persistence.write("UNSAVEABLE", (error) => results.push(error));
    controlled.advanceBy(1000);

    expect(results).toEqual([quotaExceeded]);

    // #when: storage accepts writes again and the author keeps editing
    probe.recover();
    persistence.write("SAVEABLE", (error) => results.push(error));
    controlled.advanceBy(1000);

    expect(results).toEqual([quotaExceeded, undefined]);
    expect(probe.writes).toEqual(["SAVEABLE"]);
    persistence.dispose();
  });

  test("pagehide flushes the pending source without waiting for the debounce", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });

    persistence.write("BEFORE NAVIGATION");
    window.dispatchEvent(new Event("pagehide"));

    expect(probe.writes).toEqual(["BEFORE NAVIGATION"]);
    expect(controlled.pendingCount()).toBe(0);

    // #then: the tab stays usable -- pagehide flushes, it does not dispose
    persistence.write("STILL EDITING");
    controlled.advanceBy(1000);

    expect(probe.writes).toEqual(["BEFORE NAVIGATION", "STILL EDITING"]);
    persistence.dispose();
  });

  test("dispose flushes the latest source, cancels the timer and stops listening", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });

    persistence.write("LAST EDIT");
    persistence.dispose();

    expect(probe.writes).toEqual(["LAST EDIT"]);
    expect(controlled.pendingCount()).toBe(0);

    persistence.dispose();
    persistence.write("TOO LATE");
    window.dispatchEvent(new Event("pagehide"));
    controlled.advanceBy(10_000);

    expect(probe.writes).toEqual(["LAST EDIT"]);
  });

  test("flush without a pending source writes nothing", () => {
    const probe = storageProbe();
    const controlled = createControlledScheduler();
    const persistence = createDraftPersistence({
      storage: probe.storage,
      scheduler: controlled.scheduler,
    });

    persistence.flush();

    expect(probe.writes).toEqual([]);
    persistence.dispose();
  });
});
