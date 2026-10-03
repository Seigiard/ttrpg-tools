export type FigureBounds = { x: number; y: number; width: number; height: number };

// Requires width × height RGBA pixels. Any transparency selects the alpha path:
// alpha > threshold belongs to the figure; no such pixel means no bounds (null).
// Otherwise the per-channel border median is the background. colourTolerance
// limits both the border's channel spread and each pixel's distance from that
// median. An uneven border or no contrasting pixels returns null.
export function findFigureBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8,
  colourTolerance = 12,
): FigureBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let hasTransparency = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha < 255) hasTransparency = true;
      if (alpha <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (!hasTransparency) return findOpaqueBounds(pixels, width, height, colourTolerance);
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function findOpaqueBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
): FigureBounds | null {
  if (width === 0 || height === 0) return null;
  const border: number[] = [];
  for (let x = 0; x < width; x++) {
    border.push(x * 4);
    if (height > 1) border.push(((height - 1) * width + x) * 4);
  }
  for (let y = 1; y < height - 1; y++) {
    border.push(y * width * 4);
    if (width > 1) border.push((y * width + width - 1) * 4);
  }
  const background: number[] = [];
  for (let channel = 0; channel < 3; channel++) {
    const values = border.map((i) => pixels[i + channel]).toSorted((a, b) => a - b);
    if (values[values.length - 1] - values[0] > tolerance) return null;
    const mid = Math.floor(values.length / 2);
    background.push((values[mid] + values[Math.floor((values.length - 1) / 2)]) / 2);
  }
  const isBackground = (i: number) =>
    background.every((value, channel) => Math.abs(pixels[i + channel] - value) <= tolerance);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  // The extrema equal scanning whole rows/columns inward until the first
  // non-background pixel. Similar-coloured pixels inside that box are retained.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBackground((y * width + x) * 4)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
