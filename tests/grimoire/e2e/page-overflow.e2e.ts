import { expect, test } from '@playwright/test';

import { openAuthoredPageSession, type AuthoredPageSession } from '../support/authored-page';
import { openBookDriver } from '../support/book';
import { openPrintingSession, type PrintingSession } from '../support/printing';

/**
 * Consumer: an author who declared a page -- a character sheet, a reference card --
 * and then added one line too many to it. The editor has to say so, naming the line
 * the page was declared on and how many pages it took, while still showing the book
 * the engine produced: a page that spilled is not a broken book, it is a book that
 * no longer matches what its author declared, and taking the render away would take
 * away the one thing that shows them *what* spilled.
 *
 * The oracle is what the real Vivliostyle engine did with the book -- the page
 * indices it assigned to the author's own page block -- and, for the application
 * tests, the status bar and preview that the real wiring produced from it. Never
 * render-book.ts's CSS or markup, which would only test the renderer against
 * itself. A named CSS page is a page *style* and not a page *quota* (ADR-0007), so
 * the engine is under no obligation to keep a page on one sheet; that is exactly
 * why these tests can watch it fail to.
 */

const paragraph = (n: number): string =>
  `Paragraph ${n}. ` +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(
    3,
  );

/** `count` paragraphs, each followed by the blank line that ends it, so a fixture's
 * line numbers are countable from the arrays it is built out of. Six of them is
 * comfortably more than one A5 page holds and comfortably less than two, so the
 * engine's answer is two pages with room to spare on either side of the boundary. */
const prose = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => [paragraph(from + i), '']).flat();

// 1 <Book>            5 <Page>
// 2 <Section ...>     6 A card that fits.
// 3 Short prose.      7 </Page>
// 4 </Section>        8 </Book>
const A_PAGE_THAT_FITS = [
  '<Book size="A5">',
  '<Section columns="1">',
  'Short prose before the card.',
  '</Section>',
  '<Page>',
  'A card that stands on its own.',
  '</Page>',
  '</Book>',
].join('\n');

// The same book with six paragraphs on the card instead of one line.
// 1 <Book>            5 <Page>                 18 </Page>
// 2 <Section ...>     6..17 six paragraphs     19 </Book>
// 3 Short prose.
// 4 </Section>
const A_PAGE_THAT_DOES_NOT_FIT = [
  '<Book size="A5">',
  '<Section columns="1">',
  'Short prose before the card.',
  '</Section>',
  '<Page>',
  ...prose(1, 6),
  '</Page>',
  '</Book>',
].join('\n');

// A character sheet and its reference card, both overrun.
// 1 <Book>              15 </Page>          29 </Page>
// 2 <Page>              16 <Page>           30 </Book>
// 3..14 six paragraphs  17..28 six paragraphs
const TWO_PAGES_THAT_DO_NOT_FIT = [
  '<Book size="A5">',
  '<Page>',
  ...prose(1, 6),
  '</Page>',
  '<Page>',
  ...prose(20, 6),
  '</Page>',
  '</Book>',
].join('\n');

test.describe('the pagination adapter reports the pages that did not fit', () => {
  test('a page whose content fits reports nothing', async ({ page: browserPage }) => {
    const book = await openBookDriver(browserPage);

    // #given: a card of one line, which fits on the page it claims
    // #when: the real engine paginates the book
    const authoredPage = await book.authoredPage(A_PAGE_THAT_FITS);

    // #then: the adapter has nothing to report about it
    expect(authoredPage.overflowingPages).toEqual([]);
  });

  test('a page that took two pages is reported by its line and by how many pages it took', async ({
    page: browserPage,
  }) => {
    const book = await openBookDriver(browserPage);

    // #given: the same card with six paragraphs on it, declared on line 5
    // #when: the real engine paginates the book
    const authoredPage = await book.authoredPage(A_PAGE_THAT_DOES_NOT_FIT);

    // #then: the page that spilled is named by the line the author declared it on,
    // with the number of pages the engine actually gave it
    expect(authoredPage.overflowingPages).toEqual([{ line: 5, pages: 2 }]);
  });

  test('the book still paginates and stays in the preview while the overflow is reported', async ({
    page: browserPage,
  }) => {
    const book = await openBookDriver(browserPage);

    // #given: a book whose page does not fit
    // #when: the real engine paginates it
    const authoredPage = await book.authoredPage(A_PAGE_THAT_DOES_NOT_FIT);

    // #then: the adapter resolved with the whole book -- one page of prose plus the
    // two the card took -- and left every one of those pages in the container,
    // rather than rejecting over the overflow and restoring what was there before
    expect({
      paginated: authoredPage.sheetCount,
      leftInThePreview: authoredPage.sheets.length,
    }).toEqual({
      paginated: 3,
      leftInThePreview: 3,
    });
  });

  test('two overflowing pages in one book are both reported', async ({ page: browserPage }) => {
    const book = await openBookDriver(browserPage);

    // #given: a character sheet and a reference card, both overrun
    // #when: the real engine paginates the book
    const authoredPage = await book.authoredPage(TWO_PAGES_THAT_DO_NOT_FIT);

    // #then: both are named, in the order the author wrote them -- one problem per
    // page, not one problem per book
    expect(authoredPage.overflowingPages).toEqual([
      { line: 2, pages: 2 },
      { line: 16, pages: 2 },
    ]);
  });

  test('the full app reports overflow and commits the book inside its preview frame', async ({
    page: browserPage,
  }) => {
    const authoredPage = await openAuthoredPageSession(browserPage, 'authored-page-isolated');

    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);

    await expect(authoredPage.status()).toBeVisible();
    await expect.poll(() => authoredPage.statusText()).toContain('line 5 took 2 pages');
    expect(await authoredPage.renderedPageCount()).toBe(3);
    expect(await authoredPage.previewText()).toContain('Paragraph 1.');
  });
});

