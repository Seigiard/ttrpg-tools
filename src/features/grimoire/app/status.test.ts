import { describe, expect, test } from "bun:test";

import { createStatus } from "./status";

describe("status", () => {
  test("keeps independent failures until their own workflow clears them", () => {
    const container = document.createElement("div");
    const status = createStatus(container);

    status.previewFailed({ kind: "markup-error", message: "nested section", line: 3 });
    status.printFailed({ kind: "pagination-failure", message: "printer unavailable" });
    status.draftSaveChanged(true);
    status.previewSucceeded([]);

    expect(container.textContent).not.toContain("Preview is out of date");
    expect(container.textContent).toContain("Printing failed");
    expect(container.textContent).toContain("not being saved");
    expect(container.hidden).toBe(false);
  });

  test("replacing a book clears only messages that belonged to the replaced book", () => {
    const container = document.createElement("div");
    const status = createStatus(container);

    status.previewSucceeded([{ line: 8, pages: 2 }]);
    status.previewFailed({ kind: "markup-error", message: "nested section", line: 3 });
    status.printFailed({ kind: "pagination-failure", message: "printer unavailable" });
    status.loadFailed({ kind: "unreadable-file", message: "not a saved book" });
    status.draftSaveChanged(true);
    status.bookReplaced();

    expect(container.textContent).toContain("Preview is out of date");
    expect(container.textContent).toContain("line 8 took 2 pages");
    expect(container.textContent).not.toContain("Printing failed");
    expect(container.textContent).not.toContain("Loading file failed");
    expect(container.textContent).toContain("not being saved");
  });
});
