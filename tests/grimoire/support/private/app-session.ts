import type { Page as BrowserPage } from '@playwright/test';

import { connectBrowserTransport, type BrowserTransport } from '../browser-transport';

const APP_HOST = '/tests/grimoire/fixtures/app-host.html';

/**
 * Every application scenario the full-app host can mount. A closed union rather than
 * a free string: a scenario decides which production seams are replaced, so a typo
 * must not quietly run a different adapter combination than the test names.
 */
export type AppScenarioName = 'production' | 'persistence-disabled' | 'saved-file' | 'saved-file-load-race';

/**
 * What the mounted application offers concept drivers. Each driver re-exposes only
 * the part of it its own concept is about, so an operation belonging to one concept
 * cannot be reached through another concept's session.
 */
export interface AppTestSurface {
  source(): string;
}

export function connectAppHost(
  browserPage: BrowserPage,
  scenario: AppScenarioName,
): Promise<BrowserTransport<AppTestSurface>> {
  return connectBrowserTransport<AppTestSurface>(browserPage, `${APP_HOST}?scenario=${scenario}`);
}
