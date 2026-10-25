import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const calibrationPointerScenarios: {
  name: string;
  fixture: string;
  direction: 'ltr' | 'rtl';
  hasBack: boolean;
  useArtworkCenter: boolean;
}[] = [
  {
    name: 'narrow LTR front',
    fixture: 'tall-80x800.png',
    direction: 'ltr',
    hasBack: false,
    useArtworkCenter: true,
  },
  {
    name: 'narrow LTR front and back',
    fixture: 'tall-80x800.png',
    direction: 'ltr',
    hasBack: true,
    useArtworkCenter: true,
  },
  {
    name: 'narrow RTL front',
    fixture: 'tall-80x800.png',
    direction: 'rtl',
    hasBack: false,
    useArtworkCenter: true,
  },
  {
    name: 'narrow RTL front and back',
    fixture: 'tall-80x800.png',
    direction: 'rtl',
    hasBack: true,
    useArtworkCenter: true,
  },
  {
    name: 'ordinary-width control',
    fixture: 'wide-800x80.png',
    direction: 'ltr',
    hasBack: false,
    useArtworkCenter: false,
  },
];

async function inspectImage(image: Locator, points: [number, number][]) {
  return image.evaluate(async (element, samplePoints) => {
    const loaded = element as HTMLImageElement;
    await loaded.decode();
    const canvas = document.createElement('canvas');
    canvas.width = loaded.naturalWidth;
    canvas.height = loaded.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context.');
    context.drawImage(loaded, 0, 0);
    return {
      size: [loaded.naturalWidth, loaded.naturalHeight],
      alpha: samplePoints.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]),
    };
  }, points);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/paper-minis/');
  await page.locator('astro-island:not([ssr])').waitFor();
});

test('prepares a WebP front at its decoded size', async ({ page }) => {
  // #given
  await page.getByRole('checkbox', { name: 'Обрезать пустые поля' }).uncheck();
  // #when
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('webp-5x3.webp'));
  const image = page.getByRole('img', { name: 'Лицевая сторона' });
  // #then
  expect(await inspectImage(image, [[2, 1]])).toEqual({ size: [5, 3], alpha: [255] });
});

test('normalization trims transparent margins to the figure bounds', async ({ page }) => {
  // #given
  const input = page.getByLabel('Добавить изображения', { exact: true });
  // #when
  await input.setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const image = page.getByRole('img', { name: 'Лицевая сторона' });
  // #then
  expect(
    await inspectImage(image, [
      [0, 0],
      [3, 0],
      [0, 2],
      [3, 2],
    ]),
  ).toEqual({ size: [4, 3], alpha: [255, 255, 255, 255] });
});

test('the header 3D scene has layout and textures its front face with uploaded artwork', async ({
  page,
}) => {
  // #given
  const input = page.getByLabel('Добавить изображения', { exact: true });

  // #when
  await input.setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const scene = page.getByTestId('mini-3d');
  await expect(scene).toHaveAttribute('data-art', 'artwork');
  await expect(scene).toHaveAttribute('data-t', '1');
  const frontFace = scene.locator('[data-part-role="frontFace"]');
  const artwork = frontFace.locator('img');
  await artwork.waitFor({ state: 'attached' });
  const [sceneLayout, frontFaceLayout, artworkLayout] = await Promise.all([
    scene.evaluate((element) => {
      const box = element.getBoundingClientRect();

      return {
        visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        hasWidth: box.width > 0,
        hasHeight: box.height > 0,
      };
    }),
    frontFace.evaluate((element) => {
      const box = element.getBoundingClientRect();

      return {
        visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        hasWidth: box.width > 0,
        hasHeight: box.height > 0,
      };
    }),
    artwork.evaluate(async (element) => {
      const image = element as HTMLImageElement;
      await image.decode();
      const box = image.getBoundingClientRect();

      return {
        visible: image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        hasWidth: box.width > 0,
        hasHeight: box.height > 0,
        naturalSize: [image.naturalWidth, image.naturalHeight],
      };
    }),
  ]);

  // #then
  expect({ sceneLayout, frontFaceLayout, artworkLayout }).toEqual({
    sceneLayout: { visible: true, hasWidth: true, hasHeight: true },
    frontFaceLayout: { visible: true, hasWidth: true, hasHeight: true },
    artworkLayout: {
      visible: true,
      hasWidth: true,
      hasHeight: true,
      naturalSize: [4, 3],
    },
  });
});

