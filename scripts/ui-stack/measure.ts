import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { chromium } from '@playwright/test';
import { buildPayloadReport, payloadMarkdown } from './payload';
import { measureNetwork, networkMarkdown } from './network.e2e';
import { measureTimings, timingsMarkdown } from './timings';

const routes = [
  '/',
  '/mausritter/weather/',
  '/mausritter/locations/',
  '/mausritter/encounters/',
  '/the-black-hack/prices/',
  '/paper-minis/',
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

async function assertPortFree(port: number) {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`port ${port} is already accepting connections before preview starts`));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(error);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`port ${port} did not refuse connections before preview starts`));
    });
  });
}

async function waitForPreview(baseUrl: string, proc: ChildProcess, ready: Promise<void>) {
  const started = Date.now();
  await Promise.race([
    ready,
    Bun.sleep(60_000).then(() => {
      throw new Error('vite preview did not report its local URL within 60s');
    }),
  ]);
  while (Date.now() - started < 60_000) {
    if (proc.exitCode !== null) throw new Error(`vite preview exited with ${proc.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Retry until preview binds the port.
    }
    await Bun.sleep(500);
  }
  throw new Error('vite preview did not start within 60s');
}

async function withPreview<T>(port: number, work: (baseUrl: string) => Promise<T>) {
  await assertPortFree(port);
  // vite preview stays in the foreground, unlike astro preview, which detaches and is
  // shared by every checkout; parallel worktrees would stop each other's servers.
  const baseUrl = `http://127.0.0.1:${port}`;
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const proc = spawn(
    'bunx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stopping = false;
  const exit = new Promise<never>((_, reject) => {
    proc.once('exit', (code, signal) => {
      if (stopping) return;
      reject(new Error(`vite preview exited during measurement with ${code ?? signal}`));
    });
  });
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes(baseUrl)) markReady();
    });
  }
  await waitForPreview(baseUrl, proc, Promise.race([ready, exit]));
  try {
    return await Promise.race([work(baseUrl), exit]);
  } finally {
    stopping = true;
    proc.kill('SIGTERM');
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
    '@astrojs/svelte',
    'svelte',
    '@lucide/svelte',
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
