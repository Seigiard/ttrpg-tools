import { expect, test } from 'bun:test';
import type { Entry, HeightCalibration, PreparedArtwork } from './types';
import {
  calibrationAfterChange,
  type CalibrationChange,
} from './calibration-reset-policy';

const saved: HeightCalibration = { head: 0.2, feet: 0.8 };
const prepared: PreparedArtwork = {
  bytes: Uint8Array.from([1]),
  format: 'png',
  width: 100,
  height: 200,
};

function mini(fields: Partial<Entry> = {}): Entry {
  return {
    image: null,
    artwork: null,
    heightSlot: 'medium',
    count: 1,
    calibration: saved,
    ...fields,
  };
}

test.each([
  ['replace prepared front', mini({ artwork: prepared }), 'select-front', undefined],
  [
    'replace prepared back',
    mini({ artwork: prepared, backArtwork: prepared }),
    'select-back',
    undefined,
  ],
  ['add missing back', mini({ artwork: prepared }), 'select-back', saved],
  [
    'replace loading front',
    mini({ image: new File([''], 'front.png') }),
    'select-front',
    saved,
  ],
  [
    'replace failed front',
    mini({ image: new File([''], 'front.png'), frontError: 'failed' }),
    'select-front',
    saved,
  ],
  [
    'remove one of two sides',
    mini({ artwork: prepared, backArtwork: prepared }),
    'clear-back',
    saved,
  ],
  ['remove all images', mini({ backArtwork: prepared }), 'clear-back', undefined],
  ['toggle normalization', mini({ artwork: prepared }), 'toggle-normalization', undefined],
  ['reset calibration', mini({ artwork: prepared }), 'reset', undefined],
] as const)('%s follows the calibration reset policy', (_, row, change, expected) => {
  // #given
  const event: CalibrationChange = change;
  // #when
  const result = calibrationAfterChange(row, event);
  // #then
  expect(result).toBe(expected);
});
