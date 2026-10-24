import type { HeightCalibration, MiniSize, PackingEntry } from './types';
import { calibrationGap } from './calibration-session';
import {
  type SizeDimensionsMm,
  hasPackableDimensions,
  resolveSizeDimensionsMm,
  resolveTabHeightMm,
} from './sizes.ts';

export type FigureFitLimit = 'height' | 'width' | 'page';

export type FigureFitMm = {
  imageWidthMm: number;
  imageHeightMm: number;
  limits: FigureFitLimit[];
};

// Page constants. They live here, not in pdf.ts, so the fit and packing math
// stay DOM/PDF-free and both the live page-count estimate and the PDF generator
// share them. The page cap in fitMiniFaces needs them, so packing imports them
// from here rather than the other way round.
export const PAGE_SIZES_MM = {
  a4: { w: 210, h: 297 },
  letter: { w: 216, h: 279 },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES_MM;

export const DEFAULT_FIGURE_MARGIN_MM = 2;

export const DEFAULT_PRINTER_SCALE = 0.91;

export const SCALE_BAR_BAND_MM = 10;

export const FLAT_TONGUE_DEPTH_MM = 6;

export const FLAT_TONGUE_INSET_MM = 2;

export type BaseStyle = 'tent' | 'flat' | 'foamboard';

export type PackOptions = {
  pageSize: PageSizeKey;
  numberDuplicates: boolean;
  baseStyle?: BaseStyle;
  marginMm?: number;
  printerScale?: number;
};

export function printerScale(opts: Pick<PackOptions, 'printerScale'>): number {
  return opts.printerScale ?? DEFAULT_PRINTER_SCALE;
}

export function usableAreaMm(opts: Pick<PackOptions, 'pageSize' | 'printerScale'>) {
  const full = fullPageAreaMm(opts);

  return { widthMm: full.widthMm, heightMm: full.heightMm - SCALE_BAR_BAND_MM };
}

// Later sheets have no scale bar, so minis may use their complete scaled height.
export function fullPageAreaMm(opts: Pick<PackOptions, 'pageSize' | 'printerScale'>) {
  const scale = printerScale(opts);
  const { w, h } = PAGE_SIZES_MM[opts.pageSize];

  return { widthMm: w * scale, heightMm: h * scale };
}

export const CUT_MARK_ARM_MM = 1.5;

export const CUT_MARK_STROKE_MM = 0.2;

type TentCutMarks = {
  cornersMm: [number, number];
  edgeTicksMm: [number, number, number, number];
};

type FlatCutMarks = {
  cornersMm: [number, number, number, number];
  edgeTicksMm: [number];
};

export type TentMiniLevels = {
  floorStripTopMm: number;
  frontTabTopMm: number;
  frontTongueTopMm?: never;
  frontFaceTopMm: number;
  foldMm: number;
  backFaceBottomMm: number;
  backFaceTopMm: number;
  topMm: number;
  cutMarks: TentCutMarks;
};

export type FlatMiniLevels = {
  floorStripTopMm?: never;
  frontTabTopMm?: never;
  frontTongueTopMm: number;
  frontFaceTopMm: number;
  foldMm: number;
  backFaceBottomMm: number;
  backFaceTopMm: number;
  topMm: number;
  cutMarks: FlatCutMarks;
};

type FoamboardCutMarks = {
  cornersMm: [number, number];
  edgeTicksMm: [];
};

export type FoamboardMiniLevels = {
  floorStripTopMm?: never;
  frontTabTopMm?: never;
  frontTongueTopMm: number;
  frontFaceTopMm: number;
  foldMm?: never;
  backFaceBottomMm?: never;
  backFaceTopMm?: never;
  topMm: number;
  cutMarks: FoamboardCutMarks;
};

export type MiniLevels = TentMiniLevels | FlatMiniLevels | FoamboardMiniLevels;

// A single copy of an entry, with its resolved geometry. entryIndex maps back
// to the source entry so the PDF drawer can attribute each mini to its row.
type PackedMiniCommon = {
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
  backBadgeOffsetXMm: number; // measured from the back image's own origin
  fitLimits: FigureFitLimit[];
  totalHeightMm: number;
  label?: string;
};

export type TentPackedMini = PackedMiniCommon & {
  baseStyle: 'tent';
  levels: TentMiniLevels; // vertical levels measured from the mini's bottom edge
  tongueWidthMm?: never;
  tongueOffsetXMm?: never;
};

export type FlatPackedMini = PackedMiniCommon & {
  baseStyle: 'flat';
  levels: FlatMiniLevels; // vertical levels measured from the mini's bottom edge
  tongueWidthMm: number;
  tongueOffsetXMm: number;
};

export type FoamboardPackedMini = PackedMiniCommon & {
  baseStyle: 'foamboard';
  levels: FoamboardMiniLevels; // vertical levels measured from the mini's bottom edge
  tongueWidthMm: number;
  tongueOffsetXMm: number;
};

export type PackedMini = TentPackedMini | FlatPackedMini | FoamboardPackedMini;

// The front's three image fields again, for the back artwork.
export type BackFace = { imageWidthMm: number; imageHeightMm: number; imageOffsetXMm: number };

// How a mini can sit on the usable area: as drawn, only turned a quarter, or
// not at all. Both layout candidates take this as given.
export type MiniOrientation = 'upright' | 'rotated' | 'oversized';

// What one row will become in print. `empty` covers every row with nothing to
// print yet: no image, or no copies or sizing dimensions to pack it with.
export type EntryState = 'empty' | 'loading' | 'failed' | MiniOrientation;

export type EntryStatus = { state: EntryState; limits: FigureFitLimit[] };

// One entry resolved against the page options. Every copy shares the geometry,
// so orientation and limits hold for the whole entry.
export type ResolvedMini = {
  entryIndex: number;
  orientation: MiniOrientation;
  limits: FigureFitLimit[];
  copies: PackedMini[];
};

export function footprintMm(
  mini: PackedMini,
  rotated: boolean,
): { widthMm: number; heightMm: number } {
  return rotated
    ? { widthMm: mini.totalHeightMm, heightMm: mini.totalWidthMm }
    : { widthMm: mini.totalWidthMm, heightMm: mini.totalHeightMm };
}

function miniOrientation(mini: PackedMini, opts: PackOptions): MiniOrientation {
  const usable = fullPageAreaMm(opts);

  const fits = ({ widthMm, heightMm }: { widthMm: number; heightMm: number }) =>
    widthMm <= usable.widthMm && heightMm <= usable.heightMm;

  if (fits(footprintMm(mini, false))) return 'upright';

  return fits(footprintMm(mini, true)) ? 'rotated' : 'oversized';
}

// A figure is never wider than this multiple of the height its slot prints at.
// Height comes from the height slot, so width is the axis that can run away:
// without a cap, a figure spread out sideways would swallow the sheet. Hitting
// the cap scales the whole figure down rather than cropping it, so that mini
// prints short of its slot's height.
//
// The denominator is the slot's height, not the figure's printed one, so this
// does not bound the printed width-to-height ratio and is not meant to: the
// artwork's own proportions are preserved through the scale-down, which is what
// keeps the figure uncropped. A 4:1 Medium prints 52.5 × 13.125 mm — still 4:1.
//
// The cap is measured against the slot's figure height, not the base width, and
// that is load-bearing. A base-width cap contains no slot term — every slot of a
// category shares one base — so a capped figure's height collapsed to the same
// millimetres for every slot of that category, which is exactly the
// dwarf-and-bugbear-print-alike defect printableminimaker#24 exists to remove. Against the
// figure's own height the scale-down is proportional, so the slots stay ordered
// at every aspect ratio.
//
// 1.5 because it sits close to the 1.67 the old base-width cap gave a Medium,
// so the common case barely moves, and it leaves the page real slack: the
// tallest slot's widest figure reserves 111 × 1.5 plus two figure margins,
// against A4's 190 mm of usable width. The page would in fact hold about 1.67
// here — the number is a judgement about how far a figure may spread, not a
// limit the paper forces.
export const MAX_WIDTH_TO_SLOT_HEIGHT = 1.5;

// Leave room for raised weapons without letting a short marked gap make a giant mini.
export const MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT = 2;

// Convert the slot height to artwork millimetres, dividing by a valid marked gap.
// Then apply the 2× height cap, width cap, and supplied page-height cap, in order.
// Each cap only shrinks the whole image; proportions stay intact, without cropping.
// The height cap and width-limit reporting require valid calibration. The page
// cap is opt-in: fitMiniFaces supplies it for both faces when the mini is
// calibrated. Without calibration or a page cap, only the width cap applies.
export function fitFigure(
  { figureHeightMm }: SizeDimensionsMm,
  imgWidthPx: number,
  imgHeightPx: number,
  calibration?: HeightCalibration,
  maxImageHeightMm?: number,
): FigureFitMm {
  const maxWidthMm = figureHeightMm * MAX_WIDTH_TO_SLOT_HEIGHT;
  const aspect = imgWidthPx / imgHeightPx;
  const validGap = calibrationGap(calibration);
  const limits: FigureFitLimit[] = [];
  const calibrationScale = validGap ?? 1;
  let imageHeightMm = figureHeightMm / calibrationScale;
  let imageWidthMm = aspect * imageHeightMm;

  if (validGap && imageHeightMm > figureHeightMm * MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT) {
    imageHeightMm = figureHeightMm * MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT;
    imageWidthMm = aspect * imageHeightMm;
    limits.push('height');
  }

  if (imageWidthMm > maxWidthMm) {
    imageWidthMm = maxWidthMm;
    imageHeightMm = maxWidthMm / aspect;

    if (validGap) limits.push('width');
  }

  if (maxImageHeightMm != null && imageHeightMm > maxImageHeightMm) {
    imageHeightMm = maxImageHeightMm;
    imageWidthMm = aspect * imageHeightMm;
    limits.push('page');
  }

  return { imageWidthMm, imageHeightMm, limits };
}

type MiniFaceFits = { front: FigureFitMm; back?: FigureFitMm };

// Resolve both faces together. A shared calibration gives both faces the same
// printed height. The wider face's cap shrinks both by the same factor so
// neither artwork distorts.
function fitMiniFaces(
  e: PackingEntry & { naturalWidth: number; naturalHeight: number },
  opts: PackOptions,
): MiniFaceFits {
  const dimensions = resolveSizeDimensionsMm(e);
  const { widthMm: usableWidthMm, heightMm: usableHeightMm } = fullPageAreaMm(opts);
  const marginMm = opts.marginMm ?? DEFAULT_FIGURE_MARGIN_MM;

  const baseStyle = opts.baseStyle ?? 'tent';

  const supportHeightMm =
    baseStyle === 'flat'
      ? FLAT_TONGUE_DEPTH_MM * 2
      : baseStyle === 'foamboard'
        ? FLAT_TONGUE_DEPTH_MM
        : resolveTabHeightMm(e) * 4;

  const imageSpaceMm =
    baseStyle === 'foamboard'
      ? usableHeightMm - marginMm * 2 - supportHeightMm
      : (usableHeightMm - marginMm * 2 - supportHeightMm) / 2;

  const calibrated = calibrationGap(e.calibration);

  // Page fitting belongs to the whole calibrated mini. Do not promise a page
  // fit when the base/tabs alone cannot fit.
  const maxImageHeightMm = (aspect: number) =>
    calibrated && imageSpaceMm > 0 && dimensions.baseWidthMm + marginMm * 2 <= usableWidthMm
      ? Math.min(imageSpaceMm, (usableWidthMm - marginMm * 2) / aspect)
      : undefined;

  let faces: MiniFaceFits;

  if (e.backNaturalWidth && e.backNaturalHeight && calibrated) {
    const frontAspect = e.naturalWidth / e.naturalHeight;
    const backAspect = e.backNaturalWidth / e.backNaturalHeight;

    // Fit the wider face first so width still precedes page in the cap order.
    const shared = fitFigure(
      dimensions,
      Math.max(frontAspect, backAspect),
      1,
      e.calibration,
      maxImageHeightMm(Math.max(frontAspect, backAspect)),
    );

    faces = {
      front: { ...shared, imageWidthMm: frontAspect * shared.imageHeightMm },
      back: { ...shared, imageWidthMm: backAspect * shared.imageHeightMm },
    };
  } else {
    faces = {
      front: fitFigure(
        dimensions,
        e.naturalWidth,
        e.naturalHeight,
        e.calibration,
        maxImageHeightMm(e.naturalWidth / e.naturalHeight),
      ),
      back:
        e.backNaturalWidth && e.backNaturalHeight
          ? fitFigure(
              dimensions,
              e.backNaturalWidth,
              e.backNaturalHeight,
              e.calibration,
              maxImageHeightMm(e.backNaturalWidth / e.backNaturalHeight),
            )
          : undefined,
    };
  }

  return faces;
}

const fitLimitLabels: Record<FigureFitLimit, string> = {
  height: 'лимит высоты 2×',
  width: 'лимит ширины',
  page: 'размер листа',
};

function fitLimitWarning(limits: readonly FigureFitLimit[]): string | undefined {
  if (!limits.length) return undefined;

  return `Миниатюра уменьшена: ${limits.map((limit) => fitLimitLabels[limit]).join(', ')}.`;
}

export function entryStatusWarning(status: EntryStatus): string | undefined {
  if (status.state === 'oversized')
    return 'Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.';

  return fitLimitWarning(status.limits);
}

// Resolves one entry into the geometry every copy prints with and how it sits
// on the page. Entries lacking an image's natural dimensions or the dimensions
// sizing needs are not packable yet and resolve to undefined — that includes a
// custom entry with no figure height, which is why a row can vanish from the
// count with a perfectly good base width.
export function resolveMini(
  e: PackingEntry,
  entryIndex: number,
  opts: PackOptions,
): ResolvedMini | undefined {
  if (
    !hasPackableDimensions(e) ||
    e.count <= 0 ||
    e.naturalWidth == null ||
    e.naturalHeight == null ||
    e.naturalWidth <= 0 ||
    e.naturalHeight <= 0
  ) {
    return undefined;
  }

  const { baseWidthMm } = resolveSizeDimensionsMm(e);
  const baseStyle = opts.baseStyle ?? 'tent';
  const marginMm = opts.marginMm ?? DEFAULT_FIGURE_MARGIN_MM;
  const tabHMm = baseStyle === 'tent' ? resolveTabHeightMm(e) : FLAT_TONGUE_DEPTH_MM;

  const { front, back: rawBackFit } = fitMiniFaces(
    { ...e, naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight },
    opts,
  );

  const { imageWidthMm, imageHeightMm } = front;

  const backFit = rawBackFit && {
    imageWidthMm: rawBackFit.imageWidthMm,
    imageHeightMm: rawBackFit.imageHeightMm,
  };

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
  const baseOffsetXMm = marginMm + (contentWidthMm - baseWidthMm) / 2;
  const limits = [...new Set([...front.limits, ...(rawBackFit?.limits ?? [])])];
  const copies: PackedMini[] = [];

  if (baseStyle === 'foamboard') {
    const frontTongueTopMm = FLAT_TONGUE_DEPTH_MM;
    const frontFaceTopMm = frontTongueTopMm + marginMm + faceHeightMm;
    // Use the same closed form that fitMiniFaces inverts at the page cap. A
    // chained sum can round one ulp above the usable height and reject the mini.
    const topMm = faceHeightMm + marginMm * 2 + FLAT_TONGUE_DEPTH_MM;
    const tongueWidthMm = baseWidthMm - FLAT_TONGUE_INSET_MM * 2;
    const tongueOffsetXMm = baseOffsetXMm + FLAT_TONGUE_INSET_MM;

    const levels: FoamboardMiniLevels = {
      frontTongueTopMm,
      frontFaceTopMm,
      topMm,
      cutMarks: { cornersMm: [0, topMm], edgeTicksMm: [] },
    };

    const backBadgeOffsetXMm = tongueOffsetXMm - (back?.imageOffsetXMm ?? imageOffsetXMm);

    for (let i = 0; i < e.count; i++) {
      copies.push({
        entryIndex,
        copyIndex: i,
        baseStyle,
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
        levels,
        tongueWidthMm,
        tongueOffsetXMm,
        backBadgeOffsetXMm,
        fitLimits: [...limits],
        totalHeightMm: levels.topMm,
        label: opts.numberDuplicates ? String(i + 1) : undefined,
      });
    }
  } else if (baseStyle === 'flat') {
    const frontTongueTopMm = FLAT_TONGUE_DEPTH_MM;
    const frontFaceTopMm = frontTongueTopMm + faceHeightMm;
    const foldMm = frontFaceTopMm + marginMm;
    const backFaceBottomMm = foldMm + marginMm;
    const backFaceTopMm = backFaceBottomMm + faceHeightMm;
    // Use the same closed form that fitMiniFaces inverts at the page cap. A
    // chained sum can round one ulp above the usable height and reject the mini.
    const topMm = faceHeightMm * 2 + marginMm * 2 + FLAT_TONGUE_DEPTH_MM * 2;
    const tongueWidthMm = baseWidthMm - FLAT_TONGUE_INSET_MM * 2;
    // Store the tongue offset from the piece's left edge. The base is centred
    // in the reserved column, and the inset moves inward from its left edge.
    const tongueOffsetXMm = baseOffsetXMm + FLAT_TONGUE_INSET_MM;

    const levels: FlatMiniLevels = {
      frontTongueTopMm,
      frontFaceTopMm,
      foldMm,
      backFaceBottomMm,
      backFaceTopMm,
      topMm,
      cutMarks: {
        cornersMm: [0, frontTongueTopMm, backFaceTopMm, topMm],
        edgeTicksMm: [foldMm],
      },
    };

    const backBadgeOffsetXMm =
      baseOffsetXMm + (baseWidthMm - tongueWidthMm) / 2 - (back?.imageOffsetXMm ?? imageOffsetXMm);

    for (let i = 0; i < e.count; i++) {
      copies.push({
        entryIndex,
        copyIndex: i,
        baseStyle,
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
        levels,
        tongueWidthMm,
        tongueOffsetXMm,
        backBadgeOffsetXMm,
        fitLimits: [...limits],
        totalHeightMm: levels.topMm,
        label: opts.numberDuplicates ? String(i + 1) : undefined,
      });
    }
  } else {
    const floorStripTopMm = tabHMm * 2;
    const frontTabTopMm = floorStripTopMm + tabHMm;
    const frontFaceTopMm = frontTabTopMm + faceHeightMm;
    const foldMm = frontFaceTopMm + marginMm;
    const backFaceBottomMm = foldMm + marginMm;
    // Use the same closed form that fitMiniFaces inverts at the page cap. A
    // chained sum can round one ulp above the usable height and reject the mini.
    const topMm = faceHeightMm * 2 + marginMm * 2 + tabHMm * 4;
    const backFaceTopMm = topMm - tabHMm;

    const levels: TentMiniLevels = {
      floorStripTopMm,
      frontTabTopMm,
      frontFaceTopMm,
      foldMm,
      backFaceBottomMm,
      backFaceTopMm,
      topMm,
      cutMarks: {
        cornersMm: [0, topMm],
        edgeTicksMm: [floorStripTopMm, frontTabTopMm, foldMm, backFaceTopMm],
      },
    };

    const backBadgeOffsetXMm = ((back?.imageWidthMm ?? imageWidthMm) - baseWidthMm) / 2;

    for (let i = 0; i < e.count; i++) {
      copies.push({
        entryIndex,
        copyIndex: i,
        baseStyle,
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
        levels,
        backBadgeOffsetXMm,
        fitLimits: [...limits],
        totalHeightMm: levels.topMm,
        label: opts.numberDuplicates ? String(i + 1) : undefined,
      });
    }
  }

  // A count that is not a number passes the check above but yields no copy.
  if (copies.length === 0) return undefined;

  return { entryIndex, orientation: miniOrientation(copies[0], opts), limits, copies };
}

// Keeps entry indices: an entry that is not packable yet leaves a gap.
export function resolveMinis(entries: PackingEntry[], opts: PackOptions): ResolvedMini[] {
  return entries.flatMap((entry, entryIndex) => resolveMini(entry, entryIndex, opts) ?? []);
}
