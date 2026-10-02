import type { Browser, Page } from '@playwright/test';
import { blackHackPrices } from '../../src/data/the-black-hack/prices';

export interface TimingSummary {
  name: string;
  repeats: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
  samplesMs: number[];
}

async function measure(
  context: Awaited<ReturnType<Browser['newContext']>>,
  name: string,
  repeats: number,
  action: (page: Page) => Promise<void>,
  setup: (page: Page) => Promise<void>,
) {
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const page = await context.newPage();
    await setup(page);
    const start = performance.now();
    await action(page);
    samples.push(Math.round(performance.now() - start));
    await page.close();
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    name,
    repeats,
    minMs: sorted[0] ?? 0,
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
    samplesMs: samples,
  } satisfies TimingSummary;
}

export async function measureTimings(browser: Browser, baseUrl: string) {
  const context = await browser.newContext();
  try {
    const results: TimingSummary[] = [];
    results.push(
      await measure(
        context,
        'weather click-to-result',
        10,
        async (page) => {
          const previous = await page.getByTestId('result-weather').textContent();
          await page.getByRole('button', { name: /Бросить погоду/ }).click();
          await page.waitForFunction((before) => {
            const result = document.querySelector('[data-testid="result-weather"]');
            return (
              result?.textContent?.trim() &&
              result.textContent !== before &&
              result.querySelector('[data-loading="true"]') === null
            );
          }, previous);
        },
        async (page) => {
          await installDeterministicWeatherRolls(page);
          await page.goto(new URL('/mausritter/weather/', baseUrl).toString());
          await waitForHydratedIslands(page);
          await waitForWeatherRoll(page);
        },
      ),
    );
    results.push(
      await measure(
        context,
        'prices tab switch',
        10,
        async (page) => {
          await page
            .getByRole('tab', { selected: true })
            .filter({ hasText: /Сельская/ })
            .waitFor();
          await page.getByRole('tab').last().click();
          await page.waitForFunction(
            () => new URLSearchParams(location.search).get('s') === 'city',
          );
        },
        async (page) => {
          await page.goto(
            new URL(
              `/the-black-hack/prices/?s=rural&r=1.${blackHackPrices.version}`,
              baseUrl,
            ).toString(),
          );
          await waitForHydratedIslands(page);
          await page.waitForFunction(
            () => new URLSearchParams(location.search).get('s') === 'rural',
          );
        },
      ),
    );
    results.push(
      await measure(
        context,
        'paper-minis upload-to-row',
        10,
        async (page) => {
          await page
            .locator('input[aria-label="Добавить изображения"]')
            .setInputFiles('e2e/fixtures/mini.png');
          await page.getByRole('article').first().waitFor({ state: 'visible' });
        },
        async (page) => {
          await page.goto(new URL('/paper-minis/', baseUrl).toString());
          await waitForHydratedIslands(page);
        },
      ),
    );
    results.push(
      await measure(
        context,
        'paper-minis preview ready',
        10,
        async (page) => {
          await page.getByRole('button', { name: 'Предпросмотр PDF' }).click();
          await page.getByTitle('Предпросмотр PDF').waitFor({ state: 'visible', timeout: 15_000 });
        },
        setupPaperMinis(baseUrl),
      ),
    );
    results.push(
      await measure(
        context,
        'paper-minis PDF generation',
        10,
        async (page) => {
          const download = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Скачать PDF' }).click();
          await download;
        },
        setupPaperMinis(baseUrl),
      ),
    );
    return results;
  } finally {
    await context.close();
  }
}

function setupPaperMinis(baseUrl: string) {
  return async (page: Page) => {
    await page.goto(new URL('/paper-minis/', baseUrl).toString());
    await waitForHydratedIslands(page);
    await page
      .locator('input[aria-label="Добавить изображения"]')
      .setInputFiles('e2e/fixtures/mini.png');
    await page.getByRole('article').first().waitFor({ state: 'visible' });
    await waitForEnabledButton(page, 'Предпросмотр PDF');
    await waitForEnabledButton(page, 'Скачать PDF');
  };
}

async function waitForEnabledButton(page: Page, name: string) {
  await page.getByRole('button', { name }).waitFor({ state: 'visible' });
  await page.waitForFunction((buttonName) => {
    return [...document.querySelectorAll('button')].some(
      (button) => button.textContent?.includes(buttonName) && !button.disabled,
    );
  }, name);
}

async function waitForHydratedIslands(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('astro-island')].every((island) => !island.hasAttribute('ssr')),
  );
}

async function waitForWeatherRoll(page: Page) {
  await page.getByTestId('result-weather').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const result = document.querySelector('[data-testid="result-weather"]');
    return (
      result?.textContent?.trim() &&
      result.textContent.trim() !== 'Погода' &&
      result.querySelector('[data-loading="true"]') === null
    );
  });
}

async function installDeterministicWeatherRolls(page: Page) {
  await page.addInitScript(() => {
    const values = [0, 0, 5, 5];
    let index = 0;
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value(array: Uint32Array) {
        if (array instanceof Uint32Array && index < values.length) {
          for (let i = 0; i < array.length; i++) {
            array[i] = values[index++] ?? 0;
          }
          return array;
        }
        return original(array);
      },
    });
  });
}

export function timingsMarkdown(timings: TimingSummary[]) {
  const rows = timings.map(
    (timing) =>
      `| ${timing.name} | ${timing.medianMs} | ${timing.minMs} | ${timing.maxMs} | ${timing.samplesMs.join(', ')} |`,
  );
  return `# Timings\n\nEach scenario runs 10 repeats in Playwright Chromium. Values are milliseconds.\n\n| Scenario | Median | Min | Max | Samples |\n| --- | ---: | ---: | ---: | --- |\n${rows.join('\n')}\n`;
}
