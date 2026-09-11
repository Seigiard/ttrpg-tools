import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createDraftPersistence } from "./persistence";

afterEach(() => {
  localStorage.clear();
});

describe("draft persistence", () => {
  test("destroy flushes the pending draft and is idempotent", () => {
    const persistence = createDraftPersistence();

    persistence.write("LATEST DRAFT");
    persistence.destroy();
    persistence.destroy();

    expect(localStorage.getItem("grimoire:draft")).toBe("LATEST DRAFT");
  });

  test("pagehide no longer acts on a destroyed persistence resource", () => {
    const removeEventListener = spyOn(window, "removeEventListener");
    const persistence = createDraftPersistence();
    persistence.destroy();
    persistence.write("TOO LATE");

    window.dispatchEvent(new Event("pagehide"));

    expect(localStorage.getItem("grimoire:draft")).toBeNull();
    expect(removeEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    removeEventListener.mockRestore();
  });

  test("pagehide flushes a pending draft", () => {
    const persistence = createDraftPersistence();
    persistence.write("BEFORE NAVIGATION");

    window.dispatchEvent(new Event("pagehide"));

    expect(localStorage.getItem("grimoire:draft")).toBe("BEFORE NAVIGATION");
    persistence.destroy();
  });
});
