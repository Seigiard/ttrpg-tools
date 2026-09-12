import { expect, test } from "@playwright/test";

import { openPreviewSession, type PreviewSession } from "../support/preview";
import { openPrintingSession, type PrintingSession } from "../support/printing";

const ALL_PREVIEW_FRAMES = "#preview iframe[data-grimoire-preview-document]";
const PREVIEW_FRAME = `${ALL_PREVIEW_FRAMES}:not([aria-hidden="true"])`;

const GOOD_SOURCE = ['<Book size="A5">', '<Section columns="1">', "A good paragraph appears here.", "</Section>", "</Book>"].join(
  "\n",
);

const OTHER_GOOD_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  "A second paragraph appears here.",
  "</Section>",
  "</Book>",
].join("\n");

const THIRD_GOOD_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  "A third paragraph appears here.",
  "</Section>",
  "</Book>",
].join("\n");

const BROKEN_SOURCE = "<Section>\n<Section>\nBroken nested section.\n</Section>\n</Section>";

/** A book long enough that the engine is still laying it out several seconds in, so a
 * bound can be made to fire while a run is genuinely mid-layout rather than before it
 * has started. Set through the editor handle rather than typed: 1500 paragraphs is a
 * minute of keystrokes and none of them are what the test is about. */
const LONG_BOOK_MARKER = "Paragraph 0 of a book the engine is still laying out";
const LONG_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  ...Array.from(
    { length: 1500 },
    (_, i) => `Paragraph ${i} of a book the engine is still laying out, with enough words in it to take real time.\n`,
  ),
  "</Section>",
  "</Book>",
].join("\n");

async function firstPreviewPaint(
  page: import("@playwright/test").Page,
  scenario: "preview-controlled-engine" | "preview-controlled-engine-isolated" = "preview-controlled-engine",
): Promise<PreviewSession> {
  const preview = await openPreviewSession(page, scenario);
  await expect.poll(() => preview.previewText()).toContain("Start writing your book here.");
  return preview;
}

/** The author's first book has painted, so anything that follows is a fresh run
 * rather than something coalesced into the session's opening Preview refresh. */
async function firstPrintPaint(page: import("@playwright/test").Page): Promise<PrintingSession> {
  const printing = await openPrintingSession(page, "preview-controlled-engine");
  await expect.poll(() => printing.previewText()).toContain("Start writing your book here.");
  return printing;
}

/**
 * Issue #10: the two calls this application makes into the pagination engine had no
 * time bound, and each guards a resource released only when that call settles. An
 * engine that stalled once therefore stalled for the rest of the session -- the
 * preview froze on its last render while the editor kept taking edits, and every
 * later click on print handed back the same stuck promise.
 *
 * The consumer is the author sitting in front of that editor, so every oracle below
 * is the real DOM the harness's real `startApp` wiring produces: `#preview`'s own
 * content and `#status`'s own text and visibility. Real CodeMirror, real
 * Vivliostyle, real pagination and printing adapters -- what the harness substitutes
 * is not an adapter but the engine's own silence (see the harness for why that has
 * to be forced at `loadDocument` rather than through a document), and the private
 * scheduler the two bounds use. Every browser timer in the page continues to run for
 * real.
 */
