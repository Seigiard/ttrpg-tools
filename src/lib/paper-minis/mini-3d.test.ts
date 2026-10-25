import assert from 'node:assert/strict';

import { describe, test as t } from 'bun:test';

import { resolveMini, type BaseStyle, type PackedMini } from './geometry.ts';
import { miniParts, poseMini, type MiniPart, type MiniPartPose } from './mini-3d.ts';
import { HEIGHT_SLOT_ORDER } from './sizes.ts';
import type { PackingEntry } from './types.ts';

const styles = ['tent', 'flat', 'foamboard'] as const;

const times = Array.from({ length: 11 }, (_, index) => index / 10);

const continuityStep = 0.005;

const continuityTimes = Array.from(
  { length: Math.round(1 / continuityStep) + 1 },
  (_, index) => index * continuityStep,
);

const artworkRatios = [
  { name: 'square', naturalWidth: 100, naturalHeight: 100 },
  { name: 'wide', naturalWidth: 300, naturalHeight: 100 },
  { name: 'tall', naturalWidth: 100, naturalHeight: 300 },
] as const;

const toleranceMm = 1e-6;

const entry: PackingEntry = {
  heightSlot: 'medium',
  count: 1,
  naturalWidth: 100,
  naturalHeight: 100,
};

function resolvedMini(baseStyle: BaseStyle, overrides: Partial<PackingEntry> = {}): PackedMini {
  return resolveMini({ ...entry, ...overrides }, 0, {
    pageSize: 'a4',
    numberDuplicates: false,
    baseStyle,
    marginMm: 2,
  })!.copies[0];
}

function endpoint(part: MiniPart, pose: MiniPartPose) {
  const lengthMm = part.toMm - part.fromMm;

  return {
    yMm: pose.yMm + Math.cos(pose.psiRad) * lengthMm,
    zMm: pose.zMm + Math.sin(pose.psiRad) * lengthMm,
  };
}

function role(
  parts: MiniPart[],
  poses: Map<string, MiniPartPose>,
  wanted: MiniPart['role'],
  sheet: MiniPart['sheet'] = 'main',
) {
  const part = parts.find(
    (candidate) => candidate.role === wanted && candidate.sheet === sheet,
  ) ?? {
    id: `missing-${sheet}-${wanted}`,
    sheet,
    role: wanted,
    fromMm: 0,
    toMm: 0,
  };

  return {
    part,
    pose: poses.get(part.id) ?? { yMm: Number.NaN, zMm: Number.NaN, psiRad: Number.NaN },
  };
}

function isVertical(pose: MiniPartPose): boolean {
  return Math.abs(Math.sin(pose.psiRad)) <= toleranceMm;
}

function isHorizontalOnTable(part: MiniPart, pose: MiniPartPose): boolean {
  const end = endpoint(part, pose);

  return (
    Math.abs(Math.cos(pose.psiRad)) <= toleranceMm &&
    pose.yMm >= -toleranceMm &&
    pose.yMm < 1 &&
    end.yMm >= -toleranceMm &&
    end.yMm < 1
  );
}

function zRange(part: MiniPart, pose: MiniPartPose): [number, number] {
  const end = endpoint(part, pose);

  return [Math.min(pose.zMm, end.zMm), Math.max(pose.zMm, end.zMm)];
}

function directionDot(first: { y: number; z: number }, second: { y: number; z: number }): number {
  return first.y * second.y + first.z * second.z;
}

function rangesLieOnOppositeSides(
  first: [number, number],
  second: [number, number],
  plane: number,
): boolean {
  return (
    (first[1] <= plane + toleranceMm && second[0] >= plane - toleranceMm) ||
    (second[1] <= plane + toleranceMm && first[0] >= plane - toleranceMm)
  );
}

type ExpectedPart = readonly [
  MiniPart['sheet'],
  Exclude<MiniPart['role'], 'hinge'>,
  number,
  number,
];

