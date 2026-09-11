import { createPrinting } from './private/create-printing';
import { browserScheduler } from './private/scheduler';

const printWithBrowserScheduler = createPrinting(browserScheduler);

/**
 * Prints an HTML document (the same string the preview pane paginated) through the
 * browser's own print engine (ADR-0001). Vivliostyle lays the document out again in a
 * hidden iframe and calls that frame's `print()`, so the printed PDF is paginated by
 * the same engine and the same markup the preview showed, and the editor's own page
 * never takes part in the printed layout.
 *
 * There is no silent download: this opens the browser's print dialogue, where the
 * author chooses to save as PDF.
 *
 * Resolves once the print dialogue has been asked for, rejects on a Vivliostyle
 * failure -- `printHTML`'s own `errorCallback` runs outside this function's call
 * stack, so a caller can only ever observe that failure through this promise, never
 * through a thrown exception.
 *
 * Vivliostyle keeps a single global print instance, so a second call before the
 * first hidden iframe finishes would repoint it out from under the first: the first
 * frame could print the wrong markup, and its callbacks could fire after the second
 * call's cleanup already ran. A call made while one is in flight joins that one
 * instead of starting a second, which is what makes this single-flight.
 *
 * A hung attempt rejects after 60 seconds, but the hidden iframe cannot be canceled.
 * New attempts stay blocked until that iframe eventually answers; if it never does,
 * the timeout message tells the author to reload. Starting a replacement sooner would
 * put two attempts onto Vivliostyle's one global print instance.
 *
 * The hidden iframe cannot be called off and may still call back for an attempt
 * already given up on. Settling a promise twice is a no-op, but `printCallback`
 * opens the browser's print dialogue *before* it resolves, and that is a real thing
 * happening to a real author -- a dialogue for a book they asked to print minutes
 * ago, over whatever they are doing now. `printHTML` offers no way to take its
 * callbacks back, so where `pagination.ts` can stop listening, this has to decline
 * to act instead: the bound marks the attempt abandoned, and both callbacks check
 * that before doing anything at all. A late callback only releases the separate
 * abandoned-attempt block after Vivliostyle has finished with its global instance.
 */
export function printBook(html: string): Promise<void> {
  return printWithBrowserScheduler(html);
}