// The overflowing book with its closing </Page> taken away: a markup error, so the
// repaint cannot produce a book at all and the preview keeps the last one it did.
// 1 <Book>            5 <Page>              18 </Book>
// 2 <Section ...>     6..17 six paragraphs
const A_PAGE_THAT_DOES_NOT_FIT_AND_IS_NEVER_CLOSED = [
  '<Book size="A5">',
  '<Section columns="1">',
  'Short prose before the card.',
  '</Section>',
  '<Page>',
  ...prose(1, 6),
  '</Book>',
].join('\n');

/**
 * The application half: what the author actually reads. Real CodeMirror, real
 * `renderBook`, real pagination adapter and real engine, observed through an
 * Authored Page session that can only edit source and read status/preview state.
 */
test.describe('what the author is told about a page that did not fit', () => {
  let authoredPage: AuthoredPageSession;

  test.beforeEach(async ({ page: browserPage }) => {
    authoredPage = await openAuthoredPageSession(browserPage);
    await expect
      .poll(() => authoredPage.previewText())
      .toContain('Start writing your book here.');
  });

  test('the overflow is reported by line, and the book it happened in is still on screen', async () => {
    // #given: an author writing a card
    // #when: they put six paragraphs on it
    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);

    // #then: the editor names the line the page was declared on and how many pages
    // it took, the book the engine produced is still in the preview, and none of it
    // is reported as the preview having failed -- a book was produced
    await expect(authoredPage.status()).toBeVisible();
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('line 5 took 2 pages');
    const status = (await authoredPage.statusText()) ?? '';
    const preview = await authoredPage.previewText();
    expect(status).not.toContain('Preview is out of date');
    expect(preview).toContain('Paragraph 1.');
    expect(preview).toContain('Short prose before the card.');
  });

  test('the report clears when the content fits again', async () => {
    // #given: a page the author has been told does not fit
    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('line 5 took 2 pages');

    // #when: they cut it back to something that fits
    await authoredPage.replaceSource(A_PAGE_THAT_FITS);
    await expect
      .poll(() => authoredPage.previewText())
      .toContain('A card that stands on its own.');

    // #then: the editor stops telling them about a problem they have already solved
    await expect(authoredPage.status()).toBeHidden();
  });

  test('a standing report survives a repaint that could not produce a book', async () => {
    // #given: a page the author has been told does not fit
    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('line 5 took 2 pages');

    // #when: their next keystroke leaves the page unclosed, so the repaint cannot
    // produce a book and the preview keeps the one it produced last
    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT_AND_IS_NEVER_CLOSED);
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('Preview is out of date');

    // #then: the overflow is still reported, because the book still on screen is
    // the one it is true of -- clearing it would report a book nobody can see
    const status = (await authoredPage.statusText()) ?? '';
    const preview = await authoredPage.previewText();
    expect(status).toContain('line 5 took 2 pages');
    expect(preview).toContain('Paragraph 1.');
  });

  test('a later overflow replaces the one before it instead of joining it', async () => {
    // #given: a page at line 5 the author has been told does not fit
    await authoredPage.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('line 5 took 2 pages');

    // #when: they rewrite the book into two different pages, both overrun
    await authoredPage.replaceSource(TWO_PAGES_THAT_DO_NOT_FIT);
    await expect
      .poll(() => authoredPage.statusText())
      .toContain('line 16 took 2 pages');

    // #then: they read about the two pages in front of them and not about the one
    // they have already replaced
    const status = (await authoredPage.statusText()) ?? '';
    expect(status).toContain('line 2 took 2 pages');
    expect(status).toContain('line 16 took 2 pages');
    expect(status).not.toContain('line 5 took');
  });
});

test.describe('overflow and printing failures share the status surface independently', () => {
  let printing: PrintingSession;

  test.beforeEach(async ({ page: browserPage }) => {
    printing = await openPrintingSession(browserPage, 'overflow-print-error');
    await expect
      .poll(() => printing.previewText())
      .toContain('Start writing your book here.');
  });

  test('a standing print failure survives an overflow appearing and clearing', async () => {
    // #given: a print failure the author has not acknowledged
    await printing.print();
    await expect.poll(() => printing.statusText()).toContain('Printing failed');

    // #when: a page overflows, and is then cut back until it fits
    await printing.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);
    await expect.poll(() => printing.statusText()).toContain('line 5 took 2 pages');
    const whileOverflowing = (await printing.statusText()) ?? '';

    await printing.replaceSource(A_PAGE_THAT_FITS);
    await expect
      .poll(() => printing.previewText())
      .toContain('A card that stands on its own.');
    const afterItFits = (await printing.statusText()) ?? '';

    // #then: the print failure is still there throughout -- neither the overflow
    // report arriving nor its clearing took it away
    expect(whileOverflowing).toContain('Printing failed');
    expect(afterItFits).toContain('Printing failed');
    expect(afterItFits).not.toContain('did not fit');
  });

  test('a standing overflow report survives a print failure arriving', async () => {
    // #given: a page the author has been told does not fit
    await printing.replaceSource(A_PAGE_THAT_DOES_NOT_FIT);
    await expect.poll(() => printing.statusText()).toContain('line 5 took 2 pages');

    // #when: they try to print, and printing fails
    await printing.print();
    await expect.poll(() => printing.statusText()).toContain('Printing failed');

    // #then: the overflow is still reported alongside it
    expect(await printing.statusText()).toContain('line 5 took 2 pages');
  });
});
