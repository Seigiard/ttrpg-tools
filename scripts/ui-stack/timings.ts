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
          await page.getByRole('button', { name: /Бросить погоду/ }).click();
          await page.getByTestId('result-weather').waitFor({ state: 'visible' });
          await page.evaluate(() => new Promise(requestAnimationFrame));
        },
        async (page) => {
          await page.goto(new URL('/mausritter/weather/', baseUrl).toString());
          await page.getByTestId('result-weather').waitFor({ state: 'visible' });
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
          await page.waitForFunction(() =>
            [...document.querySelectorAll('astro-island')].every(
              (island) => !island.hasAttribute('ssr'),
            ),
          );
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
    await page
      .locator('input[aria-label="Добавить изображения"]')
      .setInputFiles('e2e/fixtures/mini.png');
    await page.getByRole('article').first().waitFor({ state: 'visible' });
  };
}

export function timingsMarkdown(timings: TimingSummary[]) {
  const rows = timings.map(
    (timing) =>
      `| ${timing.name} | ${timing.medianMs} | ${timing.minMs} | ${timing.maxMs} | ${timing.samplesMs.join(', ')} |`,
  );
  return `# Timings\n\nEach scenario runs 10 repeats in Playwright Chromium. Values are milliseconds.\n\n| Scenario | Median | Min | Max | Samples |\n| --- | ---: | ---: | ---: | --- |\n${rows.join('\n')}\n`;
}
