import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from 'bun:test';
import { fireEvent as baseFireEvent } from '@testing-library/dom';
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import * as pdf from '@/lib/paper-minis/pdf';
import PaperMinisGenerator from './PaperMinisGenerator.svelte';

const fireEvent = new Proxy(baseFireEvent, {
  get(target, key: keyof typeof baseFireEvent) {
    const fire = target[key];
    if (typeof fire !== 'function') return fire;
    return (...args: unknown[]) => {
      const result = (fire as (...params: unknown[]) => boolean)(...args);
      if (key === 'change' && args[0] instanceof HTMLElement) {
        baseFireEvent.input(args[0]);
      }
      flushSync();
      return result;
    };
  },
}) as typeof baseFireEvent;

async function flushAsyncUpdates() {
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);

beforeEach(() => {
  localStorage.setItem('pmg-settings', JSON.stringify({ normalization: false }));
});
afterEach(() => {
  cleanup();
  localStorage.removeItem('pmg-settings');
});

async function addFront(bytes = png) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([bytes], 'goblin.png', { type: 'image/png' })] },
    });
  });
}

async function addBack(bytes = png) {
  await act(async () => {
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      {
        target: { files: [new File([bytes], 'back.png', { type: 'image/png' })] },
      },
    );
  });
}

async function openCalibration(frontHeight = 200) {
  const bytes = Buffer.from(png);
  bytes.writeUInt32BE(frontHeight, 20);
  render(PaperMinisGenerator);
  await addFront(bytes);
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  return within(screen.getByRole('dialog'));
}

test('both PDF actions follow generation availability', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Поля, мм' });
  // #when
  fireEvent.change(input, { target: { value: '' } });
  const disabled = ['Скачать PDF', 'Предпросмотр PDF'].map(
    (name) => screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
  );
  fireEvent.change(input, { target: { value: '2' } });
  // #then
  expect({
    disabled,
    enabled: ['Скачать PDF', 'Предпросмотр PDF'].map(
      (name) => !screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    ),
  }).toEqual({ disabled: [true, true], enabled: [true, true] });
});

test('blur restores every invalid numeric draft without changing another field', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  const count = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Количество копий' });
  const margin = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Поля, мм' });
  fireEvent.change(count, { target: { value: '2' } });
  fireEvent.change(margin, { target: { value: '5' } });
  // #when
  fireEvent.change(count, { target: { value: '' } });
  fireEvent.blur(count);
  const restoredCount = { value: count.value, invalid: count.getAttribute('aria-invalid') };
  fireEvent.change(margin, { target: { value: '' } });
  fireEvent.blur(margin);
  const restoredMargin = { value: margin.value, invalid: margin.getAttribute('aria-invalid') };
  fireEvent.change(screen.getByRole('combobox', { name: 'Высота существа' }), {
    target: { value: 'custom' },
  });
  const width = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Основание, мм' });
  const height = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Фигурка, мм' });
  fireEvent.change(width, { target: { value: '12.5' } });
  fireEvent.change(height, { target: { value: '40' } });
  fireEvent.change(width, { target: { value: '0' } });
  fireEvent.blur(width);
  const afterWidthBlur = { width: width.value, height: height.value };
  fireEvent.change(height, { target: { value: '0' } });
  fireEvent.blur(height);
  // #then
  expect({
    count: restoredCount,
    margin: restoredMargin,
    afterWidthBlur,
    afterHeightBlur: { width: width.value, height: height.value },
    dimensionsInvalid: [
      width.getAttribute('aria-invalid'),
      height.getAttribute('aria-invalid'),
    ],
    actionsEnabled: ['Скачать PDF', 'Предпросмотр PDF'].map(
      (name) => !screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    ),
  }).toEqual({
    count: { value: '2', invalid: 'false' },
    margin: { value: '5', invalid: 'false' },
    afterWidthBlur: { width: '12.5', height: '40' },
    afterHeightBlur: { width: '12.5', height: '40' },
    dimensionsInvalid: ['false', 'false'],
    actionsEnabled: [true, true],
  });
});

test('a thumbnail drop uses the first supported image even after an unsupported file', async () => {
  // #given
  render(PaperMinisGenerator);
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
  // #then
  expect({
    rejected: screen.queryByText('Выберите PNG, JPG или WebP.'),
    back: screen.queryByRole('button', { name: 'Оборот: figure.png' }) !== null,
  }).toEqual({ rejected: null, back: true });
});

