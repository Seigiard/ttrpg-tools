import type { Entry, HeightCalibration } from './types';

export type CalibrationChange =
  | 'select-front'
  | 'select-back'
  | 'clear-back'
  | 'toggle-normalization'
  | 'reset';

type CalibrationMini = Pick<Entry, 'artwork' | 'backArtwork' | 'calibration'>;

export function calibrationAfterChange(
  mini: CalibrationMini,
  change: CalibrationChange,
): HeightCalibration | undefined {
  if (change === 'select-front') return mini.artwork ? undefined : mini.calibration;

  if (change === 'select-back') return mini.backArtwork ? undefined : mini.calibration;

  if (change === 'clear-back') return mini.artwork ? mini.calibration : undefined;

  return undefined;
}
