import { afterEach, expect, test } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  DEFAULT_CUSTOM_WIDTH_MM,
} from '@/lib/paper-minis/sizes';
import type { HeightCalibration, PreparedArtwork } from '@/lib/paper-minis/types';
import {
  createPaperMinisStore,
  type ArtworkPreparation,
  type PaperMinisArtwork,
  type PaperMinisRenderer,
  type PaperMinisSettings,
} from './paper-minis-store';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const preparation = Symbol('preparation');
type ControlledFile = File & {
  [preparation]?: Promise<ArtworkPreparation>;
};

function preparedArtwork(width = 1, height = 1): PreparedArtwork {
  return { bytes: Uint8Array.from([1]), format: 'png', width, height };
}
function artworkFile(width: number, height: number, name = 'front.png') {
  const file = new File([png], name, { type: 'image/png' }) as ControlledFile;
  file[preparation] = Promise.resolve({ artwork: preparedArtwork(width, height) });
  return file;
}
function zipFile(entries: Record<string, Uint8Array>, name = 'paper-minis.zip') {
  return new File([zipSync(entries)], name, { type: 'application/zip' });
}
function fakeArtwork(): PaperMinisArtwork {
  return {
    prepare(file) {
      return (file as ControlledFile)[preparation] ?? Promise.resolve({ artwork: preparedArtwork() });
    },
  };
}
function setup(renderer?: PaperMinisRenderer, artwork = fakeArtwork()) {
  return createPaperMinisStore({ renderer, artwork });
}
function calibrate(
  store: ReturnType<typeof createPaperMinisStore>,
  id: number,
  calibration: HeightCalibration,
) {
  if (!store.openCalibration(id)) throw new Error('Expected calibration to open');
  store.setCalibrationLine('head', calibration.head);
  store.setCalibrationLine('feet', calibration.feet);
  if (!store.applyCalibration()) throw new Error('Expected calibration to apply');
}
function deferredFile() {
  let release!: (result: ArtworkPreparation) => void;
  const pending = new Promise<ArtworkPreparation>((resolve) => {
    release = resolve;
  });
  const file = new File(['slow'], 'slow.png', { type: 'image/png' }) as ControlledFile;
  file[preparation] = pending;
  return { file, release: () => release({ artwork: preparedArtwork(1, 100) }) };
}
function deferredZipFile(entries: Record<string, Uint8Array>) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrayBufferStarted!: () => void;
  const arrayBufferCalled = new Promise<void>((resolve) => {
    arrayBufferStarted = resolve;
  });
  const bytes = zipSync(entries);
  const file = new File([], 'paper-minis.zip', { type: 'application/zip' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => {
      arrayBufferStarted();
      await pending;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  });
  return { file, arrayBufferCalled, release };
}
function failedFile(name: string) {
  const file = new File(['broken'], name, { type: 'image/png' }) as ControlledFile;
  file[preparation] = Promise.reject(new Error('Artwork preparation failed'));
  return file;
}
afterEach(() => localStorage.removeItem('pmg-settings'));

test('switching a row to custom size seeds valid default dimensions', () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  // #when
  store.setSize(id, 'custom');
  // #then
  expect({
    row: store.$rows.get()[0],
    inputs: store.$inputs.get().rows[id],
  }).toEqual({
    row: {
      id,
      image: null,
      artwork: null,
      heightSlot: 'custom',
      count: 1,
      customWidthMm: DEFAULT_CUSTOM_WIDTH_MM,
      customHeightMm: DEFAULT_CUSTOM_HEIGHT_MM,
    },
    inputs: {
      count: { text: '1', valid: true },
      customWidthMm: { text: '30', valid: true },
      customHeightMm: { text: '30', valid: true },
    },
  });
});

test('setting every row size advances the revision once', () => {
  // #given
  const store = setup();
  store.addBlank();
  store.addBlank({ heightSlot: 'small' });
  const revision = store.$revision.get();
  // #when
  store.setAllSizes('large');
  // #then
  expect({
    sizes: store.$rows.get().map((row) => row.heightSlot),
    revision: store.$revision.get() - revision,
  }).toEqual({ sizes: ['large', 'large'], revision: 1 });
});

test.each(['', '-', '2.7', '0'])(
  'committing an invalid count draft %j restores the committed count',
  (text) => {
    // #given
    const store = setup();
    const id = store.addBlank()!;
    store.setCount(id, '3');
    // #when
    store.setCount(id, text);
    const invalid = {
      count: store.$rows.get()[0].count,
      input: store.$inputs.get().rows[id].count,
      valid: store.$inputsValid.get(),
    };
    store.commitCount(id);
    // #then
    expect({ invalid, reverted: store.$inputs.get().rows[id].count }).toEqual({
      invalid: { count: 3, input: { text, valid: false }, valid: false },
      reverted: { text: '3', valid: true },
    });
  },
);

test('committing a valid count draft keeps its text unchanged', () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  store.setCount(id, '01');
  // #when
  store.commitCount(id);
  // #then
  expect(store.$inputs.get().rows[id].count).toEqual({ text: '01', valid: true });
});

test('a finite scientific-notation count updates the model', () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  // #when
  store.setCount(id, '1e3');
  // #then
  expect({ count: store.$rows.get()[0].count, input: store.$inputs.get().rows[id].count }).toEqual({
    count: 1000,
    input: { text: '1e3', valid: true },
  });
});

