// @ts-check
import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [
    preact({ include: ['**/*.preact', '**/*.preact.tsx', '**/*.preact.jsx'] }),
    react({ exclude: ['**/*.preact', '**/*.preact.tsx', '**/*.preact.jsx'] })
  ],

  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true }
  }
});
