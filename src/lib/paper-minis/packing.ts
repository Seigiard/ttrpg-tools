import type { Entry, PackingEntry } from './types';
import {
  type EntryStatus,
  type PackOptions,
  type PackedMini,
  type ResolvedMini,
  footprintMm,
  fullPageAreaMm,
  usableAreaMm,
  resolveMini,
} from './geometry.ts';

export type Placement = {
  mini: PackedMini;
  // Millimetres from the top-left of this page's packable area.
  xMm: number;
  yMm: number;
  rotated: boolean;
};
export type PackedPage = { placements: Placement[] };

export type PackResult = {
  pages: PackedPage[];
  pageCount: number;
  miniCount: number; // minis actually placed (what will print)
  entries: EntryStatus[]; // indexed like the input entries
};

export type ResolvedEntry = { status: EntryStatus; mini: ResolvedMini | undefined };

// A back file is chosen but not prepared yet. Such an entry is not ready, so
// it does not print reflected for a moment and then jump to its own back.
function isBackArtworkLoading(entry: Entry): boolean {
  return entry.backImage != null && entry.backArtwork == null;
}

function unpreparedState(entry: Entry): 'empty' | 'loading' | 'failed' | undefined {
  if (entry.artwork == null) {
    if (entry.frontError) return 'failed';
    return entry.image == null ? 'empty' : 'loading';
  }
  return isBackArtworkLoading(entry) ? 'loading' : undefined;
}

function toPackingEntry(entry: Entry): PackingEntry {
  return {
    heightSlot: entry.heightSlot,
    customWidthMm: entry.customWidthMm,
    customHeightMm: entry.customHeightMm,
    count: entry.count,
    calibration: entry.calibration,
    naturalWidth: entry.artwork?.width,
    naturalHeight: entry.artwork?.height,
    backNaturalWidth: entry.backArtwork?.width,
    backNaturalHeight: entry.backArtwork?.height,
  };
}

function resolvePackingEntry(
  entry: PackingEntry,
  entryIndex: number,
  opts: PackOptions,
): ResolvedEntry {
  const mini = resolveMini(entry, entryIndex, opts);
  if (!mini) return { status: { state: 'empty', limits: [] }, mini: undefined };
  const status: EntryStatus =
    mini.orientation === 'oversized'
      ? { state: 'oversized', limits: [] }
      : { state: mini.orientation, limits: mini.limits };
  return { status, mini };
}

// Resolve the prepared state, packing geometry and print status of one row.
export function resolveEntry(entry: Entry, entryIndex: number, opts: PackOptions): ResolvedEntry {
  const state = unpreparedState(entry);
  return state
    ? { status: { state, limits: [] }, mini: undefined }
    : resolvePackingEntry(toPackingEntry(entry), entryIndex, opts);
}

// Project prepared artwork into packing geometry without changing entry indices.
export function packEntries(entries: Entry[], opts: PackOptions): PackResult {
  return packResolvedEntries(
    entries.map((entry, entryIndex) => resolveEntry(entry, entryIndex, opts)),
    opts,
  );
}

// Resolve every entry's geometry once, then lay the minis out in strips.
export function packMinis(entries: PackingEntry[], opts: PackOptions): PackResult {
  return packResolvedEntries(
    entries.map((entry, entryIndex) => resolvePackingEntry(entry, entryIndex, opts)),
    opts,
  );
}

function packResolvedEntries(entries: ResolvedEntry[], opts: PackOptions): PackResult {
  const resolved = entries.flatMap(({ mini }) => (mini ? [mini] : []));
  const { widthMm, heightMm: firstPageHeightMm } = usableAreaMm(opts);
  const { heightMm: laterPageHeightMm } = fullPageAreaMm(opts);
  const pages = packGuillotine(resolved, widthMm, firstPageHeightMm, laterPageHeightMm);
  return {
    pages,
    pageCount: pages.length,
    miniCount: resolved
      .filter((mini) => mini.orientation !== 'oversized')
      .reduce((sum, mini) => sum + mini.copies.length, 0),
    entries: entries.map(({ status }) => status),
  };
}