test('committing an invalid custom dimension restores its committed value', () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  store.setSize(id, 'custom');
  store.setCustomDimensions(id, { height: '40' });
  // #when
  store.setCustomDimensions(id, { width: '12.5', height: '-' });
  const invalid = {
    row: store.$rows.get()[0],
    inputs: store.$inputs.get().rows[id],
    valid: store.$inputsValid.get(),
  };
  store.commitCustomDimension(id, 'height');
  // #then
  expect({
    invalid: {
      dimensions: [invalid.row.customWidthMm, invalid.row.customHeightMm],
      inputs: [invalid.inputs.customWidthMm, invalid.inputs.customHeightMm],
      valid: invalid.valid,
    },
    reverted: store.$inputs.get().rows[id].customHeightMm,
  }).toEqual({
    invalid: {
      dimensions: [12.5, 40],
      inputs: [
        { text: '12.5', valid: true },
        { text: '-', valid: false },
      ],
      valid: false,
    },
    reverted: { text: '40', valid: true },
  });
});

test('committing a valid custom dimension keeps its text unchanged', () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  store.setSize(id, 'custom');
  store.setCustomDimensions(id, { width: '030' });
  // #when
  store.commitCustomDimension(id, 'width');
  // #then
  expect(store.$inputs.get().rows[id].customWidthMm).toEqual({ text: '030', valid: true });
});

test('committing an invalid margin draft restores the committed margin', () => {
  // #given
  const store = setup();
  store.setMargin('5');
  // #when
  store.setMargin('-');
  const invalid = {
    margin: store.$settings.get().marginMm,
    input: store.$inputs.get().margin,
    valid: store.$inputsValid.get(),
  };
  store.commitMargin();
  // #then
  expect({
    invalid,
    reverted: store.$inputs.get().margin,
  }).toEqual({
    invalid: { margin: 5, input: { text: '-', valid: false }, valid: false },
    reverted: { text: '5', valid: true },
  });
});

test('committing a valid margin draft keeps its text unchanged', () => {
  // #given
  const store = setup();
  store.setMargin('1e1');
  // #when
  store.commitMargin();
  // #then
  expect({ margin: store.$settings.get().marginMm, input: store.$inputs.get().margin }).toEqual({
    margin: 10,
    input: { text: '1e1', valid: true },
  });
});

test.each([
  [
    'copy count',
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => store.setCount(id, ''),
    'Количество должно быть целым числом от 1, размеры — больше 0 мм.',
  ],
  [
    'custom size',
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => {
      store.setSize(id, 'custom');
      store.setCustomDimensions(id, { width: '0' });
    },
    'Количество должно быть целым числом от 1, размеры — больше 0 мм.',
  ],
  [
    'figure margin',
    (store: ReturnType<typeof createPaperMinisStore>) => store.setMargin('-1'),
    'Поля должны быть числом от 0 мм.',
  ],
] as const)('the draft error explains an invalid %s', (_, invalidate, expected) => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  const before = store.$draftError.get();
  // #when
  invalidate(store, id);
  // #then
  expect({ before, after: store.$draftError.get() }).toEqual({ before: '', after: expected });
});

test('direct and loaded settings reject the same invalid fields', () => {
  // #given
  const input = {
    pageSize: 'legal',
    marginMm: -1,
    numberDuplicates: 'yes',
    normalization: false,
  };
  const direct = createPaperMinisStore();
  const loaded = createPaperMinisStore();
  localStorage.setItem('pmg-settings', JSON.stringify(input));
  // #when
  loaded.loadSettings();
  direct.settings(input as unknown as Partial<PaperMinisSettings>);
  // #then
  expect({ direct: direct.$settings.get(), loaded: loaded.$settings.get() }).toEqual({
    direct: {
      pageSize: 'a4',
      marginMm: 2,
      numberDuplicates: false,
      normalization: false,
    },
    loaded: {
      pageSize: 'a4',
      marginMm: 2,
      numberDuplicates: false,
      normalization: false,
    },
  });
});

test('a printer measurement resolves to the scale used for layout and PDF generation', async () => {
  // #given
  let rendered: Parameters<PaperMinisRenderer> | undefined;
  const store = setup(async (...input) => {
    rendered = input;
    return Uint8Array.from([1]);
  });
  const id = store.addBlank()!;
  await store.setImage(id, artworkFile(10, 20));
  // #when
  store.setPrinterMeasurement('95');
  await store.download();

  // #then
  expect({
    canGenerate: store.$canGenerate.get(),
    measurement: store.$settings.get().printerMeasurementMm,
    input: store.$inputs.get().printerMeasurement,
    renderedScale: rendered?.[2].printerScale,
  }).toEqual({
    canGenerate: true,
    measurement: 95,
    input: { text: '95', valid: true },
    renderedScale: 0.95,
  });
});

test.each(['79.9', '100.1', 'not a number'])(
  'an invalid printer measurement %j keeps the previous scale',
  (measurement) => {
    // #given
    const store = setup();
    store.setPrinterMeasurement('95');

    // #when
    store.setPrinterMeasurement(measurement);

    // #then
    expect({
      measurement: store.$settings.get().printerMeasurementMm,
      input: store.$inputs.get().printerMeasurement,
      valid: store.$inputsValid.get(),
    }).toEqual({
      measurement: 95,
      input: { text: measurement, valid: false },
      valid: false,
    });
  },
);

test('clearing a printer measurement restores the default scale', async () => {
  // #given
  let rendered: Parameters<PaperMinisRenderer> | undefined;
  const store = setup(async (...input) => {
    rendered = input;
    return Uint8Array.from([1]);
  });
  const id = store.addBlank()!;
  await store.setImage(id, artworkFile(10, 20));
  store.setPrinterMeasurement('95');

  // #when
  store.setPrinterMeasurement('');
  await store.download();

  // #then
  expect({
    measurement: store.$settings.get().printerMeasurementMm,
    input: store.$inputs.get().printerMeasurement,
    renderedScale: rendered?.[2].printerScale,
  }).toEqual({
    measurement: undefined,
    input: { text: '', valid: true },
    renderedScale: 0.91,
  });
});

