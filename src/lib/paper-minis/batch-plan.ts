import { calibrationGap } from './calibration';
import { HEIGHT_SLOT_ORDER } from './sizes';
import type { HeightCalibration, HeightSlot, MiniSize } from './types';

// One row a batch upload will create. All naming, pairing and size rules for
// dropped files live in this module, so the store only executes a plan.
export type PlannedRow = {
  name: string;
  front: File;
  back?: File;
  heightSlot?: MiniSize;
  customWidthMm?: number;
  customHeightMm?: number;
  count?: number;
  calibration?: HeightCalibration;
};

type Side = 'front' | 'back';

type ParsedFile = {
  file: File;
  side: Side;
  heightSlot?: MiniSize;
  customWidthMm?: number;
  customHeightMm?: number;
  count?: number;
  calibration?: HeightCalibration;
  name: string;
  key: string;
};

const separators = /[-_\s]+/;

// Size markers are exactly the slot ids, so a new slot is a new marker for free.
const slotById = new Map<string, HeightSlot>(HEIGHT_SLOT_ORDER.map((slot) => [slot, slot]));

export function planBatch(files: readonly File[]): PlannedRow[] {
  const parsed = files.map(parseFile);
  const backs = parsed.filter((item) => item.side === 'back');
  const backOf = new Map<ParsedFile, ParsedFile>();
  for (const front of parsed) {
    if (front.side !== 'front') continue;
    const matches = backs.filter((candidate) => compatible(front, candidate));
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
      const heightSlot = front.heightSlot ?? back?.heightSlot;
      if (heightSlot) row.heightSlot = heightSlot;
      const customWidthMm = front.customWidthMm ?? back?.customWidthMm;
      if (customWidthMm !== undefined) row.customWidthMm = customWidthMm;
      const customHeightMm = front.customHeightMm ?? back?.customHeightMm;
      if (customHeightMm !== undefined) row.customHeightMm = customHeightMm;
      if (front.count !== undefined) row.count = front.count;
      const calibration = front.calibration ?? back?.calibration;
      if (calibration) row.calibration = calibration;
      return row;
    });
}

// An unsized side fits any size, so one shared back covers every size of a creature.
function compatible(front: ParsedFile, back: ParsedFile): boolean {
  if (front.key !== back.key) return false;
  return !front.heightSlot || !back.heightSlot || sizeKey(front) === sizeKey(back);
}

function sizeKey(file: ParsedFile): string | undefined {
  if (!file.heightSlot) return undefined;
  if (file.heightSlot !== 'custom') return file.heightSlot;
  return `custom-${file.customWidthMm}x${file.customHeightMm}`;
}

function parseFile(file: File): ParsedFile {
  const tokens = stem(file.name)
    .split(separators)
    .filter((token) => token !== '');
  const { nameTokens, side, heightSlot, customWidthMm, customHeightMm, count, calibration } =
    readMarkers(tokens);
  const raw = nameTokens.join(' ');
  return {
    file,
    side,
    heightSlot,
    customWidthMm,
    customHeightMm,
    count,
    calibration,
    // An empty name stays empty: the view owns the "Миниатюра N" fallback.
    name: raw.charAt(0).toUpperCase() + raw.slice(1),
    key: raw.toLowerCase(),
  };
}

// Markers are read from the end of the name, each kind at most once and in any order.
function readMarkers(tokens: readonly string[]) {
  let end = tokens.length;
  let side: Side | undefined;
  let heightSlot: MiniSize | undefined;
  let customWidthMm: number | undefined;
  let customHeightMm: number | undefined;
  let count: number | undefined;
  let calibration: HeightCalibration | undefined;
  while (end > 0) {
    const token = tokens[end - 1].toLowerCase();
    if (count === undefined && /^x\d+$/i.test(token)) {
      const parsed = parseCount(token);
      if (parsed !== undefined) count = parsed;
      end -= 1;
      continue;
    }
    if (calibration === undefined && end > 1) {
      const parsed = parseCalibration(tokens[end - 2], token);
      if (parsed !== undefined) {
        if (parsed) calibration = parsed;
        end -= 2;
        continue;
      }
    }
    if (side === undefined && (token === 'front' || token === 'back')) {
      side = token;
      end -= 1;
      continue;
    }
    if (heightSlot === undefined) {
      const custom = end > 1 ? parseCustomSize(tokens[end - 2], token) : undefined;
      if (custom) {
        if (custom.valid) {
          heightSlot = 'custom';
          customWidthMm = custom.width;
          customHeightMm = custom.height;
        }
        end -= 2;
        continue;
      }
      // The two-token id wins, so `ogre-large-tall` is Large tall, not "Ogre large" + `tall`.
      const pair = end > 1 ? slotById.get(`${tokens[end - 2].toLowerCase()}-${token}`) : undefined;
      const slot = pair ?? slotById.get(token);
      if (slot) {
        heightSlot = slot;
        end -= pair ? 2 : 1;
        continue;
      }
    }
    break;
  }
  return {
    nameTokens: tokens.slice(0, end),
    side: side ?? 'front',
    heightSlot,
    customWidthMm,
    customHeightMm,
    count,
    calibration,
  };
}

function parseCount(token: string): number | undefined {
  const value = Number(token.slice(1));
  return Number.isInteger(value) && value > 1 ? value : undefined;
}

function parseCustomSize(label: string, dimensions: string) {
  if (label.toLowerCase() !== 'custom') return undefined;
  if (!dimensions.includes('x')) return undefined;
  const [rawWidth, rawHeight, extra] = dimensions.split('x');
  if (extra !== undefined || rawWidth === undefined || rawHeight === undefined)
    return { valid: false } as const;
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return { valid: false } as const;
  return { valid: true, width, height } as const;
}

function parseCalibration(headToken: string, feetToken: string): HeightCalibration | null | undefined {
  const headMatch = /^h(\d{3})$/i.exec(headToken);
  const feetMatch = /^f(\d{3})$/i.exec(feetToken);
  if (!headMatch || !feetMatch) return undefined;
  const calibration = { head: Number(headMatch[1]) / 1000, feet: Number(feetMatch[1]) / 1000 };
  return calibrationGap(calibration) === undefined ? null : calibration;
}

function stem(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? fileName : fileName.slice(0, dot);
}
