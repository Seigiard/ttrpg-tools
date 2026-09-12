import { EngineTimeoutError } from '../engine-timeout';
import type {
  OverflowingPage,
  PaginationOptions,
  PaginationResult,
} from '../pagination';
import { createVivliostylePaginationSession } from './pagination-session';
import { createBrowserPreviewTransactionFactory } from './preview-transaction';
import type { Schedule, Scheduler } from './scheduler';

const PAGINATION_TIMEOUT_SECONDS = 30;

export interface PaginationSessionTarget {
  readonly viewportElement: HTMLElement;
  readonly viewerWindow?: Window;
  readonly fitToScreen: boolean;
}

export interface PreviewTransaction extends PaginationSessionTarget {
  commit(): void;
  rollback(): void;
}

export interface PreviewTransactionFactory {
  create(container: HTMLElement, options: PaginationOptions): PreviewTransaction;
}

export interface PaginationSessionObserver {
  progress(pageCount: number): void;
  loaded(result: Pick<PaginationResult, 'pageCount' | 'pageSizes'>): void;
  failed(error: Error): void;
}

export interface PaginationSession {
  start(
    html: string,
    target: PaginationSessionTarget,
    observer: PaginationSessionObserver,
  ): () => void;
}

export function createPagination(
  scheduler: Scheduler,
  transactions: PreviewTransactionFactory = createBrowserPreviewTransactionFactory(),
  session: PaginationSession = createVivliostylePaginationSession(),
): (
  container: HTMLElement,
  html: string,
  options?: PaginationOptions,
) => Promise<PaginationResult> {
  return function paginate(
    container: HTMLElement,
    html: string,
    options: PaginationOptions = {},
  ): Promise<PaginationResult> {
    return new Promise((resolve, reject) => {
      let transaction: PreviewTransaction | undefined;
      let timeout: Schedule | undefined;
      let cleanupSession: (() => void) | undefined;
      let cleanupRequested = false;
      let cleanedUp = false;
      let settled = false;
      let latestEpageCount: number | undefined;

      const succeed = (result: Pick<PaginationResult, 'pageCount' | 'pageSizes'>): void => {
        if (settled || transaction === undefined) return;
        try {
          const overflowingPages = findOverflowingPages(transaction.viewportElement);
          transaction.commit();
          settled = true;
          cleanup();
          resolve({
            pageCount: latestEpageCount ?? result.pageCount,
            pageSizes: result.pageSizes,
            overflowingPages,
          });
        } catch (error) {
          fail(error);
        }
      };
      const cleanup = (): void => {
        if (cleanedUp) return;
        if (timeout !== undefined) scheduler.cancel(timeout);
        if (cleanupSession === undefined) {
          cleanupRequested = true;
          return;
        }
        cleanedUp = true;
        cleanupSession();
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        transaction?.rollback();
        reject(error);
      };
      const armTimeout = (): void => {
        if (timeout !== undefined) scheduler.cancel(timeout);
        timeout = scheduler.schedule(
          () => fail(new EngineTimeoutError(PAGINATION_TIMEOUT_SECONDS)),
          PAGINATION_TIMEOUT_SECONDS * 1000,
        );
      };

      try {
        transaction = transactions.create(container, options);
        armTimeout();
        cleanupSession = session.start(html, transaction, {
          progress(pageCount) {
            if (settled) return;
            latestEpageCount = pageCount;
            armTimeout();
          },
          loaded: succeed,
          failed: fail,
        });
        if (cleanupRequested) cleanup();
      } catch (error) {
        fail(error);
      }
    });
  };
}

function findOverflowingPages(container: HTMLElement): OverflowingPage[] {
  const physicalPagesByLine = new Map<number, Set<number>>();

  for (const element of container.querySelectorAll('[data-grimoire-page][data-line]')) {
    const line = Number(element.getAttribute('data-line'));
    const physicalPage = element.closest('[data-vivliostyle-page-index]');
    if (!Number.isInteger(line) || physicalPage === null) continue;

    const index = Number(physicalPage.getAttribute('data-vivliostyle-page-index'));
    if (!Number.isInteger(index)) continue;

    const indices = physicalPagesByLine.get(line) ?? new Set<number>();
    indices.add(index);
    physicalPagesByLine.set(line, indices);
  }

  return Array.from(physicalPagesByLine)
    .filter(([, indices]) => indices.size > 1)
    .map(([line, indices]) => ({ line, pages: indices.size }))
    .toSorted((left, right) => left.line - right.line);
}