test('a stored valid printer measurement is restored and an invalid one clears a previous measurement', () => {
  // #given
  const saved = setup();
  saved.setPrinterMeasurement('91');
  const valid = setup();
  valid.loadSettings();
  const invalid = setup();
  invalid.setPrinterMeasurement('95');
  localStorage.setItem('pmg-settings', JSON.stringify({ printerMeasurementMm: 101 }));

  // #when
  invalid.loadSettings();

  // #then
  expect({
    valid: valid.$settings.get().printerMeasurementMm,
    invalid: invalid.$settings.get().printerMeasurementMm,
  }).toEqual({ valid: 91, invalid: undefined });
});

test('a printer measurement remains available when persistent storage is unavailable', () => {
  // #given
  const setItem = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('Storage unavailable');
  };
  const store = setup();

  try {
    // #when
    store.setPrinterMeasurement('92');

    // #then
    expect(store.$settings.get().printerMeasurementMm).toBe(92);
  } finally {
    localStorage.setItem = setItem;
  }
});

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
  const counterLayout = store.$layout.get();
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
      printerScale: 0.91,
    },
    busy: false,
    message: 'PDF готов.',
  });
});

test('export zip restores names, sizes, counts, calibration and sides through batch ingest', async () => {
  // #given
  const store = setup();
  const goblin = store.addBlank({ name: 'Goblin', heightSlot: 'small' })!;
  store.setCount(goblin, '2');
  await store.setImage(goblin, artworkFile(10, 20, 'goblin-front.png'));
  await store.setImage(goblin, artworkFile(11, 20, 'goblin-back.png'), true);
  calibrate(store, goblin, { head: 0.2, feet: 0.8 });
  const troll = store.addBlank({ name: 'Troll', heightSlot: 'medium' })!;
  await store.setImage(troll, artworkFile(10, 20, 'troll-front.png'));
  calibrate(store, troll, { head: 0.2, feet: 1 });
  const empty = store.addBlank({ name: '', heightSlot: 'large' })!;
  await store.setImage(empty, artworkFile(12, 20, 'empty.png'));
  const custom = store.addBlank({ name: 'Dragon', heightSlot: 'custom' })!;
  store.setCustomDimensions(custom, { width: '30', height: '45' });
  store.setCount(custom, '3');
  await store.setImage(custom, artworkFile(12, 24, 'dragon.png'));
  const duplicate = store.addBlank({ name: 'Goblin', heightSlot: 'small' })!;
  await store.setImage(duplicate, artworkFile(13, 20, 'duplicate.png'));
  await store.setImage(duplicate, artworkFile(13, 20, 'duplicate-back.png'), true);

  // #when
  const bytes = await store.exportZip();
  const entries = bytes ? unzipSync(bytes) : {};
  const extracted = Object.entries(entries).map(
    ([name, fileBytes]) => new File([fileBytes], name, { type: 'image/png' }),
  );
  const restored = setup();
  restored.ingest(extracted);
  await Promise.resolve();

  // #then
  expect({
    entryNames: Object.keys(entries).toSorted(),
    message: store.$message.get(),
    rows: restored.$rows.get().map((row) => ({
      name: row.name,
      heightSlot: row.heightSlot,
      count: row.count,
      customWidthMm: row.customWidthMm,
      customHeightMm: row.customHeightMm,
      calibration: row.calibration,
      front: row.image?.name,
      back: row.backImage?.name,
      inputs: restored.$inputs.get().rows[row.id],
    })),
  }).toEqual({
    entryNames: [
      'Dragon-custom-30x45-front-x3.png',
      'Goblin-2-small-back.png',
      'Goblin-2-small-front.png',
      'Goblin-small-back-x2-h200-f800.png',
      'Goblin-small-front-x2-h200-f800.png',
      'Troll-medium-front-h200-f1000.png',
      'mini-3-large-front.png',
    ],
    message: 'Архив готов.',
    rows: [
      {
        name: 'Goblin',
        heightSlot: 'small',
        count: 2,
        customWidthMm: undefined,
        customHeightMm: undefined,
        calibration: { head: 0.2, feet: 0.8 },
        front: 'Goblin-small-front-x2-h200-f800.png',
        back: 'Goblin-small-back-x2-h200-f800.png',
        inputs: {
          count: { text: '2', valid: true },
          customWidthMm: { text: '', valid: false },
          customHeightMm: { text: '', valid: false },
        },
      },
      {
        name: 'Troll',
        heightSlot: 'medium',
        count: 1,
        customWidthMm: undefined,
        customHeightMm: undefined,
        calibration: { head: 0.2, feet: 1 },
        front: 'Troll-medium-front-h200-f1000.png',
        back: undefined,
        inputs: {
          count: { text: '1', valid: true },
          customWidthMm: { text: '', valid: false },
          customHeightMm: { text: '', valid: false },
        },
      },
      {
        name: 'Mini 3',
        heightSlot: 'large',
        count: 1,
        customWidthMm: undefined,
        customHeightMm: undefined,
        calibration: undefined,
        front: 'mini-3-large-front.png',
        back: undefined,
        inputs: {
          count: { text: '1', valid: true },
          customWidthMm: { text: '', valid: false },
          customHeightMm: { text: '', valid: false },
        },
      },
      {
        name: 'Dragon',
        heightSlot: 'custom',
        count: 3,
        customWidthMm: 30,
        customHeightMm: 45,
        calibration: undefined,
        front: 'Dragon-custom-30x45-front-x3.png',
        back: undefined,
        inputs: {
          count: { text: '3', valid: true },
          customWidthMm: { text: '30', valid: true },
          customHeightMm: { text: '45', valid: true },
        },
      },
      {
        name: 'Goblin 2',
        heightSlot: 'small',
        count: 1,
        customWidthMm: undefined,
        customHeightMm: undefined,
        calibration: undefined,
        front: 'Goblin-2-small-front.png',
        back: 'Goblin-2-small-back.png',
        inputs: {
          count: { text: '1', valid: true },
          customWidthMm: { text: '', valid: false },
          customHeightMm: { text: '', valid: false },
        },
      },
    ],
  });
});

