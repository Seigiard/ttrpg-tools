import type { BaseStyle, PackedMini } from './geometry';

export type MiniPartRole =
  | 'floorStrip'
  | 'frontTab'
  | 'frontTongue'
  | 'frontFace'
  | 'backFace'
  | 'backTab'
  | 'backTongue'
  | 'hinge';

export type MiniPart = {
  id: string;
  sheet: 'main' | 'back';
  role: MiniPartRole;
  fromMm: number;
  toMm: number;
};

export type MiniPartPose = { yMm: number; zMm: number; psiRad: number };

export type MiniPartEndpoint = { yMm: number; zMm: number };

export type MiniStandPose = { yMinMm: number; yMaxMm: number };

export type FoamSlabPose = {
  yMinMm: number;
  yMaxMm: number;
  zMinMm: number;
  zMaxMm: number;
};

const HINGE_HALF_LENGTH_MM = 0.25;

function makePart(
  id: string,
  sheet: MiniPart['sheet'],
  role: MiniPartRole,
  fromMm: number,
  toMm: number,
): MiniPart {
  return { id, sheet, role, fromMm, toMm };
}

function hinge(id: string, sheet: MiniPart['sheet'], foldMm: number): MiniPart {
  return makePart(id, sheet, 'hinge', foldMm - HINGE_HALF_LENGTH_MM, foldMm + HINGE_HALF_LENGTH_MM);
}

export function miniParts(mini: PackedMini): MiniPart[] {
  if (mini.baseStyle === 'tent') {
    const { levels } = mini;
    const floorHinge = hinge('main-hinge-floor', 'main', levels.floorStripTopMm);

    return [
      makePart('main-floor-strip', 'main', 'floorStrip', 0, floorHinge.fromMm),
      floorHinge,
      makePart('main-front-tab', 'main', 'frontTab', floorHinge.toMm, levels.frontTabTopMm),
      makePart('main-front-face', 'main', 'frontFace', levels.frontTabTopMm, levels.foldMm),
      makePart('main-back-face', 'main', 'backFace', levels.foldMm, levels.backFaceTopMm),
      makePart('main-back-tab', 'main', 'backTab', levels.backFaceTopMm, levels.topMm),
    ];
  }

  if (mini.baseStyle === 'flat') {
    const { levels } = mini;
    const faceHinge = hinge('main-hinge-face', 'main', levels.foldMm);

    return [
      makePart('main-front-tongue', 'main', 'frontTongue', 0, levels.frontTongueTopMm),
      makePart('main-front-face', 'main', 'frontFace', levels.frontTongueTopMm, faceHinge.fromMm),
      faceHinge,
      makePart('main-back-face', 'main', 'backFace', faceHinge.toMm, levels.backFaceTopMm),
      makePart('main-back-tongue', 'main', 'backTongue', levels.backFaceTopMm, levels.topMm),
    ];
  }

  const { levels } = mini;

  return [
    makePart('main-front-tongue', 'main', 'frontTongue', 0, levels.frontTongueTopMm),
    makePart('main-front-face', 'main', 'frontFace', levels.frontTongueTopMm, levels.topMm),
    makePart('back-back-tongue', 'back', 'backTongue', 0, levels.frontTongueTopMm),
    makePart('back-back-face', 'back', 'backFace', levels.frontTongueTopMm, levels.topMm),
  ];
}

function styleForParts(parts: MiniPart[]): 'tent' | 'flat' | 'foamboard' {
  if (parts.some(({ role }) => role === 'floorStrip')) return 'tent';

  if (parts.some(({ sheet }) => sheet === 'back')) return 'foamboard';

  return 'flat';
}

function phaseProgress(t: number, [start, end]: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (t - start) / (end - start)));
}

export function endpoint(part: MiniPart, pose: MiniPartPose): MiniPartEndpoint {
  const lengthMm = part.toMm - part.fromMm;

  return {
    yMm: pose.yMm + Math.cos(pose.psiRad) * lengthMm,
    zMm: pose.zMm + Math.sin(pose.psiRad) * lengthMm,
  };
}

