import { expect, test } from "@playwright/test";

import { openDraftSession } from "../support/draft";

/**
 * The oracle for every test here is the browser's own storage, observed through the
 * native `Storage` API rather than through the adapter that wrote to it. What is
 * asserted is what an author would notice: a draft that comes back after a reload,
 * an editor that opens on a clean machine, and a storage that is not written once
 * per keystroke.
 */
test.describe("persistence", () => {
  test("a draft written before the tab closes comes back when it reopens", async ({ page }) => {
    const draft = await openDraftSession(page);

    // #when: the author writes, then the tab is closed and reopened
    await draft.typeBeforeBookClose("\n\nThe referee rolls two dice.\n");

    await expect.poll(() => draft.source()).toContain("The referee rolls two dice.");
    await expect.poll(() => draft.storedDraft()).toContain("The referee rolls two dice.");

    const reopened = await draft.reopen();

    // #then: the reopened editor holds what the author wrote
    expect(await reopened.source()).toContain("The referee rolls two dice.");
  });

  test("closing the tab straight after typing does not lose the last edits", async ({ page }) => {
    const draft = await openDraftSession(page);

    // #given: the author writes and closes the tab before the debounce has elapsed
    await draft.typeBeforeBookClose("\n\nDamage is dealt before movement.\n");

    // #when: the page goes away immediately, with no pause to let the timer fire
    const reopened = await draft.reopen();

    // #then: the reopened editor still holds what was written
    expect(await reopened.source()).toContain("Damage is dealt before movement.");
  });

  test("a first-time visitor gets a usable editor rather than an error", async ({ page }) => {
    // #given: storage holds no draft (every test opens its own browser context)
    // #when: the editor opens
    const draft = await openDraftSession(page);
    const source = await draft.source();

    // #then: there is a book to edit, and typing into it works
    expect(source).toBeTruthy();

    await draft.type("x");
    expect(await draft.source()).not.toBe(source);
  });

  test("a burst of typing costs far fewer writes than it has keystrokes", async ({ page }) => {
    const draft = await openDraftSession(page);

    // #given: a counter on the native storage API, which is the browser's, not ours.
    // Counting here rather than inside the adapter keeps the oracle independent of
    // the code under test: a writer that ignored its debounce would still be counted.
    const writes = await draft.countStorageWrites();

    // #when: the author types a run of characters with no pause between them
    const burst = "Roll under your ability score to succeed.";
    await draft.typeBeforeBookClose(`${burst}\n`, { delay: 0 });

    await expect.poll(() => draft.storedDraft()).toContain(burst);

    // #then: the burst reached storage in a handful of writes, not one per keystroke.
    // The bound is deliberately loose: the point is the order of magnitude, not an
    // exact count, which would depend on how fast the machine running this types.
    expect(await writes.count()).toBeLessThan(burst.length / 4);
  });

  test("a failed draft write warns the author before they leave", async ({ page }) => {
    const draft = await openDraftSession(page);
    await draft.failStorageWrites();

    await draft.typeBeforeBookClose("\n\nThis edit cannot be persisted.\n");

    await expect.poll(() => draft.statusText()).toContain("This book is not being saved");
    await expect.poll(() => draft.statusText()).toContain("download it before closing this page");
  });
});
