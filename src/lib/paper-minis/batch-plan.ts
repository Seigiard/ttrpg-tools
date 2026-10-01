import type { HeightSlot } from './types';

// One row a batch upload will create. All naming, pairing (and, later, size)
// rules for dropped files live in this module, so the store only executes a plan.
export type PlannedRow = {
  name: string;
  front: File;
  back?: File;
  heightSlot?: HeightSlot;
};

type Side = 'front' | 'back';

type ParsedFile = {
  file: File;
  side: Side;
  name: string;
  key: string;
};

const separators = /[-_\s]+/;

export function planBatch(files: readonly File[]): PlannedRow[] {
  const parsed = files.map(parseFile);
  const backs = parsed.filter((item) => item.side === 'back');
  const backOf = new Map<ParsedFile, ParsedFile>();
  for (const front of parsed) {
    if (front.side !== 'front') continue;
    const matches = backs.filter((candidate) => candidate.key === front.key);
    // Two or more matching backs are ambiguous: the planner never guesses a pair.
    if (matches.length === 1) backOf.set(front, matches[0]);
  }
  const attached = new Set(backOf.values());
  // An unattached back is planned as a front at its own position, so no dropped
  // file disappears from the result.
  return parsed
    .filter((item) => item.side === 'front' || !attached.has(item))
    .map((front) => {
      const row: PlannedRow = { name: front.name, front: front.file };
      const back = backOf.get(front);
      if (back) row.back = back.file;
      return row;
    });
}

function parseFile(file: File): ParsedFile {
  const tokens = stem(file.name)
    .split(separators)
    .filter((token) => token !== '');
  const { nameTokens, side } = readMarkers(tokens);
  const raw = nameTokens.join(' ');
  return {
    file,
    side,
    // An empty name stays empty: the view owns the "Миниатюра N" fallback.
    name: raw.charAt(0).toUpperCase() + raw.slice(1),
    key: raw.toLowerCase(),
  };
}

// Markers are read from the end of the name, each kind at most once and in any
// order, so the size marker can join the loop as another kind.
function readMarkers(tokens: readonly string[]) {
  let end = tokens.length;
  let side: Side | undefined;
  while (end > 0) {
    const token = tokens[end - 1].toLowerCase();
    if (side === undefined && (token === 'front' || token === 'back')) {
      side = token;
      end -= 1;
      continue;
    }
    break;
  }
  return { nameTokens: tokens.slice(0, end), side: side ?? 'front' };
}

function stem(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? fileName : fileName.slice(0, dot);
}