export function poseMini(parts: MiniPart[], t: number): Map<string, MiniPartPose> {
  const clampedT = Math.max(0, Math.min(1, t));
  const style = styleForParts(parts);

  if (style === 'tent') return poseTent(parts, clampedT);

  if (style === 'flat') return poseFlat(parts, clampedT);

  return poseFoamboard(parts, clampedT);
}

export function poseMiniStand(_baseStyle: Exclude<BaseStyle, 'tent'>, t: number): MiniStandPose {
  const progress = phaseProgress(t, [0.8, 1]);
  const yMinMm = progress === 1 ? 0 : -3 * (1 - progress);

  return { yMinMm, yMaxMm: yMinMm + 3 };
}

export function poseFoamSlab(mini: PackedMini, t: number): FoamSlabPose {
  const progress = phaseProgress(t, [0.35, 0.65]);
  const heightMm = mini.levels.topMm;
  const yMinMm = (heightMm + 5) * (1 - progress);

  return { yMinMm, yMaxMm: yMinMm + heightMm, zMinMm: -5, zMaxMm: 0 };
}

function requirePart(
  parts: MiniPart[],
  role: MiniPartRole,
  sheet: MiniPart['sheet'] = 'main',
): MiniPart {
  const found = parts.find((candidate) => candidate.role === role && candidate.sheet === sheet);

  if (!found) throw new Error(`Missing ${sheet} ${role} mini part`);

  return found;
}

function optionalPart(
  parts: MiniPart[],
  role: MiniPartRole,
  sheet: MiniPart['sheet'] = 'main',
): MiniPart | undefined {
  return parts.find((candidate) => candidate.role === role && candidate.sheet === sheet);
}

function startBefore(miniPart: MiniPart, end: MiniPartEndpoint, psiRad: number): MiniPartPose {
  const lengthMm = miniPart.toMm - miniPart.fromMm;

  return {
    yMm: end.yMm - Math.cos(psiRad) * lengthMm,
    zMm: end.zMm - Math.sin(psiRad) * lengthMm,
    psiRad,
  };
}

function poseTent(parts: MiniPart[], t: number): Map<string, MiniPartPose> {
  const floor = requirePart(parts, 'floorStrip');
  const floorHinge = optionalPart(parts, 'hinge');
  const frontTab = requirePart(parts, 'frontTab');
  const frontFace = requirePart(parts, 'frontFace');
  const backFace = requirePart(parts, 'backFace');
  const backTab = requirePart(parts, 'backTab');
  const poses = new Map<string, MiniPartPose>();

  const floorProgress = phaseProgress(t, [0.75, 1]);
  const floorDirection = -Math.PI / 2 + Math.PI * floorProgress;
  const floorHingeDirection = -Math.PI / 2 + (Math.PI / 2) * floorProgress;
  const floorHingeLength = floorHinge ? floorHinge.toMm - floorHinge.fromMm : 0;
  const floorLength = floor.toMm - floor.fromMm;

  const frontTabPose = {
    yMm:
      floorLength * Math.sin(Math.PI * floorProgress) +
      floorHingeLength * Math.cos(floorHingeDirection),
    zMm: frontTab.toMm - frontTab.fromMm,
    psiRad: -Math.PI / 2,
  };

  poses.set(frontTab.id, frontTabPose);

  let previous = endpoint(frontTab, frontTabPose);

  const frontFacePose = {
    ...previous,
    psiRad: -Math.PI / 2 + (Math.PI / 2) * phaseProgress(t, [0, 0.35]),
  };

  poses.set(frontFace.id, frontFacePose);

  previous = endpoint(frontFace, frontFacePose);

  const backFoldProgress = phaseProgress(t, [0.3, 0.7]);
  const backTabProgress = phaseProgress(t, [0.6, 0.7]);
  const backTabTurn = (Math.PI / 2) * backTabProgress;
  const backFaceLength = backFace.toMm - backFace.fromMm;
  const backTabLength = backTab.toMm - backTab.fromMm;

  const backTabReach = Math.hypot(
    backFaceLength + backTabLength * Math.cos(backTabTurn),
    backTabLength * Math.sin(backTabTurn),
  );

  const backTabDirectionOffset = Math.atan2(
    backTabLength * Math.sin(backTabTurn),
    backFaceLength + backTabLength * Math.cos(backTabTurn),
  );

  const backFaceDirectionFloor =
    -Math.acos(Math.max(-1, Math.min(1, -previous.yMm / backTabReach))) - backTabDirectionOffset;

  const backFacePose = {
    ...previous,
    psiRad: Math.max(
      frontFacePose.psiRad - Math.PI * backFoldProgress ** 2,
      backFaceDirectionFloor,
    ),
  };

  poses.set(backFace.id, backFacePose);

  previous = endpoint(backFace, backFacePose);

  const backTabPose = {
    ...previous,
    psiRad: backFacePose.psiRad + backTabTurn,
  };

  poses.set(backTab.id, backTabPose);

  const floorEnd = floorHinge
    ? startBefore(floorHinge, frontTabPose, floorHingeDirection)
    : frontTabPose;

  if (floorHinge) poses.set(floorHinge.id, floorEnd);

  poses.set(floor.id, startBefore(floor, floorEnd, floorDirection));

  return poses;
}

