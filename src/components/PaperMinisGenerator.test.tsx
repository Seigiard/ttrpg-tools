import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/preact';
import * as pdf from '@/lib/paper-minis/pdf';
import { createPaperMinisStore } from '@/stores/paper-minis-store';
import PaperMinisGenerator from './PaperMinisGenerator';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
let currentStore: ReturnType<typeof createPaperMinisStore>;
const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture',
);
const releasePointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'releasePointerCapture',
);

function renderGenerator() {
  currentStore = createPaperMinisStore();
  render(<PaperMinisGenerator store={currentStore} />);
}

function dispatchCancel(element: HTMLElement) {
  element.dispatchEvent(new Event('cancel', { cancelable: true }));
}

beforeEach(() => {
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => {},
  });
});
afterEach(() => {
  cleanup();
  localStorage.removeItem('pmg-settings');
  if (setPointerCaptureDescriptor)
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', setPointerCaptureDescriptor);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  if (releasePointerCaptureDescriptor)
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', releasePointerCaptureDescriptor);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
});

function uploadTo(label: string, files: File[]) {
  if (label === 'Добавить изображения') {
    currentStore.ingest(files);
    return;
  }
  const row = currentStore.$rows.get()[0];
  if (row && label.startsWith('Оборот:')) {
    void currentStore.setImage(row.id, files[0]!, true);
    return;
  }
  const target = screen.getByRole('button', {
    name: label === 'Добавить изображения' ? /Добавить изображения/ : label,
  });
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: { files, types: ['Files'] },
  });
  target.dispatchEvent(event);
}

async function addFront(bytes: BlobPart = png) {
  await act(async () => {
    uploadTo('Добавить изображения', [new File([bytes], 'goblin.png', { type: 'image/png' })]);
  });
  await waitFor(() => expect(currentStore.$rows.get()[0]?.artwork).toBeTruthy());
}

async function addBack(bytes: BlobPart = png) {
  await act(async () => {
    uploadTo('Оборот: отражение лицевой стороны', [
      new File([bytes], 'back.png', { type: 'image/png' }),
    ]);
  });
  await waitFor(() => expect(currentStore.$rows.get()[0]?.backArtwork).toBeTruthy());
}

async function waitForPreparation() {
  await waitFor(() => expect(currentStore.$preparing.get()).toBe(false));
}

async function fixturePng() {
  return Bun.file(new URL('../lib/paper-minis/fixtures/artwork-3x2.png', import.meta.url)).arrayBuffer();
}

async function openCalibrationDialogElement() {
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  await waitFor(() => expect(screen.queryByRole('slider', { name: 'Голова' })).toBeTruthy());
  return screen.getByRole('dialog', { name: 'Задать рост' });
}

async function openCalibrationDialog() {
  return within(await openCalibrationDialogElement());
}

function changeValue(element: HTMLElement, value: string) {
  (element as HTMLInputElement | HTMLSelectElement).value = value;
  fireEvent.input(element);
  fireEvent.change(element);
}

async function chooseBatchFiles(files: File[]) {
  const input = screen.getByLabelText('Добавить изображения', { selector: 'input' });
  await act(async () => {
    fireEvent.input(input, { target: { files } });
    fireEvent.change(input, { target: { files: [] } });
  });
}

test('printer scale shows approximate sizing until a measurement is entered and can be cleared', () => {
  // #given
  render(<PaperMinisGenerator />);
  const measurement = screen.getByRole<HTMLInputElement>('spinbutton', {
    name: 'Длина линейки, мм',
  });

  // #when
  const defaultState = screen.getByText('Принтер не измерен: размеры приблизительные.').textContent;
  fireEvent.change(measurement, { target: { value: '91' } });
  const measuredState = screen.getByText('Линейка измерена: 91 мм.').textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить измерение' }));

  // #then
  expect({
    defaultState,
    measuredState,
    input: measurement.value,
    restoredState: screen.getByText('Принтер не измерен: размеры приблизительные.').textContent,
  }).toEqual({
    defaultState: 'Принтер не измерен: размеры приблизительные.',
    measuredState: 'Линейка измерена: 91 мм.',
    input: '',
    restoredState: 'Принтер не измерен: размеры приблизительные.',
  });
});

