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
 * A hung attempt rejects after 60 seconds, and an attempt the engine says it cannot
 * lay out rejects at once, but neither hands that global instance back -- the hidden
 * iframe cannot be canceled, and Vivliostyle releases the instance only on the path
 * that ends in printing. New attempts therefore stay blocked until the given-up-on
 * attempt eventually reports itself ready; if it never does, the timeout message
 * tells the author to reload. Starting a replacement sooner would put two attempts
 * onto Vivliostyle's one global print instance.
 *
 * That abandoned iframe may still call back for a print the author gave up on
 * minutes ago. Settling a promise twice is a no-op, but opening the browser's print
 * dialogue over whatever they are doing now is not, and `printHTML` offers no way to
 * take its callbacks back -- so where `pagination.ts` can stop listening, this
 * declines to act instead: a late answer releases the engine and nothing more.
 */
export function printBook(html: string): Promise<void> {
  return printWithBrowserScheduler(html);
}
