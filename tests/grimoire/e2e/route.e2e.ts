import { expect, test, type Page } from '@playwright/test';

const PREVIEW_FRAME = '#preview iframe[data-grimoire-preview-document]';

async function renderedFonts(page: Page, selector: string) {
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');

  try {
    const { root } = await session.send('DOM.getDocument');
    const { nodeId: frameNodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: PREVIEW_FRAME,
    });
    const { node: frameNode } = await session.send('DOM.describeNode', {
      nodeId: frameNodeId,
      depth: 1,
      pierce: true,
    });
    const documentNodeId = frameNode.contentDocument?.nodeId;
    if (documentNodeId === undefined) throw new Error(`No document found in ${PREVIEW_FRAME}`);

    const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentNodeId, selector });
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
  const preview = page.frameLocator(PREVIEW_FRAME);

  await expect(page.getByRole('link', { name: /TTRPG Tools/ })).toBeVisible();
  await expect(page.locator('#editor .cm-editor')).toBeVisible();
  await expect(preview.locator('body')).toContainText('Start writing your book here.');
  await expect
    .poll(() => preview.locator('[data-vivliostyle-page-index]').count())
    .toBeGreaterThan(0);
});

test('a new book previews with the bundled theme fonts', async ({ page }) => {
  await page.goto('/grimoire');
  const preview = page.frameLocator(PREVIEW_FRAME);
  await expect(preview.locator('[data-vivliostyle-page-index] p')).toBeVisible();

  const headingFonts = await renderedFonts(page, '[data-vivliostyle-page-index] h1');
  const bodyFonts = await renderedFonts(page, '[data-vivliostyle-page-index] p');

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

test('a new book fits the preview without inheriting editor-shell styles', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/grimoire');

  const preview = page.frameLocator(PREVIEW_FRAME);
  await expect
    .poll(() => preview.locator('[data-vivliostyle-page-index] p').count())
    .toBeGreaterThan(0);

  const layout = await preview.locator('body').evaluate((body) => {
    const viewport = body.querySelector<HTMLElement>('[data-vivliostyle-viewer-viewport]');
    const page = body.querySelector<HTMLElement>('[data-vivliostyle-page-index]');
    const heading = page?.querySelector<HTMLElement>('h1');
    const paragraph = page?.querySelector<HTMLElement>('p');
    if (!viewport || !page || !heading || !paragraph) throw new Error('The new book did not render');

    const previewRect = viewport.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const paragraphRect = paragraph.getBoundingClientRect();
    const headingStyle = getComputedStyle(heading);
    const paragraphStyle = getComputedStyle(paragraph);

    return {
      preview: { width: previewRect.width, height: previewRect.height },
      page: {
        left: pageRect.left - previewRect.left,
        top: pageRect.top - previewRect.top,
        right: pageRect.right - previewRect.left,
        bottom: pageRect.bottom - previewRect.top,
      },
      heading: {
        bottom: headingRect.bottom - previewRect.top,
        borderStyle: headingStyle.borderStyle,
      },
      paragraph: {
        left: paragraphRect.left - previewRect.left,
        top: paragraphRect.top - previewRect.top,
        right: paragraphRect.right - previewRect.left,
        borderStyle: paragraphStyle.borderStyle,
      },
      shellBorderToken: headingStyle.getPropertyValue('--color-border'),
    };
  });

  expect(layout.page.left).toBeGreaterThanOrEqual(0);
  expect(layout.page.top).toBeGreaterThanOrEqual(0);
  expect(layout.page.right).toBeLessThanOrEqual(layout.preview.width);
  expect(layout.page.bottom).toBeLessThanOrEqual(layout.preview.height);
  expect(layout.paragraph.left).toBeGreaterThanOrEqual(layout.page.left);
  expect(layout.paragraph.right).toBeLessThanOrEqual(layout.page.right);
  expect(layout.paragraph.top).toBeGreaterThanOrEqual(layout.heading.bottom);
  expect(layout.heading.borderStyle).toBe('none');
  expect(layout.paragraph.borderStyle).toBe('none');
  expect(layout.shellBorderToken).toBe('');

  await page.setViewportSize({ width: 900, height: 600 });
  await expect
    .poll(async () => {
      const resized = await preview.locator('body').evaluate((body) => {
        const viewport = body.querySelector<HTMLElement>('[data-vivliostyle-viewer-viewport]');
        const page = body.querySelector<HTMLElement>('[data-vivliostyle-page-index]');
        if (!viewport || !page) return false;

        const viewportRect = viewport.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        return pageRect.right <= viewportRect.right && pageRect.bottom <= viewportRect.bottom;
      });
      return resized;
    })
    .toBe(true);
});

test('a failed isolated repaint keeps the last paginated book on screen', async ({ page }) => {
  await page.goto('/grimoire');
  const preview = page.frameLocator(PREVIEW_FRAME);
  await expect(preview.locator('body')).toContainText('Start writing your book here.');
  const lastGoodBook = await preview.locator('body').textContent();

  await page.evaluate(() => {
    URL.createObjectURL = () => `blob:${location.origin}/a-blob-url-that-resolves-to-nothing`;
  });
  await page.locator('.cm-editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('# A book the engine cannot load\n\nThis must not replace the preview.\n');

  await expect(page.locator('#status')).toContainText('the pagination engine could not lay out the book');
  await expect(page.locator(PREVIEW_FRAME)).toHaveCount(1);
  expect(await preview.locator('body').textContent()).toBe(lastGoodBook);
});
