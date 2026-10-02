import type { Entry, HeightCalibration, HeightSlot, MiniSize, SizeCategory } from './types';

export type SizeDimensionsMm = { baseWidthMm: number; figureHeightMm: number };
export type FigureFitLimit = 'height' | 'width' | 'page';
export type FigureFitMm = {
  imageWidthMm: number;
  imageHeightMm: number;
  limits: FigureFitLimit[];
};

// printableminimaker ADR-0002: base width is a convention, not a measurement. A creature's space
// is the area it controls in combat, explicitly not its physical size, and the
// rules give no creature height at all. Its remaining jobs are to size the
// stand and to signal relative size, which the six categories still do well
// enough — so the category is what fixes it, and every slot that
// carries the category inherits the number.
export const CATEGORY_BASE_WIDTH_MM: Record<SizeCategory, number> = {
  tiny: 20,
  small: 25,
  medium: 25,
  large: 37,
  huge: 50,
  gargantuan: 75,
};

// The stand folds as _||_: the front and back tabs fold out under the figure,
// and the floor strip below the front tab, two tabs deep, folds under and is
// glued to both. So a tab is half the base, and the two together make the
// footprint as deep as it is wide.
//
// Huge and Gargantuan are page-bound here as their heights are: at half their
// bases neither fits Letter at any margin. Their tabs are cut to what keeps
// them on Letter through a 5 mm figure margin, so a Gargantuan stands on a
// shallow 75 × 13 mm footprint rather than falling off the sheet.
export const CATEGORY_TAB_HEIGHT_MM: Record<SizeCategory, number> = {
  tiny: 10,
  small: 12.5,
  medium: 12.5,
  large: 18.5,
  huge: 14.5,
  gargantuan: 6.5,
};

export const CATEGORY_NAMES: Record<SizeCategory, string> = {
  tiny: 'Крошечный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Большой',
  huge: 'Огромный',
  gargantuan: 'Громадный',
};

export const SIZE_CATEGORY_ORDER = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
] as const satisfies readonly SizeCategory[];

export type HeightSlotSpec = {
  category: SizeCategory;
  grade?: 'short' | 'tall'; // set only where a category carries more than one slot
  realHeight: string; // the height the slot is graded at, as the interface states it
  typical: string; // creatures that land here, for the dropdown
  figureHeightMm: number;
};

// printableminimaker ADR-0002: height is the user's input and the size category follows from the
// slot, rather than the other way round. Graded on a 1.7 m human printing
// 35 mm, the scale Printable Heroes prints its own paper minis at, so ours stand
// eye to eye with theirs on one table. That works out to about 6.3 mm per foot,
// held linear from Tiny up to the tall Large slot.
//
// The top two rows leave that line, because the paper runs out before the
// creatures do. Gargantuan is cut to 111 rather than the 206 the linear scale
// asks for; its tab gives up the rest of the page (CATEGORY_TAB_HEIGHT_MM).
//
// Huge's own linear 124 does not fit Letter at any margin, so it is paper-bound
// too. It sits at 95 rather than just under Gargantuan, because two rows 5%
// apart read as one size on cut paper; 95 keeps a step of about 16% on either
// side, to the tall Large below and Gargantuan above. The cost is that the top
// of the scale means rank rather than height: 4 m, 6 m and 10 m+ print at 82,
// 95 and 111. Every other row is the linear value rounded.
export const HEIGHT_SLOTS: Record<HeightSlot, HeightSlotSpec> = {
  tiny: {
    category: 'tiny',
    realHeight: '0,6 м',
    typical: 'фамильяр, бес, ястреб',
    figureHeightMm: 12,
  },
  small: {
    category: 'small',
    realHeight: '0,95 м',
    typical: 'полурослик, гном, волк',
    figureHeightMm: 20,
  },
  'medium-short': {
    category: 'medium',
    grade: 'short',
    realHeight: '1,3 м',
    typical: 'дварф',
    figureHeightMm: 27,
  },
  medium: {
    category: 'medium',
    realHeight: '1,7 м',
    typical: 'человек, эльф, орк',
    figureHeightMm: 35,
  },
  'medium-tall': {
    category: 'medium',
    grade: 'tall',
    realHeight: '2,1 м',
    typical: 'багбир, голиаф',
    figureHeightMm: 43,
  },
  large: {
    category: 'large',
    realHeight: '2,7 м',
    typical: 'огр, тролль, совомедведь',
    figureHeightMm: 56,
  },
  'large-tall': {
    category: 'large',
    grade: 'tall',
    realHeight: '4 м',
    typical: 'холмовой великан, молодой дракон',
    figureHeightMm: 82,
  },
  huge: {
    category: 'huge',
    realHeight: '6 м',
    typical: 'великан, взрослый дракон',
    figureHeightMm: 95,
  },
  gargantuan: {
    category: 'gargantuan',
    realHeight: '10 м и выше',
    typical: 'древний дракон, кракен',
    figureHeightMm: 111,
  },
};