test('assembled wide and tall minis keep every part inside and centred for every base style', async ({
  page,
}) => {
  // #given
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixtures = ['wide-800x80.png', 'tall-80x800.png'];
  const baseStyles = [
    { value: 'tent', label: 'Складная', partCount: 6 },
    { value: 'flat', label: 'Плоская', partCount: 5 },
    { value: 'foamboard', label: 'На пенокартоне', partCount: 4 },
  ] as const;
  const observed: Record<
    string,
    { partCount: number; allPartsHaveLayout: boolean; allPartsInside: boolean; centred: boolean }
  > = {};

  // #when
  for (const fixtureName of fixtures) {
    await page.reload();
    await page.locator('astro-island:not([ssr])').waitFor();
    await page
      .getByLabel('Добавить изображения', { exact: true })
      .setInputFiles(fixture(fixtureName));

    for (const baseStyle of baseStyles) {
      const scene = page.getByTestId('mini-3d');

      if ((await scene.getAttribute('data-base-style')) !== baseStyle.value) {
        await page.getByRole('button', { name: /Складная|Плоская|На пенокартоне/ }).click();
        await page.getByRole('option', { name: baseStyle.label, exact: true }).click();
      }

      await expect(scene).toHaveAttribute('data-base-style', baseStyle.value);
      await expect(scene).toHaveAttribute('data-t', '1');
      observed[`${fixtureName}:${baseStyle.value}`] = await measureSceneFit(scene);
    }
  }

  // #then
  expect(observed).toEqual(
    Object.fromEntries(
      fixtures.flatMap((fixtureName) =>
        baseStyles.map((baseStyle) => [
          `${fixtureName}:${baseStyle.value}`,
          {
            partCount: baseStyle.partCount,
            allPartsHaveLayout: true,
            allPartsInside: true,
            centred: true,
          },
        ]),
      ),
    ),
  );
});

test('normalization failure keeps the original artwork and shows a warning', async ({ page }) => {
  // #given
  const expectedWarning = 'Не удалось обрезать изображение. Будет напечатан оригинал.';
  // #when
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('undecodable-7x9.png'));
  const warning = page.getByText(expectedWarning, { exact: true });
  await warning.waitFor({ state: 'visible' });
  // #then
  expect({
    warning: await warning.textContent(),
    rows: await page.locator('article').count(),
    canDownload: await page.getByRole('button', { name: 'Скачать PDF' }).isEnabled(),
  }).toEqual({ warning: expectedWarning, rows: 1, canDownload: true });
});

test('uploads a front and back and downloads a PDF', async ({ page }) => {
  // #given
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  // #when
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
    { name: 'hero.png', mimeType: 'image/png', buffer: Buffer.from(artwork) },
    { name: 'hero-back.png', mimeType: 'image/png', buffer: Buffer.from(artwork) },
  ]);
  const downloadButton = page.getByRole('button', { name: 'Скачать PDF' });
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('The browser did not save the downloaded PDF.');
  const bytes = await readFile(downloadPath);
  // #then
  expect({
    rows: await page.locator('article').count(),
    hasBack: await page.getByRole('button', { name: 'Оборот: hero-back.png' }).isVisible(),
    filename: /^paper-minis-\d{8}-\d{4}\.pdf$/.test(download.suggestedFilename()),
    signature: bytes.subarray(0, 5).toString('ascii'),
    hasBody: bytes.length > 5,
  }).toEqual({ rows: 1, hasBack: true, filename: true, signature: '%PDF-', hasBody: true });
});

