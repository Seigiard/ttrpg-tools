import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

// Reserve three adjacent ports per checkout: fixtures, Astro dev, and Astro preview.
const portGroup = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 18_000;
const fixturePort = 10_000 + portGroup * 3;
const astroPort = fixturePort + 1;
const previewPort = fixturePort + 2;
const fixtureBaseURL = `http://127.0.0.1:${fixturePort}`;
const astroBaseURL = `http://127.0.0.1:${astroPort}`;
const previewBaseURL = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: './tests/grimoire/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  // Vivliostyle starts an iframe-backed layout engine per page. An unbounded local
  // worker count can exhaust Chromium before fixture apps finish mounting.
  workers: process.env.CI ? 2 : 4,
  projects: [
    {
      name: 'fixtures',
      testIgnore: 'route.e2e.ts',
      use: { ...devices['Desktop Chrome'], baseURL: fixtureBaseURL },
    },
    {
      name: 'astro-dev',
      testMatch: 'route.e2e.ts',
      use: { ...devices['Desktop Chrome'], baseURL: astroBaseURL },
    },
    {
      name: 'astro-preview',
      testMatch: 'route.e2e.ts',
      use: { ...devices['Desktop Chrome'], baseURL: previewBaseURL },
    },
  ],
  webServer: [
    {
      command: `bunx vite --config vite.grimoire-fixtures.config.ts --host 127.0.0.1 --port ${fixturePort} --strictPort`,
      url: `${fixtureBaseURL}/tests/grimoire/fixtures/harness.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `bun run dev -- --host 127.0.0.1 --port ${astroPort}`,
      url: `${astroBaseURL}/grimoire`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `bun run build && bun run preview -- --host 127.0.0.1 --port ${previewPort}`,
      url: `${previewBaseURL}/grimoire`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
