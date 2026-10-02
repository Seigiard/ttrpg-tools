import type { HeightSlot, PackingEntry } from '../types.ts';

// User-measured cut-mark pairs on four rendered PDF pages. The 100 mm ruler
// spans x=33..662 on every page. See pdf-70.md for inference and uncertainty.
type Measurement = {
  page: number;
  row: 'top' | 'bottom';
  x: readonly [number, number];
  slot: HeightSlot;
  artworkHeightMm: number;
};

export const pdf70Measurements: readonly Measurement[] = [
  { page: 1, row: 'top', x: [33, 507], slot: 'large-tall', artworkHeightMm: 82 },
  { page: 1, row: 'top', x: [532, 880], slot: 'medium', artworkHeightMm: 35 },
  { page: 1, row: 'top', x: [905, 1210], slot: 'medium', artworkHeightMm: 35 },
  { page: 2, row: 'top', x: [33, 305], slot: 'medium', artworkHeightMm: 35 },
  { page: 2, row: 'top', x: [330, 589], slot: 'large', artworkHeightMm: 56 },
  { page: 2, row: 'top', x: [614, 862], slot: 'medium', artworkHeightMm: 35 },
  { page: 2, row: 'top', x: [887, 1136], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'top', x: [33, 274], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'top', x: [299, 533], slot: 'medium-tall', artworkHeightMm: 43 },
  { page: 3, row: 'top', x: [558, 790], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'top', x: [815, 1035], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'bottom', x: [33, 248], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'bottom', x: [273, 470], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'bottom', x: [495, 689], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'bottom', x: [714, 897], slot: 'medium', artworkHeightMm: 35 },
  { page: 3, row: 'bottom', x: [922, 1105], slot: 'medium', artworkHeightMm: 35 },
  { page: 4, row: 'top', x: [33, 215], slot: 'medium', artworkHeightMm: 35 },
  { page: 4, row: 'top', x: [240, 424], slot: 'medium', artworkHeightMm: 35 },
  { page: 4, row: 'top', x: [449, 631], slot: 'medium-short', artworkHeightMm: 27 },
  { page: 4, row: 'top', x: [657, 839], slot: 'medium', artworkHeightMm: 35 },
  { page: 4, row: 'top', x: [864, 1047], slot: 'medium-short', artworkHeightMm: 27 },
  { page: 4, row: 'bottom', x: [33, 215], slot: 'medium', artworkHeightMm: 35 },
  { page: 4, row: 'bottom', x: [240, 424], slot: 'small', artworkHeightMm: 20 },
  { page: 4, row: 'bottom', x: [449, 631], slot: 'small', artworkHeightMm: 20 },
  { page: 4, row: 'bottom', x: [657, 839], slot: 'medium', artworkHeightMm: 35 },
];

export type Pdf70Reconstruction = 'rounded' | 'raw' | 'lower' | 'upper';

export function pdf70Entries(mode: Pdf70Reconstruction = 'rounded'): PackingEntry[] {
  // Each picked endpoint may be off by one raster pixel: both the measured
  // width and ruler span may differ by two. These are sensitivity samples,
  // not a claim that every combination in that interval has been checked.
  const widthDeltaPx = mode === 'lower' ? -2 : mode === 'upper' ? 2 : 0;
  const rulerDeltaPx = -widthDeltaPx;
  return pdf70Measurements.map(({ x, slot, artworkHeightMm }) => {
    const measuredWidthMm = ((x[1] - x[0] + widthDeltaPx) * 100) / (629 + rulerDeltaPx);
    const footprintWidthMm =
      mode === 'rounded' ? Math.round(measuredWidthMm * 10) / 10 : measuredWidthMm;
    return {
      heightSlot: slot,
      count: 1,
      // Only the ratio is used. These are millimetre-derived proportions,
      // NOT recovered source-image pixel dimensions. A base-limited outline
      // cannot reveal its actual art width; use the outline minus two margins.
      naturalWidth: footprintWidthMm - 4,
      naturalHeight: artworkHeightMm,
    };
  });
}
