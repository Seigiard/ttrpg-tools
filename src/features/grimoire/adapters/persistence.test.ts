import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { draftStorage } from "./persistence";

afterEach(() => {
  localStorage.clear();
});

describe("draft storage", () => {
  test("reads back what it wrote and tells an empty draft from a missing one", () => {
    expect(draftStorage.read()).toBeUndefined();

    draftStorage.write("");
    expect(draftStorage.read()).toBe("");

    draftStorage.write("A BOOK");
    expect(draftStorage.read()).toBe("A BOOK");
  });

  test("reads no draft rather than throwing when storage is inaccessible", () => {
    const getItem = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });

    expect(draftStorage.read()).toBeUndefined();

    getItem.mockRestore();
  });
});
