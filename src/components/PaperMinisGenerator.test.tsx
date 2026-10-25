import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import * as pdf from '@/lib/paper-minis/pdf';
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

async function chooseSelectOption(trigger: HTMLElement, name: string | RegExp) {
  fireEvent.click(trigger);
  const option = within(await screen.findByRole('listbox')).getByRole('option', { name });
  fireEvent.click(option);
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
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

test('printer scale reads as the default until a measurement is entered and can be cleared', () => {
  // #given
  render(<PaperMinisGenerator />);
  const defaultButton = screen.getByRole('button', { name: 'Масштаб ▾' });
  const defaultButtonLabel = defaultButton.textContent;
  fireEvent.click(defaultButton);

  const resetBeforeMeasurement =
    screen.queryByRole('button', { name: 'Сбросить измерение' })?.textContent ?? null;

  const measurement = screen.getByRole<HTMLInputElement>('spinbutton', {
    name: 'Вышло из 100 мм',
  });

  const testSheet = screen.getByRole('button', { name: 'Скачать тестовый лист' });

  // #when
  fireEvent.change(measurement, { target: { value: '91' } });
  fireEvent.blur(measurement);
  const measuredButton = screen.getByRole('button', { name: 'Масштаб · 91 мм ▾' });
  const measuredButtonLabel = measuredButton.textContent;

  const savedMeasurement = JSON.parse(
    localStorage.getItem('pmg-settings') ?? '{}',
  ).printerMeasurementMm;

  fireEvent.change(measurement, { target: { value: '79' } });
  const invalidDraft = measurement.getAttribute('aria-invalid');
  fireEvent.blur(measurement);
  const restoredDraft = measurement.value;
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить измерение' }));

  // #then
  expect({
    defaultButton: defaultButtonLabel,
    resetBeforeMeasurement,
    testSheet: testSheet.textContent,
    measuredButton: measuredButtonLabel,
    savedMeasurement,
    invalidDraft,
    restoredDraft,
    input: measurement.value,
    restoredButton: screen.getByRole('button', { name: 'Масштаб ▾' }).textContent,
  }).toEqual({
    defaultButton: 'Масштаб ▾',
    resetBeforeMeasurement: null,
    testSheet: 'тестовый лист',
    measuredButton: 'Масштаб · 91 мм ▾',
    savedMeasurement: 91,
    invalidDraft: 'true',
    restoredDraft: '91',
    input: '',
    restoredButton: 'Масштаб ▾',
  });
});

test.each([
  {
    close: 'Escape',
    savedMeasurement: '91',
    restoredMeasurement: '91',
    triggerName: 'Масштаб · 91 мм ▾',
  },
  {
    close: 'outside pointerdown',
    savedMeasurement: undefined,
    restoredMeasurement: '',
    triggerName: 'Масштаб ▾',
  },
] as const)(
  'closing the printer scale with $close restores its invalid draft and PDF actions',
  async ({ close, savedMeasurement, restoredMeasurement, triggerName }) => {
    // #given
    render(<PaperMinisGenerator />);
    await addFront();
    fireEvent.click(screen.getByRole('button', { name: 'Масштаб ▾' }));

    const measurement = screen.getByRole<HTMLInputElement>('spinbutton', {
      name: 'Вышло из 100 мм',
    });

    if (savedMeasurement !== undefined) {
      fireEvent.change(measurement, { target: { value: savedMeasurement } });
      fireEvent.blur(measurement);
    }

    const actions = ['Скачать PDF', 'Предпросмотр PDF', 'Экспорт в ZIP'];

    const enabledWithValidDraft = actions.map(
      (name) => !screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    );

    fireEvent.change(measurement, { target: { value: '79' } });

    const disabledWithInvalidDraft = actions.map(
      (name) => screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    );

    // #when
    if (close === 'Escape') fireEvent.keyDown(measurement, { key: 'Escape' });
    else {
      fireEvent.pointerDown(document.body);
      fireEvent.pointerUp(document.body);
      fireEvent.click(document.body);
    }

    const enabledAfterClose = actions.map(
      (name) => !screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
    );

    fireEvent.click(screen.getByRole('button', { name: triggerName }));

    const restored = screen.getByRole<HTMLInputElement>('spinbutton', {
      name: 'Вышло из 100 мм',
    });

    // #then
    expect({
      enabledWithValidDraft,
      disabledWithInvalidDraft,
      enabledAfterClose,
      restored: {
        value: restored.value,
        invalid: restored.getAttribute('aria-invalid'),
      },
    }).toEqual({
      enabledWithValidDraft: [true, true, true],
      disabledWithInvalidDraft: [true, true, true],
      enabledAfterClose: [true, true, true],
      restored: { value: restoredMeasurement, invalid: 'false' },
    });
  },
);

test('closing the printer scale with Escape returns focus to its trigger', async () => {
  // #given
  render(<PaperMinisGenerator />);
  const scale = screen.getByRole<HTMLButtonElement>('button', { name: 'Масштаб ▾' });
  scale.focus();
  fireEvent.click(scale);

  const measurement = screen.getByRole<HTMLInputElement>('spinbutton', {
    name: 'Вышло из 100 мм',
  });

  measurement.focus();
  const focusStartedInside = document.activeElement === measurement;

  // #when
  fireEvent.keyDown(measurement, { key: 'Escape' });
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

  // #then
  expect({
    focusStartedInside,
    open: screen.queryByRole('spinbutton', { name: 'Вышло из 100 мм' }) !== null,
    focused: document.activeElement === scale,
  }).toEqual({ focusStartedInside: true, open: false, focused: true });
});

test('printer scale popover closes on Escape and an outside click', () => {
  // #given
  render(<PaperMinisGenerator />);
  const scale = screen.getByRole('button', { name: 'Масштаб ▾' });
  fireEvent.click(scale);
  screen.getByRole('spinbutton', { name: 'Вышло из 100 мм' }).focus();
  const openBeforeEscape = screen.queryByRole('spinbutton', { name: 'Вышло из 100 мм' }) !== null;

  // #when
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  const openAfterEscape = screen.queryByRole('spinbutton', { name: 'Вышло из 100 мм' }) !== null;
  fireEvent.click(scale);

  const openBeforeOutsideClick =
    screen.queryByRole('spinbutton', { name: 'Вышло из 100 мм' }) !== null;

  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);

  // #then
  expect({
    openBeforeEscape,
    openAfterEscape,
    openBeforeOutsideClick,
    openAfterOutsideClick: screen.queryByRole('spinbutton', { name: 'Вышло из 100 мм' }) !== null,
  }).toEqual({
    openBeforeEscape: true,
    openAfterEscape: false,
    openBeforeOutsideClick: true,
    openAfterOutsideClick: false,
  });
});

