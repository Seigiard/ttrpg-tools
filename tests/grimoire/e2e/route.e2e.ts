import { expect, test } from '@playwright/test';

test('the main route does not load the Grimoire client entrypoint', async ({ page }) => {
  await page.goto('/');

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  expect(resources.some((url) => url.includes('/src/features/grimoire/main'))).toBe(false);
});

test('the Astro route mounts the editor and paginated preview inside the shared site shell', async ({
  page,
}) => {
  await page.goto('/grimoire');

  await expect(page.getByRole('link', { name: /TTRPG Tools/ })).toBeVisible();
  await expect(page.locator('#editor .cm-editor')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('Start writing your book here.');
  await expect
    .poll(() => page.locator('#preview [data-vivliostyle-page-index]').count())
    .toBeGreaterThan(0);
});