test('export zip separates reserved filename characters and compares collisions case-insensitively', async () => {
  // #given
  const store = setup();
  for (const name of ['Orc/Chief', 'orc chief', 'Mage:Boss*Elite?One"Two<Three>Four|Five\\Six']) {
    const id = store.addBlank({ name, heightSlot: 'small' })!;
    await store.setImage(id, artworkFile(10, 20, `${name}.png`));
  }

  // #when
  const bytes = await store.exportZip();
  const entries = bytes ? Object.keys(unzipSync(bytes)).toSorted() : [];

  // #then
  expect(entries).toEqual([
    'Mage-Boss-Elite-One-Two-Three-Four-Five-Six-small-front.png',
    'Orc-Chief-small-front.png',
    'orc-chief-2-small-front.png',
  ]);
});

test('export zip bytes can be dropped straight onto a fresh store', async () => {
  // #given
  const store = setup();
  const goblin = store.addBlank({ name: 'Goblin', heightSlot: 'small' })!;
  await store.setImage(goblin, artworkFile(10, 20, 'goblin-front.png'));
  await store.setImage(goblin, artworkFile(11, 20, 'goblin-back.png'), true);
  const empty = store.addBlank({ name: '', heightSlot: 'large' })!;
  await store.setImage(empty, artworkFile(12, 20, 'empty.png'));

  // #when
  const bytes = await store.exportZip();
  const restored = setup();
  await restored.ingest([new File([bytes!], 'paper-minis.zip', { type: 'application/zip' })]);

  // #then
  expect(
    restored.$rows.get().map((row) => ({
      name: row.name,
      heightSlot: row.heightSlot,
      front: row.image?.name,
      back: row.backImage?.name,
    })),
  ).toEqual([
    {
      name: 'Goblin',
      heightSlot: 'small',
      front: 'Goblin-small-front.png',
      back: 'Goblin-small-back.png',
    },
    {
      name: 'Mini 2',
      heightSlot: 'large',
      front: 'mini-2-large-front.png',
      back: undefined,
    },
  ]);
});

test('a zip and loose images are flattened into one batch plan', async () => {
  // #given
  const store = setup();
  const zip = zipFile({ 'nested/goblin-back.png': Uint8Array.from(png) });
  const front = new File([png], 'goblin-front.png', { type: 'image/png' });

  // #when
  await store.ingest([zip, front]);

  // #then
  expect(
    store.$rows.get().map((row) => ({
      name: row.name,
      front: row.image?.name,
      back: row.backImage?.name,
    })),
  ).toEqual([{ name: 'Goblin', front: 'goblin-front.png', back: 'goblin-back.png' }]);
});

test('a zip with a non-image entry reports skipped files', async () => {
  // #given
  const store = setup();
  const zip = zipFile({
    'goblin.png': Uint8Array.from(png),
    'notes.txt': Uint8Array.from([110, 111, 116, 101, 115]),
  });

  // #when
  await store.ingest([zip]);

  // #then
  expect({
    message: store.$message.get(),
    rows: store.$rows.get().map((row) => row.image?.name),
  }).toEqual({
    message: 'Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.',
    rows: ['goblin.png'],
  });
});

test('a broken zip reports an archive failure and still imports loose images', async () => {
  // #given
  const store = setup();
  const zip = new File([Uint8Array.from([1, 2, 3])], 'broken.zip', { type: 'application/zip' });
  const front = new File([png], 'goblin.png', { type: 'image/png' });

  // #when
  await store.ingest([zip, front]);

  // #then
  expect({ message: store.$message.get(), rows: store.$rows.get().map((row) => row.image?.name) }).toEqual({
    message: 'Не удалось распаковать архив. Добавьте изображения вручную или попробуйте другой файл.',
    rows: ['goblin.png'],
  });
});

test('zip expansion is preparing work that blocks generation and calibration', async () => {
  // #given
  const store = setup(async () => Uint8Array.from([1]));
  const existing = store.addBlank()!;
  await store.setImage(existing, artworkFile(10, 20, 'existing.png'));
  const slow = deferredZipFile({ 'goblin.png': Uint8Array.from(png) });

  // #when
  const ingest = store.ingest([slow.file]);
  await slow.arrayBufferCalled;
  const during = {
    preparing: store.$preparing.get(),
    download: await store.download(),
    exportBytes: await store.exportZip(),
    calibrationOpened: store.openCalibration(existing),
    rows: store.$rows.get().map((row) => row.image?.name),
  };
  slow.release();
  await ingest;

  // #then
  expect({
    during,
    after: {
      preparing: store.$preparing.get(),
      rows: store.$rows.get().map((row) => row.image?.name),
    },
  }).toEqual({
    during: {
      preparing: true,
      download: undefined,
      exportBytes: undefined,
      calibrationOpened: false,
      rows: ['existing.png'],
    },
    after: { preparing: false, rows: ['existing.png', 'goblin.png'] },
  });
});

