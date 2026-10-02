import type { PreparedArtworkFormat } from './artwork-formats';

// The size category a slot carries: a label the player knows from the rules,
// and the one thing that still fixes the base width.
export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

// The user's actual input. A category spans an octave of real height — Medium
// runs 4 to 8 feet — so two of the six are graded finer: Medium carries three
// slots and Large two, the other four one each.
export type HeightSlot =
  | 'tiny'
  | 'small'
  | 'medium-short'
  | 'medium'
  | 'medium-tall'
  | 'large'
  | 'large-tall'
  | 'huge'
  | 'gargantuan';

export type MiniSize = HeightSlot | 'custom';

export type Entry = {
  // Set only by a batch upload and never touched by replacing an image. Empty or
  // missing means the view shows its numbered fallback title.
  name?: string;
  image: File | null;
  artwork: PreparedArtwork | null;
  // Set when `image` could not be prepared; cleared when a new image is chosen.
  frontError?: string;
  // One pair of figure bounds shared by both faces.
  calibration?: HeightCalibration;
  normalizationWarning?: string;
  // Optional, drawn as the creature looks from behind. While `backImage` is set
  // and `backArtwork` is null, the back is loading and the entry is not ready.
  backImage?: File | null;
  backArtwork?: PreparedArtwork | null;
  backWarning?: string;
  heightSlot: MiniSize;
  customWidthMm?: number;
  customHeightMm?: number;
  count: number;
};

export type HeightCalibration = {
  head: number;
  feet: number;
};

export type PreparedArtwork = {
  readonly bytes: Uint8Array;
  readonly format: PreparedArtworkFormat;
  readonly width: number; // pixels in the prepared bytes
  readonly height: number;
};

// Geometry-only input keeps packing independent of image preparation.
export type PackingEntry = Pick<
  Entry,
  'heightSlot' | 'customWidthMm' | 'customHeightMm' | 'count' | 'calibration'
> & {
  naturalWidth?: number;
  naturalHeight?: number;
  backNaturalWidth?: number;
  backNaturalHeight?: number;
};
