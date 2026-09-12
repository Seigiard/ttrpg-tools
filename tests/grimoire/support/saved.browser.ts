import type { loadBookFile } from '../../../src/features/grimoire/adapters/file';

export const loadBookFileWithControlledTiming: typeof loadBookFile = (file) => {
  const delay = file.name.includes('slow') ? 300 : 0;
  const source = `# Loaded from ${file.name}\n\nContent from ${file.name}.\n`;
  return new Promise((resolve) => setTimeout(() => resolve(source), delay));
};
