import { afterEach, expect, spyOn, test } from 'bun:test';
import { createPaperMinisStore } from './paper-minis-store';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function setup() {
  const store = createPaperMinisStore();
  store.settings({ normalization: false });
  return store;
}
function deferredFile() {
  let release!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((resolve) => {
    release = resolve;
  });
  // A real 1×100 PNG makes stale artwork distinguishable from the 1×1 replacement.
  const slowPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAABHLFpgAAAAEklEQVR4nGP4z8Dwn2GUGEkEAJoCxzl9ksz2AAAAAElFTkSuQmCC',
    'base64',
  );
  const file = new File([slowPng], 'slow.png', { type: 'image/png' });
  file.arrayBuffer = () => pending;
  return { file, release: () => release(Uint8Array.from(slowPng).buffer) };
}
afterEach(() => localStorage.removeItem('pmg-settings'));

test('generation holds rows and settings stable until the lock is released', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  const file = new File([png], 'front.png', { type: 'image/png' });
  await store.setImage(id, file);
  await store.setImage(id, file, true);
  const before = {
    rows: store.$rows.get(),
    settings: store.$settings.get(),
    revision: store.$revision.get(),
  };
  // #when
  const started = store.beginGeneration();
  const repeated = store.beginGeneration();
  store.patch(id, { count: 7 });
  store.settings({ pageSize: 'letter', normalization: true });
  store.addBlank();
  store.ingest([file]);
  store.duplicate(id);
  store.clearBack(id);
  store.remove(id);
  await store.setImage(id, file);
  await store.setImage(id, file, true);
  const during = {
    rows: store.$rows.get(),
    settings: store.$settings.get(),
    revision: store.$revision.get(),
  };
  store.endGeneration();
  store.patch(id, { count: 3 });
  // #then
  expect({
    started,
    repeated,
    during,
    busy: store.$busy.get(),
    count: store.pack().miniCount,
  }).toEqual({ started: true, repeated: false, during: before, busy: false, count: 3 });
});

test('a removed row’s late load neither restores it nor invalidates the preview', async () => {
  // #given
  const store = setup();
  const slow = deferredFile();
  const id = store.addBlank()!;
  const pending = store.setImage(id, slow.file);
  // #when
  store.remove(id);
  const revision = store.$revision.get();
  slow.release();
  await pending;
  // #then
  expect({ rows: store.$rows.get(), revision: store.$revision.get() }).toEqual({
    rows: [],
    revision,
  });
});

test('generation waits for artwork preparation even when another row is printable', async () => {
  // #given
  const store = setup();
  await store.setImage(store.addBlank()!, new File([png], 'front.png', { type: 'image/png' }));
  const slow = deferredFile();
  const pending = store.setImage(store.addBlank()!, slow.file);
  // #when
  const during = {
    preparing: store.$preparing.get(),
    started: store.beginGeneration(),
    count: store.pack().miniCount,
  };
  slow.release();
  await pending;
  const after = {
    preparing: store.$preparing.get(),
    started: store.beginGeneration(),
    count: store.pack().miniCount,
  };
  store.endGeneration();
  // #then
  expect({ during, after }).toEqual({
    during: { preparing: true, started: false, count: 1 },
    after: { preparing: false, started: true, count: 2 },
  });
});

test('a normalization job keeps generation unavailable until its failure fallback is published', async () => {
  // #given
  const store = setup();
  await store.setImage(store.addBlank()!, new File([png], 'front.png', { type: 'image/png' }));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  let reject!: (reason: Error) => void;
  let started!: () => void;
  const decoding = new Promise<void>((resolve) => {
    started = resolve;
  });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: () => {
      started();
      return new Promise<ImageBitmap>((_, no) => {
        reject = no;
      });
    },
  });
  try {
    // #when
    store.settings({ normalization: true });
    await decoding;
    const during = store.beginGeneration();
    const settled = new Promise<void>((resolve) => {
      const unsubscribe = store.$preparing.listen((preparing) => {
        if (!preparing) {
          unsubscribe();
          resolve();
        }
      });
    });
    reject(new Error('Bitmap decoding failed'));
    await settled;
    const after = store.beginGeneration();
    store.endGeneration();
    // #then
    expect({
      during,
      after,
      count: store.pack().miniCount,
      warning: store.$rows.get()[0].normalizationWarning,
    }).toEqual({
      during: false,
      after: true,
      count: 1,
      warning: 'Не удалось обрезать изображение. Будет напечатан оригинал.',
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'createImageBitmap', descriptor);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
    errors.mockRestore();
  }
});

test.each(['remove', 'clearBack', 'replace'])(
  '%s releases preparation without waiting for obsolete artwork',
  async (action) => {
    // #given
    const store = setup();
    const id = store.addBlank()!;
    const front = new File([png], 'front.png', { type: 'image/png' });
    await store.setImage(id, front);
    const slow = deferredFile();
    const target = action === 'remove' ? store.addBlank()! : id;
    const pending = store.setImage(target, slow.file, action === 'clearBack');
    // #when
    if (action === 'remove') store.remove(target);
    else if (action === 'clearBack') store.clearBack(target);
    else await store.setImage(target, front);
    const preparing = store.$preparing.get();
    const started = store.beginGeneration();
    const revision = store.$revision.get();
    slow.release();
    await pending;
    store.endGeneration();
    // #then
    expect({
      preparing,
      started,
      rows: store.$rows
        .get()
        .map((row) => [row.image?.name, row.artwork?.width, row.artwork?.height]),
      count: store.pack().miniCount,
      revisionChanged: store.$revision.get() !== revision,
    }).toEqual({
      preparing: false,
      started: true,
      rows: [['front.png', 1, 1]],
      count: 1,
      revisionChanged: false,
    });
  },
);

