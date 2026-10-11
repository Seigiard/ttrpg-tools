import { expect, test } from '@playwright/test';

const routes = [
  '/',
  '/mausritter/locations/',
  '/mausritter/weather/',
  '/mausritter/encounters/',
  '/the-black-hack/prices/',
  '/paper-minis/',
];

for (const route of routes) {
  test(`${route} fits a narrow screen`, async ({ page }) => {
    // #given
    await page.setViewportSize({ width: 320, height: 780 });

    // #when
    await page.goto(route);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

    // #then
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
      .toBe(false);
  });

  if (route === '/') continue;

  test(`${route} has touch-sized buttons`, async ({ page }) => {
    // #given
    await page.setViewportSize({ width: 320, height: 780 });

    // #when
    await page.goto(route);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await expect(page.locator('main button').first()).toBeVisible();

    // #then
    const undersized = await page.locator('main button').evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const { width, height } = button.getBoundingClientRect();

        if (width === 0 || height === 0 || (width >= 44 && height >= 44)) return [];

        return [button.getAttribute('aria-label') ?? button.textContent?.trim()];
      }),
    );
    expect(undersized).toEqual([]);
  });
}

for (const direction of ['ltr', 'rtl']) {
  test(`the rolled location rows have a non-colour marker at the inline start in ${direction}`, async ({
    page,
  }) => {
    // #given
    await page.goto('/mausritter/locations/');
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

    // #when
    await page.locator('html').evaluate((html, dir) => {
      html.setAttribute('dir', dir);
    }, direction);

    // #then
    for (const table of ['reference-landmarks', 'reference-details']) {
      const markedRows = await page
        .getByTestId(table)
        .locator('li')
        .evaluateAll((rows) =>
          rows
            .filter((row) => {
              const style = getComputedStyle(row);

              return (
                style.borderInlineStartStyle === 'solid' &&
                parseFloat(style.borderInlineStartWidth) > 0
              );
            })
            .map((row) => row.getAttribute('data-hit')),
        );
      expect(markedRows).toEqual(['true']);
    }
  });
}

for (const route of ['/mausritter/locations/', '/mausritter/weather/', '/the-black-hack/prices/']) {
  for (const width of [320, 768]) {
    test(`${route} keeps tab labels inside equal-height controls at ${width}px`, async ({
      page,
    }) => {
      // #given
      await page.setViewportSize({ width, height: 900 });

      // #when
      await page.goto(route);
      await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
      const tabs = page.getByRole('tab');
      await expect(tabs.first()).toBeVisible();

      // #then
      const layout = await tabs.evaluateAll((controls) => {
        const wrappedLabels: (string | null)[] = [];
        const overflowingLabels: (string | null)[] = [];
        const heights = new Set<number>();

        for (const control of controls) {
          const range = document.createRange();
          range.selectNodeContents(control);
          const textBox = range.getBoundingClientRect();
          const controlBox = control.getBoundingClientRect();

          if (range.getClientRects().length !== 1) wrappedLabels.push(control.textContent);
          if (textBox.left < controlBox.left || textBox.right > controlBox.right) {
            overflowingLabels.push(control.textContent);
          }
          heights.add(controlBox.height);
        }

        return { wrappedLabels, overflowingLabels, unequalHeights: heights.size !== 1 };
      });
      expect(layout).toEqual({ wrappedLabels: [], overflowingLabels: [], unequalHeights: false });
    });
  }
}
