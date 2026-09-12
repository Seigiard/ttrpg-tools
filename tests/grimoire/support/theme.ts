import type { Page as BrowserPage } from '@playwright/test';

import { connectBrowserTransport } from './browser-transport';

const REAL_ENGINE_HOST = '/tests/grimoire/fixtures/real-engine-host.html';

interface ThemeRenderInput {
  readonly source: string;
}

export interface RenderedElementFontObservation {
  readonly document: string | undefined;
  readonly heading: string | undefined;
  readonly body: string | undefined;
  readonly emphasizedBody: string | undefined;
}

export interface MarginBoxFontObservation {
  readonly runningHeader: string | undefined;
  readonly pageNumber: string | undefined;
}

export interface ThemeTestSurface {
  renderedElementFonts(input: ThemeRenderInput): Promise<RenderedElementFontObservation>;
  marginBoxFonts(input: ThemeRenderInput): Promise<MarginBoxFontObservation>;
}

export interface ThemeDriver {
  renderedElementFonts(source: string): Promise<RenderedElementFontObservation>;
  marginBoxFonts(source: string): Promise<MarginBoxFontObservation>;
}

export async function openThemeDriver(browserPage: BrowserPage): Promise<ThemeDriver> {
  const transport = await connectBrowserTransport<ThemeTestSurface>(browserPage, REAL_ENGINE_HOST);

  return {
    renderedElementFonts: (source) => transport.call('renderedElementFonts', { source }),
    marginBoxFonts: (source) => transport.call('marginBoxFonts', { source }),
  };
}