test('blur restores an invalid draft and both PDF actions become available again', async () => {
  // #given
  renderGenerator();
  await addFront();
  const margin = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Поля, мм' });
  const count = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Количество копий' });
  changeValue(margin, '5');
  changeValue(count, '3');
  // #when
  changeValue(count, '');
  await waitFor(() => expect(count.getAttribute('aria-invalid')).toBe('true'));
  const disabled = ['Скачать PDF', 'Предпросмотр PDF'].map(
    (name) => screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
  );
  fireEvent.blur(count);
  await waitFor(() => expect(count.value).toBe('3'));
  changeValue(margin, '');
  await waitFor(() => expect(margin.getAttribute('aria-invalid')).toBe('true'));
  fireEvent.blur(margin);
  await waitFor(() => expect(margin.value).toBe('5'));
  changeValue(screen.getByRole('combobox', { name: 'Высота существа' }), 'custom');
  await waitFor(() =>
    expect(screen.queryByRole('spinbutton', { name: 'Основание, мм' })).toBeTruthy(),
  );
  const width = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Основание, мм' });
  const height = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Фигурка, мм' });
  changeValue(width, '12.5');
  changeValue(height, '40');
  changeValue(width, '0');
  await waitFor(() => expect(width.getAttribute('aria-invalid')).toBe('true'));
  fireEvent.blur(width);
  await waitFor(() => expect(width.value).toBe('12.5'));
  const afterWidthBlur = { width: width.value, height: height.value };
  changeValue(height, '0');
  await waitFor(() => expect(height.getAttribute('aria-invalid')).toBe('true'));
  fireEvent.blur(height);
  await waitFor(() => expect(height.value).toBe('40'));
  // #then
  expect({
    disabled,
    count: { value: count.value, invalid: count.getAttribute('aria-invalid') },
    margin: { value: margin.value, invalid: margin.getAttribute('aria-invalid') },
    afterWidthBlur,
    afterHeightBlur: { width: width.value, height: height.value },
    dimensionsInvalid: [
      width.getAttribute('aria-invalid'),
      height.getAttribute('aria-invalid'),
    ],
    enabled: ['Скачать PDF', 'Предпросмотр PDF'].map(
      (name) => !screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    ),
  }).toEqual({
    disabled: [true, true],
    count: { value: '3', invalid: 'false' },
    margin: { value: '5', invalid: 'false' },
    afterWidthBlur: { width: '12.5', height: '40' },
    afterHeightBlur: { width: '12.5', height: '40' },
    dimensionsInvalid: ['false', 'false'],
    enabled: [true, true],
  });
});

test('a thumbnail drop uses the first supported image even after an unsupported file', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  await act(async () => {
    fireEvent.drop(screen.getByRole('button', { name: 'Оборот: отражение лицевой стороны' }), {
      dataTransfer: {
        files: [
          new File(['text'], 'notes.txt', { type: 'text/plain' }),
          new File([png], 'figure.png', { type: 'image/png' }),
        ],
      },
    });
  });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Оборот: figure.png' })).toBeTruthy());
  // #then
  expect({
    rejected: screen.queryByText('Выберите PNG, JPG или WebP.'),
    back: screen.queryByRole('button', { name: 'Оборот: figure.png' }) !== null,
  }).toEqual({ rejected: null, back: true });
});

test('a JPEG labelled image/jpg is accepted', async () => {
  // #given
  renderGenerator();
  const bytes = await Bun.file(
    new URL('../lib/paper-minis/fixtures/artwork-4x3.jpg', import.meta.url),
  ).arrayBuffer();
  // #when
  await act(async () => {
    uploadTo('Добавить изображения', [new File([bytes], 'figure.jpg', { type: 'image/jpg' })]);
  });
  await waitFor(() => expect(screen.queryAllByRole('article')).toHaveLength(1));
  await waitForPreparation();
  // #then
  expect({
    rejection:
      screen.queryByText('Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.')
        ?.textContent ?? null,
    loadError:
      screen.queryByText('Не удалось загрузить изображение. Попробуйте другой файл.')
        ?.textContent ?? null,
    rows: screen.queryAllByRole('article').length,
  }).toEqual({ rejection: null, loadError: null, rows: 1 });
});

test('every artwork file input offers every supported MIME type', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  const accepts = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    (input) => input.accept,
  );
  // #then
  expect(accepts).toEqual([
    'image/png,image/jpeg,image/jpg,image/webp,.zip,application/zip',
    'image/png,image/jpeg,image/jpg,image/webp',
    'image/png,image/jpeg,image/jpg,image/webp',
  ]);
});

