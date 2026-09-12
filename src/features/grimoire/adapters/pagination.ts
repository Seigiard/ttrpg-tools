import { createPagination } from './private/create-pagination';
import { createVivliostylePaginationSession } from './private/pagination-session';
import { createBrowserPreviewTransactionFactory } from './private/preview-transaction';
import { browserScheduler } from './private/scheduler';

/**
 * A page (CONTEXT.md's Page) the engine spread over more than one physical page:
 * the source line the author declared it on, and how many physical pages its
 * content actually took. Never fewer than two -- a page that fits is not reported.
 */
export interface OverflowingPage {
  readonly line: number;
  readonly pages: number;
}

export interface PaginationResult {
  readonly pageCount: number;
  /** Each page's rendered size in CSS pixels, driven by the book's `@page size`. */
  readonly pageSizes: ReadonlyArray<{ readonly width: number; readonly height: number }>;
  /** The authored pages whose content did not fit on one physical page. */
  readonly overflowingPages: readonly OverflowingPage[];
}

export interface PaginationOptions {
  /** Direct is the compatibility default used by focused engine fixtures. */
  readonly mode?: 'direct' | 'isolated';
}

const paginateWithBrowserScheduler = createPagination(
  browserScheduler,
  createBrowserPreviewTransactionFactory(),
  createVivliostylePaginationSession(),
);

/**
 * Paginates an HTML document (as produced by `core/render-book`) into `container`
 * using the real Vivliostyle engine (ADR-0002). Resolves once the whole book has laid
 * out, carrying Vivliostyle's own page count and rendered page sizes.
 *
 * The operation is all-or-nothing about `container`'s contents (issue #11). Isolated
 * mode lays the next book out in an attached, off-screen iframe and swaps it in only
 * on success (ADR-0008). Direct mode remains the compatibility default for focused
 * adapter fixtures and restores the previous container after failure (ADR-0005).
 *
 * It rejects if the engine makes no progress for 30 seconds. Each progress event
 * restarts that inactivity bound. The engine cannot be canceled, but listeners are
 * removed when the attempt settles so a late answer cannot settle it again.
 */
export function paginate(
  container: HTMLElement,
  html: string,
  options: PaginationOptions = {},
): Promise<PaginationResult> {
  return paginateWithBrowserScheduler(container, html, options);
}
