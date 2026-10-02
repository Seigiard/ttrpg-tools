import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PaperMinisGenerator from './PaperMinisGenerator';
import * as pdf from '@/lib/paper-minis/pdf';

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

async function addFront() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Добавить изображения', { selector: 'input' }), {
      target: { files: [new File([png], 'goblin.png', { type: 'image/png' })] },
    });
  });
}

async function addBack() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Оборот: отражение лицевой стороны', { selector: 'input' }), {
      target: { files: [new File([png], 'back.png', { type: 'image/png' })] },
    });
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
  expect(
    screen.getAllByRole('article').map((row) => row.querySelector('h3')?.textContent),
  ).toEqual(['Big bad wolf', 'Миниатюра 2']);
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

for (const action of ['Скачать PDF', 'Предпросмотр PDF']) {
  for (const outcome of ['success', 'failure']) {
    test(`${action} locks editing and file events until PDF ${outcome}`, async () => {
      // #given
      let resolve!: (bytes: Uint8Array) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<Uint8Array>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const generate = spyOn(pdf, 'generatePDF').mockReturnValue(pending);
      // happy-dom cannot navigate an iframe to a PDF blob. Rendering is outside this seam.
      const objectUrl = spyOn(URL, 'createObjectURL').mockReturnValue('about:blank');
      const revokeUrl = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      try {
        render(<PaperMinisGenerator />);
        await addFront();
        fireEvent.change(screen.getByRole('combobox', { name: 'Высота существа' }), {
          target: { value: 'custom' },
        });
        const picker = screen.getByLabelText('Добавить изображения', { selector: 'input' });
        const frontPicker = screen.getByLabelText('Лицевая сторона', { selector: 'input' });
        const backPicker = screen.getByLabelText('Оборот: отражение лицевой стороны', {
          selector: 'input',
        });
        const file = new File([png], 'late.png', { type: 'image/png' });
        // #when
        fireEvent.click(screen.getByRole('button', { name: action }));
        const editor = screen.getByRole<HTMLFieldSetElement>('group', {
          name: 'Редактор миниатюр',
        });
        const locked = editor.disabled;
        const busy = editor.getAttribute('aria-busy');
        const controlsInside = Array.from(document.querySelectorAll('input, select')).every(
          (control) => editor.contains(control),
        );
        const status = screen
          .getByText('Создаём PDF. Редактирование временно недоступно.')
          .getAttribute('role');
        let pageDrop = true;
        let thumbnailDrop = true;
        await act(async () => {
          fireEvent.change(picker, { target: { files: [file] } });
          fireEvent.change(frontPicker, { target: { files: [file] } });
          fireEvent.change(backPicker, { target: { files: [file] } });
          fireEvent.change(screen.getByRole('combobox', { name: 'Размер бумаги' }), {
            target: { value: 'letter' },
          });
          fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество копий' }), {
            target: { value: '9' },
          });
          fireEvent.click(screen.getByRole('button', { name: 'Дублировать' }));
          fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
          pageDrop = fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
          thumbnailDrop = fireEvent.drop(screen.getByRole('button', { name: 'Лицевая сторона' }), {
            dataTransfer: { types: ['Files'], files: [file] },
          });
        });
        const summary = document.querySelector('[aria-live="polite"]')?.textContent;
        const lateBack = screen.queryByRole('button', { name: 'Оборот: late.png' }) !== null;
        const lockedTitles = screen
          .getAllByRole('article')
          .map((row) => row.querySelector('h3')?.textContent);
        await act(async () => {
          if (outcome === 'success') resolve(new Uint8Array([1]));
          else reject(new Error('PDF failed'));
          await pending.catch(() => {});
        });
        const unlocked = !editor.disabled && editor.getAttribute('aria-busy') === 'false';
        fireEvent.click(screen.getByRole('button', { name: 'Дублировать' }));
        await act(async () => {
          fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
        });
        // #then
        expect({
          locked,
          busy,
          controlsInside,
          status,
          pageDrop,
          thumbnailDrop,
          summary,
          lateBack,
          lockedTitles,
          unlocked,
          rows: screen.getAllByRole('article').length,
          pdfCalls: generate.mock.calls.length,
        }).toEqual({
          locked: true,
          busy: 'true',
          controlsInside: true,
          status: 'status',
          pageDrop: false,
          thumbnailDrop: false,
          summary: 'Миниатюр: 1 → листов: 1 (A4)',
          lateBack: false,
          lockedTitles: ['Goblin'],
          unlocked: true,
          rows: 3,
          pdfCalls: 1,
        });
      } finally {
        generate.mockRestore();
        objectUrl.mockRestore();
        revokeUrl.mockRestore();
      }
    });
  }
}

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

test('front height dialog applies pointer calibration and row reset clears it', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: 'Задать рост лицевой стороны' });
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(artwork, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  fireEvent.pointerDown(within(dialog).getByRole('slider', { name: 'Head' }), {
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
  expect({ label: label.textContent, warning: warning.textContent, reset: screen.queryByText('Рост задан вручную') }).toEqual({
    label: 'Рост задан вручную',
    warning: 'Миниатюра уменьшена: лимит ширины.',
    reset: null,
  });
});

test('front height dialog cancel leaves the row unchanged and keeps a 10 percent line gap', async () => {
  // #given
  render(<PaperMinisGenerator />);
  await addFront();
  // #when
  fireEvent.click(screen.getByRole('button', { name: 'Задать рост' }));
  const dialog = screen.getByRole('dialog', { name: 'Задать рост лицевой стороны' });
  const artwork = within(dialog).getByTestId('height-calibration-artwork');
  Object.defineProperty(artwork, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  const head = within(dialog).getByRole('slider', { name: 'Head' });
  const feet = within(dialog).getByRole('slider', { name: 'Feet' });
  fireEvent.pointerDown(head, { pointerId: 1, clientY: 0 });
  fireEvent.pointerMove(artwork, { pointerId: 1, clientY: 96 });
  fireEvent.pointerUp(artwork, { pointerId: 1, clientY: 96 });
  const positions = [head.getAttribute('aria-valuenow'), feet.getAttribute('aria-valuenow')];
  const readout = within(dialog).getByText('Рост 35 мм · напечатается 350 мм');
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
    readout: 'Рост 35 мм · напечатается 350 мм',
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
  Object.defineProperty(artwork, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  fireEvent.pointerDown(within(dialog).getByRole('slider', { name: 'Head' }), {
    pointerId: 1,
    clientY: 25,
  });
  fireEvent.pointerUp(artwork, { pointerId: 1, clientY: 25 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }));
  // #then
  expect({ frontOnlyTabs, label: screen.getByText('Рост задан вручную').textContent }).toEqual({
    frontOnlyTabs: null,
    label: 'Рост задан вручную',
  });
});