test('blur restores an invalid draft and both PDF actions become available again', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const margin = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Поля, мм' });
  const count = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Количество копий' });
  fireEvent.change(margin, { target: { value: '5' } });
  fireEvent.change(count, { target: { value: '3' } });
  // #when
  fireEvent.change(count, { target: { value: '' } });

  const disabled = ['Скачать PDF', 'Предпросмотр PDF'].map(
    (name) => screen.getByRole<HTMLButtonElement>('button', { name }).disabled,
  );

  fireEvent.blur(count);
  fireEvent.change(margin, { target: { value: '' } });
  fireEvent.blur(margin);
  await chooseSelectOption(screen.getByRole('button', { name: /Высота существа/ }), 'Свой размер');
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
    disabled,
    count: { value: count.value, invalid: count.getAttribute('aria-invalid') },
    margin: { value: margin.value, invalid: margin.getAttribute('aria-invalid') },
    afterWidthBlur,
    afterHeightBlur: { width: width.value, height: height.value },
    dimensionsInvalid: [width.getAttribute('aria-invalid'), height.getAttribute('aria-invalid')],
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

test('a JPEG labelled image/jpg is accepted', async () => {
  // #given
  render(<PaperMinisGenerator />);

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
  render(<PaperMinisGenerator />);
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

test('the batch file picker accepts exported zip archives', () => {
  // #given
  render(<PaperMinisGenerator />);
  // #when
  const input = screen.getByLabelText('Добавить изображения', { selector: 'input' });
  // #then
  expect(input.getAttribute('accept')).toBe(
    'image/png,image/jpeg,image/jpg,image/webp,.zip,application/zip',
  );
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
  const trigger = screen.getByRole('button', { name: /Высота существа/ });
  // #when
  await chooseSelectOption(trigger, /дварф/);
  const dwarfGeometry = trigger.getAttribute('title');
  await chooseSelectOption(trigger, /багбир/);
  // #then
  expect([dwarfGeometry, trigger.getAttribute('title')]).toEqual([
    'Основание 25 мм · высота 27 мм',
    'Основание 25 мм · высота 43 мм',
  ]);
});

test('the height menu appears with a second mini and sets every mini to the chosen height', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const withOne = screen.queryByRole('button', { name: 'Сменить высоту' });
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Сменить высоту' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /^Огромный/ }));
  // #then
  await waitFor(() =>
    expect({
      withOne,
      heights: screen
        .getAllByRole('button', { name: /Высота существа/ })
        .map((trigger) => trigger.textContent),
    }).toEqual({ withOne: null, heights: ['Огромный · 6 м', 'Огромный · 6 м'] }),
  );
});

test('the PDF button describes its output with Russian plural forms', async () => {
  // #given
  render(<PaperMinisGenerator />);
  // #when
  await addFront();
  // #then
  const download = screen.getByRole('button', { name: 'Скачать PDF' });
  const summary = document.getElementById(download.getAttribute('aria-describedby') ?? '');
  expect(summary?.textContent).toBe('1 миниатюра · 1 лист A4');
});

test('numbering is available on first render and persists both checkbox states', () => {
  // #given
  render(<PaperMinisGenerator />);

  const numbering = screen.getByRole<HTMLInputElement>('checkbox', {
    name: 'Нумеровать копии',
  });

  const initial = numbering.checked;

  // #when
  fireEvent.click(numbering);

  const enabled = {
    checked: numbering.checked,
    saved: JSON.parse(localStorage.getItem('pmg-settings') ?? '{}').numberDuplicates ?? null,
  };

  fireEvent.click(numbering);

  // #then
  expect({
    initial,
    enabled,
    disabled: {
      checked: numbering.checked,
      saved: JSON.parse(localStorage.getItem('pmg-settings') ?? '{}').numberDuplicates ?? null,
    },
  }).toEqual({
    initial: false,
    enabled: { checked: true, saved: true },
    disabled: { checked: false, saved: false },
  });
});

test('the Base style control lists every style and routes a foamboard choice to settings', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const download = screen.getByRole('button', { name: 'Скачать PDF' });
  const summary = document.getElementById(download.getAttribute('aria-describedby') ?? '');
  const tentSummary = summary?.textContent;

  // #when
  const tentTrigger = screen.queryByRole('button', { name: /Складная/ });
  fireEvent.click(tentTrigger ?? document.body);
  const options = screen.queryAllByRole('option').map((option) => option.textContent);
  fireEvent.click(screen.queryByRole('option', { name: 'Плоская' }) ?? document.body);
  const flatSummary = summary?.textContent;
  fireEvent.click(screen.queryByRole('button', { name: /Плоская/ }) ?? document.body);
  fireEvent.click(screen.queryByRole('option', { name: 'На пенокартоне' }) ?? document.body);

  // #then
  expect({
    options,
    selected: screen.queryByRole('button', { name: /На пенокартоне/ })?.textContent ?? null,
    saved: JSON.parse(localStorage.getItem('pmg-settings') ?? '{}').baseStyle ?? null,
    summaries: [tentSummary, flatSummary, summary?.textContent],
  }).toEqual({
    options: ['Складная', 'Плоская', 'На пенокартоне'],
    selected: 'На пенокартоне',
    saved: 'foamboard',
    summaries: [
      '1 миниатюра · 1 лист A4',
      '1 миниатюра · 1 лист A4',
      '1 миниатюра · 1 лист лиц + 1 лист оборотов A4',
    ],
  });
});

test('the header shows a neutral 3D mini and changes its printed parts with Base style', async () => {
  // #given
  render(<PaperMinisGenerator />);
  const scene = screen.queryByTestId('mini-3d');

  const initial = {
    baseStyle: scene?.getAttribute('data-base-style') ?? null,
    art: scene?.getAttribute('data-art') ?? null,
    oldPlaceholder: document.querySelector('.minis-header-mini-figure')?.textContent ?? null,
  };

  // #when
  await chooseSelectOption(screen.getByRole('button', { name: /Складная/ }), 'Плоская');

  // #then
  expect({
    initial,
    changedStyle: scene?.getAttribute('data-base-style') ?? null,
    changedParts: [...(scene?.querySelectorAll('[data-part-role]') ?? [])].flatMap((part) => {
      const role = part.getAttribute('data-part-role');

      return role === 'hinge' ? [] : [role];
    }),
  }).toEqual({
    initial: { baseStyle: 'tent', art: 'placeholder', oldPlaceholder: null },
    changedStyle: 'flat',
    changedParts: ['frontTongue', 'frontFace', 'backFace', 'backTongue'],
  });
});

test.each([
  { baseStyle: 'tent', numbered: true, expectedRole: 'backTab', expectedText: '1' },
  { baseStyle: 'flat', numbered: true, expectedRole: 'backTongue', expectedText: '1' },
  { baseStyle: 'foamboard', numbered: true, expectedRole: 'backTongue', expectedText: '1' },
  { baseStyle: 'tent', numbered: false, expectedRole: null, expectedText: null },
] as const)(
  'the $baseStyle scene puts copy numbering on the printed part when numbered is $numbered',
  async ({ baseStyle, numbered, expectedRole, expectedText }) => {
    // #given
    localStorage.setItem(
      'pmg-settings',
      JSON.stringify({ normalization: false, baseStyle, numberDuplicates: numbered }),
    );
    render(<PaperMinisGenerator />);

    // #when
    await addFront();
    const scene = screen.queryByTestId('mini-3d');
    const badge = scene?.querySelector('[data-testid="mini-3d-badge"]') ?? null;

    // #then
    expect({
      baseStyle: scene?.getAttribute('data-base-style') ?? null,
      art: scene?.getAttribute('data-art') ?? null,
      badgeRole: badge?.closest('[data-part-role]')?.getAttribute('data-part-role') ?? null,
      badgeText: badge?.textContent ?? null,
    }).toEqual({ baseStyle, art: 'artwork', badgeRole: expectedRole, badgeText: expectedText });
  },
);

test('the header fold runs once on mount and restarts when Base style changes', async () => {
  // #given
  const originalMatchMedia = window.matchMedia;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
      }) satisfies MediaQueryList,
  });
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, callback);

    return id;
  };

  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  try {
    render(<PaperMinisGenerator />);
    const scene = screen.queryByTestId('mini-3d');
    const mountStart = scene?.getAttribute('data-t') ?? null;

    // #when
    for (let time = 0; time <= 10_000 && scene?.getAttribute('data-t') !== '1'; time += 1_000) {
      const pending = [...frames.values()];
      frames.clear();
      act(() => pending.forEach((callback) => callback(time)));
    }

    const mountEnd = scene?.getAttribute('data-t') ?? null;

    const pendingAfterMount = frames.size;

    await chooseSelectOption(screen.getByRole('button', { name: /Складная/ }), 'На пенокартоне');
    const styleChangeStart = scene?.getAttribute('data-t') ?? null;

    for (
      let time = 20_000;
      time <= 30_000 && scene?.getAttribute('data-t') !== '1';
      time += 1_000
    ) {
      const pending = [...frames.values()];
      frames.clear();
      act(() => pending.forEach((callback) => callback(time)));
    }

    // #then
    expect({
      mountStart,
      mountEnd,
      pendingAfterMount,
      styleChangeStart,
      styleChangeEnd: scene?.getAttribute('data-t') ?? null,
      changedStyle: scene?.getAttribute('data-base-style') ?? null,
      pendingAfterStyleChange: frames.size,
    }).toEqual({
      mountStart: '0',
      mountEnd: '1',
      pendingAfterMount: 0,
      styleChangeStart: '0',
      styleChangeEnd: '1',
      changedStyle: 'foamboard',
      pendingAfterStyleChange: 0,
    });
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('reduced motion mounts the assembled mini without requesting an animation frame', () => {
  // #given
  const originalMatchMedia = window.matchMedia;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let requestedFrames = 0;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
      }) satisfies MediaQueryList,
  });
  globalThis.requestAnimationFrame = () => {
    requestedFrames += 1;

    return requestedFrames;
  };

  try {
    // #when
    render(<PaperMinisGenerator />);
    const scene = screen.queryByTestId('mini-3d');

    // #then
    expect({
      assembly: scene?.getAttribute('data-t') ?? null,
      requestedFrames,
    }).toEqual({ assembly: '1', requestedFrames: 0 });
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test('the foamboard counter uses Russian plural forms for Front and Back sheets', async () => {
  // #given
  localStorage.setItem(
    'pmg-settings',
    JSON.stringify({ normalization: false, baseStyle: 'foamboard' }),
  );
  const tallPng = Buffer.from(png);
  tallPng.writeUInt32BE(2, 20);
  render(<PaperMinisGenerator />);
  await addFront(tallPng);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Поля, мм' }), {
    target: { value: '0' },
  });
  await chooseSelectOption(screen.getByRole('button', { name: /Высота существа/ }), 'Свой размер');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Основание, мм' }), {
    target: { value: '100' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Фигурка, мм' }), {
    target: { value: '200' },
  });
  const count = screen.getByRole('spinbutton', { name: 'Количество копий' });
  const download = screen.getByRole('button', { name: 'Скачать PDF' });
  const summary = document.getElementById(download.getAttribute('aria-describedby') ?? '');
  const one = summary?.textContent;

  // #when
  fireEvent.change(count, { target: { value: '2' } });
  const two = summary?.textContent;
  fireEvent.change(count, { target: { value: '5' } });

  // #then
  expect([one, two, summary?.textContent]).toEqual([
    '1 миниатюра · 1 лист лиц + 1 лист оборотов A4',
    '2 миниатюры · 2 листа лиц + 2 листа оборотов A4',
    '5 миниатюр · 5 листов лиц + 5 листов оборотов A4',
  ]);
});