// Shortest first, which is the order the dropdown and the tests both want.
export const HEIGHT_SLOT_ORDER = [
  'tiny',
  'small',
  'medium-short',
  'medium',
  'medium-tall',
  'large',
  'large-tall',
  'huge',
  'gargantuan',
] as const satisfies readonly HeightSlot[];

export const CUSTOM_SIZE_NAME = 'Свой размер';

export function slotsOfCategory(category: SizeCategory): HeightSlot[] {
  return HEIGHT_SLOT_ORDER.filter((slot) => HEIGHT_SLOTS[slot].category === category);
}

// A slot's own name: its size category, and the grade within it where the
// category carries more than one slot. Composed rather than stored, so the
// category name has one source.
export function slotName(size: HeightSlot): string {
  const { category, grade } = HEIGHT_SLOTS[size];
  return grade
    ? `${CATEGORY_NAMES[category]}, ${grade === 'short' ? 'низкий' : 'высокий'}`
    : CATEGORY_NAMES[category];
}

// What a dropdown option says. The creature's own height, in metres, is the
// thing a user recognises — a dwarf against a bugbear is 1.3 m against 2.1 m,
// where "Medium" says nothing. The millimetres the mini prints at are the
// consequence, not the choice, so they go in the tooltip below.
export function slotLabel(size: MiniSize): string {
  if (size === 'custom') return CUSTOM_SIZE_NAME;
  const { realHeight, typical } = HEIGHT_SLOTS[size];
  return `${slotName(size)} · ${realHeight} · ${typical}`;
}

// The geometry the slot resolves to, for the select's title. Derived from the
// table so it cannot drift from what prints.
export function slotGeometryLabel(size: MiniSize): string {
  if (size === 'custom') return 'Ширина основания и высота фигурки задаются отдельно';
  return `Основание ${resolveBaseWidthMm({ heightSlot: size })} мм · высота ${HEIGHT_SLOTS[size].figureHeightMm} мм`;
}

export const DEFAULT_CUSTOM_WIDTH_MM = 30;
export const DEFAULT_CUSTOM_HEIGHT_MM = 30;
export const DEFAULT_HEIGHT_SLOT: MiniSize = 'medium';

export function resolveFigureHeightMm(e: Pick<Entry, 'heightSlot' | 'customHeightMm'>): number {
  if (e.heightSlot === 'custom') return validDimension(e.customHeightMm);
  return HEIGHT_SLOTS[e.heightSlot].figureHeightMm;
}

