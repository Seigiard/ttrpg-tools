import { afterEach, expect, test } from 'bun:test';
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

test('a removed row’s late load neither restores it nor invalidates the preview', async () => {
  // #given
  const store = setup();
  const slow = deferredFile();
  const id = store.addBlank();
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

test('a late image cannot replace the newer selection', async () => {
  // #given
  const store = setup();
  const slow = deferredFile();
  const id = store.addBlank();
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
  const id = store.addBlank();
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
  const id = store.addBlank();
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
  const id = store.addBlank();
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