test.describe("a repaint the engine never answers", () => {
  test("leaves the last book that did paginate on screen (issue #11's guarantee, through the timeout)", async ({ page }) => {
    // #given: a book the real engine has laid out into the preview
    const preview = await firstPreviewPaint(page);
    await preview.replaceSource(GOOD_SOURCE);
    await expect.poll(() => preview.previewText()).toContain("A good paragraph appears here.");
    const lastGood = await preview.previewMarkup();
    const lastGoodAttributes = await preview.previewAttributes();
    expect(lastGoodAttributes).toContain("data-vivliostyle-viewer-status=complete");

    // #when: the next repaint is staged transactionally and then goes unanswered for
    // its whole bound. The published preview remains the stale book while the engine
    // owns only its candidate viewport.
    await preview.stallEngine();
    await preview.replaceSource(OTHER_GOOD_SOURCE);
    await expect.poll(() => preview.stalledEngineRuns()).toBe(1);
    expect(await preview.previewText()).toContain("A good paragraph appears here.");
    expect(await preview.previewAttributes()).toBe(lastGoodAttributes);

    await preview.advanceEngineClock(30_000);
    await expect(preview.status()).toBeVisible();

    // #then: the preview still holds exactly the book it held on the way in -- its
    // markup and the container's own attributes.
    expect(await preview.previewMarkup()).toBe(lastGood);
    expect(await preview.previewAttributes()).toBe(lastGoodAttributes);
  });

  test("cannot put its stale book back when the engine answers for it later", async ({ page }) => {
    // #given: a repaint given up on, which restored the book before it
    const preview = await firstPreviewPaint(page);
    await preview.replaceSource(GOOD_SOURCE);
    await expect.poll(() => preview.previewText()).toContain("A good paragraph appears here.");
    await preview.stallEngine();
    await preview.replaceSource(OTHER_GOOD_SOURCE);
    await expect.poll(() => preview.stalledEngineRuns()).toBe(1);
    await preview.advanceEngineClock(30_000);
    await expect(preview.status()).toBeVisible();

    // #given: and a newer book the author has since written, painted for real
    await preview.unstallEngine();
    await preview.replaceSource(THIRD_GOOD_SOURCE);
    await expect.poll(() => preview.previewText()).toContain("A third paragraph appears here.");
    await expect(preview.status()).toBeHidden();

    // #when: the engine finally answers about the abandoned run -- the work could
    // not be called off, so this is the real event arriving for a book nobody is
    // waiting for any more
    // CoreViewer's own event target calls its listeners inline, and the handler that
    // would put the stale book back writes to the container inline too, so by the
    // time this call has returned the damage is either done or it is not. There is
    // nothing to wait for, and a wait would only be waiting on nothing.
    expect(await preview.failOldestStalledEngineRun()).toBe(true);

    // #then: the preview is still the newest book, not the one the abandoned run
    // was holding on to, and nothing is reported about a book that is no longer
    // on screen
    const previewText = await preview.previewText();
    expect(previewText).toContain("A third paragraph appears here.");
    expect(previewText).not.toContain("A good paragraph appears here.");
    await expect(preview.status()).toBeHidden();
  });
});

test("an isolated resize keeps its published book through a timeout and late engine response", async ({ page }) => {
  const previewSession = await firstPreviewPaint(page, "preview-controlled-engine-isolated");
  const preview = page.frameLocator(PREVIEW_FRAME);

  await previewSession.replaceSource(GOOD_SOURCE);
  await expect(preview.locator("body")).toContainText("A good paragraph appears here.");
  const lastGood = await preview.locator("body").textContent();

  // The editor may be ahead of the published preview while auto-refresh is off.
  // A resize must refit what is actually visible, not reveal that draft.
  await previewSession.setAutomaticRefresh(false);
  await previewSession.replaceSource(OTHER_GOOD_SOURCE);
  await page.waitForTimeout(500);
  await expect(preview.locator("body")).toContainText("A good paragraph appears here.");

  await previewSession.stallEngine();
  await page.evaluate(() => {
    const previewContainer = document.getElementById("preview")!;
    previewContainer.style.width = "500px";
    previewContainer.style.height = "420px";
  });
  await expect.poll(() => previewSession.stalledEngineRuns()).toBe(1);
  await expect(page.locator("#preview iframe")).toHaveCount(2);
  const committedFrame = PREVIEW_FRAME;
  const stagingFrame = `${ALL_PREVIEW_FRAMES}[aria-hidden="true"]`;
  await expect(page.locator(committedFrame)).toHaveCount(1);
  await expect(page.frameLocator(committedFrame).locator("body")).toContainText(
    "A good paragraph appears here.",
  );
  await expect(page.locator(stagingFrame)).toHaveCount(1);
  await expect(page.locator(stagingFrame)).toBeHidden();
  const stagedDocument = await previewSession.oldestStalledEngineDocument();
  expect(stagedDocument).toContain("A good paragraph appears here.");
  expect(stagedDocument).not.toContain("A second paragraph appears here.");

  await previewSession.advanceEngineClock(30_000);
  await expect(previewSession.status()).toBeVisible();
  await expect(page.locator("#preview iframe")).toHaveCount(1);
  expect(await preview.locator("body").textContent()).toBe(lastGood);

  await previewSession.unstallEngine();
  await previewSession.setAutomaticRefresh(true);
  await expect(preview.locator("body")).toContainText("A second paragraph appears here.");
  await previewSession.replaceSource(THIRD_GOOD_SOURCE);
  await expect(preview.locator("body")).toContainText("A third paragraph appears here.");
  expect(await previewSession.resumeOldestStalledEngineRunUntilLoaded()).toBe(true);
  await expect(page.locator("#preview iframe")).toHaveCount(1);
  await expect(preview.locator("body")).toContainText("A third paragraph appears here.");
});

