import type { BookLayoutObservation, FlowingHeaderObservation, SourcePosition } from '../book';

interface PaginationObservation {
  readonly pageCount: number;
  readonly pageSizes: BookLayoutObservation['pageSizes'];
}

export function observeBookLayout(
  container: HTMLElement,
  pagination: PaginationObservation,
): BookLayoutObservation {
  const positions: Record<string, SourcePosition> = {};

  for (const element of container.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = element.dataset.line;
    if (line === undefined) continue;

    const current = positions[line];
    const pageElement = element.closest<HTMLElement>('[data-vivliostyle-page-index]');
    const pageIndex =
      pageElement === null ? null : Number(pageElement.dataset.vivliostylePageIndex);

    if (current === undefined) positions[line] = { pageIndex };
    if (current?.x !== undefined) continue;

    const rect = element.getClientRects()[0];
    if (rect !== undefined) positions[line] = { ...positions[line]!, x: rect.x, y: rect.y };
  }

  return { pageCount: pagination.pageCount, pageSizes: pagination.pageSizes, positions };
}

export function observeFlowingHeaders(container: HTMLElement): FlowingHeaderObservation[] {
  const pages: FlowingHeaderObservation[] = [];

  for (const pageElement of container.querySelectorAll<HTMLElement>(
    '[data-vivliostyle-page-index]',
  )) {
    const header = pageElement.querySelector<HTMLElement>(
      '[data-vivliostyle-page-margin-box="top-center"]',
    );
    const pageNumber = pageElement.querySelector<HTMLElement>(
      '[data-vivliostyle-page-margin-box="bottom-center"]',
    );

    pages.push({
      pageIndex: Number(pageElement.dataset.vivliostylePageIndex),
      header: header?.textContent?.trim(),
      pageNumber: pageNumber?.textContent?.trim(),
    });
  }

  return pages.toSorted((left, right) => left.pageIndex - right.pageIndex);
}
