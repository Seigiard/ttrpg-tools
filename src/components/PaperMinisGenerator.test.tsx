import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import PaperMinisGenerator from './PaperMinisGenerator';

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

async function addBack() {
  await act(async () => {
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      {
        target: { files: [new File([png], 'back.png', { type: 'image/png' })] },
      },
    );
  });
}

test('clearing copies keeps the field empty until a new count is entered', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Количество копий' });
  fireEvent.change(input, { target: { value: '2' } });
  // #when
  fireEvent.change(input, { target: { value: '' } });
  const cleared = input.value;
  fireEvent.change(input, { target: { value: `${input.value}3` } });
  // #then
  expect({
    cleared,
    value: input.value,
    summary: document.querySelector('[aria-live="polite"]')?.textContent,
  }).toEqual({ cleared: '', value: '3', summary: 'Миниатюр: 3 → листов: 1 (A4)' });
});

test('a thumbnail drop uses the first supported image even after an unsupported file', async () => {
  // #given
  render(<PaperMinisGenerator />);
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

test('the drop zone explains the naming convention with every size id outside the button', () => {
  // #given
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
    render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
    render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
  });
  // #then
  expect({ during, after: [download.disabled, preview.disabled, editor.disabled] }).toEqual({
    during: [true, true, false],
    after: [false, false, false],
  });
});

test('height calibration stays disabled while the front loads and does not open after a blocked click', async () => {
  // #given
  render(<PaperMinisGenerator />);
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

test('back-only calibration draws thumbnail lines only on the back and reset removes them', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await addBack();
  const front = screen.getByRole('button', { name: 'Лицевая сторона' });
  const back = screen.getByRole('button', { name: 'Оборот: back.png' });
  const before = [overlay(front), overlay(back)];
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Зад' }));
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
      [null, null],
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
  render(<PaperMinisGenerator />);
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

test('front height dialog applies pointer calibration and row reset clears it', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: 'Задать рост лицевой стороны' });
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(within(dialog).getByRole('img'), 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
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
  render(<PaperMinisGenerator />);
  await addFront(bytes);
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog'));
  const area = dialog.getByTestId('height-calibration-artwork');
  const image = dialog.getByRole('img');
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

test('front height dialog cancel leaves the row unchanged and keeps a 10 percent line gap', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: 'Задать рост лицевой стороны' });
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(within(dialog).getByRole('img'), 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  const head = within(dialog).getByRole('slider', { name: 'Голова' });
  const feet = within(dialog).getByRole('slider', { name: 'Ступни' });
  fireEvent.pointerDown(head, { pointerId: 1, clientY: 0 });
  fireEvent.pointerMove(artwork, { pointerId: 1, clientY: 96 });
  fireEvent.pointerUp(artwork, { pointerId: 1, clientY: 96 });
  const positions = [head.getAttribute('aria-valuenow'), feet.getAttribute('aria-valuenow')];
  const readout = within(dialog).getByText('Рост 35 мм · напечатается 53 мм');
  const warning = within(dialog).getByText('Миниатюра уменьшена: лимит высоты 2×, лимит ширины.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
  // #then
  expect({
    positions,
    readout: readout.textContent,
    warning: warning.textContent,
    label: screen.queryByText('Рост задан вручную'),
  }).toEqual({
    positions: ['90', '100'],
    readout: 'Рост 35 мм · напечатается 53 мм',
    warning: 'Миниатюра уменьшена: лимит высоты 2×, лимит ширины.',
    label: null,
  });
});

test('height dialog shows side tabs only with a back and applies back calibration separately', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const frontOnlyTabs = screen.queryByRole('tab', { name: 'Перед' });
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  await addBack();
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: /Задать рост/ });
  fireEvent.click(within(dialog).getByRole('tab', { name: 'Зад' }));
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(within(dialog).getByRole('img'), 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  fireEvent.pointerDown(within(dialog).getByRole('slider', { name: 'Голова' }), {
    pointerId: 1,
    clientY: 25,
  });
  fireEvent.pointerUp(artwork, { pointerId: 1, clientY: 25 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const reopened = within(screen.getByRole('dialog'));
  const front = reopened.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow');
  fireEvent.click(reopened.getByRole('tab', { name: 'Зад' }));
  // #then
  expect({
    frontOnlyTabs,
    front,
    back: reopened.getByRole('slider', { name: 'Голова' }).getAttribute('aria-valuenow'),
  }).toEqual({
    frontOnlyTabs: null,
    front: '0',
    back: '25',
  });
});

test('Apply saves edits on both sides even when the back tab is visible', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await addBack();
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = within(screen.getByRole('dialog'));
  // #when
  fireEvent.keyDown(dialog.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  fireEvent.click(dialog.getByRole('tab', { name: 'Зад' }));
  fireEvent.keyDown(dialog.getByRole('slider', { name: 'Ступни' }), { key: 'ArrowUp' });
  fireEvent.click(dialog.getByRole('button', { name: 'Применить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const reopened = within(screen.getByRole('dialog'));
  const values = () =>
    ['Голова', 'Ступни'].map((name) =>
      reopened.getByRole('slider', { name }).getAttribute('aria-valuenow'),
    );
  const front = values();
  fireEvent.click(reopened.getByRole('tab', { name: 'Зад' }));
  // #then
  expect({ front, back: values() }).toEqual({ front: ['90', '100'], back: ['0', '10'] });
});

test('opening calibration moves focus inside and Escape cancels and restores the opener', async () => {
  // #given
  render(<PaperMinisGenerator />);
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

test('Apply after only viewing both tabs keeps both sides uncalibrated', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await addBack();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Зад' }));
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  // #then
  expect(screen.queryByText('Рост задан вручную')).toBe(null);
});

test.each(['pointerCancel', 'lostPointerCapture'] as const)(
  '%s ends calibration dragging',
  async (end) => {
    // #given
    render(<PaperMinisGenerator />);
    await addFront();
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
    const head = dialog.getByRole('slider', { name: 'Голова' });
    const area = dialog.getByTestId('height-calibration-artwork');
    Object.defineProperty(dialog.getByRole('img'), 'getBoundingClientRect', {
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
    render(<PaperMinisGenerator />);
    await addFront();
    fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
    const dialog = within(screen.getByRole('dialog'));
    Object.defineProperty(dialog.getByRole('img'), 'getBoundingClientRect', {
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

test('pushing untouched lines against their boundaries does not calibrate either side', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await addBack();
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  // #when
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Голова' }), { key: 'ArrowUp' });
  fireEvent.click(screen.getByRole('tab', { name: 'Зад' }));
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Ступни' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  // #then
  expect(screen.queryByText('Рост задан вручную') !== null).toBe(false);
});

test('an untouched back preview and Apply preserve its inherited printed height', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await addBack();
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Голова' }), { key: 'ArrowDown' });
  // #when
  fireEvent.click(screen.getByRole('tab', { name: 'Зад' }));
  const before = screen.getByText(/Рост 35 мм ·/).textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Зад' }));
  // #then
  expect([before, screen.getByText(/Рост 35 мм ·/).textContent]).toEqual([
    'Рост 35 мм · напечатается 53 мм',
    'Рост 35 мм · напечатается 53 мм',
  ]);
});