test('the drop zone explains the naming convention with every size id outside the button', () => {
  // #given
  renderGenerator();
  // #when
  const hint = screen.getByTestId('naming-hint');
  const sizes = hint.querySelector('details');
  // #then
  expect({
    hint: hint.querySelector('p')?.textContent,
    insideButton: hint.closest('button') !== null,
    sizes: Array.from(sizes?.querySelectorAll('li') ?? [], (item) => item.textContent),
  }).toEqual({
    hint: 'В конце имени файла: имя-back — оборот, имя-large — размер.',
    insideButton: false,
    sizes: [
      'tiny — Крошечный',
      'small — Маленький',
      'medium-short — Средний, низкий',
      'medium — Средний',
      'medium-tall — Средний, высокий',
      'large — Большой',
      'large-tall — Большой, высокий',
      'huge — Огромный',
      'gargantuan — Громадный',
    ],
  });
});

test('the batch file picker accepts exported zip archives', () => {
  // #given
  renderGenerator();
  // #when
  const input = screen.getByLabelText('Добавить изображения', { selector: 'input' });
  // #then
  expect(input.getAttribute('accept')).toBe('image/png,image/jpeg,image/jpg,image/webp,.zip,application/zip');
});

test('the batch file picker keeps the skipped-file warning after native input and change events', async () => {
  // #given
  renderGenerator();
  // #when
  await chooseBatchFiles([
    new File([png], 'figure.png', { type: 'image/png' }),
    new File(['text'], 'notes.txt', { type: 'text/plain' }),
  ]);
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  await waitForPreparation();
  // #then
  expect({
    rows: screen.getAllByRole('article').length,
    warning: screen.queryByText('Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.')?.textContent ?? null,
  }).toEqual({
    rows: 1,
    warning: 'Некоторые файлы пропущены: поддерживаются PNG, JPG и WebP.',
  });
});

test('a batch row is titled by its cleaned file name, or numbered when the name is empty', async () => {
  // #given
  renderGenerator();
  // #when
  await act(async () => {
    uploadTo('Добавить изображения', [
      new File([png], 'big-bad_wolf.PNG', { type: 'image/png' }),
      new File([png], '-.png', { type: 'image/png' }),
    ]);
  });
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
  await waitForPreparation();
  // #then
  expect(screen.getAllByRole('article').map((row) => row.querySelector('h3')?.textContent)).toEqual(
    ['Big bad wolf', 'Миниатюра 2'],
  );
});

test('the back slot announces the selected file and returns to reflection after removal', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  await act(async () => {
    uploadTo('Оборот: отражение лицевой стороны', [
      new File([png], 'back.png', { type: 'image/png' }),
    ]);
  });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Оборот: back.png' })).toBeTruthy());
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const selected = back.getAttribute('aria-label');
  fireEvent.click(screen.getByRole('button', { name: 'Убрать оборот' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Оборот: отражение лицевой стороны' })).toBeTruthy(),
  );
  // #then
  expect([
    selected,
    screen
      .getByRole('button', { name: 'Оборот: отражение лицевой стороны' })
      .getAttribute('aria-label'),
  ]).toEqual(['Оборот: back.png', 'Оборот: отражение лицевой стороны']);
});

test('rendered dwarf and bugbear choices retain distinct heights on the same base', async () => {
  // #given
  renderGenerator();
  await addFront();
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Высота существа' });
  // #when
  changeValue(select, 'medium-short');
  await waitFor(() => expect(select.title).toBe('Основание 25 мм · высота 27 мм'));
  const dwarfGeometry = select.title;
  changeValue(select, 'medium-tall');
  await waitFor(() => expect(select.title).toBe('Основание 25 мм · высота 43 мм'));
  // #then
  expect({
    dwarf: within(select)
      .getByRole('option', { name: /дварф/ })
      .getAttribute('value'),
    bugbear: within(select)
      .getByRole('option', { name: /багбир/ })
      .getAttribute('value'),
    geometry: [dwarfGeometry, select.title],
  }).toEqual({
    dwarf: 'medium-short',
    bugbear: 'medium-tall',
    geometry: ['Основание 25 мм · высота 27 мм', 'Основание 25 мм · высота 43 мм'],
  });
});

test('download action clicks an attached PDF download anchor', async () => {
  // #given
  setSystemTime(new Date(2026, 9, 2, 10, 30));
  const originalClick = HTMLAnchorElement.prototype.click;
  let clicked: { attached: boolean; download: string; protocol: string } | undefined;
  HTMLAnchorElement.prototype.click = function () {
    clicked = {
      attached: this.isConnected,
      download: this.download,
      protocol: new URL(this.href).protocol,
    };
  };
  try {
    renderGenerator();
    await addFront();
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }));
    // #then
    await waitFor(() =>
      expect(clicked).toEqual({
        attached: true,
        download: 'paper-minis-20261002-1030.pdf',
        protocol: 'blob:',
      }),
    );
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
    setSystemTime();
  }
});