test('export zip decodes JPEG artwork without EXIF orientation and releases the canvas', async () => {
  // #given
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  const calls: unknown[] = [];
  let closed = false;
  globalThis.createImageBitmap = ((...args: unknown[]) => {
    calls.push(args[1]);
    return Promise.resolve({ width: 2, height: 3, close: () => (closed = true) } as ImageBitmap);
  }) as typeof createImageBitmap;
  const canvas = document.createElement('canvas');
  const originalCreateElement = document.createElement.bind(document);
  const released: number[] = [];
  const originalWidth = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  Object.defineProperty(canvas, 'width', {
    get: () => 2,
    set: (value) => released.push(value),
  });
  Object.defineProperty(canvas, 'height', {
    get: () => 3,
    set: (value) => released.push(value),
  });
  Object.defineProperty(canvas, 'getContext', {
    value: () => ({ drawImage() {} }),
  });
  Object.defineProperty(canvas, 'toBlob', {
    value: (callback: (blob: Blob | null) => void) => callback(new Blob([png], { type: 'image/png' })),
  });
  document.createElement = ((tagName: string, options?: ElementCreationOptions) =>
    tagName === 'canvas' ? canvas : originalCreateElement(tagName, options)) as typeof document.createElement;
  const artwork: PaperMinisArtwork = {
    prepare: () =>
      Promise.resolve({ artwork: { bytes: Uint8Array.from([255, 216, 255, 217]), format: 'jpg', width: 2, height: 3 } }),
  };
  const store = setup(undefined, artwork);
  await store.setImage(store.addBlank({ name: 'Photo' })!, new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }));

  try {
    // #when
    const bytes = await store.exportZip();
    // #then
    expect({
      entries: bytes ? Object.keys(unzipSync(bytes)) : [],
      options: calls,
      closed,
      released: released.slice(-2),
    }).toEqual({
      entries: ['Photo-medium-front.png'],
      options: [{ imageOrientation: 'none' }],
      closed: true,
      released: [0, 0],
    });
  } finally {
    globalThis.createImageBitmap = previousCreateImageBitmap;
    document.createElement = originalCreateElement;
    if (originalWidth) Object.defineProperty(HTMLCanvasElement.prototype, 'width', originalWidth);
    if (originalHeight) Object.defineProperty(HTMLCanvasElement.prototype, 'height', originalHeight);
  }
});

test('zip folders and macOS metadata entries are ignored silently', async () => {
  // #given
  const store = setup();
  const zip = zipFile({
    'folder/': Uint8Array.from([]),
    '__MACOSX/._goblin-small-front.png': Uint8Array.from([1, 2, 3]),
    '.DS_Store': Uint8Array.from([1, 2, 3]),
    'folder/goblin-small-front.png': Uint8Array.from(png),
  });

  // #when
  await store.ingest([zip]);

  // #then
  expect({
    message: store.$message.get(),
    rows: store.$rows.get().map((row) => ({
      name: row.name,
      heightSlot: row.heightSlot,
      front: row.image?.name,
    })),
  }).toEqual({
    message: '',
    rows: [{ name: 'Goblin', heightSlot: 'small', front: 'goblin-small-front.png' }],
  });
});

test('export zip includes oversized artwork and skips rows without artwork', async () => {
  // #given
  const store = setup();
  const oversized = store.addBlank({ name: 'Castle', heightSlot: 'custom' })!;
  store.setCustomDimensions(oversized, { width: '10000', height: '10000' });
  await store.setImage(oversized, artworkFile(14, 20, 'castle.png'));
  store.addBlank({ name: 'Missing', heightSlot: 'huge' });

  // #when
  const bytes = await store.exportZip();
  const entries = bytes ? Object.keys(unzipSync(bytes)).toSorted() : [];

  // #then
  expect(entries).toEqual(['Castle-custom-10000x10000-front.png']);
});

test('a ready mini opens calibration while another mini is still preparing', async () => {
  // #given
  const store = setup();
  const ready = store.addBlank()!;
  await store.setImage(ready, artworkFile(10, 20, 'ready.png'));
  const slow = deferredFile();
  const pendingImage = store.setImage(store.addBlank()!, slow.file);

  // #when
  const opened = store.openCalibration(ready);
  store.cancelCalibration();
  slow.release();
  await pendingImage;

  // #then
  expect(opened).toBe(true);
});

test('export zip does nothing while locked, preparing, or without a ready mini', async () => {
  // #given
  let finish!: (bytes: Uint8Array) => void;
  const rendering = new Promise<Uint8Array>((resolve) => {
    finish = resolve;
  });
  const busy = setup(() => rendering);
  await busy.setImage(busy.addBlank()!, artworkFile(1, 1));
  const download = busy.download();

  const preparing = setup();
  const slow = deferredFile();
  const pendingImage = preparing.setImage(preparing.addBlank()!, slow.file);

  const empty = setup();
  empty.addBlank();
  const failed = setup();
  await failed.setImage(failed.addBlank()!, failedFile('broken.png'));

  // #when
  const results = await Promise.all([
    busy.exportZip(),
    preparing.exportZip(),
    empty.exportZip(),
    failed.exportZip(),
  ]);
  finish(Uint8Array.from([1]));
  slow.release();
  await Promise.all([download, pendingImage]);

  // #then
  expect(results).toEqual([undefined, undefined, undefined, undefined]);
});

