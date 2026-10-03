import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const routes = [
  '/',
  '/mausritter/weather/',
  '/mausritter/locations/',
  '/mausritter/encounters/',
  '/the-black-hack/prices/',
  '/paper-minis/',
] as const;

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      throw new Error(`Console error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    throw error;
  });
});

// Astro removes the `ssr` attribute from an island once its framework has hydrated it.
// Interacting earlier races the island's event handlers.
async function waitForHydration(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('astro-island')].every((island) => !island.hasAttribute('ssr')),
  );
}

async function openHydrated(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}

async function text(locator: ReturnType<Page['getByTestId']>) {
  await expect(locator).toBeVisible();
  return (await locator.innerText()).replace(/\s+/g, ' ').trim();
}

async function expectRollChanges(page: Page, buttonName: RegExp, resultTestId: string) {
  const result = page.getByTestId(resultTestId);
  const before = await text(result);
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: buttonName }).click();
    const after = await text(result);
    if (after !== before) return;
  }
  throw new Error(`${resultTestId} did not change after repeated rolls`);
}

test('every route renders static content and attribution without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    if (route !== '/') await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
  }
  await context.close();
});

test('weather hydrates, rolls, switches season columns, and supports tab arrows', async ({
  page,
}) => {
  await openHydrated(page, '/mausritter/weather/');
  await expect(page.getByTestId('result-weather')).not.toContainText('Погода');
  await expectRollChanges(page, /Бросить погоду/, 'result-weather');

  const selected = page.getByRole('tab', { selected: true });
  const beforeResult = await text(page.getByTestId('result-weather'));
  await selected.focus();
  await selected.press('ArrowRight');
  await expect(page.getByRole('tab').nth(1)).toBeFocused();
  await page.getByRole('tab').nth(1).click();
  await expect(page.getByTestId('reference-weather').locator('[data-hit="true"]')).toHaveCount(1);
  await expect(page.getByTestId('result-weather')).not.toHaveText(beforeResult);
});

test('locations rolls all, rerolls each part, and switches biome tabs', async ({ page }) => {
  await openHydrated(page, '/mausritter/locations/');
  await expect(page.getByTestId('result-landmark')).not.toContainText('Ориентир d20 = 0');
  await expectRollChanges(page, /Бросить локацию/, 'result-card');
  await expectRollChanges(page, /Перебросить ориентир/, 'result-landmark');
  await expectRollChanges(page, /Перебросить деталь/, 'result-detail');

  const beforeReference = await text(page.getByTestId('reference-landmarks'));
  await page.getByRole('tab').last().click();
  await expect(page.getByTestId('reference-landmarks')).not.toHaveText(beforeReference);
});

test('encounters roll check and reaction independently and mark reference hits', async ({
  page,
}) => {
  await openHydrated(page, '/mausritter/encounters/');
  await expect(page.getByTestId('check-result')).not.toContainText('Проверка');
  await expect(page.getByTestId('reaction-result')).not.toContainText('Реакция');

  const reactionBefore = await text(page.getByTestId('reaction-result'));
  await expectRollChanges(page, /Проверить/, 'check-result-card');
  expect(await text(page.getByTestId('reaction-result'))).toBe(reactionBefore);

  const checkBefore = await text(page.getByTestId('check-result'));
  await expectRollChanges(page, /Бросить реакцию/, 'reaction-result-card');
  expect(await text(page.getByTestId('check-result'))).toBe(checkBefore);
  await expect(page.getByTestId('check-reference').locator('[data-hit="true"]')).toHaveCount(1);
  await expect(page.getByTestId('reaction-reference').locator('[data-hit="true"]')).toHaveCount(1);
});

test('prices sync URL state, restore reloads, and prefer URL over localStorage', async ({
  page,
}) => {
  await openHydrated(page, '/the-black-hack/prices/');
  await expect(page).toHaveURL(/\?s=[^&]+&r=[^&]+\.[^&]+/);
  const firstUrl = new URL(page.url());
  const firstState = firstUrl.search;
  const firstParams = firstUrl.searchParams;
  const firstSettlement = firstParams.get('s');
  const firstVersion = firstParams.get('r')?.split('.')[1];
  if (!firstSettlement || !firstVersion) throw new Error('Prices URL state is missing');
  const storedSettlement = firstSettlement === 'city' ? 'rural' : 'city';
  const storedState = `s=${storedSettlement}&r=2.${firstVersion}`;
  const firstPrice = await text(page.getByTestId('item-price').first());

  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('item-price').first()).toHaveText(firstPrice);
  await page.evaluate((state) => localStorage.setItem('the-black-hack:prices', state), storedState);
  await openHydrated(page, `/the-black-hack/prices/${firstState}`);
  await expect(page).toHaveURL(firstUrl.toString());
  await expect(page.getByTestId('item-price').first()).toHaveText(firstPrice);

  const beforeTab = page.url();
  await page.getByRole('tab').last().click();
  await expect.poll(() => page.url()).not.toBe(beforeTab);
});

test('paper minis upload, edit, calibrate by keyboard, preview, and download PDF', async ({
  page,
}) => {
  await openHydrated(page, '/paper-minis/');
  const addFiles = page.getByLabel('Добавить изображения');
  await addFiles.setInputFiles('e2e/fixtures/mini.png');
  const row = page.getByRole('article', { name: /Миниатюра 1|mini/ });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Задать рост' })).toBeEnabled({ timeout: 15_000 });

  await row.getByLabel('Высота существа').selectOption('large');
  await expect(row.getByLabel('Высота существа')).toHaveValue('large');

  const calibrationButton = row.getByRole('button', { name: 'Задать рост' });
  await calibrationButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Задать рост' })).toBeVisible();
  await page.getByRole('slider', { name: 'Голова' }).press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(calibrationButton).toBeFocused();

  await page.getByRole('button', { name: 'Предпросмотр PDF' }).click();
  await expect(page.getByTitle('Предпросмотр PDF')).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать PDF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Download path is missing');
  const bytes = await readFile(path);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
});

test('no route has horizontal page scroll at 390px @narrow', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

test('the calibration dialog keeps keyboard focus inside while open', async ({ page }) => {
  await openHydrated(page, '/paper-minis/');
  await page.getByLabel('Добавить изображения').setInputFiles('e2e/fixtures/mini.png');
  const row = page.getByRole('article', { name: /Миниатюра 1|mini/ });
  const calibrationButton = row.getByRole('button', { name: 'Задать рост' });
  await expect(calibrationButton).toBeEnabled({ timeout: 15_000 });
  await calibrationButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Задать рост' })).toBeVisible();

  // Focus-trap implementations may pass focus through a sentinel element outside the
  // dialog before moving it back, so the check waits for focus to settle.
  const focusInsideDialog = () =>
    page.evaluate(() => !!document.activeElement?.closest('[role="dialog"], dialog'));
  for (const key of ['Shift+Tab', 'Tab']) {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(key);
      await expect
        .poll(focusInsideDialog, { message: `${key} #${i + 1} left the dialog`, timeout: 1000 })
        .toBe(true);
    }
  }
});