test('printer scale test sheet can download before any minis are added', async () => {
  // #given
  const originalClick = HTMLAnchorElement.prototype.click;
  let clicked: { attached: boolean; download: string; protocol: string } | undefined;
  HTMLAnchorElement.prototype.click = function () {
    clicked = {
      attached: this.isConnected,
      download: this.download,
      protocol: new URL(this.href).protocol,
    };
  };
  try {
    render(<PaperMinisGenerator />);
    const download = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Скачать тестовый лист масштаба',
    });
    // #when
    fireEvent.click(download);
    // #then
    await waitFor(() =>
      expect({ disabled: download.disabled, clicked }).toEqual({
        disabled: false,
        clicked: {
          attached: true,
          download: 'paper-minis-printer-scale-test-a4.pdf',
          protocol: 'blob:',
        },
      }),
    );
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
  }
});

test('export action waits for ready minis and clicks an attached zip download anchor', async () => {
  // #given
  setSystemTime(new Date(2026, 9, 2, 10, 30));
  const originalClick = HTMLAnchorElement.prototype.click;
  let clicked: { attached: boolean; download: string; protocol: string } | undefined;
  HTMLAnchorElement.prototype.click = function () {
    clicked = {
      attached: this.isConnected,
      download: this.download,
      protocol: new URL(this.href).protocol,
    };
  };
  try {
    renderGenerator();
    const emptyDisabled = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Экспорт в ZIP',
    }).disabled;
    await addFront();
    const readyDisabled = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Экспорт в ZIP',
    }).disabled;
    let release!: (bytes: ArrayBuffer) => void;
    const slow = new File([png], 'slow-back.png', { type: 'image/png' });
    slow.arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      });
    fireEvent.input(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      { target: { files: [slow] } },
    );
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', {
      name: 'Экспорт в ZIP',
    }).disabled).toBe(true));
    const loadingDisabled = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Экспорт в ZIP',
    }).disabled;
    await act(async () => {
      release(Uint8Array.from(png).buffer);
    });
    await waitFor(() => expect(currentStore.$rows.get()[0]?.backArtwork).toBeTruthy());

    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт в ZIP' }));

    // #then
    await waitFor(() =>
      expect({
        disabled: [emptyDisabled, readyDisabled, loadingDisabled],
        clicked,
      }).toEqual({
        disabled: [true, false, true],
        clicked: {
          attached: true,
          download: 'paper-minis-2026-10-02.zip',
          protocol: 'blob:',
        },
      }),
    );
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
    setSystemTime();
  }
});

test('export reports a browser object-URL failure', async () => {
  // #given
  renderGenerator();
  await addFront();
  const objectUrl = spyOn(URL, 'createObjectURL').mockImplementation(() => {
    throw new Error('Object URL unavailable');
  });
  try {
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт в ZIP' }));
    // #then
    expect((await screen.findByText('Не удалось создать архив. Попробуйте ещё раз.')).textContent).toBe(
      'Не удалось создать архив. Попробуйте ещё раз.',
    );
  } finally {
    objectUrl.mockRestore();
  }
});

test('download reports a browser object-URL failure', async () => {
  // #given
  renderGenerator();
  await addFront();
  const objectUrl = spyOn(URL, 'createObjectURL').mockImplementation(() => {
    throw new Error('Object URL unavailable');
  });
  try {
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }));
    // #then
    expect(
      (
        await screen.findByText(
          'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.',
        )
      ).textContent,
    ).toBe('Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.');
  } finally {
    objectUrl.mockRestore();
  }
});