test.each([
  [
    'copy count',
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => store.setCount(id, ''),
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => store.setCount(id, '1'),
  ],
  [
    'custom width',
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => {
      store.setSize(id, 'custom');
      store.setCustomDimensions(id, { width: '' });
    },
    (store: ReturnType<typeof createPaperMinisStore>, id: number) =>
      store.setCustomDimensions(id, { width: String(DEFAULT_CUSTOM_WIDTH_MM) }),
  ],
  [
    'custom height',
    (store: ReturnType<typeof createPaperMinisStore>, id: number) => {
      store.setSize(id, 'custom');
      store.setCustomDimensions(id, { height: '' });
    },
    (store: ReturnType<typeof createPaperMinisStore>, id: number) =>
      store.setCustomDimensions(id, { height: String(DEFAULT_CUSTOM_HEIGHT_MM) }),
  ],
  [
    'figure margin',
    (store: ReturnType<typeof createPaperMinisStore>) => store.setMargin(''),
    (store: ReturnType<typeof createPaperMinisStore>) => store.setMargin('2'),
  ],
] as const)(
  'download and preview reject an invalid %s draft until it is fixed',
  async (_, invalidate, fix) => {
    // #given
    let renders = 0;
    const bytes = Uint8Array.from([7]);
    const store = setup(async () => {
      renders++;
      return bytes;
    });
    const id = store.addBlank()!;
    await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
    invalidate(store, id);
    // #when
    const blockedDownload = await store.download();
    await store.refreshPreview();
    const blockedPreview = store.$preview.get();
    const rendersWhileInvalid = renders;
    fix(store, id);
    const download = await store.download();
    await store.refreshPreview();
    // #then
    expect({
      blockedDownload,
      blockedPreview,
      rendersWhileInvalid,
      download: download && Array.from(download),
      preview: store.$preview.get()?.bytes && Array.from(store.$preview.get()!.bytes),
      renders,
    }).toEqual({
      blockedDownload: undefined,
      blockedPreview: undefined,
      rendersWhileInvalid: 0,
      download: [7],
      preview: [7],
      renders: 2,
    });
  },
);

test('generation availability follows layout, drafts, preparation and rendering', async () => {
  // #given
  let finishRender!: (bytes: Uint8Array) => void;
  const rendering = new Promise<Uint8Array>((resolve) => {
    finishRender = resolve;
  });
  const store = setup(() => rendering);
  const availability = [store.$canGenerate.get()];
  const id = store.addBlank()!;
  availability.push(store.$canGenerate.get());
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  availability.push(store.$canGenerate.get());
  store.setCount(id, '');
  availability.push(store.$canGenerate.get());
  store.setCount(id, '1');
  availability.push(store.$canGenerate.get());
  const slow = deferredFile();
  const imagePreparation = store.setImage(store.addBlank()!, slow.file);
  availability.push(store.$canGenerate.get());
  slow.release();
  await imagePreparation;
  availability.push(store.$canGenerate.get());
  // #when
  const download = store.download();
  availability.push(store.$canGenerate.get());
  finishRender(Uint8Array.from([1]));
  await download;
  availability.push(store.$canGenerate.get());
  // #then
  expect(availability).toEqual([false, false, true, false, true, false, true, false, true]);
});

test('a calibration session previews draft edits and cancel leaves the row unchanged', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, artworkFile(1, 100, 'tall.png'));
  const revision = store.$revision.get();
  // #when
  const opened = store.openCalibration(id);
  store.moveCalibrationLine('head', 25);
  store.setCalibrationLine('feet', 0.75);
  const session = store.$calibration.get();
  store.cancelCalibration();
  // #then
  expect({
    opened,
    startingLines: session?.startingLines,
    lines: session?.lines,
    artworkHeight: session?.artworkHeight,
    ranges: session?.ranges,
    printedHeightMm: session?.printedHeightMm,
    warning: session?.warning,
    stored: store.$rows.get()[0].calibration,
    session: store.$calibration.get(),
    revision: store.$revision.get(),
  }).toEqual({
    opened: true,
    startingLines: { head: 0, feet: 1 },
    lines: { head: 0.25, feet: 0.75 },
    artworkHeight: 100,
    ranges: { head: { min: 0, max: 0.65 }, feet: { min: 0.35, max: 1 } },
    printedHeightMm: 70,
    warning: undefined,
    stored: undefined,
    session: undefined,
    revision,
  });
});

test('applying and resetting calibration each publish one row revision', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  store.openCalibration(id);
  store.setCalibrationLine('head', 0.25);
  const revision = store.$revision.get();
  // #when
  const applied = store.applyCalibration();
  const afterApply = store.$revision.get();
  store.resetCalibration(id);
  // #then
  expect({
    applied,
    afterApply: afterApply - revision,
    afterReset: store.$revision.get() - afterApply,
    calibration: store.$rows.get()[0].calibration,
    session: store.$calibration.get(),
  }).toEqual({
    applied: true,
    afterApply: 1,
    afterReset: 1,
    calibration: undefined,
    session: undefined,
  });
});

test('applying untouched default lines closes the session without changing the row revision', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  store.openCalibration(id);
  const revision = store.$revision.get();
  // #when
  const applied = store.applyCalibration();
  // #then
  expect({
    applied,
    session: store.$calibration.get(),
    calibration: store.$rows.get()[0].calibration,
    revision: store.$revision.get(),
  }).toEqual({ applied: true, session: undefined, calibration: undefined, revision });
});

test('a calibration session replaces an oversized warning when edited geometry fits', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, artworkFile(150, 100));
  store.setSize(id, 'custom');
  store.setCustomDimensions(id, { width: '10', height: '140' });
  store.openCalibration(id);
  const untouched = store.$calibration.get();
  // #when
  store.setCalibrationLine('head', 0.5);
  const edited = store.$calibration.get();
  // #then
  expect({
    untouched: {
      printedHeightMm: untouched?.printedHeightMm,
      warning: untouched?.warning,
    },
    edited: {
      printedHeightMm: edited?.printedHeightMm,
      warning: edited?.warning,
    },
  }).toEqual({
    untouched: {
      printedHeightMm: 140,
      warning: 'Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.',
    },
    edited: {
      printedHeightMm: 116.535,
      warning: 'Миниатюра уменьшена: лимит ширины, размер листа.',
    },
  });
});

