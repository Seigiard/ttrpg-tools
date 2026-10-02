import type { Entry, MiniSize, PackingEntry } from './types';
import {
  fitFigure,
  hasPackableDimensions,
  resolveSizeDimensionsMm,
  resolveTabHeightMm,
} from './sizes.ts';

// Page and layout constants. These live here (not in pdf.ts) so the packing
// math is a pure, DOM/PDF-free module that both the live page-count estimate
// and the PDF generator share.
export const PAGE_SIZES_MM = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES_MM;

export const MARGIN_MM = 10;
// Wide enough that two neighbours' cut marks, each reaching CUT_MARK_ARM_MM
// out from its own edge, never touch and read as one mark.
export const GAP_MM = 4;
export const CUT_MARK_ARM_MM = 1.5;
export const DEFAULT_FIGURE_MARGIN_MM = 2;

// A single placed copy of an entry, with its resolved geometry. entryIndex maps
// back to the source entry so callers (the PDF drawer, the warning UI) can
// attribute each mini to its row.
export type PackedMini = {
  entryIndex: number;
  copyIndex: number; // 0-based copy within the entry
  heightSlot: MiniSize;
  baseWidthMm: number; // the category's base, which sizes the stand and the badge
  totalWidthMm: number; // the widest of base and both figures, plus margins — the cut-out's width, and every strip's
  baseOffsetXMm: number; // offset of the base from the reserved column's left edge
  tabHeightMm: number; // each end strip; the floor strip under the front tab is twice this
  marginMm: number;
  imageWidthMm: number; // the front image's drawn width; may exceed baseWidthMm. `back` holds the back's
  imageHeightMm: number;
  imageOffsetXMm: number; // offset from the outline's left edge, including margin and centering
  // Each face's paper between its tab and the fold: the taller of the two
  // images, so both halves fold to the same length and both tabs meet the floor.
  faceHeightMm: number;
  back?: BackFace; // present only for an entry with back artwork
  totalHeightMm: number;
  label?: string;
};

// The front's three image fields again, for the back artwork.
export type BackFace = { imageWidthMm: number; imageHeightMm: number; imageOffsetXMm: number };

export type PackedRow = { items: PackedMini[]; widthMm: number; heightMm: number };
export type RowPage = { rows: PackedRow[]; heightMm: number };
export type Placement = {
  mini: PackedMini;
  // Millimetres from the top-left of the usable area, excluding sheet margins.
  xMm: number;
  yMm: number;
  rotated: boolean;
};
export type PackedPage = { placements: Placement[] };

// A mini that cannot fit a single page at all, attributed to its entry.
export type SkippedMini = {
  entryIndex: number;
  copyIndex: number;
  baseWidthMm: number;
  totalHeightMm: number;
};

export type PackResult = {
  pages: PackedPage[];
  pageCount: number;
  miniCount: number; // minis actually placed (what will print)
  skipped: SkippedMini[];
  oversizedEntryIndices: number[]; // distinct entries with >=1 skipped mini
};

export type PackOptions = {
  pageSize: PageSizeKey;
  numberDuplicates: boolean;
  marginMm?: number;
};

// A back file is chosen but not prepared yet. Such an entry is not ready, so
// it does not print reflected for a moment and then jump to its own back.
export function isBackArtworkLoading(entry: Entry): boolean {
  return entry.backImage != null && entry.backArtwork == null;
}

// Project prepared artwork into packing geometry without changing entry indices.
export function packEntries(entries: Entry[], opts: PackOptions): PackResult {
  return packMinis(
    entries.map((entry) => ({
      heightSlot: entry.heightSlot,
      customWidthMm: entry.customWidthMm,
      customHeightMm: entry.customHeightMm,
      count: entry.count,
      naturalWidth: isBackArtworkLoading(entry) ? undefined : entry.artwork?.width,
      naturalHeight: isBackArtworkLoading(entry) ? undefined : entry.artwork?.height,
      backNaturalWidth: entry.backArtwork?.width,
      backNaturalHeight: entry.backArtwork?.height,
    })),
    opts,
  );
}

// Resolve geometry once through the legacy candidate, then compare layouts.
// The row candidate is also a useful baseline for layout regression tests.
export function packMinis(entries: PackingEntry[], opts: PackOptions): PackResult {
  const rows = packRows(entries, opts);
  const { w, h } = PAGE_SIZES_MM[opts.pageSize];
  const minis = rows.pages.flatMap((page) => page.rows.flatMap((row) => row.items));
  const guillotine = packGuillotine(minis, w - MARGIN_MM * 2, h - MARGIN_MM * 2);
  const pages = guillotine.length <= rows.pageCount ? guillotine : rowPlacements(rows.pages);
  return { ...rows, pages, pageCount: pages.length };
}

function rowPlacements(pages: RowPage[]): PackedPage[] {
  return pages.map((page) => {
    const placements: Placement[] = [];
    let yMm = 0;
    for (const row of page.rows) {
      let xMm = 0;
      for (const mini of row.items) {
        placements.push({ mini, xMm, yMm, rotated: false });
        xMm += mini.totalWidthMm + GAP_MM;
      }
      yMm += row.heightMm + GAP_MM;
    }
    return { placements };
  });
}

type Column = { xMm: number; widthMm: number; usedHeightMm: number };
type Strip = { yMm: number; heightMm: number; usedWidthMm: number; columns: Column[] };
type LayoutSheet = { strips: Strip[]; usedHeightMm: number; placements: Placement[] };