function partsMatchPrintContract(
  parts: MiniPart[],
  expected: readonly ExpectedPart[],
  allowedHinges: readonly number[],
  topMm: number,
): boolean {
  const hinges = parts.filter((part) => part.role === 'hinge');

  const hingeFolds = hinges.map((hinge) =>
    allowedHinges.find(
      (fold) => hinge.fromMm < fold && hinge.toMm > fold && hinge.toMm - hinge.fromMm < 1,
    ),
  );

  const validHinges =
    hingeFolds.every((fold) => fold !== undefined) && new Set(hingeFolds).size === hinges.length;

  const toleranceAt = (level: number) => (hingeFolds.includes(level) ? 1 : toleranceMm);

  const nonHinge = parts.filter((part) => part.role !== 'hinge');

  const boundariesMatch =
    nonHinge.length === expected.length &&
    nonHinge.every((part, index) => {
      const [sheet, roleName, fromMm, toMm] = expected[index];

      return (
        part.sheet === sheet &&
        part.role === roleName &&
        Math.abs(part.fromMm - fromMm) <= toleranceAt(fromMm) &&
        Math.abs(part.toMm - toMm) <= toleranceAt(toMm)
      );
    });

  const sheetsTile = (['main', 'back'] as const).every((sheet) => {
    const sheetParts = parts.filter((part) => part.sheet === sheet);

    if (sheetParts.length === 0)
      return !expected.some(([expectedSheet]) => expectedSheet === sheet);

    return (
      Math.abs(sheetParts[0].fromMm) <= toleranceMm &&
      Math.abs(sheetParts.at(-1)!.toMm - topMm) <= toleranceMm &&
      sheetParts.every((part) => part.toMm > part.fromMm) &&
      sheetParts
        .slice(1)
        .every((part, index) => Math.abs(part.fromMm - sheetParts[index].toMm) <= toleranceMm)
    );
  });

  return validHinges && boundariesMatch && sheetsTile;
}

function flatAtPrintLevels(parts: MiniPart[], poses: Map<string, MiniPartPose>): boolean {
  return (['main', 'back'] as const).every((sheet) => {
    const sheetParts = parts.filter((part) => part.sheet === sheet);

    if (sheetParts.length === 0) return true;

    const first = sheetParts[0];
    const firstPose = poses.get(first.id);

    if (!firstPose) return false;

    const direction = {
      y: Math.cos(firstPose.psiRad),
      z: Math.sin(firstPose.psiRad),
    };

    return sheetParts.every((part) => {
      const pose = poses.get(part.id);

      if (!pose) return false;

      const end = endpoint(part, pose);
      const offsetMm = part.fromMm - first.fromMm;

      return (
        Math.abs(pose.yMm) <= toleranceMm &&
        Math.abs(end.yMm) <= toleranceMm &&
        Math.abs(Math.cos(pose.psiRad) - direction.y) <= toleranceMm &&
        Math.abs(Math.sin(pose.psiRad) - direction.z) <= toleranceMm &&
        Math.abs(pose.yMm - (firstPose.yMm + direction.y * offsetMm)) <= toleranceMm &&
        Math.abs(pose.zMm - (firstPose.zMm + direction.z * offsetMm)) <= toleranceMm
      );
    });
  });
}

function sheetsDoNotOverlap(parts: MiniPart[], poses: Map<string, MiniPartPose>): boolean {
  const ranges = (['main', 'back'] as const).map((sheet) => {
    const sheetParts = parts.filter((part) => part.sheet === sheet);

    const points = sheetParts.flatMap((part) => {
      const pose = poses.get(part.id);

      return pose ? [pose.zMm, endpoint(part, pose).zMm] : [];
    });

    return points.length === 0 ? null : ([Math.min(...points), Math.max(...points)] as const);
  });

  if (ranges[0] === null || ranges[1] === null) return true;

  return ranges[0][1] <= ranges[1][0] + toleranceMm || ranges[1][1] <= ranges[0][0] + toleranceMm;
}