test('applying rejects an invalid calibration draft', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  store.openCalibration(id);
  const revision = store.$revision.get();
  store.setCalibrationLine('head', Number.NaN);
  // #when
  const applied = store.applyCalibration();
  // #then
  expect({
    applied,
    open: store.$calibration.get() !== undefined,
    calibration: store.$rows.get()[0].calibration,
    revision: store.$revision.get(),
  }).toEqual({ applied: false, open: true, calibration: undefined, revision });
});

test('an open calibration session blocks batch and single-slot file intake', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  const original = new File([png], 'original.png', { type: 'image/png' });
  await store.setImage(id, original);
  store.openCalibration(id);
  const revision = store.$revision.get();
  // #when
  store.ingest([new File([png], 'batch.png', { type: 'image/png' })]);
  await store.setImage(id, new File([png], 'replacement.png', { type: 'image/png' }));
  // #then
  expect({
    acceptsFiles: store.$acceptsFiles.get(),
    rows: store.$rows.get().map((row) => row.image?.name),
    revision: store.$revision.get(),
  }).toEqual({ acceptsFiles: false, rows: ['original.png'], revision });
});

test('calibration cannot open without prepared front artwork or during PDF generation', async () => {
  // #given
  let finish!: (bytes: Uint8Array) => void;
  const rendering = new Promise<Uint8Array>((resolve) => {
    finish = resolve;
  });
  const store = setup(() => rendering);
  const id = store.addBlank()!;
  const withoutArtwork = store.openCalibration(id);
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const download = store.download();
  // #when
  const whileBusy = store.openCalibration(id);
  const acceptsWhileBusy = store.$acceptsFiles.get();
  finish(Uint8Array.from([1]));
  await download;
  // #then
  expect({
    withoutArtwork,
    whileBusy,
    session: store.$calibration.get(),
    acceptsWhileBusy,
    acceptsAfter: store.$acceptsFiles.get(),
  }).toEqual({
    withoutArtwork: false,
    whileBusy: false,
    session: undefined,
    acceptsWhileBusy: false,
    acceptsAfter: true,
  });
});

test('calibration cannot open while the selected back artwork is loading', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const slow = deferredFile();
  const pending = store.setImage(id, slow.file, true);
  // #when
  const whileLoading = store.openCalibration(id);
  slow.release();
  await pending;
  const afterLoading = store.openCalibration(id);
  // #then
  expect({ whileLoading, afterLoading, open: store.$calibration.get() !== undefined }).toEqual({
    whileLoading: false,
    afterLoading: true,
    open: true,
  });
});

test('a calibration session closes when its row artwork changes or its row is removed', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  store.openCalibration(id);
  // #when
  store.clearBack(id);
  const afterArtworkChange = store.$calibration.get();
  store.openCalibration(id);
  store.remove(id);
  // #then
  expect({ afterArtworkChange, afterRemove: store.$calibration.get() }).toEqual({
    afterArtworkChange: undefined,
    afterRemove: undefined,
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
  store.setCount(id, '2');
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
    inputs: store.$inputs.get(),
    revision: store.$revision.get(),
  };
  // #when
  const download = store.download();
  store.setCount(id, '7');
  store.setSize(id, 'custom');
  store.setAllSizes('large');
  store.setCustomDimensions(id, { width: '9' });
  store.setMargin('7');
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
    inputs: store.$inputs.get(),
    revision: store.$revision.get(),
  };
  release(Uint8Array.from([1]));
  await download;
  store.setCount(id, '3');
  // #then
  expect({
    sameSnapshot:
      during.rows === before.rows &&
      during.settings === before.settings &&
      during.inputs === before.inputs &&
      during.revision === before.revision,
    busy: store.$busy.get(),
    count: store.$layout.get().miniCount,
  }).toEqual({ sameSnapshot: true, busy: false, count: 3 });
});

test('generation keeps every draft commit locked until rendering settles', async () => {
  // #given
  let release!: (bytes: Uint8Array) => void;
  const rendering = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  const store = setup(() => rendering);
  const id = store.addBlank()!;
  store.setSize(id, 'custom');
  store.setSize(id, 'medium');
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const download = store.download();
  const inputs = store.$inputs.get();
  inputs.rows[id].count = { text: '', valid: false };
  inputs.rows[id].customWidthMm = { text: '', valid: false };
  inputs.margin = { text: '', valid: false };
  // #when
  store.commitCount(id);
  store.commitCustomDimension(id, 'width');
  store.commitMargin();
  const during = structuredClone(store.$inputs.get());
  release(Uint8Array.from([1]));
  await download;
  // #then
  expect(during).toEqual({
    printerMeasurement: { text: '', valid: true },
    rows: {
      [id]: {
        count: { text: '', valid: false },
        customWidthMm: { text: '', valid: false },
        customHeightMm: { text: '30', valid: true },
      },
    },
    margin: { text: '', valid: false },
  });
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
    count: store.$layout.get().miniCount,
  };
  slow.release();
  await pending;
  const after = {
    preparing: store.$preparing.get(),
    result: Array.from((await store.download()) ?? []),
    count: store.$layout.get().miniCount,
  };
  // #then
  expect({ during, after, renders }).toEqual({
    during: { preparing: true, result: undefined, count: 1 },
    after: { preparing: false, result: [1], count: 2 },
    renders: 1,
  });
});