test('a JPEG labelled image/jpg is accepted', async () => {
  // #given
  render(PaperMinisGenerator);
  const bytes = await Bun.file(
    new URL('../lib/paper-minis/fixtures/artwork-4x3.jpg', import.meta.url),
  ).arrayBuffer();
  // #when
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([bytes], 'figure.jpg', { type: 'image/jpg' })] },
    });
  });
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
  render(PaperMinisGenerator);
  await addFront();
  // #when
  const accepts = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    (input) => input.accept,
  );
  // #then
  expect(accepts).toEqual([
    'image/png,image/jpeg,image/jpg,image/webp',
    'image/png,image/jpeg,image/jpg,image/webp',
    'image/png,image/jpeg,image/jpg,image/webp',
  ]);
});

test('the drop zone explains the naming convention with every size id outside the button', () => {
  // #given
  render(PaperMinisGenerator);
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

test('a batch row is titled by its cleaned file name, or numbered when the name is empty', async () => {
  // #given
  render(PaperMinisGenerator);
  // #when
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: {
        files: [
          new File([png], 'big-bad_wolf.PNG', { type: 'image/png' }),
          new File([png], '-.png', { type: 'image/png' }),
        ],
      },
    });
  });
  // #then
  expect(screen.getAllByRole('article').map((row) => row.querySelector('h3')?.textContent)).toEqual(
    ['Big bad wolf', 'Миниатюра 2'],
  );
});

test('the back slot announces the selected file and returns to reflection after removal', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  // #when
  await act(async () => {
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      {
        target: { files: [new File([png], 'back.png', { type: 'image/png' })] },
      },
    );
  });
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const selected = back.getAttribute('aria-label');
  fireEvent.click(screen.getByRole('button', { name: 'Убрать оборот' }));
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
  render(PaperMinisGenerator);
  await addFront();
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Высота существа' });
  // #when
  fireEvent.change(select, { target: { value: 'medium-short' } });
  const dwarfGeometry = select.title;
  fireEvent.change(select, { target: { value: 'medium-tall' } });
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
    render(PaperMinisGenerator);
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

test('download reports a browser object-URL failure', async () => {
  // #given
  render(PaperMinisGenerator);
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
    render(PaperMinisGenerator);
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
  render(PaperMinisGenerator);
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
  render(PaperMinisGenerator);
  await addFront();
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'slow.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
  // #when
  fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
    target: { files: [file] },
  });
  const download = screen.getByRole<HTMLButtonElement>('button', { name: 'Скачать PDF' });
  const preview = screen.getByRole<HTMLButtonElement>('button', { name: 'Предпросмотр PDF' });
  const editor = screen.getByRole<HTMLFieldSetElement>('group', { name: 'Редактор миниатюр' });
  const during = [download.disabled, preview.disabled, editor.disabled];
  await act(async () => {
    release(Uint8Array.from(png).buffer);
    await flushAsyncUpdates();
  });
  // #then
  expect({ during, after: [download.disabled, preview.disabled, editor.disabled] }).toEqual({
    during: [true, true, false],
    after: [false, false, false],
  });
});

test('height calibration stays disabled while the front loads and does not open after a blocked click', async () => {
  // #given
  render(PaperMinisGenerator);
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'pending.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
    target: { files: [file] },
  });
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Задать рост' });
  // #when
  const disabledDuringLoad = button.disabled;
  fireEvent.click(button);
  await act(async () => {
    release(Uint8Array.from(png).buffer);
    await flushAsyncUpdates();
  });
  // #then
  expect({
    disabledDuringLoad,
    disabledAfter: button.disabled,
    dialog: screen.queryByRole('dialog') !== null,
  }).toEqual({ disabledDuringLoad: true, disabledAfter: false, dialog: false });
});

