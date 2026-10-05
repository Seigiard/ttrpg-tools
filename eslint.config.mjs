import { readFileSync } from 'node:fs';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import antiSlop from './tools/oxlint/anti-slop/index.ts';

// Keep the anti-slop policy in one place for both lint engines.
const oxlint = JSON.parse(readFileSync(new URL('./.oxlintrc.json', import.meta.url), 'utf8'));
const rules = Object.fromEntries(
  Object.entries(oxlint.rules).filter(([name]) => name.startsWith('anti-slop/')),
);

export default [
  ...svelte.configs['flat/recommended'],
  {
    files: ['src/**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser },
    },
    plugins: { 'anti-slop': antiSlop },
    rules,
  },
];
