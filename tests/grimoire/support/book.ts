import type { Page as BrowserPage } from '@playwright/test';

import { connectBrowserTransport } from './browser-transport';

const REAL_ENGINE_HOST = '/tests/grimoire/fixtures/real-engine-host.html';

export interface PhysicalSheetSize {
  readonly width: number;
  readonly height: number;
}

export interface SourcePosition {
  readonly x?: number;
  readonly y?: number;
  readonly pageIndex: number | null;
}

export interface BookLayoutObservation {
  readonly pageCount: number;
  readonly pageSizes: readonly PhysicalSheetSize[];
  readonly positions: Readonly<Record<string, SourcePosition>>;
}

export interface FlowingHeaderObservation {
  readonly pageIndex: number;
  readonly header: string | undefined;
  readonly pageNumber: string | undefined;
}

export type SheetOrientation = 'portrait' | 'landscape';

export interface PhysicalSheetObservation extends PhysicalSheetSize {
  readonly sheetIndex: number;
  readonly orientation: SheetOrientation;
  readonly runningHeader: string | undefined;
  readonly pageNumber: string | undefined;
}

export interface AuthoredPageBox {
  readonly sheetIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly frameHeight: number;
}

export interface OverflowingAuthoredPage {
  readonly line: number;
  readonly pages: number;
}

export interface AuthoredPageObservation {
  readonly pageCount: number;
  readonly sheets: readonly PhysicalSheetObservation[];
  /** Keyed `line-<data-line>` or `probe-<data-probe>`. */
  readonly boxes: Record<string, AuthoredPageBox | undefined>;
  readonly overflowingPages: readonly OverflowingAuthoredPage[];
}

interface RenderInput {
  readonly source: string;
  readonly extraThemeCss?: string;
}

export interface BookTestSurface {
  pageCount(input: { readonly source: string }): Promise<number>;
  layout(input: RenderInput): Promise<BookLayoutObservation>;
  authoredPage(input: RenderInput): Promise<AuthoredPageObservation>;
  flowingHeaders(input: RenderInput): Promise<readonly FlowingHeaderObservation[]>;
}

export interface BookDriver {
  pageCount(source: string): Promise<number>;
  layout(source: string, extraThemeCss?: string): Promise<BookLayoutObservation>;
  authoredPage(source: string, extraThemeCss?: string): Promise<AuthoredPageObservation>;
  flowingHeaders(
    source: string,
    extraThemeCss?: string,
  ): Promise<readonly FlowingHeaderObservation[]>;
}

export async function openBookDriver(browserPage: BrowserPage): Promise<BookDriver> {
  const transport = await connectBrowserTransport<BookTestSurface>(browserPage, REAL_ENGINE_HOST);

  return {
    pageCount: (source) => transport.call('pageCount', { source }),
    layout: (source, extraThemeCss) => transport.call('layout', { source, extraThemeCss }),
    authoredPage: (source, extraThemeCss) =>
      transport.call('authoredPage', { source, extraThemeCss }),
    flowingHeaders: (source, extraThemeCss) =>
      transport.call('flowingHeaders', { source, extraThemeCss }),
  };
}
