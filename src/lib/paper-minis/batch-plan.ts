import type { HeightSlot } from './types';

// One row a batch upload will create. All naming (and, later, pairing and size)
// rules for dropped files live in this module, so the store only executes a plan.
export type PlannedRow = {
  name: string;
  front: File;
  back?: File;
  heightSlot?: HeightSlot;
};

const separators = /[-_\s]+/g;

function stem(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? fileName : fileName.slice(0, dot);
}

// An empty result stays empty: the view owns the "Миниатюра N" fallback.
function displayName(raw: string) {
  const spaced = raw.replace(separators, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function planBatch(files: readonly File[]): PlannedRow[] {
  return files.map((front) => ({ name: displayName(stem(front.name)), front }));
}
