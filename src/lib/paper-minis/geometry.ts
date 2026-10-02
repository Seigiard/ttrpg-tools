import type { HeightCalibration, PackingEntry } from './types';
import { calibrationGap } from './calibration';
import { type SizeDimensionsMm, resolveSizeDimensionsMm, resolveTabHeightMm } from './sizes.ts';

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

export const MARGIN_MM = 10;
export const DEFAULT_FIGURE_MARGIN_MM = 2;

export type PackOptions = {
  pageSize: PageSizeKey;
  numberDuplicates: boolean;
  marginMm?: number;
};

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

// Resolve both faces together for packing and the calibration preview. A shared
// calibration gives both faces the same printed height. The wider face's cap
// shrinks both by the same factor so neither artwork distorts.
export function fitMiniFaces(
  e: PackingEntry & { naturalWidth: number; naturalHeight: number },
  opts: PackOptions,
): { front: FigureFitMm; back?: FigureFitMm } {
  const dimensions = resolveSizeDimensionsMm(e);
  const usableHeightMm = PAGE_SIZES_MM[opts.pageSize].h - MARGIN_MM * 2;
  const usableWidthMm = PAGE_SIZES_MM[opts.pageSize].w - MARGIN_MM * 2;
  const marginMm = opts.marginMm ?? DEFAULT_FIGURE_MARGIN_MM;
  const imageSpaceMm = (usableHeightMm - marginMm * 2 - resolveTabHeightMm(e) * 4) / 2;
  const calibrated = calibrationGap(e.calibration);
  // Page fitting belongs to the whole calibrated mini. Do not promise a page
  // fit when the base/tabs alone cannot fit.
  const maxImageHeightMm = (aspect: number) =>
    calibrated && imageSpaceMm > 0 && dimensions.baseWidthMm + marginMm * 2 <= usableWidthMm
      ? Math.min(imageSpaceMm, (usableWidthMm - marginMm * 2) / aspect)
      : undefined;
  let faces: { front: FigureFitMm; back?: FigureFitMm };
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

export function fitLimitWarning(limits: readonly FigureFitLimit[]): string | undefined {
  if (!limits.length) return undefined;
  return `Миниатюра уменьшена: ${limits.map((limit) => fitLimitLabels[limit]).join(', ')}.`;
}