describe('flat print nets', () => {
  t('parts tile every sheet in print order and lie at their print levels at t = 0', () => {
    // #given
    const expectedParts = {
      tent: [
        ['main', 'floorStrip', 0, 25],
        ['main', 'frontTab', 25, 37.5],
        ['main', 'frontFace', 37.5, 74.5],
        ['main', 'backFace', 74.5, 111.5],
        ['main', 'backTab', 111.5, 124],
      ],
      flat: [
        ['main', 'frontTongue', 0, 6],
        ['main', 'frontFace', 6, 43],
        ['main', 'backFace', 43, 80],
        ['main', 'backTongue', 80, 86],
      ],
      foamboard: [
        ['main', 'frontTongue', 0, 6],
        ['main', 'frontFace', 6, 45],
        ['back', 'backTongue', 0, 6],
        ['back', 'backFace', 6, 45],
      ],
    } satisfies Record<(typeof styles)[number], readonly ExpectedPart[]>;

    const allowedHinges = { tent: [25, 74.5], flat: [43], foamboard: [] } as const;
    const tops = { tent: 124, flat: 86, foamboard: 45 } as const;

    // #when
    const actual = Object.fromEntries(
      styles.map((baseStyle) => {
        const parts = miniParts(resolvedMini(baseStyle));
        const poses = poseMini(parts, 0);

        return [
          baseStyle,
          {
            partsMatchPrintContract: partsMatchPrintContract(
              parts,
              expectedParts[baseStyle],
              allowedHinges[baseStyle],
              tops[baseStyle],
            ),
            flatAtPrintLevels: flatAtPrintLevels(parts, poses),
            sheetsDoNotOverlap: sheetsDoNotOverlap(parts, poses),
          },
        ];
      }),
    );

    // #then
    assert.deepEqual(actual, {
      tent: {
        partsMatchPrintContract: true,
        flatAtPrintLevels: true,
        sheetsDoNotOverlap: true,
      },
      flat: {
        partsMatchPrintContract: true,
        flatAtPrintLevels: true,
        sheetsDoNotOverlap: true,
      },
      foamboard: {
        partsMatchPrintContract: true,
        flatAtPrintLevels: true,
        sheetsDoNotOverlap: true,
      },
    });
  });
});

