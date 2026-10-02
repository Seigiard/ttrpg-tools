import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

// A per-checkout port lets parallel worktrees run the suite at once; PORT overrides it.
const portOffset = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 18_000;
const port = Number(process.env.PORT ?? 10_000 + portOffset);
const baseURL = `http://127.0.0.1:${port}`;
const previewCommand = `${process.env.CI ? '' : 'bun run build && '}bunx vite preview --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
  testMatch: '**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'paper-minis',
      testDir: './tests/paper-minis',
      use: { ...devices['Desktop Chrome'], baseURL },
    },
    {
      name: 'desktop',
      testDir: './e2e',
      grepInvert: /@narrow/,
      use: { ...devices['Desktop Chrome'], baseURL, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'narrow',
      testDir: './e2e',
      grep: /@narrow/,
      use: { ...devices['Desktop Chrome'], baseURL, viewport: { width: 390, height: 900 } },
    },
  ],
  webServer: {
    command: previewCommand,
    url: `${baseURL}/paper-minis/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