/**
 * What an abandoned run actually goes on to do, pinned rather than assumed. The bound
 * is deliberately generous, which means it is meant to fire on books that are still
 * laying out, so this case is reachable by construction rather than exotic. Half of
 * the outcome is good and half is not, and the not-good half is issue #15: nothing in
 * this application can call the engine off, and `removeListener` only detaches the
 * adapter's handlers from the viewer's event target -- the object writing to the
 * container is the viewer's internal one, and nothing detaches that. A staging
 * container is what closes it, and that is a decision with its own cost (ADR-0005).
 */
test.describe("a repaint abandoned while the engine was mid-layout", () => {
  test("keeps its pages and late container bookkeeping out of the preview", async ({ page }) => {
    test.setTimeout(90_000);

    // #given: a book on screen, and a much longer one the engine is part-way through
    const preview = await firstPreviewPaint(page);
    await preview.replaceSource(GOOD_SOURCE);
    await expect.poll(() => preview.previewText()).toContain("A good paragraph appears here.");

    await preview.replaceSource(LONG_SOURCE);
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll("#preview [data-vivliostyle-page-index]").length), {
        timeout: 30_000,
      })
      .toBeGreaterThan(5);
    // Pages of the new book are on screen and the call has still not settled: this run
    // is genuinely mid-layout, not merely started.
    expect(await preview.pendingEngineDeadlines()).toBe(1);

    // #when: the bound fires there. The engine's own stamp is taken off the container
    // in the same task, so that its coming back can only be the abandoned run writing.
    await preview.advanceEngineClock(30_000);
    await page.evaluate(() => {
      document.getElementById("preview")!.removeAttribute("data-vivliostyle-viewer-status");
    });
    await expect(preview.status()).toBeVisible();

    // #then: the abandoned run cannot write its late bookkeeping onto the published
    // preview container.
    await expect
      .poll(() => page.evaluate(() => document.getElementById("preview")!.getAttribute("data-vivliostyle-viewer-status")), {
        timeout: 30_000,
      })
      .toBeNull();

    // #then: and its pages never arrive, because the abandoned engine can write only
    // into the transaction candidate nobody can see.
    const previewText = await preview.previewText();
    expect(previewText).toContain("A good paragraph appears here.");
    expect(previewText).not.toContain(LONG_BOOK_MARKER);
  });
});

test.describe("a print the engine never answers", () => {
  test("does not open a dialogue over the author when the engine answers for it later", async ({ page }) => {
    // #given: a print given up on, with no dialogue opened for it
    const printing = await firstPrintPaint(page);
    await printing.stallEngine();
    await printing.print();
    await expect.poll(() => printing.stalledEngineRuns()).toBe(1);
    await printing.advanceEngineClock(60_000);
    await expect.poll(() => printing.statusText()).toContain("Printing failed");
    expect(await printing.printDialoguesOpened()).toBe(0);

    // #when: the abandoned attempt's engine lays the whole book out after all and
    // calls back to have it printed -- a real success, arriving for a print the
    // author gave up on a minute ago
    expect(await printing.resumeOldestStalledEngineRun()).toBe(true);
    // `printHTML` removes an attempt's iframe once that attempt has run to the end,
    // so the count dropping is the abandoned attempt reporting that its whole success
    // path -- the print callback included -- has now run.
    await expect.poll(() => printing.printAttemptsStarted(), { timeout: 30_000 }).toBe(0);

    // #then: the browser's own modal was not opened over whatever the author has
    // moved on to. Settling twice is a harmless no-op; opening a dialogue is not,
    // and it happens on the line before the resolve.
    expect(await printing.printDialoguesOpened()).toBe(0);
  });

  test("an ignored print request renders no newer source for an older completion to clear", async ({ page }) => {
    const printing = await firstPrintPaint(page);
    await printing.stallEngine();
    await printing.print();
    await expect.poll(() => printing.stalledEngineRuns()).toBe(1);

    await printing.replaceSource(BROKEN_SOURCE);
    await printing.print();
    await expect(page.locator("#status")).toContainText("Preview is out of date");
    await expect(page.locator("#status")).not.toContainText("Printing failed");

    expect(await printing.resumeOldestStalledEngineRun()).toBe(true);
    await expect.poll(() => printing.printAttemptsStarted()).toBe(0);
    await expect(page.locator("#status")).toContainText("Preview is out of date");
    await expect(page.locator("#status")).not.toContainText("Printing failed");
  });
});
