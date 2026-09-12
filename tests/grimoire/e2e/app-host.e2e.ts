import { expect, test } from '@playwright/test';

test.describe('full-app host', () => {
  test('the production scenario renders the preview in an isolated document', async ({ page }) => {
    await page.goto('/tests/grimoire/fixtures/app-host.html?scenario=production');

    const previewFrame = page.locator('#preview > iframe[data-grimoire-preview-document]:not([aria-hidden])');
    await expect(previewFrame).toHaveCount(1);
    await expect
      .poll(() => previewFrame.evaluate((frame: HTMLIFrameElement) => frame.contentDocument?.body.textContent ?? ''))
      .toContain('Start writing your book here.');
  });
});
