import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BaseStyle, PackedMini } from '@/lib/paper-minis/geometry';
import {
  endpoint,
  miniParts,
  poseFoamSlab,
  poseMini,
  poseMiniStand,
  type MiniPart,
  type MiniPartPose,
} from '@/lib/paper-minis/mini-3d';
import type { PreparedArtwork } from '@/lib/paper-minis/types';
import { Button } from '@/components/ui/button';
import { useArtworkUrl } from './use-artwork-url';

export type PaperMini3dProps = {
  baseStyle: BaseStyle;
  mini?: PackedMini;
  artwork?: PreparedArtwork | null;
  backArtwork?: PreparedArtwork | null;
};

const FOLD_DURATION_MS = 900;

const LIGHT = normalize([0.35, 0.8, 0.55]);

const WORLD_ROTATE_X_RAD = (-16 * Math.PI) / 180;

const WORLD_ROTATE_Y_RAD = (-32 * Math.PI) / 180;

const FRAME_WIDTH_PX = 146;

const FRAME_HEIGHT_PX = 124;

const FRAME_CENTER_Y_PX = -64;

const SCENE_PERSPECTIVE_PX = 640;

export function PaperMini3d({ baseStyle, mini, artwork, backArtwork }: PaperMini3dProps) {
  const parts = useMemo(
    () => (mini ? miniParts(mini) : fallbackParts(baseStyle)),
    [baseStyle, mini],
  );

  const [assembly, setAssembly] = useState(0);
  const [replay, setReplay] = useState(0);
  const frontUrl = useArtworkUrl(artwork);
  const backUrl = useArtworkUrl(backArtwork) ?? frontUrl;

  useEffect(() => {
    setAssembly(0);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAssembly(1);

      return;
    }

    let frame = 0;
    let startedAt: number | undefined;

    const animate = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / FOLD_DURATION_MS);
      setAssembly(progress);

      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [baseStyle, replay]);

  const poses = useMemo(() => poseMini(parts, assembly), [assembly, parts]);

  const paperWidthMm = mini?.totalWidthMm ?? 29;

  const standZ = useMemo(
    () => (baseStyle === 'tent' ? undefined : standPosition(parts)),
    [baseStyle, parts],
  );

  const standPose = useMemo(
    () => (baseStyle === 'tent' ? undefined : poseMiniStand(baseStyle, assembly)),
    [assembly, baseStyle],
  );

  const foamSlab = useMemo(
    () => (baseStyle === 'foamboard' && mini ? poseFoamSlab(mini, assembly) : undefined),
    [assembly, baseStyle, mini],
  );

  const frame = useMemo(
    () => frameFor(parts, poses, paperWidthMm, standZ, standPose, foamSlab),
    [foamSlab, paperWidthMm, parts, poses, standPose, standZ],
  );

  const badgeRole = baseStyle === 'tent' ? 'backTab' : 'backTongue';

  const image = mini && {
    front: {
      widthMm: mini.imageWidthMm,
      heightMm: mini.imageHeightMm,
      offsetXMm: mini.imageOffsetXMm,
    },
    back: mini.back
      ? {
          widthMm: mini.back.imageWidthMm,
          heightMm: mini.back.imageHeightMm,
          offsetXMm: mini.back.imageOffsetXMm,
        }
      : {
          widthMm: mini.imageWidthMm,
          heightMm: mini.imageHeightMm,
          offsetXMm: mini.imageOffsetXMm,
        },
  };

  return (
    <div
      data-testid="mini-3d"
      data-base-style={baseStyle}
      data-t={assembly === 1 ? '1' : String(assembly)}
      data-art={artwork ? 'artwork' : 'placeholder'}
      className="mini-3d-scene"
      aria-label="как собрать одну фигурку"
    >
      <Button
        aria-label="Повторить сборку"
        className="absolute end-1 top-1 z-10 size-11"
        size="icon-xs"
        title="Повторить сборку"
        variant="outline"
        onPress={() => setReplay((current) => current + 1)}
      >
        <span aria-hidden="true">↻</span>
      </Button>
      <div className="mini-3d-world" style={worldStyle(frame)}>
        <div className="mini-3d-shadow" style={shadowStyle(frame)} />
        {standZ !== undefined && standPose && assembly >= 0.8 && (
          <MiniStand frame={frame} pose={standPose} standZ={standZ} />
        )}
        {foamSlab && <FoamSlab frame={frame} mini={mini} pose={foamSlab} />}
        {parts.map((miniPart) => {
          const pose = poses.get(miniPart.id);

          if (!pose) return null;

          const isFace = miniPart.role === 'frontFace' || miniPart.role === 'backFace';
          const isBack = miniPart.role === 'backFace';
          const dimensions = isBack ? image?.back : image?.front;
          const artUrl = isBack ? backUrl : frontUrl;
          const label = mini?.label && miniPart.role === badgeRole ? mini.label : undefined;
          const printFacesAway = baseStyle === 'foamboard' && isBack;

          return (
            <div
              key={miniPart.id}
              data-part-role={miniPart.role}
              className={`mini-3d-part${isFace ? ' mini-3d-face' : ''}`}
              style={partStyle(miniPart, pose, paperWidthMm, frame.scale)}
            >
              <div
                className="mini-3d-side mini-3d-print"
                style={printFacesAway ? { transform: 'rotateY(180deg)' } : undefined}
              >
                {isFace && dimensions && artUrl ? (
                  <img
                    className="mini-3d-art"
                    style={{
                      ...artStyle(
                        miniPart,
                        dimensions,
                        frame.scale,
                        baseStyle === 'foamboard' ? (mini?.marginMm ?? 0) : undefined,
                      ),
                      ...(isBack &&
                        baseStyle !== 'foamboard' && {
                          transform: backArtwork ? 'rotate(180deg)' : 'scaleY(-1)',
                        }),
                    }}
                    src={artUrl}
                    alt=""
                  />
                ) : isFace ? (
                  <span className="mini-3d-placeholder" aria-hidden="true" />
                ) : null}
                {label && mini && (
                  <span
                    data-testid="mini-3d-badge"
                    className="mini-3d-badge"
                    style={badgeStyle(mini, frame.scale)}
                  >
                    {label}
                  </span>
                )}
                <span className="mini-3d-shade" style={{ opacity: shadeFor(pose) }} />
              </div>
              <div
                className="mini-3d-side mini-3d-reverse"
                style={printFacesAway ? { transform: 'none' } : undefined}
              >
                <span className="mini-3d-shade" style={{ opacity: shadeFor(pose, true) }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStand({
  frame,
  pose,
  standZ,
}: {
  frame: { centerZ: number; scale: number };
  pose: { yMinMm: number; yMaxMm: number };
  standZ: number;
}) {
  const { scale } = frame;

  // SAFETY: Values are locally generated lengths for React's CSS custom-property escape hatch.
  const style = {
    '--mini-disc-size': `${34 * scale}px`,
    '--mini-disc-offset': `${-17 * scale}px`,
    '--mini-slot-width': `${24 * scale}px`,
    '--mini-slot-height': `${3 * scale}px`,
    '--mini-slot-x': `${-12 * scale}px`,
    '--mini-slot-y': `${-3 * scale}px`,
    '--mini-stand-height': `${scale}px`,
    transform: `translate3d(0, ${-pose.yMinMm * scale}px, ${standZ * scale}px)`,
  } as CSSProperties;

  return (
    <div className="mini-3d-stand" style={style} aria-hidden="true">
      <span className="mini-3d-stand-disc" />
      <span className="mini-3d-stand-slot" />
    </div>
  );
}

function FoamSlab({
  frame,
  mini,
  pose,
}: {
  frame: { scale: number };
  mini?: PackedMini;
  pose: { yMinMm: number; yMaxMm: number; zMinMm: number; zMaxMm: number };
}) {
  if (!mini) return null;

  const width = mini.totalWidthMm * frame.scale;
  const height = (pose.yMaxMm - pose.yMinMm) * frame.scale;
  const depth = (pose.zMaxMm - pose.zMinMm) * frame.scale;

  const base: CSSProperties = {
    position: 'absolute',
    background: 'var(--color-border)',
    backfaceVisibility: 'hidden',
  };

  return (
    <div aria-hidden="true" style={{ transformStyle: 'preserve-3d' }}>
      <span
        style={{
          ...base,
          inlineSize: `${width}px`,
          blockSize: `${height}px`,
          marginInlineStart: `${-width / 2}px`,
          marginBlockStart: `${-height}px`,
          transform: `translate3d(0, ${-pose.yMinMm * frame.scale}px, ${pose.zMaxMm * frame.scale}px)`,
        }}
      />
      <span
        style={{
          ...base,
          inlineSize: `${width}px`,
          blockSize: `${height}px`,
          marginInlineStart: `${-width / 2}px`,
          marginBlockStart: `${-height}px`,
          transform: `translate3d(0, ${-pose.yMinMm * frame.scale}px, ${pose.zMinMm * frame.scale}px) rotateY(180deg)`,
        }}
      />
      <span
        style={{
          ...base,
          inlineSize: `${depth}px`,
          blockSize: `${height}px`,
          marginInlineStart: `${-depth / 2}px`,
          marginBlockStart: `${-height}px`,
          transform: `translate3d(${-width / 2}px, ${-pose.yMinMm * frame.scale}px, ${-depth / 2}px) rotateY(90deg)`,
        }}
      />
      <span
        style={{
          ...base,
          inlineSize: `${depth}px`,
          blockSize: `${height}px`,
          marginInlineStart: `${-depth / 2}px`,
          marginBlockStart: `${-height}px`,
          transform: `translate3d(${width / 2}px, ${-pose.yMinMm * frame.scale}px, ${-depth / 2}px) rotateY(-90deg)`,
        }}
      />
      <span
        style={{
          ...base,
          inlineSize: `${width}px`,
          blockSize: `${depth}px`,
          marginInlineStart: `${-width / 2}px`,
          marginBlockStart: `${-depth / 2}px`,
          transform: `translate3d(0, ${-pose.yMaxMm * frame.scale}px, ${-depth / 2}px) rotateX(90deg)`,
        }}
      />
      <span
        style={{
          ...base,
          inlineSize: `${width}px`,
          blockSize: `${depth}px`,
          marginInlineStart: `${-width / 2}px`,
          marginBlockStart: `${-depth / 2}px`,
          transform: `translate3d(0, ${-pose.yMinMm * frame.scale}px, ${-depth / 2}px) rotateX(-90deg)`,
        }}
      />
    </div>
  );
}

function fallbackParts(baseStyle: BaseStyle): MiniPart[] {
  if (baseStyle === 'tent') {
    return [
      fallbackPart('floor', 'floorStrip', 0, 20),
      fallbackPart('front-tab', 'frontTab', 20, 30),
      fallbackPart('front-face', 'frontFace', 30, 70),
      fallbackPart('back-face', 'backFace', 70, 110),
      fallbackPart('back-tab', 'backTab', 110, 120),
    ];
  }

  if (baseStyle === 'flat') {
    return [
      fallbackPart('front-tongue', 'frontTongue', 0, 6),
      fallbackPart('front-face', 'frontFace', 6, 60),
      fallbackPart('back-face', 'backFace', 60, 114),
      fallbackPart('back-tongue', 'backTongue', 114, 120),
    ];
  }

  return [
    fallbackPart('front-tongue', 'frontTongue', 0, 6),
    fallbackPart('front-face', 'frontFace', 6, 60),
    { ...fallbackPart('back-tongue', 'backTongue', 0, 6), sheet: 'back' },
    { ...fallbackPart('back-face', 'backFace', 6, 60), sheet: 'back' },
  ];
}

function fallbackPart(id: string, role: MiniPart['role'], fromMm: number, toMm: number): MiniPart {
  return { id, role, fromMm, toMm, sheet: 'main' };
}

function frameFor(
  parts: MiniPart[],
  poses: Map<string, MiniPartPose>,
  widthMm: number,
  standZ?: number,
  standPose?: { yMinMm: number; yMaxMm: number },
  foamSlab?: { yMinMm: number; yMaxMm: number; zMinMm: number; zMaxMm: number },
) {
  const points = parts.flatMap((miniPart) => {
    const pose = poses.get(miniPart.id);

    if (!pose) return [];

    return [pose, endpoint(miniPart, pose)].flatMap(({ yMm, zMm }) => [
      { x: -widthMm / 2, y: yMm, z: zMm },
      { x: widthMm / 2, y: yMm, z: zMm },
    ]);
  });

  if (standZ !== undefined) points.push(...standPoints(standZ, standPose?.yMinMm ?? 0));

  if (foamSlab) points.push(...slabPoints(foamSlab, widthMm));

  const z = points.map((point) => point.z);
  const centerZ = (Math.min(...z) + Math.max(...z)) / 2;
  const scale = frameScale(points, centerZ);
  const projected = points.map((point) => projectWorldPoint(point, centerZ, scale));
  const x = projected.map((point) => point.x);
  const y = projected.map((point) => point.y);
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const minY = Math.min(...y);
  const maxY = Math.max(...y);

  return {
    centerZ,
    scale,
    translateX: -(minX + maxX) / 2,
    translateY: FRAME_CENTER_Y_PX - (minY + maxY) / 2,
  };
}

function worldStyle({
  centerZ,
  scale,
  translateX,
  translateY,
}: {
  centerZ: number;
  scale: number;
  translateX: number;
  translateY: number;
}): CSSProperties {
  return {
    transform: `translate3d(${translateX}px, ${translateY}px, 0) rotateX(-16deg) rotateY(-32deg) translate3d(0, 0, ${-centerZ * scale}px)`,
  };
}

function shadowStyle({ centerZ, scale }: { centerZ: number; scale: number }): CSSProperties {
  const width = 58 * scale;
  const height = 38 * scale;

  return {
    inlineSize: `${width}px`,
    blockSize: `${height}px`,
    marginInlineStart: `${-width / 2}px`,
    marginBlockStart: `${-height / 2}px`,
    transform: `translateZ(${centerZ * scale}px) rotateX(90deg) translateZ(1px)`,
  };
}

function partStyle(
  miniPart: MiniPart,
  pose: MiniPartPose,
  widthMm: number,
  scale: number,
): CSSProperties {
  const length = (miniPart.toMm - miniPart.fromMm) * scale;
  const width = widthMm * scale;
  const renderOffsetZMm = miniPart.role === 'backFace' ? -0.25 : 0;
  const renderOffsetYMm = miniPart.role === 'frontTab' || miniPart.role === 'backTab' ? 0.25 : 0;

  return {
    inlineSize: `${width}px`,
    blockSize: `${length}px`,
    marginInlineStart: `${-width / 2}px`,
    marginBlockStart: `${-length}px`,
    transform: `translate3d(0, ${-(pose.yMm + renderOffsetYMm) * scale}px, ${(pose.zMm + renderOffsetZMm) * scale}px) rotateX(${-pose.psiRad}rad)`,
  };
}

function artStyle(
  miniPart: MiniPart,
  image: { widthMm: number; heightMm: number; offsetXMm: number },
  scale: number,
  bottomMm?: number,
): CSSProperties {
  const partHeight = miniPart.toMm - miniPart.fromMm;

  const insetBottomMm =
    bottomMm ?? (miniPart.role === 'backFace' ? partHeight - image.heightMm : 0);

  return {
    inlineSize: `${image.widthMm * scale}px`,
    blockSize: `${image.heightMm * scale}px`,
    insetInlineStart: `${image.offsetXMm * scale}px`,
    insetBlockEnd: `${insetBottomMm * scale}px`,
  };
}

function badgeStyle(mini: PackedMini, scale: number): CSSProperties {
  const { widthMm, offsetMm, roomMm } =
    mini.baseStyle === 'tent'
      ? {
          widthMm: mini.baseWidthMm,
          offsetMm: mini.baseOffsetXMm,
          roomMm: mini.tabHeightMm,
        }
      : {
          widthMm: mini.tongueWidthMm,
          offsetMm: mini.tongueOffsetXMm,
          roomMm: 6,
        };

  const badgeWidthMm = Math.max(4, Math.min(7, widthMm * 0.22));
  const paddingMm = Math.min(0.8, widthMm * 0.04, roomMm * 0.1);
  const badgeHeightMm = Math.min(badgeWidthMm * 0.85, roomMm - paddingMm * 2);

  return {
    inlineSize: `${badgeWidthMm * scale}px`,
    blockSize: `${badgeHeightMm * scale}px`,
    insetInlineStart: `${
      (mini.baseStyle === 'foamboard'
        ? offsetMm + widthMm - badgeWidthMm - paddingMm
        : offsetMm + paddingMm) * scale
    }px`,
    insetBlockEnd: `${paddingMm * scale}px`,
    paddingInline: 0,
    transform: mini.baseStyle === 'foamboard' ? undefined : 'rotate(180deg)',
  };
}

function normalize([x, y, z]: [number, number, number]): [number, number, number] {
  const magnitude = Math.hypot(x, y, z);

  return [x / magnitude, y / magnitude, z / magnitude];
}

function shadeFor(pose: MiniPartPose, reverse = false): number {
  const normal: [number, number, number] = [0, -Math.sin(pose.psiRad), Math.cos(pose.psiRad)];
  const direction = reverse ? normal.map((value) => -value) : normal;

  const light = Math.max(
    0,
    direction[0] * LIGHT[0] + direction[1] * LIGHT[1] + direction[2] * LIGHT[2],
  );

  return 0.42 * (1 - Math.min(1, 0.45 + 0.55 * light));
}

function standPosition(parts: MiniPart[]): number {
  const tongues = parts.filter(
    (miniPart) => miniPart.role === 'frontTongue' || miniPart.role === 'backTongue',
  );

  const assembled = poseMini(parts, 1);

  const z = tongues.flatMap((miniPart) => {
    const pose = assembled.get(miniPart.id);

    return pose ? [pose.zMm, endpoint(miniPart, pose).zMm] : [];
  });

  return z.reduce((total, value) => total + value, 0) / z.length;
}

function standPoints(standZ: number, yMm: number): WorldPoint[] {
  return [
    ...[-17, 17].flatMap((x) => [-17, 17].map((z) => ({ x, y: yMm, z: standZ + z }))),
    ...[-12, 12].flatMap((x) => [yMm, yMm + 3].map((y) => ({ x, y, z: standZ }))),
  ];
}

function slabPoints(
  {
    yMinMm,
    yMaxMm,
    zMinMm,
    zMaxMm,
  }: { yMinMm: number; yMaxMm: number; zMinMm: number; zMaxMm: number },
  widthMm: number,
): WorldPoint[] {
  return [-widthMm / 2, widthMm / 2].flatMap((x) =>
    [yMinMm, yMaxMm].flatMap((y) => [zMinMm, zMaxMm].map((z) => ({ x, y, z }))),
  );
}

type WorldPoint = { x: number; y: number; z: number };

type ProjectedPoint = { x: number; y: number };

function frameScale(points: WorldPoint[], centerZ: number): number {
  let minimum = 0;

  let maximum = 2.6;

  for (let step = 0; step < 24; step += 1) {
    const scale = (minimum + maximum) / 2;

    const projected = points.map((point) => projectWorldPoint(point, centerZ, scale));

    const x = projected.map((point) => point.x);

    const y = projected.map((point) => point.y);

    const fits =
      Math.max(...x) - Math.min(...x) <= FRAME_WIDTH_PX &&
      Math.max(...y) - Math.min(...y) <= FRAME_HEIGHT_PX;

    if (fits) minimum = scale;
    else maximum = scale;
  }

  return minimum;
}

function projectWorldPoint(
  { x, y, z }: WorldPoint,
  centerZ: number,
  scale: number,
): ProjectedPoint {
  const centeredZ = z - centerZ;
  const rotatedX = Math.cos(WORLD_ROTATE_Y_RAD) * x + Math.sin(WORLD_ROTATE_Y_RAD) * centeredZ;
  const rotatedZ = -Math.sin(WORLD_ROTATE_Y_RAD) * x + Math.cos(WORLD_ROTATE_Y_RAD) * centeredZ;
  const rotatedY = Math.cos(WORLD_ROTATE_X_RAD) * -y - Math.sin(WORLD_ROTATE_X_RAD) * rotatedZ;
  const depth = Math.sin(WORLD_ROTATE_X_RAD) * -y + Math.cos(WORLD_ROTATE_X_RAD) * rotatedZ;
  const perspective = SCENE_PERSPECTIVE_PX / (SCENE_PERSPECTIVE_PX - depth * scale);

  return {
    x: rotatedX * scale * perspective,
    y: rotatedY * scale * perspective,
  };
}