test('a pending normalized result keeps generation unavailable until its warning is published', async () => {
  // #given
  let renders = 0;
  let release!: (result: ArtworkPreparation) => void;
  let normalize: boolean | undefined;
  const pending = new Promise<ArtworkPreparation>((resolve) => {
    release = resolve;
  });
  const slow = new File(['slow'], 'slow.png', { type: 'image/png' });
  const artwork: PaperMinisArtwork = {
    prepare(file, options) {
      normalize = options.normalize;
      return file === slow ? pending : Promise.resolve({ artwork: preparedArtwork() });
    },
  };
  const store = setup(
    async () => {
      renders++;
      return Uint8Array.from([1]);
    },
    artwork,
  );
  await store.setImage(store.addBlank()!, new File([png], 'front.png', { type: 'image/png' }));
  const pendingImage = store.setImage(store.addBlank()!, slow);
  // #when
  const during = await store.download();
  release({
    artwork: preparedArtwork(1, 100),
    warning: 'Не удалось обрезать изображение. Будет напечатан оригинал.',
  });
  await pendingImage;
  const after = await store.download();
  // #then
  expect({
    normalize,
    during,
    after: after && Array.from(after),
    renders,
    count: store.$layout.get().miniCount,
    warning: store.$rows.get()[1].normalizationWarning,
  }).toEqual({
    normalize: true,
    during: undefined,
    after: [1],
    renders: 1,
    count: 2,
    warning: 'Не удалось обрезать изображение. Будет напечатан оригинал.',
  });
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
      count: store.$layout.get().miniCount,
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
  let release!: () => void;
  const decoding = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = new File(['slow'], 'slow.png', { type: 'image/png' });
  const normalized: string[] = [];
  const artwork: PaperMinisArtwork = {
    async prepare(file, options) {
      if (file === slow) await decoding;
      if (options.normalize && options.isCurrent?.() !== false) normalized.push(file.name);
      return { artwork: preparedArtwork() };
    },
  };
  const store = setup(undefined, artwork);
  const id = store.addBlank()!;
  const pending = store.setImage(id, slow);
  const replacement = new File([png], 'new.png', { type: 'image/png' });
  // #when
  await store.setImage(id, replacement);
  release();
  await pending;
  // #then
  expect({
    rows: store.$rows.get().map((row) => [row.image?.name, row.artwork?.width, row.artwork?.height]),
    normalized,
  }).toEqual({ rows: [['new.png', 1, 1]], normalized: ['new.png'] });
});

test('clearing a loading back keeps the reflection and restores print readiness', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  const slow = deferredFile();
  const pending = store.setImage(id, slow.file, true);
  const during = store.$layout.get().miniCount;
  // #when
  store.clearBack(id);
  slow.release();
  await pending;
  // #then
  expect({
    during,
    after: store.$layout.get().miniCount,
    back: store.$rows.get()[0].backArtwork,
  }).toEqual(
    { during: 0, after: 1, back: null },
  );
});

test('a broken back falls back to the front with a warning', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  // #when
  await store.setImage(id, failedFile('back.png'), true);
  // #then
  expect({
    count: store.$layout.get().miniCount,
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
  await store.setImage(id, failedFile('bad.png'));
  const failed = {
    count: store.$layout.get().miniCount,
    error: store.$rows.get()[0].frontError,
  };
  // #when
  await store.setImage(id, new File([png], 'good.png', { type: 'image/png' }));
  // #then
  expect({
    failed,
    count: store.$layout.get().miniCount,
    error: store.$rows.get()[0].frontError,
  }).toEqual(
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
  calibrate(store, id, { head: 0.2, feet: 0.8 });
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
  calibrate(store, id, { head: 0.25, feet: 0.75 });
  store.setSize(id, 'large');
  store.duplicate(id);
  store.resetCalibration(id);
  // #then
  expect(store.$rows.get().map((row) => row.calibration)).toEqual([
    undefined,
    { head: 0.25, feet: 0.75 },
  ]);
});

test('adding a missing back keeps calibration after the artwork is prepared', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  calibrate(store, id, { head: 0.2, feet: 0.8 });
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
    calibrate(store, id, { head: 0.2, feet: 0.8 });
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
  calibrate(store, id, { head: 0.2, feet: 0.8 });
  const settled = new Promise<void>((resolve) => {
    const unsubscribe = store.$preparing.listen((preparing) => {
      if (!preparing) {
        unsubscribe();
        resolve();
      }
    });
  });
  // #when
  store.settings({ normalization: false });
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
});

test('loading a different normalization setting resets calibration and prepares artwork again', async () => {
  // #given
  const normalizations: boolean[] = [];
  const artwork: PaperMinisArtwork = {
    prepare(_file, options) {
      normalizations.push(options.normalize);
      return Promise.resolve({ artwork: preparedArtwork() });
    },
  };
  const store = setup(undefined, artwork);
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  calibrate(store, id, { head: 0.2, feet: 0.8 });
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));
  // #when
  store.loadSettings();
  const settled = new Promise<void>((resolve) => {
    const unsubscribe = store.$preparing.listen((preparing) => {
      if (!preparing) {
        unsubscribe();
        resolve();
      }
    });
  });
  await settled;
  // #then
  expect({ calibration: store.$rows.get()[0].calibration, normalizations }).toEqual({
    calibration: undefined,
    normalizations: [true, false],
  });
});

test('removing one of two sides keeps calibration', async () => {
  // #given
  const store = setup();
  const id = store.addBlank()!;
  await store.setImage(id, new File([png], 'front.png', { type: 'image/png' }));
  await store.setImage(id, new File([png], 'back.png', { type: 'image/png' }), true);
  calibrate(store, id, { head: 0.2, feet: 0.8 });
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
