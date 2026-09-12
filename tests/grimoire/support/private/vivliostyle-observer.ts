import type {
  AuthoredPageBox,
  AuthoredPageObservation,
  BookLayoutObservation,
  FlowingHeaderObservation,
  SourcePosition,
} from '../book';

interface PaginationObservation {
  readonly pageCount: number;
  readonly pageSizes: BookLayoutObservation['pageSizes'];
  readonly overflowingPages?: AuthoredPageObservation['overflowingPages'];
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

export function observeAuthoredPageLayout(
  container: HTMLElement,
  pagination: PaginationObservation,
): AuthoredPageObservation {
  for (const pageContainer of container.querySelectorAll<HTMLElement>(
    '[data-vivliostyle-page-container]',
  )) {
    pageContainer.style.display = 'block';
  }

  const headers = new Map(
    observeFlowingHeaders(container).map((sheet) => [sheet.pageIndex, sheet]),
  );
  const sheets = pagination.pageSizes.map((sheet, sheetIndex) => {
    const header = headers.get(sheetIndex);
    return {
      sheetIndex,
      width: sheet.width,
      height: sheet.height,
      orientation: sheet.width > sheet.height ? 'landscape' : 'portrait',
      runningHeader: header?.header,
      pageNumber: header?.pageNumber,
    } as const;
  });

  const boxes: Record<string, AuthoredPageBox | undefined> = {};
  const record = (key: string, element: HTMLElement): void => {
    if (boxes[key] !== undefined) return;

    const rect = element.getClientRects()[0];
    const sheetElement = element.closest<HTMLElement>('[data-vivliostyle-page-index]');
    if (rect === undefined || sheetElement === null) return;

    const sheet = sheetElement.getBoundingClientRect();
    const authoredPage = element.closest<HTMLElement>('[data-grimoire-page]');
    const pageArea = element.closest<HTMLElement>('[data-vivliostyle-page-area-container]');
    const origin =
      authoredPage === null || pageArea === null ? sheet : pageArea.getBoundingClientRect();
    boxes[key] = {
      sheetIndex: Number(sheetElement.dataset.vivliostylePageIndex),
      x: rect.x - origin.x,
      y: rect.y - origin.y,
      width: rect.width,
      height: rect.height,
      frameHeight: origin.height,
    };
  };

  for (const element of container.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = element.dataset.line;
    if (line !== undefined) record(`line-${line}`, element);
  }
  for (const element of container.querySelectorAll<HTMLElement>('[data-probe]')) {
    const probe = element.dataset.probe;
    if (probe !== undefined) record(`probe-${probe}`, element);
  }

  return {
    pageCount: pagination.pageCount,
    sheets,
    boxes,
    overflowingPages: pagination.overflowingPages ?? [],
  };
}