test('height pickers share two-line choices, geometry, and the selected indicator', async ({
  page,
}) => {
  // #given
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
    { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
    { name: 'villain.png', mimeType: 'image/png', buffer: artwork },
  ]);
  const trigger = page.getByRole('button', { name: 'Высота существа' }).first();
  await expect(trigger).toBeVisible({ timeout: 1_000 });

  // #when
  await trigger.click();
  const listbox = page.getByRole('listbox');
  const tiny = listbox.getByRole('option', {
    name: 'Крошечный · 0,6 м фамильяр, бес, ястреб',
  });
  const medium = listbox.getByRole('option', {
    name: 'Средний · 1,7 м человек, эльф, орк',
  });
  await expect(tiny).toBeVisible();
  const tinyTitle = tiny.getByText('Крошечный · 0,6 м', { exact: true });
  const tinyTypical = tiny.getByText('фамильяр, бес, ястреб', { exact: true });
  const [titleBox, typicalBox] = await Promise.all([
    tinyTitle.boundingBox(),
    tinyTypical.boundingBox(),
  ]);
  const rowPresentation = {
    lines: (await tiny.innerText()).split('\n').filter(Boolean),
    geometry: await tiny.getAttribute('title'),
    description: await tiny.getAttribute('aria-description'),
    selected: await medium.getAttribute('aria-selected'),
    selectedIndicator: await medium.locator('svg').isVisible(),
    unselectedIndicators: await tiny.locator('svg').count(),
  };
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Сменить высоту' }).click();
  const bulkTiny = page.getByRole('menuitem', { name: /^Крошечный · 0,6 м/ });
  await expect(bulkTiny).toBeVisible();

  // #then
  expect({
    trigger: (await trigger.textContent())?.trim(),
    rowPresentation,
    twoLines:
      titleBox !== null && typicalBox !== null && typicalBox.y >= titleBox.y + titleBox.height,
    bulkLines: (await bulkTiny.innerText()).split('\n').filter(Boolean),
    bulkGeometry: await bulkTiny.getAttribute('title'),
  }).toEqual({
    trigger: 'Средний · 1,7 м',
    rowPresentation: {
      lines: ['Крошечный · 0,6 м', 'фамильяр, бес, ястреб'],
      geometry: 'Основание 20 мм · высота 12 мм',
      description: 'Основание 20 мм · высота 12 мм',
      selected: 'true',
      selectedIndicator: true,
      unselectedIndicators: 0,
    },
    twoLines: true,
    bulkLines: ['Крошечный · 0,6 м', 'фамильяр, бес, ястреб'],
    bulkGeometry: 'Основание 20 мм · высота 12 мм',
  });
});

test('row height and custom choices leave the other mini unchanged', async ({ page }) => {
  // #given
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
    { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
    { name: 'villain.png', mimeType: 'image/png', buffer: artwork },
  ]);
  const first = page.getByRole('article', { name: 'Миниатюра 1' });
  const second = page.getByRole('article', { name: 'Миниатюра 2' });
  const firstTrigger = first.getByRole('button', { name: 'Высота существа' });
  const secondTrigger = second.getByRole('button', { name: 'Высота существа' });
  await expect(firstTrigger).toBeVisible({ timeout: 1_000 });

  // #when
  await firstTrigger.click();
  await page.getByRole('option', { name: /^Маленький · 0,95 м/ }).click();
  await expect(firstTrigger).toHaveText('Маленький · 0,95 м');
  const afterHeight = await Promise.all([firstTrigger.textContent(), secondTrigger.textContent()]);
  await firstTrigger.click();
  await page.getByRole('option', { name: 'Свой размер' }).click();
  await expect(firstTrigger).toHaveText('Свой размер');
  await first.getByRole('spinbutton', { name: 'Основание, мм' }).fill('30');
  await first.getByRole('spinbutton', { name: 'Фигурка, мм' }).fill('50');

  // #then
  expect({
    afterHeight: afterHeight.map((value) => value?.trim()),
    afterCustom: [
      (await firstTrigger.textContent())?.trim(),
      (await secondTrigger.textContent())?.trim(),
    ],
    customDimensions: [
      await first.getByRole('spinbutton', { name: 'Основание, мм' }).inputValue(),
      await first.getByRole('spinbutton', { name: 'Фигурка, мм' }).inputValue(),
    ],
    otherRowCustomFields: await second
      .getByRole('spinbutton', { name: /^(Основание|Фигурка), мм$/ })
      .count(),
  }).toEqual({
    afterHeight: ['Маленький · 0,95 м', 'Средний · 1,7 м'],
    afterCustom: ['Свой размер', 'Средний · 1,7 м'],
    customDimensions: ['30', '50'],
    otherRowCustomFields: 0,
  });
});