test.each([false, true])(
  'a file selected while locked cannot publish after unlock (back=%s)',
  async (back) => {
    // #given
    const store = setup();
    const id = store.addBlank()!;
    const original = new File([png], 'original.png', { type: 'image/png' });
    await store.setImage(id, original);
    await store.setImage(id, original, true);
    const slow = deferredFile();
    store.beginGeneration();
    // #when
    const pending = store.setImage(id, slow.file, back);
    store.endGeneration();
    slow.release();
    await pending;
    const row = store.$rows.get()[0];
    // #then
    expect({
      front: [row.image?.name, row.artwork?.width, row.artwork?.height],
      back: [row.backImage?.name, row.backArtwork?.width, row.backArtwork?.height],
      preparing: store.$preparing.get(),
    }).toEqual({ front: ['original.png', 1, 1], back: ['original.png', 1, 1], preparing: false });
  },
);

test('a late image cannot replace the newer selection', async () => {
  // #given
  const store = setup();
  const slow = deferredFile();
  const id = store.addBlank()!;
  const pending = store.setImage(id, slow.file);
  const replacement = new File([png], 'new.png', { type: 'image/png' });
  // #when
  await store.setImage(id, replacement);
  slow.release();
  await pending;
  // #then
  expect(
    store.$rows.get().map((row) => [row.image?.name, row.artwork?.width, row.artwork?.height]),
  ).toEqual([['new.png', 1, 1]]);
});

test('clearing a loading back keeps the reflection and restores print readiness', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const slow = deferredFile();
  const pending = store.setImage(id, slow.file, true);
  const during = store.pack().miniCount;
  // #when
  store.clearBack(id);
  slow.release();
  await pending;
  // #then
  expect({ during, after: store.pack().miniCount, back: store.$rows.get()[0].backArtwork }).toEqual(
    { during: 0, after: 1, back: null },
  );
});

test('a broken back falls back to the front with a warning', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  // #when
  await store.setImage(id, new File(['broken'], 'back.png', { type: 'image/png' }), true);
  // #then
  expect({
    count: store.pack().miniCount,
    image: store.$rows.get()[0].backImage,
    warning: store.$rows.get()[0].backWarning,
  }).toEqual({
    count: 1,
    image: null,
    warning: 'Не удалось загрузить оборот. Будет использовано отражение лицевой стороны.',
  });
});

test('a failed front stays out of the print estimate and can be replaced', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File(['broken'], 'bad.png', { type: 'image/png' }));
  const failed = { count: store.pack().miniCount, error: store.$rows.get()[0].frontError };
  // #when
  await store.setImage(id, new File([png], 'good.png', { type: 'image/png' }));
  // #then
  expect({ failed, count: store.pack().miniCount, error: store.$rows.get()[0].frontError }).toEqual(
    {
      failed: { count: 0, error: 'Не удалось загрузить изображение. Попробуйте другой файл.' },
      count: 1,
      error: undefined,
    },
  );
});

test('a dropped front and back pair loads into one row with both sides', async () => {
  // #given
  const store = setup();
  const front = new File([png], 'goblin.png', { type: 'image/png' });
  const back = new File([png], 'goblin-back.png', { type: 'image/png' });
  const settled = new Promise<void>((resolve) => {
    const unsubscribe = store.$preparing.listen((preparing) => {
      if (!preparing) {
        unsubscribe();
        resolve();
      }
    });
  });
  // #when
  store.ingest([front, back]);
  await settled;
  // #then
  expect(
    store.$rows.get().map((row) => ({
      name: row.name,
      front: row.image?.name,
      back: row.backImage?.name,
      backReady: row.backArtwork !== null && row.backArtwork !== undefined,
    })),
  ).toEqual([{ name: 'Goblin', front: 'goblin.png', back: 'goblin-back.png', backReady: true }]);
});

test('a batch row keeps its planned name through image replacement and duplication', async () => {
  // #given
  const store = setup();
  store.ingest([new File([png], 'big-bad_wolf.PNG', { type: 'image/png' })]);
  const id = store.$rows.get()[0].id;
  // #when
  await store.setImage(id, new File([png], 'retouched.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'wolf-back.png', { type: 'image/png' }), true);
  store.duplicate(id);
  // #then
  expect(store.$rows.get().map((row) => row.name)).toEqual(['Big bad wolf', 'Big bad wolf']);
});

test('a batch row lands on the size its file name carries', () => {
  // #given
  const store = setup();
  // #when
  store.ingest([new File([png], 'ogre-large.png', { type: 'image/png' })]);
  // #then
  expect(store.$rows.get().map((row) => [row.name, row.heightSlot])).toEqual([['Ogre', 'large']]);
});

test('a single-slot upload ignores the size in its file name', async () => {
  // #given
  const store = setup();
  store.ingest([new File([png], 'ogre.png', { type: 'image/png' })]);
  const id = store.$rows.get()[0].id;
  // #when
  await store.setImage(id, new File([png], 'ogre-gargantuan.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'ogre-tiny-back.png', { type: 'image/png' }), true);
  // #then
  expect(store.$rows.get()[0].heightSlot).toBe('medium');
});
