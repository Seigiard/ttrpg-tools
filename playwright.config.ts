import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

const portOffset = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 18_000;
const port = 10_000 + portOffset;
const baseURL = `http://127.0.0.1:${port}`;
const previewCommand = `${process.env.CI ? '' : 'bun run build && '}bunx vite preview --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
  testDir: './tests/paper-minis',
  testMatch: '**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL },
    },
  ],
  webServer: {
    command: previewCommand,
    url: `${baseURL}/paper-minis/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