type Column = { xMm: number; widthMm: number; usedHeightMm: number };
type Strip = {
  yMm: number;
  heightMm: number;
  usedWidthMm: number;
  columns: Column[];
  dedicated: boolean;
};
type LayoutSheet = { strips: Strip[]; usedHeightMm: number; placements: Placement[] };

function packGuillotine(
  minis: ResolvedMini[],
  widthMm: number,
  firstPageHeightMm: number,
  laterPageHeightMm: number,
): PackedPage[] {
  const candidates = placeableCopies(minis)
    .map(({ mini, rotated }) => {
      const footprint = footprintMm(mini, rotated);
      return { mini, rotated, widthMm: footprint.widthMm, heightMm: footprint.heightMm };
    })
    .toSorted((a, b) => b.heightMm - a.heightMm || b.widthMm - a.widthMm);
  const sheets: LayoutSheet[] = [];
  for (const candidate of candidates) {
    const { mini, rotated } = candidate;
    let placed = false;
    for (const [sheetIndex, sheet] of sheets.entries()) {
      const heightMm = sheetIndex === 0 ? firstPageHeightMm : laterPageHeightMm;
      // Finish searching stacks before considering a new column on this sheet.
      for (const strip of sheet.strips) {
        if (rotated || strip.dedicated) continue;
        for (const column of strip.columns) {
          const y = column.usedHeightMm;
          if (mini.totalWidthMm <= column.widthMm && y + mini.totalHeightMm <= strip.heightMm) {
            sheet.placements.push({ mini, xMm: column.xMm, yMm: strip.yMm + y, rotated: false });
            column.usedHeightMm = y + mini.totalHeightMm;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
      for (const strip of sheet.strips) {
        if (rotated || strip.dedicated) continue;
        const x = strip.usedWidthMm;
        if (mini.totalHeightMm <= strip.heightMm && x + mini.totalWidthMm <= widthMm) {
          strip.columns.push({
            xMm: x,
            widthMm: mini.totalWidthMm,
            usedHeightMm: mini.totalHeightMm,
          });
          strip.usedWidthMm = x + mini.totalWidthMm;
          sheet.placements.push({ mini, xMm: x, yMm: strip.yMm, rotated: false });
          placed = true;
          break;
        }
      }
      if (placed) break;
      const y = sheet.usedHeightMm;
      if (y + candidate.heightMm <= heightMm) {
        addStrip(sheet, mini, y, rotated);
        placed = true;
        break;
      }
    }
    if (!placed) {
      // A mini that only fits below the scale-bar band's bottom starts on page
      // two. Keep page one in the layout so the PDF still prints its scale bar.
      if (sheets.length === 0 && candidate.heightMm > firstPageHeightMm) {
        sheets.push({ strips: [], usedHeightMm: 0, placements: [] });
      }
      const sheet: LayoutSheet = { strips: [], usedHeightMm: 0, placements: [] };
      addStrip(sheet, mini, 0, rotated);
      sheets.push(sheet);
    }
  }
  return sheets.map(({ placements }) => ({ placements }));
}

function addStrip(sheet: LayoutSheet, mini: PackedMini, yMm: number, rotated: boolean) {
  const { widthMm, heightMm } = footprintMm(mini, rotated);
  sheet.strips.push({
    yMm,
    heightMm,
    usedWidthMm: widthMm,
    columns: [{ xMm: 0, widthMm, usedHeightMm: heightMm }],
    dedicated: rotated,
  });
  sheet.usedHeightMm = yMm + heightMm;
  sheet.placements.push({ mini, xMm: 0, yMm, rotated });
}

function placeableCopies(minis: ResolvedMini[]): { mini: PackedMini; rotated: boolean }[] {
  return minis.flatMap(({ orientation, copies }) =>
    orientation === 'oversized'
      ? []
      : copies.map((mini) => ({ mini, rotated: orientation === 'rotated' })),
  );
}
