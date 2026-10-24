import { expect, test, type Locator } from '@playwright/test';

async function measureTabLayout(controls: Locator) {
  return controls.evaluateAll((controls) => {
    const wrappedLabels: (string | null)[] = [];
    const overflowingLabels: (string | null)[] = [];
    const heights = new Set<number>();

    for (const control of controls) {
      const lineBoxes: { bottom: number; top: number }[] = [];
      let textLeft = Infinity;
      let textRight = -Infinity;
      const textNodes = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      let textNode = textNodes.nextNode();

      while (textNode) {
        const range = document.createRange();
        range.selectNodeContents(textNode);

        for (const box of range.getClientRects()) {
          textLeft = Math.min(textLeft, box.left);
          textRight = Math.max(textRight, box.right);

          const line = lineBoxes.find(
            (line) => box.top < line.bottom && box.bottom > line.top,
          );

          if (line) {
            line.top = Math.min(line.top, box.top);
            line.bottom = Math.max(line.bottom, box.bottom);
          } else {
            lineBoxes.push({ bottom: box.bottom, top: box.top });
          }
        }

        textNode = textNodes.nextNode();
      }

      const controlBox = control.getBoundingClientRect();

      if (lineBoxes.length !== 1) wrappedLabels.push(control.textContent);
      if (textLeft < controlBox.left || textRight > controlBox.right) {
        overflowingLabels.push(control.textContent);
      }
      heights.add(controlBox.height);
    }

    return { wrappedLabels, overflowingLabels, unequalHeights: heights.size !== 1 };
  });
}

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

test('the selected generator tab has the primary fill while unselected tabs stay transparent', async ({
  page,
}) => {
  // #given
  await page.goto('/mausritter/locations/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const selected = page.getByRole('tab', { selected: true });
  const unselected = page.getByRole('tab', { selected: false }).first();

  // #when
  await expect
    .poll(() => selected.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('');
  const appearance = await Promise.all(
    [selected, unselected].map((tab) =>
      tab.evaluate((element) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) throw new Error('Canvas 2D context is unavailable');

        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);

        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }),
    ),
  );

  // #then
  expect(appearance).toEqual([
    [180, 83, 9, 255],
    [0, 0, 0, 0],
  ]);
});

test('arrowing between price tabs does not change the generator until Enter activates it', async ({
  page,
}) => {
  // #given
  await page.goto('/the-black-hack/prices/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const rural = page.getByRole('tab', { name: 'Сельская местность', exact: true });
  await expect(rural).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/the-black-hack\/prices\/\?s=rural&r=[0-9a-z]{1,7}\.[0-9a-z]+$/);
  const urlBeforeFocus = page.url();
  const priceBeforeFocus = await page.getByTestId('item-price').first().textContent();
  await rural.focus();

  // #when
  await page.keyboard.press('ArrowRight');
  const afterArrow = {
    selected: await page.getByRole('tab', { selected: true }).textContent(),
    categories: await page
      .locator('section[data-testid^="category-"]')
      .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-testid'))),
    priceUnchanged:
      (await page.getByTestId('item-price').first().textContent()) === priceBeforeFocus,
    urlUnchanged: page.url() === urlBeforeFocus,
  };
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/the-black-hack\/prices\/\?s=town&r=[0-9a-z]{1,7}\.[0-9a-z]+$/);
  const afterActivation = {
    selected: await page.getByRole('tab', { selected: true }).textContent(),
    categories: await page
      .locator('section[data-testid^="category-"]')
      .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-testid'))),
    urlChanged: page.url() !== urlBeforeFocus,
  };

  // #then
  expect({ afterArrow, afterActivation }).toEqual({
    afterArrow: {
      selected: 'Сельская местность',
      categories: ['category-common'],
      priceUnchanged: true,
      urlUnchanged: true,
    },
    afterActivation: {
      selected: 'Город',
      categories: ['category-common', 'category-rare'],
      urlChanged: true,
    },
  });
});

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
      // React Aria replaces the hydrated tabs with new nodes after the island loses `ssr`,
      // so a single measurement can catch the detached nodes; poll until the settled tabs answer.
      await expect
        .poll(() => measureTabLayout(tabs))
        .toEqual({ wrappedLabels: [], overflowingLabels: [], unequalHeights: false });
    });
  }
}