test('height calibration stays disabled until the selected back artwork is ready', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  let release!: (bytes: ArrayBuffer) => void;
  const file = new File([png], 'pending-back.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  fireEvent.change(
    screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
    { target: { files: [file] } },
  );
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Задать рост' });
  // #when
  const disabledDuringLoad = button.disabled;
  fireEvent.click(button);
  await act(async () => {
    release(Uint8Array.from(png).buffer);
    await flushAsyncUpdates();
  });
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
  render(PaperMinisGenerator);
  await addFront();
  await addBack();
  const front = screen.getByRole('button', { name: 'Лицевая сторона' });
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const before = [overlay(front), overlay(back)];
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  const calibrated = [overlay(front), overlay(back)];
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить рост' }));
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
  render(PaperMinisGenerator);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog'));
  // #then
  expect({
    tabs: dialog.queryAllByRole('tab').length,
    panels: dialog.queryAllByRole('tabpanel').length,
    sliders: dialog.getAllByRole('slider').map((el) => el.getAttribute('aria-label')),
  }).toEqual({ tabs: 0, panels: 0, sliders: ['Голова', 'Ступни'] });
});

test('calibration lines expose named vertical sliders in the tab order', async () => {
  // #given
  const dialog = await openCalibration();
  // #when
  const sliders = ['Голова', 'Ступни'].map((name) => {
    const slider = dialog.getByRole<HTMLButtonElement>('slider', { name });
    slider.focus();
    return {
      focused: document.activeElement === slider,
      tabIndex: slider.tabIndex,
      orientation: slider.getAttribute('aria-orientation'),
      value: slider.getAttribute('aria-valuenow'),
    };
  });
  // #then
  expect(sliders).toEqual([
    { focused: true, tabIndex: 0, orientation: 'vertical', value: '0' },
    { focused: true, tabIndex: 0, orientation: 'vertical', value: '100' },
  ]);
});

test.each([
  { frontHeight: 200, backHeight: 400 },
  { frontHeight: 400, backHeight: 200 },
])(
  'keyboard steps and announced pixels use the taller artwork height ($frontHeight/$backHeight)',
  async ({ frontHeight, backHeight }) => {
    // #given
    await openCalibration(frontHeight);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    const bytes = Buffer.from(png);
    bytes.writeUInt32BE(backHeight, 20);
    await addBack(bytes);
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
    // #when
    const head = dialog.getByRole('slider', { name: 'Голова' });
    fireEvent.keyDown(head, { key: 'ArrowDown' });
    const onePixel = head.getAttribute('aria-valuenow');
    fireEvent.keyDown(head, { key: 'ArrowDown', shiftKey: true });
    const afterShift = [head.getAttribute('aria-valuenow'), head.getAttribute('aria-valuetext')];
    // #then
    expect({ tabs: dialog.queryAllByRole('tab').length, onePixel, afterShift }).toEqual({
      tabs: 0,
      onePixel: '0.25',
      afterShift: ['2.75', '11 пикселей от верха'],
    });
  },
);

test('slider ranges announce the movement allowed by the other line', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  const feet = dialog.getByRole('slider', { name: 'Ступни' });
  // #when
  fireEvent.keyDown(feet, { key: 'ArrowUp', shiftKey: true });
  // #then
  expect(
    [head, feet].map((el) => [el.getAttribute('aria-valuemin'), el.getAttribute('aria-valuemax')]),
  ).toEqual([
    ['0', '85'],
    ['10', '100'],
  ]);
});

test('arrow keys prevent scrolling while other keys pass through unchanged', async () => {
  // #given
  const dialog = await openCalibration();
  const head = dialog.getByRole('slider', { name: 'Голова' });
  // #when
  const arrowHandled = fireEvent.keyDown(head, { key: 'ArrowDown' });
  const afterArrow = head.getAttribute('aria-valuenow');
  const tabHandled = fireEvent.keyDown(head, { key: 'Tab' });
  // #then
  expect({
    arrowHandled,
    tabHandled,
    afterArrow,
    afterTab: head.getAttribute('aria-valuenow'),
  }).toEqual({ arrowHandled: false, tabHandled: true, afterArrow: '0.5', afterTab: '0.5' });
});

test('an oversized mini uses danger styling in both the row and calibration dialog', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  fireEvent.change(screen.getByRole('combobox', { name: 'Высота существа' }), {
    target: { value: 'custom' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Основание, мм' }), {
    target: { value: '300' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Фигурка, мм' }), {
    target: { value: '30' },
  });
  const warning = 'Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.';
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  // #then
  expect(screen.getAllByText(warning).map((element) => element.classList.contains('text-danger'))).toEqual([
    true,
    true,
  ]);
});

test('front height dialog applies pointer calibration and row reset clears it', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: 'Задать рост' });
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(
    within(dialog).getByTestId('calibration-artworks'),
    'getBoundingClientRect',
    {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    },
  );
  fireEvent.pointerDown(within(dialog).getByRole('slider', { name: 'Голова' }), {
    pointerId: 1,
    clientY: 25,
  });
  fireEvent.pointerMove(artwork, { pointerId: 1, clientY: 50 });
  fireEvent.pointerUp(artwork, { pointerId: 1, clientY: 50 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }));
  const label = screen.getByText('Рост задан вручную');
  const warning = screen.getByText('Миниатюра уменьшена: лимит ширины.');
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить рост' }));
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