test('preview action shows the generated PDF in an iframe and matching link', async () => {
  // #given
  const objectUrl = spyOn(URL, 'createObjectURL').mockReturnValue('about:blank#pdf-preview');
  const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    renderGenerator();
    await addFront();
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр PDF' }));
    const iframe = await screen.findByTitle<HTMLIFrameElement>('Предпросмотр PDF');
    const link = screen.getByRole<HTMLAnchorElement>('link', {
      name: 'Открыть PDF в новой вкладке',
    });
    // #then
    expect({ src: iframe.src, sameUrl: iframe.src === link.href, target: link.target }).toEqual({
      src: 'about:blank#pdf-preview',
      sameUrl: true,
      target: '_blank',
    });
  } finally {
    cleanup();
    objectUrl.mockRestore();
    revokeUrl.mockRestore();
  }
});

test('preview reports a browser object-URL failure instead of showing a ready message', async () => {
  // #given
  renderGenerator();
  await addFront();
  const objectUrl = spyOn(URL, 'createObjectURL').mockImplementation(() => {
    throw new Error('Object URL unavailable');
  });
  try {
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр PDF' }));
    // #then
    expect(
      (
        await screen.findByText(
          'Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.',
        )
      ).textContent,
    ).toBe('Не удалось создать PDF. Попробуйте ещё раз или уменьшите изображения.');
  } finally {
    objectUrl.mockRestore();
  }
});

test('PDF actions wait for a pending image while the editor stays available', async () => {
  // #given
  renderGenerator();
  await addFront();
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'slow.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
  // #when
  await act(async () => {
    uploadTo('Добавить изображения', [file]);
  });
  const download = screen.getByRole<HTMLButtonElement>('button', { name: 'Скачать PDF' });
  const preview = screen.getByRole<HTMLButtonElement>('button', { name: 'Предпросмотр PDF' });
  const editor = screen.getByRole<HTMLFieldSetElement>('group', { name: 'Редактор миниатюр' });
  await waitFor(() => expect([download.disabled, preview.disabled]).toEqual([true, true]));
  const during = [download.disabled, preview.disabled, editor.disabled];
  await act(async () => {
    release(Uint8Array.from(png).buffer);
  });
  await waitFor(() => expect([download.disabled, preview.disabled]).toEqual([false, false]));
  // #then
  expect({ during, after: [download.disabled, preview.disabled, editor.disabled] }).toEqual({
    during: [true, true, false],
    after: [false, false, false],
  });
});

test('height calibration stays disabled while the front loads and does not open after a blocked click', async () => {
  // #given
  renderGenerator();
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'pending.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  await act(async () => {
    uploadTo('Добавить изображения', [file]);
  });
  const button = await screen.findByRole<HTMLButtonElement>('button', { name: 'Задать рост' });
  await waitFor(() => expect(button.disabled).toBe(true));
  // #when
  const disabledDuringLoad = button.disabled;
  fireEvent.click(button);
  await act(async () => {
    release(Uint8Array.from(png).buffer);
  });
  await waitFor(() => expect(button.disabled).toBe(false));
  // #then
  expect({
    disabledDuringLoad,
    disabledAfter: button.disabled,
    dialog: screen.queryByRole('dialog') !== null,
  }).toEqual({ disabledDuringLoad: true, disabledAfter: false, dialog: false });
});

test('height calibration stays disabled until the selected back artwork is ready', async () => {
  // #given
  renderGenerator();
  await addFront();
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'pending-back.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  await act(async () => {
    uploadTo('Оборот: отражение лицевой стороны', [file]);
  });
  await waitFor(() => expect(currentStore.$rows.get()[0]?.backImage).toBeTruthy());
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Задать рост' });
  await waitFor(() => expect(button.disabled).toBe(true));
  // #when
  const disabledDuringLoad = button.disabled;
  fireEvent.click(button);
  await act(async () => {
    release(Uint8Array.from(png).buffer);
  });
  await waitFor(() => expect(button.disabled).toBe(false));
  // #then
  expect({
    disabledDuringLoad,
    disabledAfter: button.disabled,
    dialog: screen.queryByRole('dialog') !== null,
  }).toEqual({ disabledDuringLoad: true, disabledAfter: false, dialog: false });
});

const overlay = (slot: HTMLElement) =>
  ['head', 'feet'].map(
    (key) => within(slot).queryByTestId(`calibration-${key}`)?.style.top ?? null,
  );

