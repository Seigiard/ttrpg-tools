import { artworkMimeType } from './artwork-formats';
import { findFigureBounds } from './figure-bounds';
import { canvasToPngBytes } from './canvas';
import type { PreparedArtwork } from './types';

type NormalizedArtwork = { artwork: PreparedArtwork; warning?: string };

export function createArtworkNormalizer() {
  const cache = new WeakMap<PreparedArtwork, Promise<NormalizedArtwork>>();
  // A batch holds at most one full-resolution bitmap, canvas and pixel buffer.
  let trimQueue: Promise<void> = Promise.resolve();

  // Failures return the original and leave the cache so a later call can retry.
  return function normalizeArtwork(original: PreparedArtwork): Promise<NormalizedArtwork> {
    let pending = cache.get(original);

    if (!pending) {
      pending = trimQueue
        .then(() => trimArtwork(original))
        .catch((err) => {
          console.error(err);
          cache.delete(original);

          return {
            artwork: original,
            warning: 'Не удалось обрезать изображение. Будет напечатан оригинал.',
          };
        });
      trimQueue = pending.then(() => {});
      cache.set(original, pending);
    }

    return pending;
  };
}

async function trimArtwork(original: PreparedArtwork): Promise<NormalizedArtwork> {
  const notFound = {
    artwork: original,
    warning: 'Не удалось определить границы фигурки. Будет напечатан оригинал.',
  };

  const blob = new Blob([original.bytes.slice()], {
    type: artworkMimeType(original.format),
  });

  const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
  const canvas = document.createElement('canvas');

  try {
    canvas.width = original.width;
    canvas.height = original.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bounds = findFigureBounds(pixels.data, canvas.width, canvas.height);

    if (!bounds) return notFound;

    if (
      bounds.x === 0 &&
      bounds.y === 0 &&
      bounds.width === original.width &&
      bounds.height === original.height
    ) {
      return { artwork: original };
    }

    canvas.width = bounds.width;
    canvas.height = bounds.height;
    ctx.drawImage(
      bitmap,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );

    // PNG avoids another lossy compression pass for trimmed JPEGs. This can
    // increase PDF size; disabling normalization restores the original bytes.
    return {
      artwork: {
        bytes: await canvasToPngBytes(canvas),
        format: 'png',
        width: bounds.width,
        height: bounds.height,
      },
    };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