function packGuillotine(minis: PackedMini[], widthMm: number, heightMm: number): PackedPage[] {
  minis.sort((a, b) => b.totalHeightMm - a.totalHeightMm || b.totalWidthMm - a.totalWidthMm);
  const sheets: LayoutSheet[] = [];
  for (const mini of minis) {
    let placed = false;
    for (const sheet of sheets) {
      // Finish searching stacks before considering a new column on this sheet.
      for (const strip of sheet.strips) {
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
      if (y + mini.totalHeightMm <= heightMm) {
        addStrip(sheet, mini, y);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const sheet: LayoutSheet = { strips: [], usedHeightMm: 0, placements: [] };
      addStrip(sheet, mini, 0);
      sheets.push(sheet);
    }
  }
  return sheets.map(({ placements }) => ({ placements }));
}

function addStrip(sheet: LayoutSheet, mini: PackedMini, yMm: number) {
  sheet.strips.push({
    yMm,
    heightMm: mini.totalHeightMm,
    usedWidthMm: mini.totalWidthMm,
    columns: [{ xMm: 0, widthMm: mini.totalWidthMm, usedHeightMm: mini.totalHeightMm }],
  });
  sheet.usedHeightMm = yMm + mini.totalHeightMm;
  sheet.placements.push({ mini, xMm: 0, yMm, rotated: false });
}

// Expands entries into individual minis with resolved geometry, sorted by
// reserved width descending, then bin-packs them into rows and pages within the
// usable area. Entries lacking an image's natural dimensions or the dimensions
// sizing needs are simply omitted (not yet packable) — that includes a custom
// entry with no figure height, which is why a row can vanish from the count
// with a perfectly good base width. Minis too large for a single page are
// reported as skipped rather than silently dropped.
export function packRows(
  entries: PackingEntry[],
  opts: PackOptions,
): Omit<PackResult, 'pages'> & { pages: RowPage[] } {
  const { w: pageWmm, h: pageHmm } = PAGE_SIZES_MM[opts.pageSize];
  const usableWmm = pageWmm - MARGIN_MM * 2;
  const usableHmm = pageHmm - MARGIN_MM * 2;
  const marginMm = opts.marginMm ?? DEFAULT_FIGURE_MARGIN_MM;

  const minis: PackedMini[] = [];
  entries.forEach((e, entryIndex) => {
    const dimensions = resolveSizeDimensionsMm(e);
    const { baseWidthMm } = dimensions;
    if (
      !hasPackableDimensions(e) ||
      e.count <= 0 ||
      e.naturalWidth == null ||
      e.naturalHeight == null ||
      e.naturalWidth <= 0 ||
      e.naturalHeight <= 0
    ) {
      return; // not packable yet
    }
    const { imageWidthMm, imageHeightMm } = fitFigure(dimensions, e.naturalWidth, e.naturalHeight);
    const backFit =
      e.backNaturalWidth && e.backNaturalHeight
        ? fitFigure(dimensions, e.backNaturalWidth, e.backNaturalHeight)
        : undefined;
    // A figure may overhang its base, so the reserved column is the widest of
    // base and faces.
    const contentWidthMm = Math.max(baseWidthMm, imageWidthMm, backFit?.imageWidthMm ?? 0);
    const totalWidthMm = contentWidthMm + marginMm * 2;
    const imageOffsetXMm = marginMm + (contentWidthMm - imageWidthMm) / 2;
    const back = backFit && {
      ...backFit,
      imageOffsetXMm: marginMm + (contentWidthMm - backFit.imageWidthMm) / 2,
    };
    const faceHeightMm = Math.max(imageHeightMm, backFit?.imageHeightMm ?? 0);
    // Derived here in millimetres rather than in the drawer, because the same
    // arithmetic in points does not land on the same numbers. `drawMini` still
    // derives the back badge's own offset, inside the rotated frame, from this
    // rule — change it here and change it there.
    const baseOffsetXMm = marginMm + (contentWidthMm - baseWidthMm) / 2;
    const tabHMm = resolveTabHeightMm(e);
    // Face on face, a margin either side of the fold, a tab at each end and
    // the floor strip, twice a tab, under the front one.
    const totalHeightMm = faceHeightMm * 2 + marginMm * 2 + tabHMm * 4;
    for (let i = 0; i < e.count; i++) {
      minis.push({
        entryIndex,
        copyIndex: i,
        heightSlot: e.heightSlot,
        baseWidthMm,
        totalWidthMm,
        baseOffsetXMm,
        tabHeightMm: tabHMm,
        marginMm,
        imageWidthMm,
        imageHeightMm,
        imageOffsetXMm,
        faceHeightMm,
        ...(back && { back }),
        totalHeightMm,
        label: opts.numberDuplicates ? String(i + 1) : undefined,
      });
    }
  });

  // Sort by reserved width descending so wide minis lead each row — reordering
  // rows in the UI has no effect on output, which is why drag-to-reorder is out
  // of scope. A narrow figure of a large category can reserve less than a wide
  // one of a small category, so this is not base-width order.
  minis.sort((a, b) => b.totalWidthMm - a.totalWidthMm);

  const pages: RowPage[] = [];
  const skipped: SkippedMini[] = [];
  const oversized = new Set<number>();
  let placed = 0;

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

  for (const mini of minis) {
    if (mini.totalWidthMm > usableWmm || mini.totalHeightMm > usableHmm) {
      skipped.push({
        entryIndex: mini.entryIndex,
        copyIndex: mini.copyIndex,
        baseWidthMm: mini.baseWidthMm,
        totalHeightMm: mini.totalHeightMm,
      });
      oversized.add(mini.entryIndex);
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
    placed++;
  }
  flushRow();
  if (page.rows.length > 0) pages.push(page);

  return {
    pages,
    pageCount: pages.length,
    miniCount: placed,
    skipped,
    oversizedEntryIndices: [...oversized],
  };
}
