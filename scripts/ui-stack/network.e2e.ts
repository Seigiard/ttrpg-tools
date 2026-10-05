import type { Browser, Page } from '@playwright/test';

export interface NetworkBucket {
  requests: number;
  transferredBytes: number;
}

export interface NetworkRun {
  route: string;
  mode: 'cold' | 'warm';
  total: NetworkBucket;
  byType: Record<string, NetworkBucket>;
}

function addBucket(target: NetworkBucket, bytes: number) {
  target.requests += 1;
  target.transferredBytes += bytes;
}

async function capture(page: Page, url: string, mode: NetworkRun['mode']): Promise<NetworkRun> {
  const client = await page.context().newCDPSession(page);
  const types = new Map<string, string>();
  const finished: Array<{ type: string; bytes: number }> = [];
  client.on('Network.requestWillBeSent', (event) => {
    types.set(event.requestId, String(event.type).toLowerCase());
  });
  client.on('Network.loadingFinished', (event) => {
    finished.push({ type: types.get(event.requestId) ?? 'other', bytes: event.encodedDataLength });
  });
  await client.send('Network.enable');
  await page.goto(url, { waitUntil: 'networkidle' });
  await client.detach();

  const run: NetworkRun = {
    route: new URL(url).pathname,
    mode,
    total: { requests: 0, transferredBytes: 0 },
    byType: {},
  };

  for (const item of finished) {
    addBucket(run.total, item.bytes);
    run.byType[item.type] ??= { requests: 0, transferredBytes: 0 };
    addBucket(run.byType[item.type], item.bytes);
  }

  return run;
}

export async function measureNetwork(browser: Browser, baseUrl: string, routes: readonly string[]) {
  const runs: NetworkRun[] = [];

  for (const route of routes) {
    const coldContext = await browser.newContext();
    const coldPage = await coldContext.newPage();
    runs.push(await capture(coldPage, new URL(route, baseUrl).toString(), 'cold'));
    await coldContext.close();

    const warmContext = await browser.newContext();
    const warmPage = await warmContext.newPage();
    await warmPage.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle' });
    runs.push(await capture(warmPage, new URL(route, baseUrl).toString(), 'warm'));
    await warmContext.close();
  }

  return runs;
}

export function networkMarkdown(runs: NetworkRun[]) {
  const rows = runs.map(
    (run) =>
      `| ${run.route} | ${run.mode} | ${run.total.transferredBytes} | ${run.total.requests} | ${Object.entries(
        run.byType,
      )
        .map(([type, bucket]) => `${type}: ${bucket.transferredBytes} B / ${bucket.requests}`)
        .join('<br>')} |`,
  );

  return `# Network\n\nTransferred bytes use Chrome DevTools Protocol Network.loadingFinished encodedDataLength.\n\n| Route | Mode | Transferred bytes | Requests | By resource type |\n| --- | --- | ---: | ---: | --- |\n${rows.join('\n')}\n`;
}