test('shared calibration draws the same thumbnail lines on both sides and reset removes them', async () => {
  // #given
  renderGenerator();
  await addFront();
  await addBack();
  const front = screen.getByRole('button', { name: 'Лицевая сторона' });
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const before = [overlay(front), overlay(back)];
  // #when
  const dialog = await openCalibrationDialog();
  fireEvent.keyDown(dialog.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  await waitFor(() =>
    expect(dialog.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('90'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Сбросить рост' })).toBeTruthy());
  const calibrated = [overlay(front), overlay(back)];
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить рост' }));
  await waitFor(() => expect(screen.queryByText('Рост задан вручную')).toBeNull());
  // #then
  expect({ before, calibrated, reset: [overlay(front), overlay(back)] }).toEqual({
    before: [
      [null, null],
      [null, null],
    ],
    calibrated: [
      ['90%', '100%'],
      ['90%', '100%'],
    ],
    reset: [
      [null, null],
      [null, null],
    ],
  });
});

test('a front-only calibration dialog exposes sliders without an orphan tab stop', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  const dialog = await openCalibrationDialog();
  // #then
  expect({
    tabs: dialog.queryAllByRole('tab').length,
    panels: dialog.queryAllByRole('tabpanel').length,
    sliders: dialog.getAllByRole('slider').map((el) => el.getAttribute('aria-label')),
  }).toEqual({ tabs: 0, panels: 0, sliders: ['Голова', 'Ступни'] });
  fireEvent.click(dialog.getByRole('button', { name: 'Отмена' }));
});

test('an oversized mini uses danger styling in both the row and calibration dialog', async () => {
  // #given
  renderGenerator();
  await addFront();
  changeValue(screen.getByRole('combobox', { name: 'Высота существа' }), 'custom');
  await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'Основание, мм' })).toBeTruthy());
  changeValue(screen.getByRole('spinbutton', { name: 'Основание, мм' }), '300');
  changeValue(screen.getByRole('spinbutton', { name: 'Фигурка, мм' }), '30');
  const warning = 'Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.';
  // #when
  await openCalibrationDialog();
  // #then
  expect(screen.getAllByText(warning).map((element) => element.classList.contains('text-danger'))).toEqual([
    true,
    true,
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
});

test('front height dialog applies calibration and row reset clears it', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  const dialog = await openCalibrationDialog();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  const area = dialog.getByTestId('height-calibration-artwork');
  Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
    value: () => ({ top: 0, height: 100 }),
    configurable: true,
  });
  fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientY: 25 });
  fireEvent.pointerMove(area, { pointerId: 1, clientY: 50 });
  fireEvent.pointerUp(area, { pointerId: 1 });
  await waitFor(() => expect(dialog.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('50'));
  fireEvent.click(dialog.getByRole('button', { name: 'Применить' }));
  await waitFor(() => expect(currentStore.$rows.get()[0]?.calibration).toBeTruthy());
  await waitFor(() => expect(screen.queryByText('Рост задан вручную')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText('Миниатюра уменьшена: лимит ширины.')).toBeTruthy());
  const label = screen.getByText('Рост задан вручную');
  const warning = screen.getByText('Миниатюра уменьшена: лимит ширины.');
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить рост' }));
  await waitFor(() => expect(screen.queryByText('Рост задан вручную')).toBeNull());
  // #then
  expect({
    label: label.textContent,
    warning: warning.textContent,
    reset: screen.queryByText('Рост задан вручную'),
  }).toEqual({
    label: 'Рост задан вручную',
    warning: 'Миниатюра уменьшена: лимит ширины.',
    reset: null,
  });
});

test('calibration applies a visible-image fraction inside vertical letterboxing', async () => {
  // #given
  const bytes = await fixturePng();
  renderGenerator();
  await addFront(bytes);
  const dialog = await openCalibrationDialog();
  const image = dialog.getByTestId('calibration-artworks');
  // A 400×100 image is centred in a 400×400 area: image top 150, bottom 250.
  Object.defineProperty(image, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 150, width: 400, height: 100, right: 400, bottom: 250 }),
  });
  // #when
  fireEvent.pointerDown(dialog.getByRole('slider', { name: 'Голова' }), {
    button: 0,
    pointerId: 1,
    clientY: 175,
  });
  await waitFor(() => expect(dialog.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('25'));
  fireEvent.click(dialog.getByRole('button', { name: 'Применить' }));
  await openCalibrationDialog();
  // #then
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('25'));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
});