test('paper picker is available on first render and changes the saved format to Letter', async ({
  page,
}) => {
  // #given
  const trigger = page.getByRole('button', { name: 'Формат' });
  await expect(trigger).toBeVisible();

  // #when
  await trigger.click();
  await page.getByRole('option', { name: 'Letter' }).click();
  await expect(trigger).toHaveText('Letter');

  // #then
  expect({
    selected: (await trigger.textContent())?.trim(),
    saved: await page.evaluate(
      () => JSON.parse(localStorage.getItem('pmg-settings') ?? '{}').pageSize,
    ),
  }).toEqual({ selected: 'Letter', saved: 'letter' });
});

test('sticky settings bar summarizes settings and returns to the header or downloads', async ({
  page,
}) => {
  // #given
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.evaluate(() => {
    localStorage.setItem(
      'pmg-settings',
      JSON.stringify({
        pageSize: 'a4',
        marginMm: 5,
        baseStyle: 'tent',
        normalization: true,
        numberDuplicates: true,
      }),
    );
  });
  await page.reload();
  await page.locator('astro-island:not([ssr])').waitFor();
  const format = page.getByRole('button', { name: 'Формат' });
  const edit = page.getByRole('button', { name: 'Изменить' });
  await expect(edit).toBeHidden();
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles(
    Array.from({ length: 8 }, (_, index) => ({
      name: `mini-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: artwork,
    })),
  );
  const finalMini = page.getByRole('article', { name: 'Миниатюра 8' });

  // #when
  await finalMini.scrollIntoViewIfNeeded();
  await expect(edit).toBeVisible();
  await expect(
    page.getByText('A4 · поля 5 мм · складная · обрезка, нумерация', { exact: true }),
  ).toBeVisible();
  const stickyBar = edit.locator(
    'xpath=ancestor::*[.//button[normalize-space()="Скачать PDF"]][1]',
  );
  const downloadPromise = page.waitForEvent('download');
  await stickyBar.getByRole('button', { name: 'Скачать PDF', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (!downloadPath) throw new Error('The sticky bar did not save the downloaded PDF.');
  const downloadedBytes = await readFile(downloadPath);

  await edit.click();
  await expect(format).toBeFocused();
  await expect(edit).toBeHidden();

  await page.getByRole('button', { name: 'Масштаб ▾' }).click();
  const measurement = page.getByRole('spinbutton', { name: 'Вышло из 100 мм' });
  await measurement.fill('97');
  await measurement.press('Tab');
  await finalMini.scrollIntoViewIfNeeded();
  await expect(edit).toBeVisible();

  // #then
  expect({
    downloadSignature: downloadedBytes.subarray(0, 5).toString('ascii'),
    summaryWithScale: await page
      .getByText('A4 · поля 5 мм · складная · обрезка, нумерация · масштаб 97 мм', {
        exact: true,
      })
      .isVisible(),
  }).toEqual({ downloadSignature: '%PDF-', summaryWithScale: true });
});

test('height picker selects with the keyboard and Escape restores trigger focus', async ({
  page,
}) => {
  // #given
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const trigger = page.getByRole('button', { name: 'Высота существа' });
  await expect(trigger).toBeVisible({ timeout: 1_000 });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  // #when
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await trigger.press('Enter');
  const popup = page.getByRole('listbox');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  // #then
  await expect(trigger).toHaveText('Средний, высокий · 2,1 м');
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('height picker stays touch-sized inside a 390px viewport', async ({ page }) => {
  // #given
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const trigger = page.getByRole('button', { name: 'Высота существа' });
  await expect(trigger).toBeVisible({ timeout: 1_000 });
  // #when
  await trigger.click();
  const popup = page.getByRole('listbox');
  const option = popup.getByRole('option', { name: /^Крошечный/ });
  await expect(option).toBeVisible();
  const [triggerBox, popupBox, optionBox] = await Promise.all([
    trigger.boundingBox(),
    popup.boundingBox(),
    option.boundingBox(),
  ]);
  // #then
  expect({
    trigger: triggerBox !== null && triggerBox.width >= 44 && triggerBox.height >= 44,
    popup: popupBox !== null && popupBox.x >= 0 && popupBox.x + popupBox.width <= 390,
    option: optionBox !== null && optionBox.width >= 44 && optionBox.height >= 44,
  }).toEqual({ trigger: true, popup: true, option: true });
});

test('landscape height picker scrolls to a pointer-selectable custom size', async ({ page }) => {
  // #given
  await page.setViewportSize({ width: 844, height: 390 });
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const trigger = page.getByRole('button', { name: 'Высота существа' });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const popup = page.getByRole('listbox');
  const custom = page.getByRole('option', { name: 'Свой размер' });
  const gesture = await scrollPopupToEnd(page, popup);
  expect(gesture.reachable).toBe(true);
  await expect
    .poll(async () => (await pointerTarget(custom)).reachable, {
      message: 'The custom-size option must become pointer-reachable after scrolling.',
    })
    .toBe(true);

  // #when
  const customPoint = await pointerTarget(custom);

  // #then
  expect(customPoint.reachable).toBe(true);
  await page.mouse.click(customPoint.x, customPoint.y);
  await expect(trigger).toHaveText('Свой размер');
});

test('height picker names its selected value and describes its current geometry', async ({
  page,
}) => {
  // #given
  await page
    .getByLabel('Добавить изображения', { exact: true })
    .setInputFiles(fixture('trim-6x5-to-4x3.png'));
  const trigger = page
    .getByRole('article', { name: 'Миниатюра 1' })
    .getByRole('button')
    .filter({ hasText: /^Средний/ });
  await expect(trigger).toBeVisible({ timeout: 1_000 });

  // #when
  const medium = {
    name: await trigger.ariaSnapshot(),
    geometry: await trigger.getAttribute('aria-description'),
  };
  await trigger.click();
  await page.getByRole('option', { name: /^Средний, высокий · 2,1 м/ }).click();
  const tall = {
    name: await trigger.ariaSnapshot(),
    geometry: await trigger.getAttribute('aria-description'),
  };

  // #then
  expect({ medium, tall }).toEqual({
    medium: {
      name: '- button "Средний · 1,7 м Высота существа": Средний · 1,7 м',
      geometry: 'Основание 25 мм · высота 35 мм',
    },
    tall: {
      name: '- button "Средний, высокий · 2,1 м Высота существа": Средний, высокий · 2,1 м',
      geometry: 'Основание 25 мм · высота 43 мм',
    },
  });
});

test('bulk height menu keeps every choice inside its popover', async ({ page }) => {
  // #given
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
    { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
    { name: 'villain.png', mimeType: 'image/png', buffer: artwork },
  ]);
  await page.getByRole('button', { name: 'Сменить высоту' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  // #when
  const overflowingInlineItems = await menu.evaluate((element) => {
    const shell = element.parentElement;
    if (!shell) throw new Error('The bulk menu popover is missing.');
    const shellBox = shell.getBoundingClientRect();

    return Array.from(element.querySelectorAll<HTMLElement>('[role="menuitem"]')).flatMap(
      (item) => {
        const itemBox = item.getBoundingClientRect();

        return itemBox.left < shellBox.left || itemBox.right > shellBox.right
          ? [item.textContent?.trim()]
          : [];
      },
    );
  });

  // #then
  expect(overflowingInlineItems).toEqual([]);
});

test('landscape bulk height menu scrolls to a pointer-selectable final choice', async ({
  page,
}) => {
  // #given
  await page.setViewportSize({ width: 844, height: 390 });
  const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
  await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
    { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
    { name: 'villain.png', mimeType: 'image/png', buffer: artwork },
  ]);
  const trigger = page.getByRole('button', { name: 'Сменить высоту' });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const popup = page.getByRole('menu');
  const gargantuan = page.getByRole('menuitem', { name: /^Громадный · 10 м и выше/ });
  const gesture = await scrollPopupToEnd(page, popup);
  expect(gesture.reachable).toBe(true);
  await expect
    .poll(async () => (await pointerTarget(gargantuan)).reachable, {
      message: 'The final bulk-height choice must become pointer-reachable after scrolling.',
    })
    .toBe(true);

  // #when
  const gargantuanPoint = await pointerTarget(gargantuan);

  // #then
  expect(gargantuanPoint.reachable).toBe(true);
  await page.mouse.click(gargantuanPoint.x, gargantuanPoint.y);
  await expect
    .poll(async () =>
      Promise.all(
        (await page.getByRole('button', { name: 'Высота существа' }).all()).map((button) =>
          button.textContent(),
        ),
      ),
    )
    .toEqual(['Громадный · 10 м и выше', 'Громадный · 10 м и выше']);
});

for (const scenario of calibrationPointerScenarios) {
  test(`a head-line pointer drag keeps feet fixed for ${scenario.name}`, async ({ page }) => {
    // #given
    await page.setViewportSize({ width: 390, height: 390 });
    await page.evaluate((direction) => {
      document.documentElement.dir = direction;
    }, scenario.direction);
    const artwork = await readFile(fixture(scenario.fixture));
    await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles(
      scenario.hasBack
        ? [
            { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
            { name: 'hero-back.png', mimeType: 'image/png', buffer: artwork },
          ]
        : { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
    );
    await page.getByRole('button', { name: 'Задать рост' }).click();
    const calibrationArtwork = page.getByTestId('calibration-artworks');
    const headSlider = page.getByRole('slider', { name: 'Голова' });
    for (let step = 0; step < 72; step++) await headSlider.press('Shift+ArrowDown');
    await headSlider.scrollIntoViewIfNeeded();
    const artworkBox = await calibrationArtwork.boundingBox();
    const headBox = await headSlider.boundingBox();
    if (!artworkBox || !headBox) throw new Error('The calibration controls are not visible.');
    const [headY, feetY] = await calibrationLineYs(calibrationArtwork);
    const targetY = Math.round(artworkBox.y + artworkBox.height * 0.7);
    const viewport = page.viewportSize();
    if (
      !viewport ||
      headY < 0 ||
      targetY < 0 ||
      headY >= viewport.height ||
      targetY >= viewport.height
    )
      throw new Error('The pointer drag coordinates are outside the viewport.');
    const dragX = scenario.useArtworkCenter
      ? Math.round(artworkBox.x + artworkBox.width / 2)
      : Math.round(headBox.x + headBox.width / 2);
    await page.evaluate(() => {
      document.documentElement.dataset.pointerReceiver = '';
      document.querySelectorAll<HTMLElement>('[role="slider"]').forEach((slider) => {
        slider.addEventListener('pointerdown', () => {
          document.documentElement.dataset.pointerReceiver =
            slider.getAttribute('aria-label') ?? '';
        });
      });
    });

    // #when
    await dragPointer(page, { x: dragX, y: headY }, { x: dragX, y: targetY });

    // #then
    expect({
      receiver: await page.locator('html').getAttribute('data-pointer-receiver'),
      lines: await calibrationLineYs(calibrationArtwork),
    }).toEqual({ receiver: 'Голова', lines: [targetY, feetY] });
  });
}

for (const width of [320, 1440]) {
  test(`calibration markers stay aligned with both images at ${width}px and reset removes them`, async ({
    page,
  }) => {
    // #given
    await page.setViewportSize({ width, height: 900 });
    const artwork = await readFile(fixture('trim-6x5-to-4x3.png'));
    await page.getByLabel('Добавить изображения', { exact: true }).setInputFiles([
      { name: 'hero.png', mimeType: 'image/png', buffer: artwork },
      { name: 'hero-back.png', mimeType: 'image/png', buffer: artwork },
    ]);
    const front = page.getByRole('button', { name: 'Лицевая сторона', exact: true });
    const back = page.getByRole('button', { name: 'Оборот: hero-back.png', exact: true });
    await expect(page.getByRole('button', { name: 'Задать рост' })).toBeEnabled();
    const before = await Promise.all([markerPositions(front), markerPositions(back)]);

    // #when
    await page.getByRole('button', { name: 'Задать рост' }).click();
    await page.getByRole('slider', { name: 'Голова' }).press('ArrowDown');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    const calibrated = await Promise.all([markerPositions(front), markerPositions(back)]);
    await page.getByRole('button', { name: 'Сбросить рост' }).click();

    // #then
    expect({
      before,
      calibrated,
      reset: await Promise.all([markerPositions(front), markerPositions(back)]),
    }).toEqual({
      before: [null, null],
      calibrated: [
        [0.33, 1],
        [0.33, 1],
      ],
      reset: [null, null],
    });
  });
}

async function markerPositions(slot: Locator) {
  return slot.evaluate((element) => {
    const image = element.querySelector('img');
    const head = element.querySelector('[data-testid="calibration-head"]');
    const feet = element.querySelector('[data-testid="calibration-feet"]');

    if (!head && !feet) return null;
    if (!image || !head || !feet) throw new Error('The calibration preview is incomplete.');
    const imageBox = image.getBoundingClientRect();

    return [head, feet].map((line) =>
      Number(((line.getBoundingClientRect().top - imageBox.top) / imageBox.height).toFixed(2)),
    );
  });
}

async function measureSceneFit(scene: Locator) {
  return scene.evaluate((element) => {
    const tolerancePx = 1;
    const sceneBox = element.getBoundingClientRect();
    const partElements = Array.from(element.querySelectorAll<HTMLElement>('[data-part-role]'));
    const partBoxes = partElements.map((part) => part.getBoundingClientRect());
    const unionLeft = Math.min(...partBoxes.map((box) => box.left));
    const unionRight = Math.max(...partBoxes.map((box) => box.right));
    const partsCentreX = (unionLeft + unionRight) / 2;
    const sceneCentreX = (sceneBox.left + sceneBox.right) / 2;

    return {
      partCount: partElements.length,
      allPartsHaveLayout: partElements.every(
        (part, index) =>
          part.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          partBoxes[index]!.width > 0 &&
          partBoxes[index]!.height > 0,
      ),
      allPartsInside: partBoxes.every(
        (box) =>
          box.left >= sceneBox.left - tolerancePx &&
          box.right <= sceneBox.right + tolerancePx &&
          box.top >= sceneBox.top - tolerancePx &&
          box.bottom <= sceneBox.bottom + tolerancePx,
      ),
      centred: Math.abs(partsCentreX - sceneCentreX) <= sceneBox.width * 0.1,
    };
  });
}

async function dragPointer(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

async function scrollPopupToEnd(page: Page, popup: Locator) {
  const gesture = await popup.evaluate((element) => {
    const shell = element.parentElement;
    if (!shell) throw new Error('The popup shell is missing.');
    const box = shell.getBoundingClientRect();
    const left = Math.max(0, box.left);
    const right = Math.min(window.innerWidth, box.right);
    const top = Math.max(0, box.top);
    const bottom = Math.min(window.innerHeight, box.bottom);
    if (left >= right || top >= bottom)
      throw new Error('The popup has no visible area for a scroll gesture.');
    const x = Math.round((left + right) / 2);
    const y = Math.round((top + bottom) / 2);
    const target = document.elementFromPoint(x, y);

    return { x, y, reachable: !!target && shell.contains(target) };
  });

  await page.mouse.move(gesture.x, gesture.y);
  await page.mouse.wheel(0, 1_000);

  return gesture;
}

async function pointerTarget(option: Locator) {
  return option.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = Math.round(box.left + box.width / 2);
    const y = Math.round(box.top + box.height / 2);
    const target = document.elementFromPoint(x, y);

    return { x, y, reachable: !!target && element.contains(target) };
  });
}

async function calibrationLineYs(artwork: Locator): Promise<[number, number]> {
  const lines = await artwork
    .locator(':scope > [aria-hidden="true"]')
    .evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().top)),
    );

  if (lines.length !== 2) throw new Error('The calibration lines are incomplete.');

  return [lines[0]!, lines[1]!];
}
