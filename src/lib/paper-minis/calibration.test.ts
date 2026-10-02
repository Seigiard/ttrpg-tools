import { expect, test } from 'bun:test';
import {
  calibrationChanged,
  calibrationGap,
  calibrationRange,
  DEFAULT_CALIBRATION,
  setCalibrationLine,
} from './calibration';

test('calibration lines stay inside the artwork and at least ten percent apart', () => {
  // #given
  const lines = { head: 0.25, feet: 0.75 };
  // #when
  const head = setCalibrationLine(lines, 'head', 0.7);
  const feet = setCalibrationLine(lines, 'feet', 0.3);
  // #then
  expect({ head, feet }).toEqual({
    head: { head: 0.65, feet: 0.75 },
    feet: { head: 0.25, feet: 0.35 },
  });
});

test('line ranges reflect the other line and the minimum gap', () => {
  // #given
  const lines = { head: 0.25, feet: 0.75 };
  // #when
  const ranges = {
    head: calibrationRange(lines, 'head'),
    feet: calibrationRange(lines, 'feet'),
  };
  // #then
  expect(ranges).toEqual({
    head: { min: 0, max: 0.65 },
    feet: { min: 0.35, max: 1 },
  });
});

test('only finite in-bounds calibrations with the minimum gap have a gap', () => {
  // #given
  const calibrations = [
    { head: 0.2, feet: 0.3 },
    { head: 0.2, feet: 0.299 },
    { head: -0.1, feet: 0.8 },
    { head: 0.2, feet: Number.NaN },
  ];
  // #when
  const gaps = calibrations.map(calibrationGap);
  // #then
  expect(gaps).toEqual([0.09999999999999998, undefined, undefined, undefined]);
});

test('calibration change detection compares values against default lines', () => {
  // #given
  const sameValues = { ...DEFAULT_CALIBRATION };
  // #when
  const changed = {
    defaultDraft: calibrationChanged(sameValues, undefined),
    equalObjects: calibrationChanged({ head: 0.2, feet: 0.8 }, { head: 0.2, feet: 0.8 }),
    roundingNoise: calibrationChanged(
      { head: 0.2 + Number.EPSILON, feet: 0.8 },
      { head: 0.2, feet: 0.8 },
    ),
    movedLine: calibrationChanged({ head: 0.21, feet: 0.8 }, { head: 0.2, feet: 0.8 }),
  };
  // #then
  expect(changed).toEqual({
    defaultDraft: false,
    equalObjects: false,
    roundingNoise: false,
    movedLine: true,
  });
});