test('height dialog shows both artworks side by side under one pair of shared lines', async () => {
  // #given
  renderGenerator();
  await addFront();
  // #when
  await addBack(await fixturePng());
  const dialog = await openCalibrationDialog();
  const artworks = dialog.getByTestId('calibration-artworks');
  const images = within(artworks).getAllByRole('img');
  // #then
  expect({
    tabs: dialog.queryAllByRole('tab').length,
    images: images.map((image) => image.getAttribute('alt')),
    aspectRatio: artworks.style.aspectRatio,
    sliders: dialog.getAllByRole('slider').map((slider) => slider.getAttribute('aria-label')),
  }).toEqual({
    tabs: 0,
    images: ['Лицевая сторона', 'Оборот'],
    aspectRatio: '2.5 / 1',
    sliders: ['Голова', 'Ступни'],
  });
  fireEvent.click(dialog.getByRole('button', { name: 'Отмена' }));
});

test('opening calibration moves focus inside and Escape cancels and restores the opener', async () => {
  // #given
  renderGenerator();
  await addFront();
  const opener = screen.getByRole('button', { name: 'Задать рост' });
  opener.focus();
  // #when
  const dialog = await openCalibrationDialogElement();
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  dispatchCancel(dialog);
  // #then
  await waitFor(() =>
    expect({
      open: screen.queryByRole('dialog') !== null,
      focusRestored: document.activeElement === opener,
      calibrated: screen.queryByText('Рост задан вручную') !== null,
    }).toEqual({ open: false, focusRestored: true, calibrated: false }),
  );
});

test.each(['pointerCancel', 'lostPointerCapture'] as const)(
  '%s ends calibration dragging',
  async (end) => {
    // #given
    renderGenerator();
    await addFront();
    const dialog = await openCalibrationDialog();
    const head = dialog.getByRole('slider', { name: 'Голова' });
    const area = dialog.getByTestId('height-calibration-artwork');
    Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
      value: () => ({ top: 0, height: 100 }),
      configurable: true,
    });
    fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientY: 25 });
    await waitFor(() => expect(head.getAttribute('aria-valuenow')).toBe('25'));
    // #when
    fireEvent[end](area, { pointerId: 1 });
    fireEvent.pointerMove(area, { pointerId: 1, clientY: 50 });
    // #then
    expect(currentStore.$calibration.get()?.lines.head).toBe(0.25);
    fireEvent.click(dialog.getByRole('button', { name: 'Отмена' }));
  },
);

test.each([{ button: 2 }, { button: 0, ctrlKey: true }])(
  'context-menu press %j does not start calibration',
  async (press) => {
    // #given
    renderGenerator();
    await addFront();
    const dialog = await openCalibrationDialog();
    Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
      value: () => ({ top: 0, height: 100 }),
      configurable: true,
    });
    // #when
    fireEvent.pointerDown(dialog.getByRole('slider', { name: 'Голова' }), {
      ...press,
      pointerId: 1,
      clientY: 25,
    });
    fireEvent.pointerMove(dialog.getByTestId('height-calibration-artwork'), {
      pointerId: 1,
      clientY: 50,
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull());
    // #then
    expect({ session: currentStore.$calibration.get(), calibration: currentStore.$rows.get()[0]?.calibration }).toEqual({
      session: undefined,
      calibration: undefined,
    });
  },
);

test('Apply after returning lines to their starting values keeps the calibration unchanged', async () => {
  // #given
  const generate = spyOn(pdf, 'generatePDF').mockResolvedValue(new Uint8Array([1]));
  const objectUrl = spyOn(URL, 'createObjectURL').mockReturnValue('about:blank');
  const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    const bytes = await fixturePng();
    renderGenerator();
    await addFront(bytes);
    const dialog = await openCalibrationDialog();
    Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 100 }),
    });
    currentStore.setCalibrationLine('head', 0.25);
    await waitFor(() => expect(dialog.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('25'));
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр PDF' }));
    });
    const reopenedDialog = await openCalibrationDialog();
    const head = reopenedDialog.getByRole('slider', { name: 'Голова' });
    // #when
    fireEvent.keyDown(head, { key: 'ArrowDown' });
    fireEvent.keyDown(head, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Задать рост' })).toBeNull());
    // #then
    expect(currentStore.$previewStale.get()).toBe(false);
  } finally {
    generate.mockRestore();
    objectUrl.mockRestore();
    revokeUrl.mockRestore();
  }
});
