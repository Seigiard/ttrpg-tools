import { expect, test } from 'bun:test';
import {
  calibrationRange,
  calibrationSessionResult,
  moveCalibrationLine,
  openCalibrationSession,
  setCalibrationLine,
} from './calibration-session';

test.each([
  ['valid saved lines', { head: 0.2, feet: 0.8 }, { head: 0.2, feet: 0.8 }],
  ['invalid saved lines', { head: 0.8, feet: 0.2 }, { head: 0, feet: 1 }],
  ['no saved lines', undefined, { head: 0, feet: 1 }],
] as const)('a calibration session opens from %s', (_, saved, expected) => {
  // #given
  const rowId = 17;
  // #when
  const session = openCalibrationSession(rowId, saved, 240);
  // #then
  expect(session).toEqual({
    rowId,
    startingLines: expected,
    lines: expected,
    artworkHeight: 240,
  });
});

test('setting a line clamps it to the artwork and the minimum gap', () => {
  // #given
  const opened = openCalibrationSession(17, { head: 0.25, feet: 0.75 }, 100);
  // #when
  const movedWithinRange = setCalibrationLine(opened, 'head', 0.4);
  const movedHead = setCalibrationLine(opened, 'head', 0.9);
  const movedFeet = setCalibrationLine(opened, 'feet', -0.5);
  // #then
  expect({
    withinRange: movedWithinRange.lines,
    head: movedHead.lines,
    headRanges: {
      head: calibrationRange(movedHead.lines, 'head'),
      feet: calibrationRange(movedHead.lines, 'feet'),
    },
    feet: movedFeet.lines,
  }).toEqual({
    withinRange: { head: 0.4, feet: 0.75 },
    head: { head: 0.65, feet: 0.75 },
    headRanges: { head: { min: 0, max: 0.65 }, feet: { min: 0.75, max: 1 } },
    feet: { head: 0.25, feet: 0.35 },
  });
});

test('pixel moves use the taller artwork height', () => {
  // #given
  const session = openCalibrationSession(17, { head: 0.2, feet: 0.8 }, 100, 200);
  // #when
  const moved = moveCalibrationLine(session, 'head', 10);
  // #then
  expect({ artworkHeight: moved.artworkHeight, lines: moved.lines }).toEqual({
    artworkHeight: 200,
    lines: { head: 0.25, feet: 0.8 },
  });
});

test('the minimum gap allowed while moving a line is also accepted on Apply', () => {
  // #given
  const opened = openCalibrationSession(17, { head: 0.7, feet: 0.9 }, 100);
  const session = setCalibrationLine(opened, 'feet', 0.75);
  // #when
  const result = calibrationSessionResult(session);
  // #then
  expect(result.state).toBe('changed');
});

test.each([
  ['unchanged lines', undefined, undefined, { state: 'unchanged' }],
  [
    'invalid lines',
    undefined,
    ['head', Number.NaN] as const,
    { state: 'invalid' },
  ],
  [
    'new lines',
    { head: 0.2, feet: 0.8 },
    ['feet', 0.7] as const,
    { state: 'changed', calibration: { head: 0.2, feet: 0.7 } },
  ],
] as const)('Apply reports %s', (_, saved, edit, expected) => {
  // #given
  const opened = openCalibrationSession(17, saved, 100);
  const session = edit ? setCalibrationLine(opened, edit[0], edit[1]) : opened;
  // #when
  const result = calibrationSessionResult(session);
  // #then
  expect(result).toEqual(expected);
});
