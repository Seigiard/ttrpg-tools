import type { Locator, Page as BrowserPage } from '@playwright/test';

import { connectAppHost, type AppScenarioName } from './private/app-session';

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
  const activePreviewFrame = browserPage.locator(
    '#preview > iframe[data-grimoire-preview-document]:not([aria-hidden])',
  );

  const renderedBook = async () => {
    if ((await activePreviewFrame.count()) === 0) return browserPage.locator('#preview');
    return activePreviewFrame.contentFrame().locator('body');
  };

  return {
    replaceSource: (source) => transport.call('replaceSource', { source }),

    status: () => browserPage.locator('#status'),

    statusText: () => browserPage.locator('#status').textContent(),

    async previewText() {
      return (await renderedBook()).textContent().then((text) => text ?? '');
    },

    async renderedSheetCount() {
      return (await renderedBook()).locator('[data-vivliostyle-page-index]').count();
    },
  };
}
