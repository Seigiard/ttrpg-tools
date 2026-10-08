import { artworkMimeType } from './artwork-formats';

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob failed'))),
      artworkMimeType('png'),
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}
