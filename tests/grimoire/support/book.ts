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

interface RenderInput {
  readonly source: string;
  readonly extraThemeCss?: string;
}

export interface BookTestSurface {
  pageCount(input: { readonly source: string }): Promise<number>;
  layout(input: RenderInput): Promise<BookLayoutObservation>;
  flowingHeaders(input: RenderInput): Promise<readonly FlowingHeaderObservation[]>;
}

export interface BookDriver {
  pageCount(source: string): Promise<number>;
  layout(source: string, extraThemeCss?: string): Promise<BookLayoutObservation>;
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
    flowingHeaders: (source, extraThemeCss) =>
      transport.call('flowingHeaders', { source, extraThemeCss }),
  };
}
