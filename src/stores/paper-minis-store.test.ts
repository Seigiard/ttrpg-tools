import { afterEach, expect, spyOn, test } from 'bun:test';
import { createPaperMinisStore, type PaperMinisRenderer } from './paper-minis-store';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function setup(renderer?: PaperMinisRenderer) {
  const store = createPaperMinisStore(renderer);
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

test('download renders the layout shown by the counter and returns the renderer bytes', async () => {
  // #given
  const bytes = Uint8Array.from([11, 22, 33]);
  let rendered: Parameters<PaperMinisRenderer> | undefined;
  const store = setup(async (...input) => {
    rendered = input;
    return bytes;
  });
  const id = store.addBlank()!;
  const file = new File([png], 'front.png', { type: 'image/png' });
  await store.setImage(id, file);
  const counterLayout = store.pack();
  // #when
  const result = await store.download();
  // #then
  expect({
    bytes: result && Array.from(result),
    rows: rendered?.[0].map((row) => row.id),
    sameLayout: rendered?.[1] === counterLayout,
    settings: rendered?.[2],
    busy: store.$busy.get(),
    message: store.$message.get(),
  }).toEqual({
    bytes: [11, 22, 33],
    rows: [id],
    sameLayout: true,
    settings: {
      pageSize: 'a4',
      marginMm: 2,
      numberDuplicates: false,
      normalization: false,
    },
    busy: false,
    message: 'PDF готов.',
  });
});

test('a render failure releases the generation lock and reports the failure', async () => {
  // #given
  const store = setup(async () => {
    throw new Error('renderer failed');
  });
  await store.setImage(
    store.addBlank()!,
    new File([png], 'front.png', { type: 'image/png' }),
  );
  // #when
  const result = await store.download();
  // #then
  expect({ result, busy: store.$busy.get(), message: store.$message.get() }).toEqual({
    result: undefined,
    busy: false,
    message: 'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.',
  });
});

test('a preview records its revision and becomes stale after an edit', async () => {
  // #given
  const bytes = Uint8Array.from([44, 55]);
  const store = setup(async () => bytes);
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const revision = store.$revision.get();
  // #when
  await store.refreshPreview();
  const current = {
    preview: store.$preview.get(),
    stale: store.$previewStale.get(),
  };
  store.patch(id, { count: 2 });
  // #then
  expect({
    current: {
      bytes: current.preview && Array.from(current.preview.bytes),
      revisionMatches: current.preview?.revision === revision,
      stale: current.stale,
    },
    revisionAdvanced: store.$revision.get() === revision + 1,
    stale: store.$previewStale.get(),
  }).toEqual({
    current: { bytes: [44, 55], revisionMatches: true, stale: false },
    revisionAdvanced: true,
    stale: true,
  });
});

test('a second generation call does nothing while the renderer is pending', async () => {
  // #given
  let release!: (bytes: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const store = setup(() => {
    calls++;
    return pending;
  });
  await store.setImage(
    store.addBlank()!,
    new File([png], 'front.png', { type: 'image/png' }),
  );
  // #when
  const download = store.download();
  const preview = await store.refreshPreview();
  release(Uint8Array.from([66]));
  const result = await download;
  // #then
  expect({
    calls,
    preview,
    storedPreview: store.$preview.get(),
    result: result && Array.from(result),
    busy: store.$busy.get(),
  }).toEqual({
    calls: 1,
    preview: undefined,
    storedPreview: undefined,
    result: [66],
    busy: false,
  });
});

test('generation keeps every row and setting mutation locked until rendering settles', async () => {
  // #given
  let release!: (bytes: Uint8Array) => void;
  const rendering = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  const store = setup(() => rendering);
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
  const download = store.download();
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
  release(Uint8Array.from([1]));
  await download;
  store.patch(id, { count: 3 });
  // #then
  expect({
    sameSnapshot:
      during.rows === before.rows &&
      during.settings === before.settings &&
      during.revision === before.revision,
    busy: store.$busy.get(),
    count: store.pack().miniCount,
  }).toEqual({ sameSnapshot: true, busy: false, count: 3 });
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
  let renders = 0;
  const store = setup(async () => {
    renders++;
    return Uint8Array.from([1]);
  });
  await store.setImage(store.addBlank()!, new File([png], 'front.png', { type: 'image/png' }));
  const slow = deferredFile();
  const pending = store.setImage(store.addBlank()!, slow.file);
  // #when
  const during = {
    preparing: store.$preparing.get(),
    result: await store.download(),
    count: store.pack().miniCount,
  };
  slow.release();
  await pending;
  const after = {
    preparing: store.$preparing.get(),
    result: Array.from((await store.download()) ?? []),
    count: store.pack().miniCount,
  };
  // #then
  expect({ during, after, renders }).toEqual({
    during: { preparing: true, result: undefined, count: 1 },
    after: { preparing: false, result: [1], count: 2 },
    renders: 1,
  });
});

test('a normalization job keeps generation unavailable until its failure fallback is published', async () => {
  // #given
  let renders = 0;
  const store = setup(async () => {
    renders++;
    return Uint8Array.from([1]);
  });
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
    const during = await store.download();
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
    const after = await store.download();
    // #then
    expect({
      during,
      after: after && Array.from(after),
      renders,
      count: store.pack().miniCount,
      warning: store.$rows.get()[0].normalizationWarning,
    }).toEqual({
      during: undefined,
      after: [1],
      renders: 1,
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
    const store = setup(async () => Uint8Array.from([1]));
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
    const generated = await store.download();
    const revision = store.$revision.get();
    slow.release();
    await pending;
    // #then
    expect({
      preparing,
      generated: generated && Array.from(generated),
      rows: store.$rows
        .get()
        .map((row) => [row.image?.name, row.artwork?.width, row.artwork?.height]),
      count: store.pack().miniCount,
      revisionChanged: store.$revision.get() !== revision,
    }).toEqual({
      preparing: false,
      generated: [1],
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
    let finish!: (bytes: Uint8Array) => void;
    const rendering = new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    });
    const store = setup(() => rendering);
    const id = store.addBlank()!;
    const original = new File([png], 'original.png', { type: 'image/png' });
    await store.setImage(id, original);
    await store.setImage(id, original, true);
    const slow = deferredFile();
    const download = store.download();
    // #when
    await store.setImage(id, slow.file, back);
    finish(Uint8Array.from([1]));
    await download;
    slow.release();
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

test('duplicating while a missing back loads keeps calibration on the copy', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  store.setCalibration(id, { head: 0.2, feet: 0.8 });
  const slow = deferredFile();
  const pending = store.setImage(id, slow.file, true);
  const settled = new Promise<void>((resolve) => {
    const unsubscribe = store.$preparing.listen((preparing) => {
      if (!preparing) {
        unsubscribe();
        resolve();
      }
    });
  });
  // #when
  store.duplicate(id);
  const calibrations = store.$rows.get().map((row) => row.calibration);
  slow.release();
  await Promise.all([pending, settled]);
  // #then
  expect(calibrations).toEqual([
    { head: 0.2, feet: 0.8 },
    { head: 0.2, feet: 0.8 },
  ]);
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

test('calibration can be set, cleared, copied and kept across size changes', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  // #when
  store.setCalibration(id, { head: 0.25, feet: 0.75 });
  store.patch(id, { heightSlot: 'large' });
  store.duplicate(id);
  store.clearCalibration(id);
  // #then
  expect(store.$rows.get().map((row) => row.calibration)).toEqual([
    undefined,
    { head: 0.25, feet: 0.75 },
  ]);
});

test('adding a missing back keeps calibration', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  store.setCalibration(id, { head: 0.2, feet: 0.8 });
  // #when
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  // #then
  expect(store.$rows.get()[0].calibration).toEqual({ head: 0.2, feet: 0.8 });
});

test.each([false, true])(
  'replacing an existing image resets calibration (back=%s)',
  async (back) => {
    // #given
    const store = setup();
    const id = store.addBlank()!;
    await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
    if (back) await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
    store.setCalibration(id, { head: 0.2, feet: 0.8 });
    // #when
    await store.setImage(id, new File([png], 'replacement.png', { type: 'image/png' }), back);
    // #then
    expect(store.$rows.get()[0].calibration).toBe(undefined);
  },
);

test('normalization clears calibration on a row with loaded front and back images', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  store.setCalibration(id, { head: 0.2, feet: 0.8 });
  // happy-dom has no bitmap decoder. The reset must also survive trim fallback.
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  const settled = new Promise<void>((resolve) => {
    const unsubscribe = store.$preparing.listen((preparing) => {
      if (!preparing) {
        unsubscribe();
        resolve();
      }
    });
  });
  try {
    // #when
    store.settings({ normalization: true });
    const during = store.$rows.get()[0];
    await settled;
    const after = store.$rows.get()[0];
    // #then
    expect(
      [during, after].map((row) => [row.image?.name, row.backImage?.name, row.calibration]),
    ).toEqual([
      ['front.png', 'back.png', undefined],
      ['front.png', 'back.png', undefined],
    ]);
  } finally {
    errors.mockRestore();
  }
});

test('removing one of two sides keeps calibration', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  store.setCalibration(id, { head: 0.2, feet: 0.8 });
  // #when
  store.clearBack(id);
  const row = store.$rows.get()[0];
  // #then
  expect([row.backImage, row.backArtwork, row.calibration]).toEqual([
    null,
    null,
    { head: 0.2, feet: 0.8 },
  ]);
});

test('removing the only image resets calibration', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  store.setCalibration(id, { head: 0.2, feet: 0.8 });
  // #when
  store.clearBack(id);
  // #then
  expect(store.$rows.get()[0].calibration).toBe(undefined);
});
