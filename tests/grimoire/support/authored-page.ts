import type { Locator, Page as BrowserPage } from '@playwright/test';

import { connectAppHost, type AppScenarioName } from './private/app-session';
import { activePreviewBody } from './private/preview-body';

type AuthoredPageScenarioName = Extract<AppScenarioName, 'authored-page'>;
type IsolatedAuthoredPageScenarioName = Extract<AppScenarioName, 'authored-page-isolated'>;

export interface AuthoredPageSession {
  replaceSource(source: string): Promise<void>;
  status(): Locator;
  statusText(): Promise<string | null>;
  previewText(): Promise<string>;
  renderedSheetCount(): Promise<number>;
}

export async function openAuthoredPageSession(
  browserPage: BrowserPage,
  scenario: AuthoredPageScenarioName | IsolatedAuthoredPageScenarioName = 'authored-page',
): Promise<AuthoredPageSession> {
  const transport = await connectAppHost(browserPage, scenario);

  return {
    replaceSource: (source) => transport.call('replaceSource', { source }),

    status: () => browserPage.locator('#status'),

    statusText: () => browserPage.locator('#status').textContent(),

    async previewText() {
      return (await activePreviewBody(browserPage)).textContent().then((text) => text ?? '');
    },

    async renderedSheetCount() {
      return (await activePreviewBody(browserPage))
        .locator('[data-vivliostyle-page-index]')
        .count();
    },
  };
}