// Resolves the base/footprint width (mm) of an entry: the width the slot's
// category implies, or the user's custom width. Returns 0 when a custom entry
// has no valid width yet, which callers treat as "not packable". Custom stays
// the one escape hatch that names a base width directly — deriving it from the
// custom height would leave no way to set it at all.
export function resolveBaseWidthMm(e: Pick<Entry, 'heightSlot' | 'customWidthMm'>): number {
  if (e.heightSlot === 'custom') return validDimension(e.customWidthMm);
  return CATEGORY_BASE_WIDTH_MM[HEIGHT_SLOTS[e.heightSlot].category];
}

// A custom entry's tab is half its own base; only the slots carry page-bound caps.
export function resolveTabHeightMm(e: Pick<Entry, 'heightSlot' | 'customWidthMm'>): number {
  if (e.heightSlot === 'custom') return resolveBaseWidthMm(e) / 2;
  return CATEGORY_TAB_HEIGHT_MM[HEIGHT_SLOTS[e.heightSlot].category];
}

// Resolves both columns for one entry. Returns a zero in either slot when the
// entry is not packable yet; callers check before fitting.
export function resolveSizeDimensionsMm(
  e: Pick<Entry, 'heightSlot' | 'customWidthMm' | 'customHeightMm'>,
): SizeDimensionsMm {
  return { baseWidthMm: resolveBaseWidthMm(e), figureHeightMm: resolveFigureHeightMm(e) };
}

// The dimension rule packing applies, shared so the PDF writer embeds artwork
// for exactly the entries that will be drawn. A custom entry needs both of its
// numbers: the height scales the figure, the width stands it up.
export function hasPackableDimensions(
  e: Pick<Entry, 'heightSlot' | 'customWidthMm' | 'customHeightMm'>,
): boolean {
  const { baseWidthMm, figureHeightMm } = resolveSizeDimensionsMm(e);
  return baseWidthMm > 0 && figureHeightMm > 0;
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
export const MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT = 2;

// The one place a height slot becomes millimetres of artwork. Fits a figure to
// its slot's height, letting width follow the artwork's proportions, then scales
// the whole figure down if it passes the width cap. Aspect ratio is preserved
// throughout and nothing is cropped.
export function fitFigure(
  { figureHeightMm }: SizeDimensionsMm,
  imgWidthPx: number,
  imgHeightPx: number,
  calibration?: HeightCalibration,
  maxImageHeightMm?: number,
): FigureFitMm {
  const maxWidthMm = figureHeightMm * MAX_WIDTH_TO_SLOT_HEIGHT;
  const aspect = imgWidthPx / imgHeightPx;
  const calibrationGap = validCalibrationGap(calibration);
  const limits: FigureFitLimit[] = [];
  const calibrationScale = calibrationGap ?? 1;
  let imageHeightMm = figureHeightMm / calibrationScale;
  let imageWidthMm = aspect * imageHeightMm;
  if (calibrationGap && imageHeightMm > figureHeightMm * MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT) {
    imageHeightMm = figureHeightMm * MAX_CALIBRATED_HEIGHT_TO_SLOT_HEIGHT;
    imageWidthMm = aspect * imageHeightMm;
    limits.push('height');
  }
  if (imageWidthMm > maxWidthMm) {
    imageWidthMm = maxWidthMm;
    imageHeightMm = maxWidthMm / aspect;
    if (calibrationGap) limits.push('width');
  }
  if (calibrationGap && maxImageHeightMm != null && imageHeightMm > maxImageHeightMm) {
    imageHeightMm = maxImageHeightMm;
    imageWidthMm = aspect * imageHeightMm;
    limits.push('page');
  }
  return { imageWidthMm, imageHeightMm, limits };
}

export function validCalibrationGap(
  calibration: HeightCalibration | undefined,
): number | undefined {
  if (!calibration) return undefined;
  const { head, feet } = calibration;
  if (
    !Number.isFinite(head) ||
    !Number.isFinite(feet) ||
    head < 0 ||
    feet > 1 ||
    head >= feet ||
    feet - head < 0.1 - Number.EPSILON
  )
    return undefined;
  return feet - head;
}

function validDimension(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}
