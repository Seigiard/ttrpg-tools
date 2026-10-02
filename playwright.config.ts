import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 4400);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `trap 'bunx astro preview stop >/dev/null 2>&1 || true' EXIT INT TERM; PORT=${port} bun run build && PORT=${port} bunx astro preview --port ${port} && bunx astro preview logs --follow`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@narrow/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'narrow',
      grep: /@narrow/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 390, height: 900 },
      },
    },
  ],
});