describe('fold invariants', () => {
  t('every endpoint moves continuously within the derived 15.81 mm step bound', () => {
    // #given
    const longestStripMm = 124;
    const shortestPhaseWidth = 0.25;
    const maximumRootTravelMm = 45;
    const maximumAngularStepRad = (Math.PI * continuityStep) / shortestPhaseWidth;
    const maximumRotatingEndpointStepMm = 2 * longestStripMm * Math.sin(maximumAngularStepRad / 2);

    const maximumSmoothStepMm =
      Math.ceil((2 * maximumRotatingEndpointStepMm + maximumRootTravelMm * continuityStep) * 100) /
      100;

    let sampledMoves = 0;
    let maximumObservedStepMm = 0;

    // #when
    for (const baseStyle of styles) {
      const parts = miniParts(resolvedMini(baseStyle));
      let previous = poseMini(parts, continuityTimes[0]);

      for (const time of continuityTimes.slice(1)) {
        const current = poseMini(parts, time);

        for (const part of parts) {
          const previousPose = previous.get(part.id);
          const currentPose = current.get(part.id);

          if (!previousPose || !currentPose) {
            maximumObservedStepMm = Number.POSITIVE_INFINITY;
            continue;
          }

          const previousEnd = endpoint(part, previousPose);
          const currentEnd = endpoint(part, currentPose);
          sampledMoves += 2;
          maximumObservedStepMm = Math.max(
            maximumObservedStepMm,
            Math.hypot(currentPose.yMm - previousPose.yMm, currentPose.zMm - previousPose.zMm),
            Math.hypot(currentEnd.yMm - previousEnd.yMm, currentEnd.zMm - previousEnd.zMm),
          );
        }

        previous = current;
      }
    }

    const tentParts = miniParts(resolvedMini('tent'));

    const floorDirections = [0.75, 0.875, 1].map((time) => {
      const floor = role(tentParts, poseMini(tentParts, time), 'floorStrip');

      return { y: Math.cos(floor.pose.psiRad), z: Math.sin(floor.pose.psiRad) };
    });

    // #then
    assert.deepEqual(
      {
        derivedStepBoundMm: maximumSmoothStepMm,
        sampledEveryEndpoint:
          sampledMoves ===
          styles.reduce(
            (count, baseStyle) =>
              count + miniParts(resolvedMini(baseStyle)).length * (continuityTimes.length - 1) * 2,
            0,
          ),
        endpointsMoveContinuously: maximumObservedStepMm <= maximumSmoothStepMm,
        floorReversesDuringItsPhase: directionDot(floorDirections[0], floorDirections[2]) < -0.99,
        floorTurnsByMidPhase:
          directionDot(floorDirections[0], floorDirections[1]) < 0.9 &&
          directionDot(floorDirections[1], floorDirections[2]) < 0.9,
      },
      {
        derivedStepBoundMm: 15.81,
        sampledEveryEndpoint: true,
        endpointsMoveContinuously: true,
        floorReversesDuringItsPhase: true,
        floorTurnsByMidPhase: true,
      },
    );
  });

  t('the back half never crosses the front face print side during a fold', () => {
    // #given
    let sampledPoints = 0;
    let expectedPoints = 0;
    let maximumPrintSideDistanceMm = Number.NEGATIVE_INFINITY;

    // #when
    for (const baseStyle of ['tent', 'flat'] as const) {
      const parts = miniParts(resolvedMini(baseStyle));

      const mainParts = parts
        .filter((part) => part.sheet === 'main')
        .toSorted((first, second) => first.fromMm - second.fromMm);

      const faceHinges = mainParts.filter((part, index) => {
        if (part.role !== 'hinge') return false;

        const neighbourRoles = new Set([mainParts[index - 1]?.role, mainParts[index + 1]?.role]);

        return neighbourRoles.has('frontFace') && neighbourRoles.has('backFace');
      });

      const faceHingeIds = new Set(faceHinges.map((part) => part.id));

      const backParts = parts.filter(
        (part) =>
          part.role === 'backFace' ||
          part.role === 'backTab' ||
          part.role === 'backTongue' ||
          faceHingeIds.has(part.id),
      );

      expectedPoints += backParts.length * continuityTimes.length * 2;

      for (const time of continuityTimes) {
        const poses = poseMini(parts, time);
        const frontFace = role(parts, poses, 'frontFace');

        const printNormal = {
          y: -Math.sin(frontFace.pose.psiRad),
          z: Math.cos(frontFace.pose.psiRad),
        };

        for (const part of backParts) {
          const pose = poses.get(part.id);

          if (!pose) {
            maximumPrintSideDistanceMm = Number.POSITIVE_INFINITY;
            continue;
          }

          for (const point of [pose, endpoint(part, pose)]) {
            sampledPoints += 1;
            maximumPrintSideDistanceMm = Math.max(
              maximumPrintSideDistanceMm,
              (point.yMm - frontFace.pose.yMm) * printNormal.y +
                (point.zMm - frontFace.pose.zMm) * printNormal.z,
            );
          }
        }
      }
    }

    // #then
    assert.deepEqual(
      {
        sampledEveryBackEndpoint: sampledPoints === expectedPoints && sampledPoints >= 1_608,
        paperDoesNotCrossFrontPrintSide: maximumPrintSideDistanceMm <= toleranceMm,
      },
      { sampledEveryBackEndpoint: true, paperDoesNotCrossFrontPrintSide: true },
    );
  });

  t('the printed nets start with every rendered print side facing up', () => {
    // #given
    let sampledParts = 0;
    let lowestPrintNormalY = Number.POSITIVE_INFINITY;

    // #when
    for (const baseStyle of styles) {
      const parts = miniParts(resolvedMini(baseStyle));
      const poses = poseMini(parts, 0);

      const renderedFlatParts = parts.filter(
        (part) => baseStyle !== 'foamboard' || part.sheet === 'main',
      );

      for (const part of renderedFlatParts) {
        const pose = poses.get(part.id);
        sampledParts += 1;
        lowestPrintNormalY = Math.min(
          lowestPrintNormalY,
          pose ? -Math.sin(pose.psiRad) : Number.NEGATIVE_INFINITY,
        );
      }
    }

    // #then
    assert.deepEqual(
      { sampledParts, everyPrintSideFacesUp: lowestPrintNormalY > toleranceMm },
      { sampledParts: 13, everyPrintSideFacesUp: true },
    );
  });

  t('every hinge keeps adjacent parts joined throughout every fold', () => {
    // #given
    let comparisons = 0;
    let expectedComparisons = 0;
    let maxGapMm = 0;

    // #when
    for (const baseStyle of styles) {
      const parts = miniParts(resolvedMini(baseStyle));
      expectedComparisons +=
        times.length *
        (['main', 'back'] as const).reduce(
          (count, sheet) =>
            count + Math.max(0, parts.filter((part) => part.sheet === sheet).length - 1),
          0,
        );

      for (const time of times) {
        const poses = poseMini(parts, time);

        for (const sheet of ['main', 'back'] as const) {
          const sheetParts = parts.filter((part) => part.sheet === sheet);

          for (let index = 1; index < sheetParts.length; index += 1) {
            comparisons += 1;
            const previous = sheetParts[index - 1];
            const current = sheetParts[index];
            const previousPose = poses.get(previous.id);
            const currentPose = poses.get(current.id);

            if (!previousPose || !currentPose) {
              maxGapMm = Number.POSITIVE_INFINITY;
              continue;
            }

            const previousEnd = endpoint(previous, previousPose);
            maxGapMm = Math.max(
              maxGapMm,
              Math.hypot(currentPose.yMm - previousEnd.yMm, currentPose.zMm - previousEnd.zMm),
            );
          }
        }
      }
    }

    // #then
    assert.deepEqual(
      {
        comparisonsMatchParts: comparisons === expectedComparisons,
        testedEveryRequiredJoint: comparisons >= 99,
        hingesHold: maxGapMm <= toleranceMm,
      },
      { comparisonsMatchParts: true, testedEveryRequiredJoint: true, hingesHold: true },
    );
  });

  t(
    'no part endpoint passes through the table for every slot, artwork shape, and custom-size extreme',
    () => {
      // #given
      const sizeVariants: {
        name: string;
        overrides: Partial<PackingEntry>;
      }[] = [
        ...HEIGHT_SLOT_ORDER.flatMap((heightSlot) =>
          artworkRatios.map(({ name, naturalWidth, naturalHeight }) => ({
            name: `${heightSlot}-${name}`,
            overrides: { heightSlot, naturalWidth, naturalHeight },
          })),
        ),
        {
          name: 'custom-wide-base-short-figure',
          overrides: {
            heightSlot: 'custom',
            customWidthMm: 80,
            customHeightMm: 5,
            naturalWidth: 100,
            naturalHeight: 100,
          },
        },
        {
          name: 'custom-narrow-base-tall-figure',
          overrides: {
            heightSlot: 'custom',
            customWidthMm: 5,
            customHeightMm: 80,
            naturalWidth: 100,
            naturalHeight: 100,
          },
        },
      ];

      const expectedVariants = styles.length * sizeVariants.length;

      let sampledEndpoints = 0;
      let expectedEndpoints = 0;
      let sampledVariants = 0;
      let sampledTimes = 0;
      let lowestYMm = Number.POSITIVE_INFINITY;

      let firstBelowTable:
        | {
            baseStyle: BaseStyle;
            sizeVariant: string;
            time: number;
            role: MiniPart['role'];
            sheet: MiniPart['sheet'];
            endpoint: 'from' | 'to';
            yMm: number;
          }
        | undefined;

      // #when
      for (const baseStyle of styles) {
        for (const { name: sizeVariant, overrides } of sizeVariants) {
          const parts = miniParts(resolvedMini(baseStyle, overrides));

          sampledVariants += 1;
          expectedEndpoints += parts.length * continuityTimes.length * 2;

          for (const time of continuityTimes) {
            const poses = poseMini(parts, time);
            sampledTimes += 1;

            for (const part of parts) {
              const pose = poses.get(part.id);
              sampledEndpoints += 2;

              if (!pose) {
                lowestYMm = Number.NEGATIVE_INFINITY;
                continue;
              }

              const endpoints = [
                ['from', pose.yMm],
                ['to', endpoint(part, pose).yMm],
              ] as const;

              for (const [endpointName, yMm] of endpoints) {
                lowestYMm = Math.min(lowestYMm, yMm);

                if (yMm < -toleranceMm && firstBelowTable === undefined) {
                  firstBelowTable = {
                    baseStyle,
                    sizeVariant,
                    time,
                    role: part.role,
                    sheet: part.sheet,
                    endpoint: endpointName,
                    yMm,
                  };
                }
              }
            }
          }
        }
      }

      // #then
      assert.deepEqual(
        {
          sampledEveryVariant: sampledVariants === expectedVariants,
          sampledEveryTime: sampledTimes === expectedVariants * continuityTimes.length,
          sampledEveryEndpoint: sampledEndpoints === expectedEndpoints,
          staysAboveTable: lowestYMm >= -toleranceMm,
          firstBelowTable,
        },
        {
          sampledEveryVariant: true,
          sampledEveryTime: true,
          sampledEveryEndpoint: true,
          staysAboveTable: true,
          firstBelowTable: undefined,
        },
      );
    },
  );

  t('the tent front tab stays horizontal and returns to the table after the floor tuck', () => {
    // #given
    const parts = miniParts(resolvedMini('tent'));
    let sampledTimes = 0;
    let sampledOutsideFloorTuck = 0;
    let stayedHorizontalPrintSideUp = true;
    let stayedOnTableOutsideFloorTuck = true;

    // #when
    for (const time of continuityTimes) {
      const poses = poseMini(parts, time);
      const frontTab = role(parts, poses, 'frontTab');
      const frontTabEnd = endpoint(frontTab.part, frontTab.pose);
      const insideOpenFloorTuck = time > 0.75 && time < 1;

      sampledTimes += 1;
      stayedHorizontalPrintSideUp &&=
        Math.abs(Math.cos(frontTab.pose.psiRad)) <= toleranceMm &&
        -Math.sin(frontTab.pose.psiRad) > toleranceMm;

      if (!insideOpenFloorTuck) {
        sampledOutsideFloorTuck += 1;
        stayedOnTableOutsideFloorTuck &&=
          frontTab.pose.yMm >= -toleranceMm &&
          frontTab.pose.yMm < 1 &&
          frontTabEnd.yMm >= -toleranceMm &&
          frontTabEnd.yMm < 1;
      }
    }

    // #then
    assert.deepEqual(
      {
        sampledTimes,
        sampledOutsideFloorTuck,
        stayedHorizontalPrintSideUp,
        stayedOnTableOutsideFloorTuck,
      },
      {
        sampledTimes: 201,
        sampledOutsideFloorTuck: 152,
        stayedHorizontalPrintSideUp: true,
        stayedOnTableOutsideFloorTuck: true,
      },
    );
  });

  t('the tent floor strip stays under the front tab throughout the fold', () => {
    // #given
    const parts = miniParts(resolvedMini('tent'));
    let sampledTimes = 0;
    let floorStayedUnderFrontTab = true;

    // #when
    for (const time of continuityTimes) {
      const poses = poseMini(parts, time);
      const frontTab = role(parts, poses, 'frontTab');
      const floor = role(parts, poses, 'floorStrip');
      const floorEnd = endpoint(floor.part, floor.pose);

      sampledTimes += 1;
      floorStayedUnderFrontTab &&=
        floor.pose.yMm <= frontTab.pose.yMm + toleranceMm &&
        floorEnd.yMm <= frontTab.pose.yMm + toleranceMm;
    }

    // #then
    assert.deepEqual(
      { sampledTimes, floorStayedUnderFrontTab },
      { sampledTimes: 201, floorStayedUnderFrontTab: true },
    );
  });
});

