import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createCanvasArtwork } from './artwork.ts';

const options = { normalize: false, isCurrent: () => true };

async function fixture(name: string): Promise<ArrayBuffer> {
  return Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer();
}

async function prepare(name: string, type: string) {
  const bytes = await fixture(name);

  return createCanvasArtwork().prepare(new File([bytes], name, { type }), options);
}

test('PNG dimensions come from the image bytes', async () => {
  // #given
  const name = 'artwork-3x2.png';
  // #when
  const result = await prepare(name, 'image/png');
  // #then
  assert.deepEqual(
    { format: result.artwork.format, width: result.artwork.width, height: result.artwork.height },
    { format: 'png', width: 3, height: 2 },
  );
});

for (const { name, alter, message } of [
  {
    name: 'a bad signature',
    alter(bytes: Uint8Array) {
      bytes[0] = 0;

      return bytes;
    },
    message: 'Invalid PNG header.',
  },
  {
    name: 'a short header',
    alter(bytes: Uint8Array) {
      return bytes.slice(0, 32);
    },
    message: 'Invalid PNG header.',
  },
  {
    name: 'zero width',
    alter(bytes: Uint8Array) {
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(16, 0);

      return bytes;
    },
    message: 'Invalid PNG dimensions.',
  },
  {
    name: 'zero height',
    alter(bytes: Uint8Array) {
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(20, 0);

      return bytes;
    },
    message: 'Invalid PNG dimensions.',
  },
] as const) {
  test(`PNG rejects ${name}`, async () => {
    // #given
    const bytes = alter(new Uint8Array(await fixture('artwork-3x2.png')));
    const file = new File([bytes.slice()], 'broken.png', { type: 'image/png' });
    // #when
    const result = createCanvasArtwork().prepare(file, options);
    // #then
    await assert.rejects(result, { message });
  });
}

test('JPEG dimensions come from the image bytes', async () => {
  // #given
  const name = 'artwork-4x3.jpg';
  // #when
  const result = await prepare(name, 'image/jpeg');
  // #then
  assert.deepEqual(
    { format: result.artwork.format, width: result.artwork.width, height: result.artwork.height },
    { format: 'jpg', width: 4, height: 3 },
  );
});

test('JPEG EXIF orientation does not rotate the dimensions read from bytes', async () => {
  // #given
  const name = 'artwork-exif-3x2.jpg';
  // #when
  const result = await prepare(name, 'image/jpeg');
  // #then
  assert.deepEqual(
    { format: result.artwork.format, width: result.artwork.width, height: result.artwork.height },
    { format: 'jpg', width: 3, height: 2 },
  );
});

test('a failed decode can retry the same File', async () => {
  // #given
  const valid = await fixture('artwork-3x2.png');
  const broken = new Uint8Array(valid.slice(0));
  broken[0] = 0;
  const file = new File([], 'retry.png', { type: 'image/png' });
  let reads = 0;
  file.arrayBuffer = async () => (reads++ === 0 ? broken.buffer : valid);
  const artwork = createCanvasArtwork();
  // #when
  let firstError: unknown;

  try {
    await artwork.prepare(file, options);
  } catch (error) {
    firstError = error;
  }

  const retry = await artwork.prepare(file, options);
  // #then
  assert.deepEqual(
    {
      firstError: firstError instanceof Error ? firstError.message : null,
      reads,
      format: retry.artwork.format,
      width: retry.artwork.width,
      height: retry.artwork.height,
    },
    { firstError: 'Invalid PNG header.', reads: 2, format: 'png', width: 3, height: 2 },
  );
});
