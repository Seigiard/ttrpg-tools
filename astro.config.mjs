// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import svelte from '@astrojs/svelte';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react({ include: /\.[jt]sx$/ }), svelte({ include: /\.svelte$/ })],

  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true }
  }
});
