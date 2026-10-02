import { PDFDocument } from 'pdf-lib';
import { canvasToPngBytes } from './canvas';
import { createArtworkNormalizer } from './normalization';
import type { PreparedArtwork } from './types';

export type ArtworkPreparation = { artwork: PreparedArtwork; warning?: string };
export type ArtworkPreparationOptions = {
  normalize: boolean;
  isCurrent: () => boolean;
};
export type PaperMinisArtwork = {
  prepare(file: File, options: ArtworkPreparationOptions): Promise<ArtworkPreparation>;
};

export function isSupportedArtwork(file: File): boolean {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase());
}

export function createCanvasArtwork(): PaperMinisArtwork {
  const cache = new WeakMap<File, Promise<PreparedArtwork>>();
  const normalizeArtwork = createArtworkNormalizer();

  // Keep the dimensions of the printed bytes, not browser EXIF-rotated dimensions.
  function prepareOriginal(file: File): Promise<PreparedArtwork> {
    let pending = cache.get(file);
    if (!pending) {
      pending = decodeArtwork(file);
      cache.set(file, pending);
      void pending.catch(() => cache.delete(file));
    }
    return pending;
  }

  return {
    async prepare(file, { normalize, isCurrent }) {
      const original = await prepareOriginal(file);
      return normalize && isCurrent() ? normalizeArtwork(original) : { artwork: original };
    },
  };
}

async function decodeArtwork(file: File): Promise<PreparedArtwork> {
  const { bytes, format } = await fileToImageBytes(file);
  if (format === 'png') return { bytes, format, ...pngDimensions(bytes) };
  // pdf-lib's JPEG embedder reads SOF markers without decoding pixels.
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(bytes);
  return { bytes, format, width: image.width, height: image.height };
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  // PNG starts with its signature and a 13-byte IHDR chunk (including the CRC: 33 bytes).
  if (bytes.byteLength < 33) throw new Error('Invalid PNG header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452
  ) {
    throw new Error('Invalid PNG header.');
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) throw new Error('Invalid PNG dimensions.');
  return { width, height };
}

async function fileToImageBytes(file: File): Promise<{ bytes: Uint8Array; format: 'png' | 'jpg' }> {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') {
    return { bytes: new Uint8Array(await file.arrayBuffer()), format: 'jpg' };
  }
  if (type === 'image/png') {
    return { bytes: new Uint8Array(await file.arrayBuffer()), format: 'png' };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(bitmap, 0, 0);
    return { bytes: await canvasToPngBytes(canvas), format: 'png' };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
