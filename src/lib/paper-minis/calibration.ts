import type { HeightCalibration } from './types';

export const MIN_CALIBRATION_GAP = 0.1;
export const DEFAULT_CALIBRATION: Readonly<HeightCalibration> = { head: 0, feet: 1 };

export type CalibrationLine = keyof HeightCalibration;
export type CalibrationRange = { min: number; max: number };

export function calibrationRange(
  lines: HeightCalibration,
  line: CalibrationLine,
): CalibrationRange {
  return line === 'head'
    ? { min: 0, max: lines.feet - MIN_CALIBRATION_GAP }
    : { min: lines.head + MIN_CALIBRATION_GAP, max: 1 };
}

export function setCalibrationLine(
  lines: HeightCalibration,
  line: CalibrationLine,
  fraction: number,
): HeightCalibration {
  const { min, max } = calibrationRange(lines, line);
  const next = Math.min(Math.max(fraction, min), max);
  return next === lines[line] ? lines : { ...lines, [line]: next };
}

export function calibrationGap(calibration: HeightCalibration | undefined): number | undefined {
  if (!calibration) return undefined;
  const { head, feet } = calibration;
  const gap = feet - head;
  if (
    !Number.isFinite(head) ||
    !Number.isFinite(feet) ||
    head < 0 ||
    feet > 1 ||
    head >= feet ||
    gap < MIN_CALIBRATION_GAP - Number.EPSILON
  )
    return undefined;
  return gap;
}

export function calibrationChanged(
  draft: HeightCalibration,
  initial: HeightCalibration | undefined,
): boolean {
  const starting = initial ?? DEFAULT_CALIBRATION;
  const tolerance = Number.EPSILON * 8;
  return (
    Math.abs(draft.head - starting.head) > tolerance ||
    Math.abs(draft.feet - starting.feet) > tolerance
  );
}
