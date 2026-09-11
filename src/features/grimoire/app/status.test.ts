import { describe, expect, test } from "bun:test";

import { createStatus } from "./status";

describe("Status", () => {
  test("starts hidden when every channel is clear", () => {
    const container = document.createElement("div");

    createStatus(container);

    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  test("renders every channel in Preview, Overflow, Print, Load, Save order", () => {
    const container = document.createElement("div");
    const status = createStatus(container);

    status.saveFailed();
    status.loadFailed({ kind: "unreadable-file", message: "the selected file is not a book" });
    status.printFailed({ kind: "print-engine-failure", message: "the print engine stopped" });
    status.previewSucceeded([{ line: 12, pages: 2 }]);
    status.previewFailed({ kind: "markup-error", message: "a section was not closed", line: 4 });

    expect(container.hidden).toBe(false);
    expect(container.textContent).toBe(
      "Preview is out of date — line 4: a section was not closed " +
        "A page did not fit — line 12 took 2 pages. " +
        "Printing failed — the print engine stopped " +
        "Loading file failed — the selected file is not a book " +
        "This book is not being saved — download it before closing this page.",
    );

    status.previewSucceeded([]);
    status.clearPrint();
    status.savedFileValidated();
    status.saveSucceeded();

    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  test("publishes Preview success and its complete overflow report as one update", () => {
    const container = document.createElement("div");
    const updates: string[] = [];
    let textContent = "";
    Object.defineProperty(container, "textContent", {
      configurable: true,
      get: () => textContent,
      set: (value: string) => {
        textContent = value;
        updates.push(value);
      },
    });
    const status = createStatus(container);

    status.previewSucceeded([{ line: 2, pages: 2 }]);
    status.previewFailed({ kind: "preview-engine-failure", message: "engine stopped" });
    updates.length = 0;

    status.previewSucceeded([{ line: 8, pages: 3 }]);

    expect(updates).toEqual(["A page did not fit — line 8 took 3 pages."]);
  });

  test("keeps channel results independent and preserves overflow when Preview fails", () => {
    const container = document.createElement("div");
    const status = createStatus(container);

    status.previewSucceeded([{ line: 6, pages: 2 }]);
    status.printFailed({ kind: "print-engine-failure", message: "print failed" });
    status.loadFailed({ kind: "load-failure", message: "bad file" });
    status.saveFailed();

    status.previewFailed({ kind: "preview-engine-failure", message: "preview failed" });
    expect(container.textContent).toContain("line 6 took 2 pages");

    status.previewSucceeded([]);
    expect(container.textContent).toBe(
      "Printing failed — print failed " +
        "Loading file failed — bad file " +
        "This book is not being saved — download it before closing this page.",
    );

    status.savedFileValidated();
    expect(container.textContent).not.toContain("Loading file failed");
    expect(container.textContent).toContain("Printing failed");
    expect(container.textContent).toContain("not being saved");

    status.clearPrint();
    expect(container.textContent).not.toContain("Printing failed");
    expect(container.textContent).toContain("not being saved");

    status.saveSucceeded();
    expect(container.hidden).toBe(true);
  });
});
