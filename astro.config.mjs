// @ts-check
import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [preact()],

  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
    // fflate is only imported dynamically, on the first zip export or import.
    // Discovered that late, Vite re-optimizes deps mid-session and the pending
    // request fails with 504 "Outdated Optimize Dep".
    optimizeDeps: { include: ['fflate'] },
  }
});
