import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium } from '@playwright/test';
import { buildPayloadReport, payloadMarkdown } from './payload';
import { measureNetwork, networkMarkdown } from './network.e2e';
import { measureTimings, timingsMarkdown } from './timings';

const routes = [
  '/',
  '/mausritter/weather',
  '/mausritter/locations',
  '/mausritter/encounters',
  '/the-black-hack/prices',
  '/paper-minis',
] as const;

function arg(name: string, fallback?: string) {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : fallback;
}

async function run(command: string, args: string[]) {
  const proc = spawn(command, args, { stdio: 'inherit', env: process.env });
  const code = await new Promise<number | null>((resolve) => proc.on('exit', resolve));
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${code}`);
}

async function waitForPreview(baseUrl: string, proc: ChildProcess) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (proc.exitCode !== null) throw new Error(`astro preview exited with ${proc.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Retry until preview binds the port.
    }
    await Bun.sleep(500);
  }
  throw new Error('astro preview did not start within 60s');
}

async function withPreview<T>(port: number, work: (baseUrl: string) => Promise<T>) {
  const proc = spawn(
    'sh',
    ['-c', `bunx astro preview --port ${port} && bunx astro preview logs --follow`],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PORT: String(port) },
    },
  );
  const baseUrl = `http://localhost:${port}`;
  await waitForPreview(baseUrl, proc);
  try {
    return await work(baseUrl);
  } finally {
    proc.kill('SIGTERM');
    await run('bunx', ['astro', 'preview', 'stop']);
  }
}

async function screenshots(baseUrl: string, out: string) {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle' });
        const name = route === '/' ? 'index' : route.slice(1).replaceAll('/', '-');
        await page.screenshot({
          path: join(out, 'screenshots', `${name}-${width}.png`),
          fullPage: true,
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function versions() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lock = await readFile('bun.lock', 'utf8');
  const wanted = [
    'astro',
    '@astrojs/react',
    'react',
    'react-dom',
    '@base-ui/react',
    '@nanostores/react',
    'nanostores',
    '@playwright/test',
    'pdf-lib',
  ];
  return {
    packageJson: {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    },
    bunLockSnippets: Object.fromEntries(
      wanted.map((name) => [
        name,
        lock
          .split('\n')
          .filter((line) => line.includes(`"${name}"`) || line.includes(`${name}@`))
          .slice(0, 5),
      ]),
    ),
  };
}

async function main() {
  const out = arg('--out');
  if (!out) throw new Error('Usage: bun run measure -- --out <directory>');
  const port = Number(process.env.PORT ?? 4400);
  await mkdir(out, { recursive: true });
  await mkdir(join(out, 'screenshots'), { recursive: true });

  await run('bun', ['run', 'build']);
  const payload = await buildPayloadReport();
  await writeFile(join(out, 'payload.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(join(out, 'payload.md'), payloadMarkdown(payload));

  await withPreview(port, async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const network = await measureNetwork(browser, baseUrl, routes);
      await writeFile(join(out, 'network.json'), `${JSON.stringify(network, null, 2)}\n`);
      await writeFile(join(out, 'network.md'), networkMarkdown(network));
      const timingData = await measureTimings(browser, baseUrl);
      const machine = {
        cpu: cpus()[0]?.model ?? 'unknown',
        cpuCount: cpus().length,
        os: `${platform()} ${release()}`,
        browserVersion: browser.version(),
      };
      await writeFile(
        join(out, 'timings.json'),
        `${JSON.stringify({ machine, timings: timingData }, null, 2)}\n`,
      );
      await writeFile(
        join(out, 'timings.md'),
        `Machine: ${machine.cpu}, ${machine.cpuCount} cores, ${machine.os}, Chromium ${machine.browserVersion}\n\n${timingsMarkdown(timingData)}`,
      );
    } finally {
      await browser.close();
    }
    await screenshots(baseUrl, out);
  });

  await writeFile(join(out, 'versions.json'), `${JSON.stringify(await versions(), null, 2)}\n`);
  await writeFile(
    join(out, 'SUMMARY.md'),
    `# UI stack measurements\n\n${payloadMarkdown(payload)}\n\nSee network.md, timings.md, versions.json and screenshots/.\n`,
  );
}

if (import.meta.main) await main();
