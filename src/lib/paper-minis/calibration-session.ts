import type { HeightCalibration } from './types';

export const MIN_CALIBRATION_GAP = 0.1;

export const CALIBRATION_TOLERANCE = Number.EPSILON * 8;

export const DEFAULT_CALIBRATION: Readonly<HeightCalibration> = { head: 0, feet: 1 };

export type CalibrationLine = keyof HeightCalibration;

export type CalibrationRange = { min: number; max: number };

export type CalibrationSession = {
  rowId: number;
  startingLines: HeightCalibration;
  lines: HeightCalibration;
  artworkHeight: number;
};

export type CalibrationSessionResult =
  | { state: 'unchanged' }
  | { state: 'invalid' }
  | { state: 'changed'; calibration: HeightCalibration };

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
    gap < MIN_CALIBRATION_GAP - CALIBRATION_TOLERANCE
  )
    return undefined;

  return gap;
}

export function openCalibrationSession(
  rowId: number,
  saved: HeightCalibration | undefined,
  frontArtworkHeight: number,
  backArtworkHeight = 0,
): CalibrationSession {
  const source = saved && calibrationGap(saved) !== undefined ? saved : DEFAULT_CALIBRATION;
  const startingLines = { ...source };
  const artworkHeight = Math.max(frontArtworkHeight, backArtworkHeight);

  return { rowId, startingLines, lines: { ...startingLines }, artworkHeight };
}

export function calibrationRange(
  lines: HeightCalibration,
  line: CalibrationLine,
): CalibrationRange {
  return line === 'head'
    ? { min: 0, max: lines.feet - MIN_CALIBRATION_GAP }
    : { min: lines.head + MIN_CALIBRATION_GAP, max: 1 };
}

export function setCalibrationLine(
  session: CalibrationSession,
  line: CalibrationLine,
  fraction: number,
): CalibrationSession {
  const { min, max } = calibrationRange(session.lines, line);
  const next = Math.min(Math.max(fraction, min), max);

  if (next === session.lines[line]) return session;

  return { ...session, lines: { ...session.lines, [line]: next } };
}

export function moveCalibrationLine(
  session: CalibrationSession,
  line: CalibrationLine,
  pixels: number,
): CalibrationSession {
  if (session.artworkHeight <= 0) return session;

  return setCalibrationLine(session, line, session.lines[line] + pixels / session.artworkHeight);
}

export function calibrationSessionResult(session: CalibrationSession): CalibrationSessionResult {
  if (calibrationGap(session.lines) === undefined) return { state: 'invalid' };

  const unchanged =
    Math.abs(session.lines.head - session.startingLines.head) <= CALIBRATION_TOLERANCE &&
    Math.abs(session.lines.feet - session.startingLines.feet) <= CALIBRATION_TOLERANCE;

  return unchanged ? { state: 'unchanged' } : { state: 'changed', calibration: session.lines };
}
