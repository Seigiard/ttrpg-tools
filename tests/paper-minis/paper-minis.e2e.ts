import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator } from '@playwright/test';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

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
  await page.getByRole('button', { name: /^Фигурки/ }).click();
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
