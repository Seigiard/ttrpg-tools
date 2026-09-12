import { loadBookFile } from '../../../src/features/grimoire/adapters/file';

export const loadBookFileWithControlledTiming: typeof loadBookFile = (file) => {
  const delay = file.name.includes('slow') ? 300 : 0;
  return new Promise((resolve, reject) => {
    void loadBookFile(file).then(
      (source) => setTimeout(() => resolve(source), delay),
      (error: unknown) => setTimeout(() => reject(error), delay),
    );
  });
};