test('copy stepper changes how many minis the PDF prints and stops at one', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  const fewer = screen.getByRole<HTMLButtonElement>('button', { name: 'Меньше копий' });
  const disabledAtOne = fewer.disabled;
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Больше копий' }));
  fireEvent.click(screen.getByRole('button', { name: 'Больше копий' }));
  fireEvent.click(fewer);
  // #then
  const download = screen.getByRole('button', { name: 'Скачать PDF' });
  const summary = document.getElementById(download.getAttribute('aria-describedby') ?? '');
  expect({ disabledAtOne, summary: summary?.textContent }).toEqual({
    disabledAtOne: true,
    summary: '2 миниатюры · 1 лист A4',
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
    fireEvent.click(screen.getByRole('button', { name: 'Масштаб ▾' }));

    const download = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Скачать тестовый лист',
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
    render(<PaperMinisGenerator />);

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
    fireEvent.change(
      screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }),
      { target: { files: [slow] } },
    );

    const loadingDisabled = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Экспорт в ZIP',
    }).disabled;

    await act(async () => {
      release(Uint8Array.from(png).buffer);
    });

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
  render(<PaperMinisGenerator />);
  await addFront();

  const objectUrl = spyOn(URL, 'createObjectURL').mockImplementation(() => {
    throw new Error('Object URL unavailable');
  });

  try {
    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт в ZIP' }));
    // #then
    expect(
      (await screen.findByText('Не удалось создать архив. Попробуйте ещё раз.')).textContent,
    ).toBe('Не удалось создать архив. Попробуйте ещё раз.');
  } finally {
    objectUrl.mockRestore();
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

test('height calibration stays disabled until the selected back artwork is ready', async () => {
  // #given
  render(<PaperMinisGenerator />);
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
    (key) => within(slot).queryByTestId(`calibration-${key}`)?.style.insetBlockStart ?? null,
  );

test('shared calibration draws the same thumbnail lines on both sides and reset removes them', async () => {
  // #given
  render(<PaperMinisGenerator />);
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

test('an oversized mini uses danger styling in both the row and calibration dialog', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  await chooseSelectOption(screen.getByRole('button', { name: /Высота существа/ }), 'Свой размер');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Основание, мм' }), {
    target: { value: '300' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Фигурка, мм' }), {
    target: { value: '30' },
  });

  const warning =
    'Не помещается на лист. Уменьшите размер или поля. Эта миниатюра не попадёт в PDF.';

  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  // #then
  expect(
    screen.getAllByText(warning).map((element) => element.classList.contains('text-danger')),
  ).toEqual([true, true]);
});

test('front height dialog applies pointer calibration and row reset clears it', async () => {
  // #given
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
  render(<PaperMinisGenerator />);
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
    render(<PaperMinisGenerator />);
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
    render(<PaperMinisGenerator />);
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
    await waitFor(() => expect(screen.getByTitle('Предпросмотр PDF')).toBeDefined());
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