test('pointer calibration measures the visible image inside vertical letterboxing', async () => {
  // #given
  const bytes = Buffer.from(png);
  bytes.writeUInt32BE(400, 16);
  bytes.writeUInt32BE(100, 20);
  render(PaperMinisGenerator);
  await addFront(bytes);
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog'));
  const area = dialog.getByTestId('height-calibration-artwork');
  const image = dialog.getByTestId('calibration-artworks');
  // A 400×100 image is centred in a 400×400 area: image top 150, bottom 250.
  Object.defineProperty(area, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }),
  });
  Object.defineProperty(image, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 150, width: 400, height: 100, right: 400, bottom: 250 }),
  });
  // #when
  fireEvent.pointerDown(dialog.getByRole('slider', { name: 'Голова' }), {
    pointerId: 1,
    clientY: 175,
  });
  fireEvent.pointerUp(area, { pointerId: 1, clientY: 175 });
  fireEvent.click(dialog.getByRole('button', { name: 'Применить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  // #then
  expect(screen.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow')).toBe('25');
});

test('height dialog shows both artworks side by side under one pair of shared lines', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  // #when
  const backBytes = Buffer.from(png);
  backBytes.writeUInt32BE(2, 16);
  await addBack(backBytes);
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Задать рост' }));
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
    aspectRatio: '3 / 1',
    sliders: ['Голова', 'Ступни'],
  });
});

test('opening calibration moves focus inside and Escape cancels and restores the opener', async () => {
  // #given
  render(PaperMinisGenerator);
  await addFront();
  const opener = screen.getByRole('button', { name: 'Задать рост' });
  opener.focus();
  // #when
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
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
    render(PaperMinisGenerator);
    await addFront();
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
    const head = dialog.getByRole('slider', { name: 'Голова' });
    const area = dialog.getByTestId('height-calibration-artwork');
    Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
      value: () => ({ top: 0, height: 100 }),
      configurable: true,
    });
    fireEvent.pointerDown(head, { pointerId: 1, button: 0, clientY: 25 });
    // #when
    fireEvent[end](head, { pointerId: 1 });
    fireEvent.pointerMove(area, { pointerId: 1, clientY: 50 });
    // #then
    expect(head.getAttribute('aria-valuenow')).toBe('25');
  },
);

test.each([{ button: 2 }, { button: 0, ctrlKey: true }])(
  'context-menu press %j does not start calibration',
  async (press) => {
    // #given
    render(PaperMinisGenerator);
    await addFront();
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
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
    // #then
    expect(screen.queryByText('Рост задан вручную') !== null).toBe(false);
  },
);

test('Apply after returning lines to their starting values keeps the calibration unchanged', async () => {
  // #given
  const generate = spyOn(pdf, 'generatePDF').mockResolvedValue(new Uint8Array([1]));
  const objectUrl = spyOn(URL, 'createObjectURL').mockReturnValue('about:blank');
  const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    const bytes = Buffer.from(png);
    bytes.writeUInt32BE(201, 20);
    render(PaperMinisGenerator);
    await addFront(bytes);
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
    Object.defineProperty(dialog.getByTestId('calibration-artworks'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 100 }),
    });
    fireEvent.pointerDown(dialog.getByRole('slider', { name: 'Голова' }), {
      pointerId: 1,
      clientY: 25,
    });
    fireEvent.pointerUp(dialog.getByTestId('height-calibration-artwork'), {
      pointerId: 1,
      clientY: 25,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр PDF' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const head = screen.getByRole('slider', { name: 'Голова' });
    // #when
    fireEvent.keyDown(head, { key: 'ArrowDown' });
    fireEvent.keyDown(head, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    // #then
    expect(screen.queryByText('Настройки или изображения изменились. Обновите предпросмотр.')).toBe(
      null,
    );
  } finally {
    generate.mockRestore();
    objectUrl.mockRestore();
    revokeUrl.mockRestore();
  }
});