function poseFlat(parts: MiniPart[], t: number): Map<string, MiniPartPose> {
  const frontTongue = requirePart(parts, 'frontTongue');
  const frontFace = requirePart(parts, 'frontFace');
  const faceHinge = optionalPart(parts, 'hinge');
  const backFace = requirePart(parts, 'backFace');
  const backTongue = requirePart(parts, 'backTongue');
  const poses = new Map<string, MiniPartPose>();
  const frontDirection = -Math.PI / 2 + (Math.PI / 2) * phaseProgress(t, [0, 0.5]);
  const frontTonguePose = { yMm: 0, zMm: 0, psiRad: frontDirection };

  poses.set(frontTongue.id, frontTonguePose);

  let previous = endpoint(frontTongue, frontTonguePose);
  const frontFacePose = { ...previous, psiRad: frontDirection };

  poses.set(frontFace.id, frontFacePose);

  previous = endpoint(frontFace, frontFacePose);

  if (faceHinge) {
    const faceHingePose = { ...previous, psiRad: frontDirection };
    poses.set(faceHinge.id, faceHingePose);
    previous = endpoint(faceHinge, faceHingePose);
  }

  const backDirection = frontDirection - Math.PI * phaseProgress(t, [0.3, 0.7]);
  const backFacePose = { ...previous, psiRad: backDirection };

  poses.set(backFace.id, backFacePose);

  previous = endpoint(backFace, backFacePose);

  poses.set(backTongue.id, { ...previous, psiRad: backDirection });

  return poses;
}

function poseFoamboard(parts: MiniPart[], t: number): Map<string, MiniPartPose> {
  const poses = new Map<string, MiniPartPose>();
  const riseProgress = phaseProgress(t, [0, 0.35]);
  const closeProgress = phaseProgress(t, [0.65, 0.8]);

  for (const sheet of ['main', 'back'] as const) {
    const sheetParts = parts
      .filter((candidate) => candidate.sheet === sheet)
      .toSorted((first, second) => first.fromMm - second.fromMm);

    const sheetTop = Math.max(...sheetParts.map((candidate) => candidate.toMm));
    const initialZ = sheet === 'main' ? sheetTop + 5 : -5;
    const openZ = sheet === 'main' ? 5 : -10;
    const assembledZ = sheet === 'main' ? 0 : -5;
    const psiRad = -Math.PI / 2 + (Math.PI / 2) * riseProgress;
    const zAfterRise = initialZ + (openZ - initialZ) * riseProgress;
    const zMm = zAfterRise + (assembledZ - openZ) * closeProgress;

    let next: MiniPartPose = {
      yMm: 0,
      zMm,
      psiRad,
    };

    for (const sheetPart of sheetParts) {
      poses.set(sheetPart.id, next);

      next = { ...endpoint(sheetPart, next), psiRad };
    }
  }

  return poses;
}
