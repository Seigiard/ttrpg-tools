import type { Entry, PackingEntry } from './types';
import {
  type EntryStatus,
  type PackOptions,
  type PackedMini,
  type ResolvedMini,
  footprintMm,
  packableAreaMm,
  resolveMini,
} from './geometry.ts';

// Wide enough that two neighbours' cut marks, each reaching CUT_MARK_ARM_MM
// out from its own edge, never touch and read as one mark.
export const GAP_MM = 4;

export type PackedRow = { items: PackedMini[]; widthMm: number; heightMm: number; rotated?: true };
export type RowPage = { rows: PackedRow[]; heightMm: number };
export type Placement = {
  mini: PackedMini;
  // Millimetres from the top-left of the packable area, below the scale bar.
  // Rotated footprints include the stroked cut marks; the cut-out is inset by their extent.
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

// Resolve every entry's geometry once, then compare the two layouts of the
// same resolved minis. The row candidate is also a useful baseline for layout
// regression tests.
export function packMinis(entries: PackingEntry[], opts: PackOptions): PackResult {
  return packResolvedEntries(
    entries.map((entry, entryIndex) => resolvePackingEntry(entry, entryIndex, opts)),
    opts,
  );
}

function packResolvedEntries(entries: ResolvedEntry[], opts: PackOptions): PackResult {
  const resolved = entries.flatMap(({ mini }) => (mini ? [mini] : []));
  const rows = packRows(resolved, opts);
  const { widthMm, heightMm } = packableAreaMm(opts);
  const guillotine = packGuillotine(resolved, widthMm, heightMm);
  const pages = guillotine.length <= rows.pageCount ? guillotine : rowPlacements(rows.pages);
  return {
    pages,
    pageCount: pages.length,
    miniCount: resolved
      .filter((mini) => mini.orientation !== 'oversized')
      .reduce((sum, mini) => sum + mini.copies.length, 0),
    entries: entries.map(({ status }) => status),
  };
}

function rowPlacements(pages: RowPage[]): PackedPage[] {
  return pages.map((page) => {
    const placements: Placement[] = [];
    let yMm = 0;
    for (const row of page.rows) {
      let xMm = 0;
      for (const mini of row.items) {
        placements.push({ mini, xMm, yMm, rotated: row.rotated ?? false });
        xMm += mini.totalWidthMm + GAP_MM;
      }
      yMm += row.heightMm + GAP_MM;
    }
    return { placements };
  });
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

function packGuillotine(minis: ResolvedMini[], widthMm: number, heightMm: number): PackedPage[] {
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
    for (const sheet of sheets) {
      // Finish searching stacks before considering a new column on this sheet.
      for (const strip of sheet.strips) {
        if (rotated || strip.dedicated) continue;
        for (const column of strip.columns) {
          const y = column.usedHeightMm + GAP_MM;
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
        const x = strip.usedWidthMm + GAP_MM;
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
      const y = sheet.usedHeightMm + GAP_MM;
      if (y + candidate.heightMm <= heightMm) {
        addStrip(sheet, mini, y, rotated);
        placed = true;
        break;
      }
    }
    if (!placed) {
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

// Lays resolved minis out in rows and pages within the usable area. Upright
// minis share rows; a mini that only fits turned gets a row of its own;
// oversized minis are left out, as the resolve step already reported them.
export function packRows(
  minis: ResolvedMini[],
  opts: Pick<PackOptions, 'pageSize' | 'printerScale'>,
): { pages: RowPage[]; pageCount: number } {
  const { widthMm: usableWmm, heightMm: usableHmm } = packableAreaMm(opts);

  // Sort by reserved width descending so wide minis lead each row — reordering
  // rows in the UI has no effect on output, which is why drag-to-reorder is out
  // of scope. A narrow figure of a large category can reserve less than a wide
  // one of a small category, so this is not base-width order.
  const copies = placeableCopies(minis).toSorted((a, b) => b.mini.totalWidthMm - a.mini.totalWidthMm);

  const pages: RowPage[] = [];
  const rescued: PackedMini[] = [];

  let page: RowPage = { rows: [], heightMm: 0 };
  let row: PackedRow = { items: [], widthMm: 0, heightMm: 0 };

  const flushRow = () => {
    if (row.items.length === 0) return;
    const addedHeight = row.heightMm + (page.rows.length > 0 ? GAP_MM : 0);
    if (page.heightMm + addedHeight > usableHmm) {
      if (page.rows.length > 0) pages.push(page);
      page = { rows: [row], heightMm: row.heightMm };
    } else {
      page.rows.push(row);
      page.heightMm += addedHeight;
    }
    row = { items: [], widthMm: 0, heightMm: 0 };
  };

  for (const { mini, rotated } of copies) {
    if (rotated) {
      rescued.push(mini);
      continue;
    }
    const isFirst = row.items.length === 0;
    const addedWidth = mini.totalWidthMm + (isFirst ? 0 : GAP_MM);
    if (row.widthMm + addedWidth > usableWmm) {
      flushRow();
    }
    const firstNow = row.items.length === 0;
    row.widthMm += mini.totalWidthMm + (firstNow ? 0 : GAP_MM);
    row.items.push(mini);
    if (mini.totalHeightMm > row.heightMm) row.heightMm = mini.totalHeightMm;
  }
  flushRow();
  if (page.rows.length > 0) pages.push(page);

  // Rescues own a full strip in the fallback too. Scan all sheets before
  // opening another; upright rows must never share a rescued mini's strip.
  for (const mini of rescued) {
    const { widthMm, heightMm } = footprintMm(mini, true);
    const rescueRow: PackedRow = { items: [mini], widthMm, heightMm, rotated: true };
    const target = pages.find((sheet) => sheet.heightMm + GAP_MM + heightMm <= usableHmm);
    if (target) {
      target.rows.push(rescueRow);
      target.heightMm += GAP_MM + heightMm;
    } else {
      pages.push({ rows: [rescueRow], heightMm });
    }
  }

  return { pages, pageCount: pages.length };
}
