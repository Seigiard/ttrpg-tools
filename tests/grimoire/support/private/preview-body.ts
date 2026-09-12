import type { Locator, Page as BrowserPage } from '@playwright/test';

export async function activePreviewBody(browserPage: BrowserPage): Promise<Locator> {
  const activePreviewFrame = browserPage.locator(
    '#preview > iframe[data-grimoire-preview-document]:not([aria-hidden])',
  );

  if ((await activePreviewFrame.count()) === 0) return browserPage.locator('#preview');

  return activePreviewFrame.contentFrame().locator('body');
}
