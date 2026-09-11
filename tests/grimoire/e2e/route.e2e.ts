import { expect, test, type Page } from '@playwright/test';

async function renderedFonts(page: Page, selector: string) {
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');

  try {
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (nodeId === 0) throw new Error(`No element matches ${selector}`);
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map(({ familyName, isCustomFont }) => ({ familyName, isCustomFont }));
  } finally {
    await session.detach();
  }
}

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

test('a new book previews with the bundled theme fonts', async ({ page }) => {
  await page.goto('/grimoire');
  await expect(page.locator('#preview [data-vivliostyle-page-index] p')).toBeVisible();

  const headingFonts = await renderedFonts(page, '#preview [data-vivliostyle-page-index] h1');
  const bodyFonts = await renderedFonts(page, '#preview [data-vivliostyle-page-index] p');

  expect(headingFonts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ familyName: expect.stringContaining('Alegreya'), isCustomFont: true }),
    ]),
  );
  expect(bodyFonts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ familyName: expect.stringContaining('Vollkorn'), isCustomFont: true }),
    ]),
  );
});
