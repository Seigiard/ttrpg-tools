import type { Page as BrowserPage } from '@playwright/test';

import { connectBrowserTransport } from './browser-transport';

export const PRINT_CAPTURE_HOST = '/tests/grimoire/fixtures/print-capture-host.html';

export interface PrintCaptureSurface {
  renderPrintReadyHtml(input: { readonly source: string }): Promise<string>;
}

export interface PrintCaptureDriver {
  renderPrintReadyHtml(source: string): Promise<string>;
}

export async function connectPrintCaptureHost(
  browserPage: BrowserPage,
  hostUrl: string,
): Promise<PrintCaptureDriver> {
  const transport = await connectBrowserTransport<PrintCaptureSurface>(browserPage, hostUrl);

  return {
    renderPrintReadyHtml: (source) => transport.call('renderPrintReadyHtml', { source }),
  };
}