describe('assembled poses', () => {
  t('the tent stands back to back while its tabs lie opposed inside the floor strip', () => {
    // #given
    const parts = miniParts(resolvedMini('tent'));

    // #when
    const poses = poseMini(parts, 1);
    const frontFace = role(parts, poses, 'frontFace');
    const backFace = role(parts, poses, 'backFace');
    const frontTab = role(parts, poses, 'frontTab');
    const backTab = role(parts, poses, 'backTab');
    const floor = role(parts, poses, 'floorStrip');
    const floorRange = zRange(floor.part, floor.pose);
    const frontTabRange = zRange(frontTab.part, frontTab.pose);
    const backTabRange = zRange(backTab.part, backTab.pose);

    // #then
    assert.deepEqual(
      {
        nonHingePartCount: parts.filter((part) => part.role !== 'hinge').length,
        facesVertical: isVertical(frontFace.pose) && isVertical(backFace.pose),
        facesOpposed: Math.cos(frontFace.pose.psiRad) * Math.cos(backFace.pose.psiRad) < 0,
        facePlaneDistanceUnder1Mm: Math.abs(frontFace.pose.zMm - backFace.pose.zMm) < 1,
        paperOnTable:
          isHorizontalOnTable(frontTab.part, frontTab.pose) &&
          isHorizontalOnTable(backTab.part, backTab.pose) &&
          isHorizontalOnTable(floor.part, floor.pose),
        floorSpansTabs:
          floorRange[0] <= Math.min(frontTabRange[0], backTabRange[0]) + toleranceMm &&
          floorRange[1] >= Math.max(frontTabRange[1], backTabRange[1]) - toleranceMm,
        floorNotAboveTabs:
          floor.pose.yMm <= frontTab.pose.yMm + toleranceMm &&
          floor.pose.yMm <= backTab.pose.yMm + toleranceMm,
        tabsPointAway: rangesLieOnOppositeSides(frontTabRange, backTabRange, frontFace.pose.zMm),
      },
      {
        nonHingePartCount: 5,
        facesVertical: true,
        facesOpposed: true,
        facePlaneDistanceUnder1Mm: true,
        paperOnTable: true,
        floorSpansTabs: true,
        floorNotAboveTabs: true,
        tabsPointAway: true,
      },
    );
  });

  t('the tent tabs fold outward with their printed sides facing up', () => {
    // #given
    const parts = miniParts(resolvedMini('tent'));

    // #when
    const poses = poseMini(parts, 1);
    const frontFace = role(parts, poses, 'frontFace');
    const backFace = role(parts, poses, 'backFace');
    const frontTab = role(parts, poses, 'frontTab');
    const backTab = role(parts, poses, 'backTab');
    const frontTabEnd = endpoint(frontTab.part, frontTab.pose);
    const backTabEnd = endpoint(backTab.part, backTab.pose);
    const frontTabMiddleZ = (frontTab.pose.zMm + frontTabEnd.zMm) / 2;
    const backTabMiddleZ = (backTab.pose.zMm + backTabEnd.zMm) / 2;

    // #then
    assert.deepEqual(
      {
        frontTabOnFrontPrintSide:
          (frontTabMiddleZ - frontFace.pose.zMm) * Math.cos(frontFace.pose.psiRad) > toleranceMm,
        backTabOnBackPrintSide:
          (backTabMiddleZ - backFace.pose.zMm) * Math.cos(backFace.pose.psiRad) > toleranceMm,
        frontTabPrintSideFacesUp: -Math.sin(frontTab.pose.psiRad) > toleranceMm,
        backTabPrintSideFacesUp: -Math.sin(backTab.pose.psiRad) > toleranceMm,
      },
      {
        frontTabOnFrontPrintSide: true,
        backTabOnBackPrintSide: true,
        frontTabPrintSideFacesUp: true,
        backTabPrintSideFacesUp: true,
      },
    );
  });

  t('the flat mini has back-to-back vertical faces and both tongues below them', () => {
    // #given
    const parts = miniParts(resolvedMini('flat'));

    // #when
    const poses = poseMini(parts, 1);
    const frontFace = role(parts, poses, 'frontFace');
    const backFace = role(parts, poses, 'backFace');
    const frontTongue = role(parts, poses, 'frontTongue');
    const backTongue = role(parts, poses, 'backTongue');
    const frontTongueEnd = endpoint(frontTongue.part, frontTongue.pose);
    const backTongueEnd = endpoint(backTongue.part, backTongue.pose);

    // #then
    assert.deepEqual(
      {
        nonHingePartCount: parts.filter((part) => part.role !== 'hinge').length,
        facesVertical: isVertical(frontFace.pose) && isVertical(backFace.pose),
        facesOpposed: Math.cos(frontFace.pose.psiRad) * Math.cos(backFace.pose.psiRad) < 0,
        facePlaneDistanceUnder1Mm: Math.abs(frontFace.pose.zMm - backFace.pose.zMm) < 1,
        frontTongueBelowFace: frontTongue.pose.yMm < frontTongueEnd.yMm - toleranceMm,
        backTongueBelowFace: backTongueEnd.yMm < backTongue.pose.yMm - toleranceMm,
      },
      {
        nonHingePartCount: 4,
        facesVertical: true,
        facesOpposed: true,
        facePlaneDistanceUnder1Mm: true,
        frontTongueBelowFace: true,
        backTongueBelowFace: true,
      },
    );
  });

  t('the foamboard sheets close vertically onto opposite sides of a 5 mm slab', () => {
    // #given
    const parts = miniParts(resolvedMini('foamboard'));

    // #when
    const poses = poseMini(parts, 1);
    const frontFace = role(parts, poses, 'frontFace');
    const backFace = role(parts, poses, 'backFace', 'back');
    const frontTongue = role(parts, poses, 'frontTongue');
    const backTongue = role(parts, poses, 'backTongue', 'back');
    const frontTongueEnd = endpoint(frontTongue.part, frontTongue.pose);
    const backTongueEnd = endpoint(backTongue.part, backTongue.pose);
    const planeDistanceMm = Math.abs(frontFace.pose.zMm - backFace.pose.zMm);

    // #then
    assert.deepEqual(
      {
        partCount: parts.length,
        facesVertical: isVertical(frontFace.pose) && isVertical(backFace.pose),
        facesParallel:
          Math.abs(Math.sin(frontFace.pose.psiRad) - Math.sin(backFace.pose.psiRad)) <= toleranceMm,
        planesFiveMmApart: planeDistanceMm >= 4 && planeDistanceMm <= 6,
        frontTongueBelowFace: frontTongue.pose.yMm < frontTongueEnd.yMm - toleranceMm,
        backTongueBelowFace: backTongue.pose.yMm < backTongueEnd.yMm - toleranceMm,
      },
      {
        partCount: 4,
        facesVertical: true,
        facesParallel: true,
        planesFiveMmApart: true,
        frontTongueBelowFace: true,
        backTongueBelowFace: true,
      },
    );
  });
});
